//! Datos del PC que Red Level muestra o usa: programas instalados, espacio libre en disco y el puntero.

use serde::{Deserialize, Serialize};

/// Un programa del menú Inicio de Windows, tal como lo ve el usuario.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct InstalledApp {
    pub name: String,
    /// Identificador con el que Windows lo abre (ruta, o identificador de app de la Tienda).
    pub id: String,
    /// Icono en PNG, en base64. Falta cuando Windows no supo darlo.
    pub icon: Option<String>,
}

/// Espacio de un disco fijo del PC.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    /// Letra de la unidad, sin dos puntos: "C".
    pub letter: String,
    pub free_bytes: u64,
    pub total_bytes: u64,
}

/// Prefijo con el que Windows abre cualquier programa del menú Inicio, sea clásico o de la Tienda.
pub const SHELL_PREFIX: &str = "shell:AppsFolder\\";

/// El menú Inicio trae también desinstaladores, manuales y enlaces: eso no son apps para tener a la vista.
pub fn is_real_app(app: &InstalledApp) -> bool {
    let name = app.name.to_lowercase();
    let id = app.id.to_lowercase();
    let noise = ["uninstall", "desinstalar", "readme", "léeme", "leeme", "manual", "documentation", "documentación", "license", "licencia", "website", "sitio web", "release notes", "help", "ayuda"];
    let files = [".url", ".chm", ".txt", ".html", ".htm", ".pdf", ".rtf", ".lnk", ".msc", ".cpl"];
    !name.trim().is_empty() && !id.trim().is_empty() && !id.starts_with("http") && !noise.iter().any(|word| name.contains(word)) && !files.iter().any(|ext| id.ends_with(ext))
}

/// Limpia y ordena la lista que devuelve Windows: sin ruido, sin repetidos y por nombre.
pub fn tidy_apps(mut apps: Vec<InstalledApp>) -> Vec<InstalledApp> {
    apps.retain(is_real_app);
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.id.eq_ignore_ascii_case(&b.id));
    apps
}

/// La lista llega de PowerShell en JSON: una lista, o un solo objeto si solo hay una app.
pub fn parse_apps(json: &str) -> Vec<InstalledApp> {
    let text = json.trim().trim_start_matches('\u{feff}');
    serde_json::from_str::<Vec<InstalledApp>>(text).or_else(|_| serde_json::from_str::<InstalledApp>(text).map(|one| vec![one])).map(tidy_apps).unwrap_or_default()
}

/// Lo que se le pide a Windows: las apps del menú Inicio con su icono de 48 px.
/// El icono se saca con la misma interfaz que usa el Explorador, así que sirve también para apps de la Tienda.
pub const APPS_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public static class RedLevelIcons {
    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr bitmap); }
    [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx; public int cy; }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid id, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
    public static string Png(string path, int size) {
        try {
            Guid id = typeof(IShellItemImageFactory).GUID;
            IShellItemImageFactory factory;
            if (SHCreateItemFromParsingName(path, IntPtr.Zero, ref id, out factory) != 0 || factory == null) return null;
            SIZE wanted; wanted.cx = size; wanted.cy = size;
            IntPtr handle;
            if (factory.GetImage(wanted, 0, out handle) != 0 || handle == IntPtr.Zero) return null;
            try {
                using (Bitmap bitmap = Image.FromHbitmap(handle))
                using (MemoryStream stream = new MemoryStream()) {
                    bitmap.Save(stream, ImageFormat.Png);
                    return Convert.ToBase64String(stream.ToArray());
                }
            } finally { DeleteObject(handle); }
        } catch { return null; }
    }
}
'@
$apps = @(Get-StartApps | ForEach-Object {
    [pscustomobject]@{ name = $_.Name; id = $_.AppID; icon = [RedLevelIcons]::Png('shell:AppsFolder\' + $_.AppID, 48) }
})
ConvertTo-Json -InputObject $apps -Compress
"#;

/// Por qué no se abrió un programa como administrador.
#[derive(Debug, Clone, PartialEq)]
pub enum AdminError {
    /// El usuario dijo que no en el aviso de Windows.
    Refused,
    /// Windows no pudo abrirlo; va su código de error.
    Failed(isize),
}

/// De una lista de procesos (identificador, padre), los que descienden de `root`: hijos, nietos…
pub fn descendants_of(links: &[(u32, Option<u32>)], root: u32) -> Vec<u32> {
    let mut found: Vec<u32> = Vec::new();
    let mut frontier = vec![root];
    while let Some(parent) = frontier.pop() {
        for (pid, _) in links.iter().filter(|(pid, up)| *up == Some(parent) && *pid != root) {
            if !found.contains(pid) {
                found.push(*pid);
                frontier.push(*pid);
            }
        }
    }
    found
}

#[cfg(windows)]
mod sys {
    use super::{AdminError, Disk, InstalledApp};
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use windows_sys::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives};
    use windows_sys::Win32::UI::WindowsAndMessaging::ClipCursor;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DRIVE_FIXED: u32 = 3;

    /// Programas del menú Inicio, con su icono. Tarda uno o dos segundos: se llama fuera del hilo de la interfaz.
    pub fn installed_apps(work_dir: &std::path::Path) -> Result<Vec<InstalledApp>, String> {
        let _ = std::fs::create_dir_all(work_dir);
        let script = work_dir.join("apps-instaladas.ps1");
        // Con marca de orden de bytes para que PowerShell lea el archivo como UTF-8.
        std::fs::write(&script, format!("\u{feff}{}", super::APPS_SCRIPT)).map_err(|e| e.to_string())?;
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("No se pudo consultar los programas instalados: {e}"))?;
        let _ = std::fs::remove_file(&script);
        let apps = super::parse_apps(&String::from_utf8_lossy(&output.stdout));
        if apps.is_empty() {
            let reason = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Windows no devolvió la lista de programas. {}", reason.lines().next().unwrap_or("").trim()));
        }
        Ok(apps)
    }

    /// Discos fijos del PC con su espacio libre.
    pub fn disks() -> Vec<Disk> {
        let mut list = Vec::new();
        let mask = unsafe { GetLogicalDrives() };
        for index in 0..26u32 {
            if mask & (1 << index) == 0 {
                continue;
            }
            let letter = (b'A' + index as u8) as char;
            let root: Vec<u16> = format!("{letter}:\\").encode_utf16().chain(std::iter::once(0)).collect();
            let (mut free, mut total) = (0u64, 0u64);
            unsafe {
                if GetDriveTypeW(root.as_ptr()) != DRIVE_FIXED || GetDiskFreeSpaceExW(root.as_ptr(), &mut free, &mut total, std::ptr::null_mut()) == 0 {
                    continue;
                }
            }
            if total > 0 {
                list.push(Disk { letter: letter.to_string(), free_bytes: free, total_bytes: total });
            }
        }
        list
    }

    /// Termina esos procesos y los que hayan abierto. Es el último recurso para cerrar un juego que no atiende
    /// a que se le pida cerrar su ventana.
    pub fn kill(pids: &[u32]) {
        use std::os::windows::process::CommandExt;
        for pid in pids {
            let _ = std::process::Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).creation_flags(0x0800_0000).output();
        }
    }

    /// Libera el puntero si un juego lo dejó encerrado en su ventana.
    /// No se recargan los cursores de Windows: eso invalida los que ya usa la interfaz y deja el puntero invisible.
    pub fn restore_pointer() {
        unsafe {
            ClipCursor(std::ptr::null());
        }
    }

    /// Cómo ve Windows el puntero ahora mismo: (estado, si tiene forma, x, y). Estado 1 = a la vista; 0 = alguien lo
    /// ocultó; 2 = Windows lo esconde porque lo último que se usó fue una pantalla táctil o un lápiz.
    pub fn pointer_state() -> (u32, bool, i32, i32) {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorInfo, CURSORINFO};
        unsafe {
            let mut info: CURSORINFO = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<CURSORINFO>() as u32;
            if GetCursorInfo(&mut info) == 0 {
                return (u32::MAX, false, 0, 0);
            }
            (info.flags, !info.hCursor.is_null(), info.ptScreenPos.x, info.ptScreenPos.y)
        }
    }

    /// Rescata el puntero cuando se queda "fantasma": una flecha quieta en la pantalla mientras el puntero de
    /// verdad se mueve sin verse. Eso pasa cuando la gráfica deja colgada la imagen del puntero en un monitor; aquí
    /// se obliga a Windows a dibujarlo de nuevo: se pasa un instante al puntero dibujado por Windows (el del rastro
    /// del ratón), se vuelve al normal y se le da un toque en su sitio. Devuelve qué hizo, para el registro.
    pub fn rescue_pointer() -> String {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, SetCursorPos, SystemParametersInfoW, SPI_GETMOUSETRAILS, SPI_SETMOUSETRAILS};
        let before = pointer_state();
        let mut trails: u32 = 0;
        unsafe {
            ClipCursor(std::ptr::null());
            SystemParametersInfoW(SPI_GETMOUSETRAILS, 0, &mut trails as *mut u32 as *mut core::ffi::c_void, 0);
            // Con el rastro ya puesto por el usuario, Windows ya lo dibuja él: no se toca.
            if trails < 2 {
                SystemParametersInfoW(SPI_SETMOUSETRAILS, 2, std::ptr::null_mut(), 0);
                std::thread::sleep(std::time::Duration::from_millis(90));
                SystemParametersInfoW(SPI_SETMOUSETRAILS, trails, std::ptr::null_mut(), 0);
            }
            let mut at = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut at) != 0 {
                SetCursorPos(at.x, at.y);
            }
        }
        let after = pointer_state();
        format!("estado {}→{} forma={} en {},{} rastro={trails}", before.0, after.0, after.1, after.2, after.3)
    }

    fn text16(raw: &[u16]) -> String {
        String::from_utf16_lossy(&raw[..raw.iter().position(|c| *c == 0).unwrap_or(raw.len())]).trim().to_string()
    }

    /// Lo que hace falta saber del PC para entender un fallo del puntero: versión de Windows, gráficas y pantallas
    /// (con sus hercios), y los ajustes de Windows que cambian cómo se dibuja el puntero.
    pub fn describe() -> String {
        use windows_sys::Win32::Graphics::Gdi::{EnumDisplayDevicesW, EnumDisplaySettingsW, DEVMODEW, DISPLAY_DEVICEW, ENUM_CURRENT_SETTINGS};
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;
        let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
        let user = RegKey::predef(HKEY_CURRENT_USER);
        let version = machine.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion").ok();
        let build = version.as_ref().and_then(|k| k.get_value::<String, _>("CurrentBuild").ok()).unwrap_or_default();
        let release = version.as_ref().and_then(|k| k.get_value::<String, _>("DisplayVersion").ok()).unwrap_or_default();
        let patch = version.as_ref().and_then(|k| k.get_value::<u32, _>("UBR").ok()).unwrap_or(0);
        // Si alguien desactivó los planos de superposición de la gráfica (MPO), aquí hay un 5.
        let overlays = machine.open_subkey("SOFTWARE\\Microsoft\\Windows\\Dwm").ok().and_then(|k| k.get_value::<u32, _>("OverlayTestMode").ok()).map(|v| v.to_string()).unwrap_or_else(|| "de serie".into());
        let trails = user.open_subkey("Control Panel\\Mouse").ok().and_then(|k| k.get_value::<String, _>("MouseTrails").ok()).unwrap_or_default();
        let size = user.open_subkey("SOFTWARE\\Microsoft\\Accessibility").ok().and_then(|k| k.get_value::<u32, _>("CursorSize").ok()).unwrap_or(1);
        let scheme = user.open_subkey("Control Panel\\Cursors").ok().and_then(|k| k.get_value::<String, _>("").ok()).unwrap_or_default();

        let mut screens: Vec<String> = Vec::new();
        unsafe {
            for index in 0..16u32 {
                let mut device: DISPLAY_DEVICEW = std::mem::zeroed();
                device.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
                if EnumDisplayDevicesW(std::ptr::null(), index, &mut device, 0) == 0 {
                    break;
                }
                // Solo las salidas con una pantalla puesta en el escritorio.
                if device.StateFlags & 1 == 0 {
                    continue;
                }
                let mut mode: DEVMODEW = std::mem::zeroed();
                mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
                let known = EnumDisplaySettingsW(device.DeviceName.as_ptr(), ENUM_CURRENT_SETTINGS, &mut mode) != 0;
                screens.push(format!(
                    "{}{} {}",
                    text16(&device.DeviceString),
                    if device.StateFlags & 4 != 0 { " (principal)" } else { "" },
                    if known { format!("{}x{} a {} Hz", mode.dmPelsWidth, mode.dmPelsHeight, mode.dmDisplayFrequency) } else { "sin datos".into() }
                ));
            }
        }
        format!("Windows {build}.{patch} {release} | pantallas: {} | planos de la gráfica: {overlays} | puntero: rastro={trails} tamaño={size} esquema={scheme}", screens.join("; "))
    }

    /// Abre un programa (o un acceso directo, o un .bat) pidiendo permiso de administrador. Es lo mismo que
    /// "Ejecutar como administrador" del menú de Windows. Conviene llamarlo desde el hilo de la ventana que
    /// tiene el foco: así el aviso de Windows sale delante. Con `visible` apagado, lo que se abre no enseña ventana.
    pub fn run_as_admin(window: isize, file: &str, params: &str, dir: &str, visible: bool) -> Result<(), AdminError> {
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        let wide = |text: &str| -> Vec<u16> { text.encode_utf16().chain(std::iter::once(0)).collect() };
        let (verb, file, params_w, dir_w) = (wide("runas"), wide(file), wide(params), wide(dir));
        let result = unsafe {
            ShellExecuteW(
                window as _,
                verb.as_ptr(),
                file.as_ptr(),
                if params.is_empty() { std::ptr::null() } else { params_w.as_ptr() },
                if dir.is_empty() { std::ptr::null() } else { dir_w.as_ptr() },
                i32::from(visible),
            )
        } as isize;
        // Más de 32 es que se abrió. 5 es "acceso denegado": lo que devuelve cuando el usuario dice que no.
        match result {
            code if code > 32 => Ok(()),
            5 => Err(AdminError::Refused),
            code => Err(AdminError::Failed(code)),
        }
    }

    /// Baja (o devuelve a lo normal) la prioridad de Red Level y de esos procesos suyos. Con un juego abierto,
    /// Windows atiende siempre antes al juego: Red Level solo usa el procesador que sobre.
    pub fn set_low_priority(pids: &[u32], low: bool) {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcess, SetPriorityClass, BELOW_NORMAL_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS, PROCESS_SET_INFORMATION};
        let class = if low { BELOW_NORMAL_PRIORITY_CLASS } else { NORMAL_PRIORITY_CLASS };
        unsafe {
            SetPriorityClass(GetCurrentProcess(), class);
            for pid in pids {
                let handle = OpenProcess(PROCESS_SET_INFORMATION, 0, *pid);
                if !handle.is_null() {
                    SetPriorityClass(handle, class);
                    CloseHandle(handle);
                }
            }
        }
    }

    /// Da la máxima prioridad al hilo que llama. Lo usa el que atiende el teclado: cada tecla del PC pasa por él,
    /// y no puede esperar ni cuando un juego ocupa todo el procesador ni cuando Red Level va con prioridad baja.
    pub fn boost_this_thread() {
        use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL};
        unsafe {
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        }
    }
}

#[cfg(not(windows))]
mod sys {
    use super::{AdminError, Disk, InstalledApp};
    pub fn kill(_pids: &[u32]) {}
    pub fn run_as_admin(_window: isize, _file: &str, _params: &str, _dir: &str, _visible: bool) -> Result<(), AdminError> {
        Err(AdminError::Failed(0))
    }
    pub fn set_low_priority(_pids: &[u32], _low: bool) {}
    pub fn boost_this_thread() {}
    pub fn installed_apps(_work_dir: &std::path::Path) -> Result<Vec<InstalledApp>, String> {
        Ok(Vec::new())
    }
    pub fn disks() -> Vec<Disk> {
        Vec::new()
    }
    pub fn restore_pointer() {}
    pub fn pointer_state() -> (u32, bool, i32, i32) {
        (1, true, 0, 0)
    }
    pub fn rescue_pointer() -> String {
        String::new()
    }
    pub fn describe() -> String {
        String::new()
    }
}

pub use sys::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_procesos_de_la_interfaz_son_los_que_cuelgan_de_red_level() {
        // 10 es Red Level; 20 su navegador; 21 y 22 las pestañas; 30 y 31 no tienen nada que ver.
        let links = [(10, Some(1)), (20, Some(10)), (21, Some(20)), (22, Some(20)), (30, Some(1)), (31, Some(30)), (10, Some(10))];
        let mut found = descendants_of(&links, 10);
        found.sort();
        assert_eq!(found, vec![20, 21, 22]);
        assert!(descendants_of(&links, 99).is_empty());
    }

    fn app(name: &str, id: &str) -> InstalledApp {
        InstalledApp { name: name.into(), id: id.into(), icon: None }
    }

    #[test]
    fn the_start_menu_list_is_cleaned_and_sorted() {
        let json = r#"[
            {"name":"Zeta Player","id":"C:\\Program Files\\Zeta\\zeta.exe","icon":"AAAA"},
            {"name":"Uninstall Zeta Player","id":"C:\\Program Files\\Zeta\\unins000.exe","icon":null},
            {"name":"Chat de voz","id":"com.squirrel.chat.Chat","icon":null},
            {"name":"Manual de Zeta","id":"C:\\Program Files\\Zeta\\manual.pdf","icon":null},
            {"name":"Zeta en la web","id":"https://zeta.example/","icon":null},
            {"name":"zeta player","id":"c:\\program files\\zeta\\ZETA.exe","icon":null},
            {"name":"Música","id":"Musica.App_abc123!App","icon":null}
        ]"#;
        let apps = parse_apps(json);
        assert_eq!(apps.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), vec!["Chat de voz", "Música", "Zeta Player"]);
        assert_eq!(apps[2].icon.as_deref(), Some("AAAA"));
    }

    #[test]
    fn a_single_app_or_garbage_does_not_break_the_list() {
        assert_eq!(parse_apps(r#"{"name":"Notas","id":"notas.exe"}"#), vec![app("Notas", "notas.exe")]);
        assert_eq!(parse_apps("\u{feff}[]"), vec![]);
        assert_eq!(parse_apps("Get-StartApps : no se reconoce"), vec![]);
    }
}
