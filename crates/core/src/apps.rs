//! Apps del segundo monitor: cada quien añade los programas de su PC que quiera tener a la vista,
//! y Red Level lleva sus ventanas al hueco bajo la barra.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Nombre del archivo de un programa, en minúsculas: así se le reconoce entre los procesos abiertos.
/// Vacío cuando la app se abre por un identificador que no dice cuál es su programa (apps de la Tienda).
pub fn process_name(path: &str) -> String {
    let file = crate::split_path(path).1.to_lowercase();
    if file.ends_with(".exe") || !path.starts_with("shell:") { file } else { String::new() }
}

/// Nombre para mostrar a partir de la ruta: `C:\Apps\Mi Programa.exe` → `Mi Programa`.
pub fn display_name(path: &str) -> String {
    let file = crate::split_path(path).1;
    let stem = file.rsplit_once('.').map_or(file, |(stem, _)| stem).trim();
    let mut letters = stem.chars();
    match letters.next() {
        // Muchos programas se llaman en minúsculas (notepad.exe): la primera letra se muestra en mayúscula.
        Some(first) => first.to_uppercase().chain(letters).collect(),
        None => "App".into(),
    }
}

/// Divisiones que admite el segundo monitor: de pantalla sola a 12 cuadros.
pub const LAYOUTS: &[u8] = &[1, 2, 3, 4, 6, 8, 9, 12];

/// La división válida más cercana a la pedida.
pub fn valid_layout(count: u8) -> u8 {
    LAYOUTS.iter().copied().min_by_key(|n| n.abs_diff(count)).unwrap_or(1)
}

/// Columnas y filas de cada división. En un monitor en vertical se reparten al revés.
pub fn grid_shape(count: u8, landscape: bool) -> (i32, i32) {
    let (long, short) = match valid_layout(count) {
        1 => (1, 1),
        2 => (2, 1),
        3 => (3, 1),
        4 => (2, 2),
        6 => (3, 2),
        8 => (4, 2),
        9 => (3, 3),
        _ => (4, 3),
    };
    if landscape { (long, short) } else { (short, long) }
}

/// Separación entre cuadros, en píxeles.
pub const GRID_GAP: i32 = 6;

/// Los cuadros de una división, de izquierda a derecha y de arriba abajo, dentro del hueco dado.
pub fn cells(area: Rect, count: u8) -> Vec<Rect> {
    let (cols, rows) = grid_shape(count, area.width >= area.height);
    let width = (area.width - GRID_GAP * (cols - 1)) / cols;
    let height = (area.height - GRID_GAP * (rows - 1)) / rows;
    let mut list = Vec::with_capacity((cols * rows) as usize);
    for row in 0..rows {
        for col in 0..cols {
            list.push(Rect { x: area.x + col * (width + GRID_GAP), y: area.y + row * (height + GRID_GAP), width, height });
        }
    }
    list
}

/// Dónde se abre en grande la app de un cuadro: centrada, dejando ver la cuadrícula por los bordes.
pub fn popup_rect(area: Rect) -> Rect {
    let width = area.width * 86 / 100;
    let height = area.height * 86 / 100;
    Rect { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height }
}

/// De las ventanas visibles ahora (ventana, proceso), las que no estaban antes ni son del propio Red Level.
/// Sirve para los programas que arrancan con un lanzador y acaban en un proceso con otro nombre.
pub fn new_windows(before: &[(isize, u32)], now: &[(isize, u32)], own_pid: u32) -> Vec<(isize, u32)> {
    now.iter().filter(|(hwnd, pid)| *pid != own_pid && !before.iter().any(|(old, _)| old == hwnd)).copied().collect()
}

#[cfg(windows)]
mod sys {
    use super::Rect;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow,
        SetWindowPos, ShowWindow, GW_OWNER, HWND_NOTOPMOST, HWND_TOP, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_MINIMIZE, SW_RESTORE,
        SW_SHOWNOACTIVATE,
    };

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let found = &mut *(lparam as *mut Vec<(isize, u32)>);
        if IsWindowVisible(hwnd) != 0 && GetWindow(hwnd, GW_OWNER).is_null() && GetWindowTextLengthW(hwnd) > 0 {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            found.push((hwnd as isize, pid));
        }
        1
    }

    /// Ventanas principales visibles ahora mismo, con el proceso de cada una.
    pub fn visible_windows() -> Vec<(isize, u32)> {
        let mut windows: Vec<(isize, u32)> = Vec::new();
        unsafe {
            EnumWindows(Some(collect), &mut windows as *mut Vec<(isize, u32)> as LPARAM);
        }
        windows
    }

    /// Ventanas principales visibles de esos procesos.
    fn windows_of(pids: &[u32]) -> Vec<HWND> {
        visible_windows().into_iter().filter(|(_, pid)| pids.contains(pid)).map(|(hwnd, _)| hwnd as HWND).collect()
    }

    /// Coloca esas ventanas en el rectángulo dado. Con `focus` las trae al frente y les da el teclado;
    /// sin él las deja en su sitio sin quitarle el foco a lo que se esté usando.
    /// `pinned` las mantiene por encima de todo (solo lo usa la prueba con un segundo monitor simulado).
    pub fn place_windows(windows: &[isize], target: Rect, focus: bool, pinned: bool) -> usize {
        for hwnd in windows {
            let hwnd = *hwnd as HWND;
            unsafe {
                if IsIconic(hwnd) != 0 {
                    ShowWindow(hwnd, if focus { SW_RESTORE } else { SW_SHOWNOACTIVATE });
                }
                let after = if pinned { HWND_TOPMOST } else if focus { HWND_TOP } else { HWND_NOTOPMOST };
                let flags = if focus { SWP_SHOWWINDOW } else { SWP_SHOWWINDOW | SWP_NOACTIVATE };
                SetWindowPos(hwnd, after, target.x, target.y, target.width, target.height, flags);
                if focus {
                    SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, 0x0001 | 0x0002); // SWP_NOSIZE | SWP_NOMOVE: solo al frente
                    SetForegroundWindow(hwnd);
                }
            }
        }
        windows.len()
    }

    /// Coloca las ventanas de esos procesos en el rectángulo dado. Devuelve cuántas colocó.
    pub fn place_windows_of(pids: &[u32], target: Rect, focus: bool, pinned: bool) -> usize {
        let windows: Vec<isize> = windows_of(pids).into_iter().map(|hwnd| hwnd as isize).collect();
        place_windows(&windows, target, focus, pinned)
    }

    /// La ventana que tiene el teclado ahora mismo y su proceso.
    pub fn foreground() -> (isize, u32) {
        unsafe {
            let hwnd = GetForegroundWindow();
            let mut pid: u32 = 0;
            if !hwnd.is_null() {
                GetWindowThreadProcessId(hwnd, &mut pid);
            }
            (hwnd as isize, pid)
        }
    }

    /// Minimiza las ventanas de esos procesos (la app sigue abierta, por ejemplo la música sigue sonando).
    pub fn minimize_windows_of(pids: &[u32]) -> usize {
        let windows = windows_of(pids);
        for hwnd in &windows {
            unsafe {
                ShowWindow(*hwnd, SW_MINIMIZE);
            }
        }
        windows.len()
    }
}

#[cfg(not(windows))]
mod sys {
    use super::Rect;
    pub fn visible_windows() -> Vec<(isize, u32)> {
        Vec::new()
    }
    pub fn place_windows(_windows: &[isize], _target: Rect, _focus: bool, _pinned: bool) -> usize {
        0
    }
    pub fn place_windows_of(_pids: &[u32], _target: Rect, _focus: bool, _pinned: bool) -> usize {
        0
    }
    pub fn foreground() -> (isize, u32) {
        (0, 0)
    }
    pub fn minimize_windows_of(_pids: &[u32]) -> usize {
        0
    }
}

pub use sys::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_come_from_the_path() {
        assert_eq!(process_name(r"C:\Users\Ana\AppData\Local\Musica\Reproductor.EXE"), "reproductor.exe");
        assert_eq!(display_name(r"C:\Program Files\Chat Voz\Chat Voz.exe"), "Chat Voz");
        assert_eq!(display_name("/opt/apps/notas"), "Notas");
        assert_eq!(display_name(""), "App");
        assert_eq!(process_name(r"shell:AppsFolder\{6D809377-6AF0-444B-8957-A3773F02200E}\Notas\notas.exe"), "notas.exe");
        assert_eq!(process_name(r"shell:AppsFolder\Musica.App_abc123!App"), "", "una app de la Tienda no dice su programa");
    }

    #[test]
    fn the_second_monitor_splits_from_one_to_twelve() {
        assert_eq!(valid_layout(0), 1);
        assert_eq!(valid_layout(5), 4);
        assert_eq!(valid_layout(7), 6);
        assert_eq!(valid_layout(200), 12);
        assert_eq!(grid_shape(4, true), (2, 2));
        assert_eq!(grid_shape(12, true), (4, 3));
        assert_eq!(grid_shape(3, false), (1, 3), "en vertical se apilan");
        let area = Rect { x: 1920, y: 56, width: 1920, height: 1024 };
        for count in LAYOUTS {
            let list = cells(area, *count);
            assert_eq!(list.len(), *count as usize);
            for (i, cell) in list.iter().enumerate() {
                assert!(cell.x >= area.x && cell.y >= area.y && cell.x + cell.width <= area.x + area.width && cell.y + cell.height <= area.y + area.height, "el cuadro no se sale");
                for other in &list[i + 1..] {
                    let apart = cell.x + cell.width <= other.x || other.x + other.width <= cell.x || cell.y + cell.height <= other.y || other.y + other.height <= cell.y;
                    assert!(apart, "los cuadros no se pisan");
                }
            }
        }
        assert_eq!(cells(area, 1), vec![area]);
        let two = cells(area, 2);
        assert_eq!((two[0].width, two[1].x), (957, 1920 + 957 + GRID_GAP));
        let popup = popup_rect(area);
        assert!(popup.x > area.x && popup.y > area.y && popup.width < area.width && popup.height < area.height);
    }

    #[test]
    fn only_windows_that_were_not_there_count_as_new() {
        let before = [(10, 100), (11, 100)];
        let now = [(10, 100), (11, 100), (12, 200), (13, 999), (14, 300)];
        assert_eq!(new_windows(&before, &now, 999), vec![(12, 200), (14, 300)]);
        assert!(new_windows(&now, &now, 999).is_empty());
    }
}
