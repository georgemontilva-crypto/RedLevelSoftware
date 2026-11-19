//! Apps de compañía (Discord, Spotify) para el segundo monitor: abrirlas y llevar su ventana allí.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub struct Companion {
    pub id: &'static str,
    pub name: &'static str,
    /// Dirección que abre la app instalada.
    pub uri: &'static str,
    /// Protocolo que la app registra en Windows al instalarse.
    pub scheme: &'static str,
    /// Versión web, por si la app no está instalada.
    pub web: &'static str,
    /// Nombres de sus procesos, en minúsculas.
    pub processes: &'static [&'static str],
}

pub const COMPANIONS: &[Companion] = &[
    Companion { id: "discord", name: "Discord", uri: "discord://-/", scheme: "discord", web: "https://discord.com/app", processes: &["discord.exe"] },
    Companion { id: "spotify", name: "Spotify", uri: "spotify:", scheme: "spotify", web: "https://open.spotify.com", processes: &["spotify.exe"] },
    Companion { id: "youtube", name: "YouTube", uri: "", scheme: "", web: "https://www.youtube.com", processes: &[] },
];

pub fn companion(id: &str) -> Option<&'static Companion> {
    COMPANIONS.iter().find(|c| c.id == id)
}

#[cfg(windows)]
mod sys {
    use super::Rect;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, SetWindowPos, ShowWindow,
        GW_OWNER, HWND_TOP, SWP_SHOWWINDOW, SW_MINIMIZE, SW_RESTORE,
    };

    pub fn is_installed(scheme: &str) -> bool {
        use winreg::enums::HKEY_CLASSES_ROOT;
        use winreg::RegKey;
        !scheme.is_empty() && RegKey::predef(HKEY_CLASSES_ROOT).open_subkey(scheme).is_ok()
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let found = &mut *(lparam as *mut Vec<(isize, u32)>);
        if IsWindowVisible(hwnd) != 0 && GetWindow(hwnd, GW_OWNER).is_null() && GetWindowTextLengthW(hwnd) > 0 {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            found.push((hwnd as isize, pid));
        }
        1
    }

    /// Ventanas principales visibles de esos procesos.
    fn windows_of(pids: &[u32]) -> Vec<HWND> {
        let mut windows: Vec<(isize, u32)> = Vec::new();
        unsafe {
            EnumWindows(Some(collect), &mut windows as *mut Vec<(isize, u32)> as LPARAM);
        }
        windows.into_iter().filter(|(_, pid)| pids.contains(pid)).map(|(hwnd, _)| hwnd as HWND).collect()
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
    pub fn is_installed(_scheme: &str) -> bool {
        false
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
    fn companions_are_listed() {
        assert_eq!(companion("discord").map(|c| c.scheme), Some("discord"));
        assert!(companion("youtube").unwrap().processes.is_empty());
        assert!(companion("otra").is_none());
    }
}
