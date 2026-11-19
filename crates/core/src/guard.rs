//! Controles de Windows que hacen de Red Level una interfaz "de consola": anular las teclas
//! que sacan al escritorio, esconder la barra de tareas y silenciar las notificaciones.
//!
//! Todo es reversible y nada queda escrito en el sistema: si Red Level se cierra, aunque sea
//! de golpe, el teclado vuelve a la normalidad porque el gancho muere con el programa.

use serde::Serialize;

/// No se anula nada.
pub const MODE_OFF: u8 = 0;
/// Hay un juego abierto: solo la tecla Windows y Ctrl+Esc (y Alt+Tab si el usuario lo pidió).
pub const MODE_GAME: u8 = 1;
/// Red Level en pantalla: tecla Windows, Alt+Tab, Alt+Esc, Alt+F4, Alt+Espacio, Ctrl+Esc y Ctrl+Mayús+Esc.
pub const MODE_LAUNCHER: u8 = 2;

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GuardReport {
    pub keyboard_hook: bool,
    pub taskbars_found: u32,
    /// "ok", o el motivo por el que Windows no dejó cambiar el modo de notificaciones.
    pub notifications: String,
}

/// Qué teclas se anulan en cada modo. Separado del gancho para poder probarlo.
#[allow(clippy::too_many_arguments)]
pub fn should_block(mode: u8, alt_tab_in_game: bool, vk: u32, alt: bool, ctrl: bool) -> bool {
    const VK_TAB: u32 = 0x09;
    const VK_ESCAPE: u32 = 0x1B;
    const VK_SPACE: u32 = 0x20;
    const VK_F4: u32 = 0x73;
    const VK_LWIN: u32 = 0x5B;
    const VK_RWIN: u32 = 0x5C;
    let win = vk == VK_LWIN || vk == VK_RWIN;
    let ctrl_esc = vk == VK_ESCAPE && ctrl;
    let switcher = alt && (vk == VK_TAB || vk == VK_ESCAPE);
    match mode {
        MODE_GAME => win || ctrl_esc || (alt_tab_in_game && switcher),
        MODE_LAUNCHER => win || ctrl_esc || switcher || (alt && (vk == VK_F4 || vk == VK_SPACE)),
        _ => false,
    }
}

/// Salida de emergencia: Ctrl+Alt+Mayús+Q cierra Red Level pase lo que pase.
pub fn is_emergency_exit(vk: u32, alt: bool, ctrl: bool, shift: bool) -> bool {
    vk == 0x51 && alt && ctrl && shift
}

#[cfg(windows)]
mod sys {
    use super::*;
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU8, Ordering};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, FindWindowExW, FindWindowW, GetMessageW, SetWindowsHookExW, ShowWindow, TranslateMessage,
        KBDLLHOOKSTRUCT, MSG, SW_HIDE, SW_SHOWNA, WH_KEYBOARD_LL,
    };

    const LLKHF_ALTDOWN: u32 = 0x20;
    const LLKHF_UP: u32 = 0x80;
    const VK_SHIFT: i32 = 0x10;
    const VK_CONTROL: i32 = 0x11;
    const VK_MENU: i32 = 0x12;

    static MODE: AtomicU8 = AtomicU8::new(MODE_OFF);
    static ALT_TAB_IN_GAME: AtomicBool = AtomicBool::new(false);
    static EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);
    static RESCUE_REQUESTED: AtomicBool = AtomicBool::new(false);
    static HOOK_STARTED: AtomicBool = AtomicBool::new(false);
    static HOOK_OK: AtomicBool = AtomicBool::new(false);
    static TASKBAR_HIDDEN: AtomicBool = AtomicBool::new(false);
    static DND_CHANGED: AtomicBool = AtomicBool::new(false);
    static DND_PREVIOUS: AtomicU32 = AtomicU32::new(0);
    static KEY_EVENTS: AtomicU32 = AtomicU32::new(0);
    static LAST_KEY: AtomicU32 = AtomicU32::new(0);
    /// 0 = sin arrancar, 1 = el hilo del gancho está atendiendo, 2 = el hilo terminó.
    static HOOK_LOOP: AtomicU8 = AtomicU8::new(0);

    /// Para diagnóstico: cuántas pulsaciones ha visto el gancho y cómo leyó la última
    /// ("tecla 0x51 alt=true ctrl=true mayus=true"). No guarda qué se escribe.
    pub fn keyboard_diagnostics() -> String {
        let last = LAST_KEY.load(Ordering::Relaxed);
        format!(
            "hilo={} eventos={} ultima=0x{:02X} alt={} ctrl={} mayus={}",
            HOOK_LOOP.load(Ordering::Relaxed),
            KEY_EVENTS.load(Ordering::Relaxed),
            last & 0xFF,
            last >> 8 & 1 == 1,
            last >> 9 & 1 == 1,
            last >> 10 & 1 == 1
        )
    }

    /// Pulsa y suelta teclas como lo haría un teclado. Solo la usa la autoprueba.
    pub fn press_keys(keys: &[u8]) {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::keybd_event;
        unsafe {
            for key in keys {
                keybd_event(*key, 0, 0, 0);
                std::thread::sleep(std::time::Duration::from_millis(40));
            }
            std::thread::sleep(std::time::Duration::from_millis(80));
            for key in keys.iter().rev() {
                keybd_event(*key, 0, 2, 0);
                std::thread::sleep(std::time::Duration::from_millis(40));
            }
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == 0 {
            let key = &*(lparam as *const KBDLLHOOKSTRUCT);
            KEY_EVENTS.fetch_add(1, Ordering::Relaxed);
            // Con Ctrl pulsado Windows no marca Alt en el propio evento: se consulta también la tecla.
            let alt = key.flags & LLKHF_ALTDOWN != 0 || GetAsyncKeyState(VK_MENU) < 0;
            let ctrl = GetAsyncKeyState(VK_CONTROL) < 0;
            let shift = GetAsyncKeyState(VK_SHIFT) < 0;
            LAST_KEY.store(key.vkCode & 0xFF | (alt as u32) << 8 | (ctrl as u32) << 9 | (shift as u32) << 10, Ordering::Relaxed);
            if is_emergency_exit(key.vkCode, alt, ctrl, shift) {
                EXIT_REQUESTED.store(true, Ordering::SeqCst);
                return 1;
            }
            // Ctrl+Alt+Mayús+P: rescatar el puntero si se quedó "fantasma" (quieto en pantalla, moviéndose sin verse).
            if key.vkCode == 0x50 && alt && ctrl && shift {
                if key.flags & LLKHF_UP == 0 {
                    RESCUE_REQUESTED.store(true, Ordering::SeqCst);
                }
                return 1;
            }
            let mode = MODE.load(Ordering::Relaxed);
            if should_block(mode, ALT_TAB_IN_GAME.load(Ordering::Relaxed), key.vkCode, alt, ctrl) {
                // De Alt+Tab (o Alt+F4, Alt+Espacio) anulado, a la ventana solo le llega Alt: al soltarla, Windows
                // lo toma por "Alt sola" y mete a la ventana en su modo menú, con el ratón sin responder hasta el
                // siguiente clic. Una tecla sin uso en medio lo evita.
                if alt && key.flags & LLKHF_UP == 0 {
                    use windows_sys::Win32::UI::Input::KeyboardAndMouse::keybd_event;
                    keybd_event(0xE8, 0, 0, 0);
                    keybd_event(0xE8, 0, 2, 0);
                }
                return 1;
            }
        }
        CallNextHookEx(null_mut(), code, wparam, lparam)
    }

    /// Instala el gancho de teclado en su propio hilo. Hasta que se llame a `set_mode` no anula nada.
    pub fn start_keyboard_guard() {
        if HOOK_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        std::thread::spawn(|| unsafe {
            // Todas las teclas del PC pasan por este hilo: que nunca tenga que esperar turno.
            crate::system::boost_this_thread();
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), GetModuleHandleW(null()), 0);
            HOOK_OK.store(!hook.is_null(), Ordering::SeqCst);
            HOOK_LOOP.store(1, Ordering::SeqCst);
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            HOOK_LOOP.store(2, Ordering::SeqCst);
        });
    }

    pub fn keyboard_guard_active() -> bool {
        HOOK_OK.load(Ordering::SeqCst)
    }

    pub fn set_mode(mode: u8) {
        MODE.store(mode, Ordering::SeqCst);
    }

    pub fn mode() -> u8 {
        MODE.load(Ordering::SeqCst)
    }

    pub fn set_alt_tab_in_game(block: bool) {
        ALT_TAB_IN_GAME.store(block, Ordering::SeqCst);
    }

    /// ¿Se pidió con el teclado rescatar el puntero? Al leerlo se da por atendido.
    pub fn take_rescue_request() -> bool {
        RESCUE_REQUESTED.swap(false, Ordering::SeqCst)
    }

    pub fn take_exit_request() -> bool {
        EXIT_REQUESTED.swap(false, Ordering::SeqCst)
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Muestra u oculta la barra de tareas principal y las de los demás monitores.
    /// Devuelve cuántas barras encontró.
    pub fn set_taskbar_visible(visible: bool) -> u32 {
        let show = if visible { SW_SHOWNA } else { SW_HIDE };
        let mut count = 0;
        unsafe {
            let main: HWND = FindWindowW(wide("Shell_TrayWnd").as_ptr(), null());
            if !main.is_null() {
                ShowWindow(main, show);
                count += 1;
            }
            let class = wide("Shell_SecondaryTrayWnd");
            let mut child: HWND = null_mut();
            loop {
                child = FindWindowExW(null_mut(), child, class.as_ptr(), null());
                if child.is_null() {
                    break;
                }
                ShowWindow(child, show);
                count += 1;
            }
        }
        TASKBAR_HIDDEN.store(!visible, Ordering::SeqCst);
        count
    }

    pub fn taskbar_hidden() -> bool {
        TASKBAR_HIDDEN.load(Ordering::SeqCst)
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn NtQueryWnfStateData(
            state_name: *const u64,
            type_id: *const c_void,
            explicit_scope: *const c_void,
            change_stamp: *mut u32,
            buffer: *mut c_void,
            buffer_size: *mut u32,
        ) -> i32;
        fn NtUpdateWnfStateData(
            state_name: *const u64,
            buffer: *const c_void,
            length: u32,
            type_id: *const c_void,
            explicit_scope: *const c_void,
            matching_change_stamp: u32,
            check_stamp: u32,
        ) -> i32;
    }

    /// Estado de Windows que guarda el modo de "No molestar" (antes Asistente de concentración):
    /// 0 = apagado, 1 = solo prioritarias, 2 = solo alarmas.
    const WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED: u64 = 0x0D83_063E_A3BF_1C75;

    fn read_dnd() -> Result<u32, i32> {
        let mut value: u32 = 0;
        let mut size: u32 = 4;
        let mut stamp: u32 = 0;
        let status = unsafe {
            NtQueryWnfStateData(
                &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED,
                null(),
                null(),
                &mut stamp,
                &mut value as *mut u32 as *mut c_void,
                &mut size,
            )
        };
        if status >= 0 {
            Ok(value)
        } else {
            Err(status)
        }
    }

    fn write_dnd(value: u32) -> Result<(), i32> {
        let status = unsafe {
            NtUpdateWnfStateData(&WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED, &value as *const u32 as *const c_void, 4, null(), null(), 0, 0)
        };
        if status >= 0 {
            Ok(())
        } else {
            Err(status)
        }
    }

    /// Activa o devuelve el modo "No molestar". Windows no tiene una vía oficial para esto: se usa
    /// el mismo estado interno que cambia el botón de la campana. Al desactivar se restaura el modo
    /// que tenía el usuario antes de abrir Red Level.
    pub fn set_notifications_silenced(silenced: bool) -> Result<(), String> {
        let explain = |status: i32| format!("Windows no permitió cambiar el modo No molestar (código 0x{:08X}).", status as u32);
        if silenced {
            if DND_CHANGED.load(Ordering::SeqCst) {
                return Ok(());
            }
            let previous = read_dnd().unwrap_or(0);
            if previous < 2 {
                write_dnd(2).map_err(explain)?;
            }
            DND_PREVIOUS.store(previous, Ordering::SeqCst);
            DND_CHANGED.store(true, Ordering::SeqCst);
            Ok(())
        } else {
            if !DND_CHANGED.swap(false, Ordering::SeqCst) {
                return Ok(());
            }
            write_dnd(DND_PREVIOUS.load(Ordering::SeqCst)).map_err(explain)
        }
    }

    pub fn notifications_mode() -> Option<u32> {
        read_dnd().ok()
    }

    /// Deja Windows como estaba. Se puede llamar más de una vez.
    pub fn release_all() {
        set_mode(MODE_OFF);
        if taskbar_hidden() {
            set_taskbar_visible(true);
        }
        let _ = set_notifications_silenced(false);
    }
}

#[cfg(not(windows))]
mod sys {
    //! Fuera de Windows no hay nada que controlar; estas funciones existen para compilar y probar el resto.
    pub fn start_keyboard_guard() {}
    pub fn keyboard_guard_active() -> bool {
        false
    }
    pub fn set_mode(_mode: u8) {}
    pub fn mode() -> u8 {
        super::MODE_OFF
    }
    pub fn set_alt_tab_in_game(_block: bool) {}
    pub fn take_rescue_request() -> bool {
        false
    }
    pub fn take_exit_request() -> bool {
        false
    }
    pub fn set_taskbar_visible(_visible: bool) -> u32 {
        0
    }
    pub fn taskbar_hidden() -> bool {
        false
    }
    pub fn set_notifications_silenced(_silenced: bool) -> Result<(), String> {
        Err("Solo disponible en Windows.".into())
    }
    pub fn notifications_mode() -> Option<u32> {
        None
    }
    pub fn release_all() {}
    pub fn keyboard_diagnostics() -> String {
        String::new()
    }
    pub fn press_keys(_keys: &[u8]) {}
}

pub use sys::*;

#[cfg(test)]
mod tests {
    use super::*;

    const WIN: u32 = 0x5B;
    const TAB: u32 = 0x09;
    const ESC: u32 = 0x1B;
    const F4: u32 = 0x73;
    const KEY_A: u32 = 0x41;

    #[test]
    fn launcher_mode_blocks_the_ways_out() {
        assert!(should_block(MODE_LAUNCHER, false, WIN, false, false));
        assert!(should_block(MODE_LAUNCHER, false, TAB, true, false), "Alt+Tab");
        assert!(should_block(MODE_LAUNCHER, false, ESC, true, false), "Alt+Esc");
        assert!(should_block(MODE_LAUNCHER, false, F4, true, false), "Alt+F4");
        assert!(should_block(MODE_LAUNCHER, false, ESC, false, true), "Ctrl+Esc y Ctrl+Mayús+Esc");
        assert!(!should_block(MODE_LAUNCHER, false, ESC, false, false), "Esc sola sirve para cerrar paneles");
        assert!(!should_block(MODE_LAUNCHER, false, TAB, false, false));
        assert!(!should_block(MODE_LAUNCHER, false, KEY_A, false, false));
    }

    #[test]
    fn game_mode_keeps_the_game_usable() {
        assert!(should_block(MODE_GAME, false, WIN, false, false));
        assert!(should_block(MODE_GAME, false, ESC, false, true));
        assert!(!should_block(MODE_GAME, false, F4, true, false), "Alt+F4 cierra el juego");
        assert!(!should_block(MODE_GAME, false, TAB, true, false), "Alt+Tab para ir a otra ventana");
        assert!(should_block(MODE_GAME, true, TAB, true, false), "salvo que el usuario lo pida");
        assert!(!should_block(MODE_GAME, true, TAB, false, false), "Tab sola es del juego");
    }

    #[test]
    fn off_mode_blocks_nothing() {
        for vk in [WIN, TAB, ESC, F4] {
            assert!(!should_block(MODE_OFF, true, vk, true, true));
        }
    }

    #[test]
    fn emergency_exit_needs_all_three_modifiers() {
        assert!(is_emergency_exit(0x51, true, true, true));
        assert!(!is_emergency_exit(0x51, true, true, false));
        assert!(!is_emergency_exit(0x41, true, true, true));
    }
}
