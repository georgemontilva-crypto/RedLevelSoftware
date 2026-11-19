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
pub fn process_name(path: &str) -> String {
    crate::split_path(path).1.to_lowercase()
}

/// Nombre para mostrar a partir de la ruta: `C:\Apps\Mi Programa.exe` → `Mi Programa`.
pub fn display_name(path: &str) -> String {
    let file = crate::split_path(path).1;
    let stem = file.rsplit_once('.').map_or(file, |(stem, _)| stem).trim();
    if stem.is_empty() { "App".into() } else { stem.to_string() }
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
        EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, SetWindowPos, ShowWindow,
        GW_OWNER, HWND_TOP, SWP_SHOWWINDOW, SW_MINIMIZE, SW_RESTORE,
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

    /// Coloca esas ventanas concretas en el rectángulo dado y las trae al frente.
    pub fn place_windows(windows: &[isize], target: Rect) -> usize {
        for hwnd in windows {
            unsafe {
                ShowWindow(*hwnd as HWND, SW_RESTORE);
                SetWindowPos(*hwnd as HWND, HWND_TOP, target.x, target.y, target.width, target.height, SWP_SHOWWINDOW);
                SetForegroundWindow(*hwnd as HWND);
            }
        }
        windows.len()
    }

    /// Coloca las ventanas de esos procesos exactamente en el rectángulo dado (el hueco bajo la barra
    /// del segundo monitor) y las trae al frente. No las maximiza: taparían la barra. Devuelve cuántas colocó.
    pub fn place_windows_of(pids: &[u32], target: Rect) -> usize {
        let windows = windows_of(pids);
        for hwnd in &windows {
            unsafe {
                ShowWindow(*hwnd, SW_RESTORE);
                SetWindowPos(*hwnd, HWND_TOP, target.x, target.y, target.width, target.height, SWP_SHOWWINDOW);
                SetForegroundWindow(*hwnd);
            }
        }
        windows.len()
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
    pub fn place_windows(_windows: &[isize], _target: Rect) -> usize {
        0
    }
    pub fn place_windows_of(_pids: &[u32], _target: Rect) -> usize {
        0
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
        assert_eq!(display_name("/opt/apps/notas"), "notas");
        assert_eq!(display_name(""), "App");
    }

    #[test]
    fn only_windows_that_were_not_there_count_as_new() {
        let before = [(10, 100), (11, 100)];
        let now = [(10, 100), (11, 100), (12, 200), (13, 999), (14, 300)];
        assert_eq!(new_windows(&before, &now, 999), vec![(12, 200), (14, 300)]);
        assert!(new_windows(&now, &now, 999).is_empty());
    }
}
