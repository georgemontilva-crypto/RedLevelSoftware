//! Actualizaciones: mirar si hay una versión más nueva publicada y bajar su instalador.
//! Se usa `curl`, que viene con Windows 10 y 11, para no cargar el programa con más piezas.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// Repositorio donde se publican los instaladores.
pub const REPO: &str = "georgemontilva-crypto/RedLevelSoftware";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    pub version: String,
    pub url: String,
    pub size: u64,
}

fn numbers(version: &str) -> Vec<u64> {
    version.trim().trim_start_matches('v').split('.').map(|part| part.chars().take_while(char::is_ascii_digit).collect::<String>().parse().unwrap_or(0)).collect()
}

/// ¿`candidate` es una versión posterior a `current`? ("0.10.0" es más nueva que "0.9.3").
pub fn is_newer(candidate: &str, current: &str) -> bool {
    let (a, b) = (numbers(candidate), numbers(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

/// Solo se instala lo que viene de las publicaciones del repositorio de Red Level.
pub fn is_trusted_url(url: &str) -> bool {
    url.starts_with(&format!("https://github.com/{REPO}/releases/download/")) && url.to_lowercase().ends_with(".exe") && !url.contains("..")
}

/// Lee la respuesta de GitHub sobre la última publicación.
pub fn parse_release(json: &str) -> Option<Update> {
    let data: serde_json::Value = serde_json::from_str(json).ok()?;
    let version = data.get("tag_name")?.as_str()?.trim_start_matches('v').to_string();
    let asset = data.get("assets")?.as_array()?.iter().find(|asset| {
        asset.get("name").and_then(|n| n.as_str()).map_or(false, |name| name.to_lowercase().ends_with(".exe"))
    })?;
    let url = asset.get("browser_download_url")?.as_str()?.to_string();
    is_trusted_url(&url).then(|| Update { version, url, size: asset.get("size").and_then(|s| s.as_u64()).unwrap_or(0) })
}

fn curl(args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = Command::new(if cfg!(windows) { "curl.exe" } else { "curl" });
    command.args(["--silent", "--show-error", "--location", "--fail"]).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().map_err(|e| format!("No se pudo conectar: {e}"))?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Última versión publicada, sea o no más nueva que la instalada.
pub fn latest() -> Result<Option<Update>, String> {
    let body = curl(&["--max-time", "20", "-H", "Accept: application/vnd.github+json", &format!("https://api.github.com/repos/{REPO}/releases/latest")])?;
    Ok(parse_release(&String::from_utf8_lossy(&body)))
}

/// La actualización disponible para quien tiene instalada la versión `current`, si la hay.
pub fn check(current: &str) -> Result<Option<Update>, String> {
    Ok(latest()?.filter(|update| is_newer(&update.version, current)))
}

/// Baja el instalador a `dest` y devuelve cuánto ocupa.
pub fn download(url: &str, dest: &Path) -> Result<u64, String> {
    if !is_trusted_url(url) {
        return Err("Esa descarga no viene de Red Level.".into());
    }
    let _ = std::fs::remove_file(dest);
    curl(&["--max-time", "600", "--output", &dest.to_string_lossy(), url])?;
    std::fs::metadata(dest).map(|m| m.len()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions_by_number() {
        assert!(is_newer("0.3.0", "0.2.9"));
        assert!(is_newer("0.10.0", "0.9.3"));
        assert!(is_newer("v1.0", "0.99.99"));
        assert!(is_newer("0.2.1", "0.2"));
        assert!(!is_newer("0.2.0", "0.2.0"));
        assert!(!is_newer("0.1.9", "0.2.0"));
        assert!(!is_newer("basura", "0.0.1"));
    }

    #[test]
    fn only_trusts_our_releases() {
        assert!(is_trusted_url("https://github.com/georgemontilva-crypto/RedLevelSoftware/releases/download/v0.3.0/RedLevel-Setup-0.3.0.exe"));
        assert!(!is_trusted_url("https://github.com/otro/RedLevelSoftware/releases/download/v9/x.exe"));
        assert!(!is_trusted_url("http://github.com/georgemontilva-crypto/RedLevelSoftware/releases/download/v9/x.exe"));
        assert!(!is_trusted_url("https://github.com/georgemontilva-crypto/RedLevelSoftware/releases/download/v9/x.zip"));
        assert!(!is_trusted_url("https://github.com/georgemontilva-crypto/RedLevelSoftware/releases/download/../../otro/x.exe"));
    }

    #[test]
    fn reads_github_release() {
        let json = r#"{"tag_name":"v0.3.0","assets":[{"name":"notas.txt","size":10,"browser_download_url":"https://github.com/georgemontilva-crypto/RedLevelSoftware/releases/download/v0.3.0/notas.txt"},{"name":"RedLevel-Setup-0.3.0.exe","size":2600000,"browser_download_url":"https://github.com/georgemontilva-crypto/RedLevelSoftware/releases/download/v0.3.0/RedLevel-Setup-0.3.0.exe"}]}"#;
        let update = parse_release(json).unwrap();
        assert_eq!((update.version.as_str(), update.size), ("0.3.0", 2_600_000));
        assert!(update.url.ends_with("RedLevel-Setup-0.3.0.exe"));
        assert!(parse_release(r#"{"tag_name":"v1","assets":[]}"#).is_none());
        assert!(parse_release("no es json").is_none());
        // Un instalador alojado fuera del repositorio no se acepta.
        assert!(parse_release(r#"{"tag_name":"v9","assets":[{"name":"x.exe","browser_download_url":"https://ejemplo.com/x.exe"}]}"#).is_none());
    }
}
