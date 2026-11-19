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

#[cfg(windows)]
mod sys {
    use super::{Disk, InstalledApp};
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
}

#[cfg(not(windows))]
mod sys {
    use super::{Disk, InstalledApp};
    pub fn kill(_pids: &[u32]) {}
    pub fn installed_apps(_work_dir: &std::path::Path) -> Result<Vec<InstalledApp>, String> {
        Ok(Vec::new())
    }
    pub fn disks() -> Vec<Disk> {
        Vec::new()
    }
    pub fn restore_pointer() {}
}

pub use sys::*;

#[cfg(test)]
mod tests {
    use super::*;

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
