//! Guardado en la nube: empaqueta la carpeta de partidas de un juego en un .zip, lo sube o lo baja
//! con una dirección firmada que da el servidor de Red Level, y lo restaura en su sitio.

use serde::Serialize;
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// Una copia ya empaquetada.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Packed {
    pub files: usize,
    /// Lo que pesa el .zip.
    pub bytes: u64,
}

/// Archivos de una carpeta, con su ruta relativa usando "/" (como pide el formato zip).
fn walk(root: &Path, dir: &Path, out: &mut Vec<(PathBuf, String)>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let kind = entry.file_type()?;
        if kind.is_dir() {
            walk(root, &path, out)?;
        } else if kind.is_file() {
            let relative = path.strip_prefix(root).unwrap_or(&path);
            let name = relative.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect::<Vec<_>>().join("/");
            out.push((path, name));
        }
    }
    Ok(())
}

/// Empaqueta todo lo que hay en `folder` dentro de `zip_path`. Si el .zip pasa de `max_bytes` se abandona:
/// casi siempre significa que se eligió la carpeta del juego entero en vez de la de sus partidas.
pub fn pack(folder: &Path, zip_path: &Path, max_bytes: u64) -> Result<Packed, String> {
    if !folder.is_dir() {
        return Err("La carpeta de partidas ya no existe.".into());
    }
    let mut found = Vec::new();
    walk(folder, folder, &mut found).map_err(|e| format!("No se pudo leer la carpeta de partidas: {e}"))?;
    if found.is_empty() {
        return Err("La carpeta de partidas está vacía: todavía no hay nada que guardar.".into());
    }
    found.sort_by(|a, b| a.1.cmp(&b.1));
    if let Some(parent) = zip_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let result = (|| -> Result<Packed, String> {
        let file = File::create(zip_path).map_err(|e| format!("No se pudo crear la copia: {e}"))?;
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (path, name) in &found {
            writer.start_file(name.as_str(), options).map_err(|e| e.to_string())?;
            let mut source = File::open(path).map_err(|e| format!("No se pudo leer {name}: {e}"))?;
            io::copy(&mut source, &mut writer).map_err(|e| format!("No se pudo copiar {name}: {e}"))?;
            if fs::metadata(zip_path).map(|m| m.len()).unwrap_or(0) > max_bytes {
                return Err(too_big(max_bytes));
            }
        }
        writer.finish().map_err(|e| e.to_string())?;
        let bytes = fs::metadata(zip_path).map_err(|e| e.to_string())?.len();
        if bytes > max_bytes {
            return Err(too_big(max_bytes));
        }
        Ok(Packed { files: found.len(), bytes })
    })();
    if result.is_err() {
        let _ = fs::remove_file(zip_path);
    }
    result
}

fn too_big(max_bytes: u64) -> String {
    format!(
        "Esa carpeta pesa más de {} MB. Elige solo la carpeta de las partidas, no la del juego entero.",
        max_bytes / (1024 * 1024)
    )
}

/// Saca el contenido de `zip_path` en `folder`, pisando lo que haya con el mismo nombre.
/// Las rutas que intenten salirse de la carpeta se rechazan.
pub fn unpack(zip_path: &Path, folder: &Path) -> Result<usize, String> {
    let file = File::open(zip_path).map_err(|e| format!("No se pudo abrir la copia: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|_| "La copia descargada está dañada.".to_string())?;
    // Primero se comprueba todo; solo si la copia entera es de fiar se toca la carpeta.
    let mut targets = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|_| "La copia descargada está dañada.".to_string())?;
        let Some(relative) = entry.enclosed_name() else {
            return Err("La copia tiene rutas que no son de fiar y no se ha restaurado.".into());
        };
        targets.push((index, folder.join(relative), entry.is_dir()));
    }
    fs::create_dir_all(folder).map_err(|e| format!("No se pudo crear la carpeta de partidas: {e}"))?;
    let mut files = 0;
    for (index, target, is_dir) in targets {
        if is_dir {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let mut out = File::create(&target).map_err(|e| format!("No se pudo escribir {}: {e}", target.display()))?;
        io::copy(&mut entry, &mut out).map_err(|e| format!("No se pudo escribir {}: {e}", target.display()))?;
        files += 1;
    }
    Ok(files)
}

/// Solo se sube o se baja contra direcciones https (o del propio equipo, para las pruebas).
fn allowed(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://127.0.0.1:") || url.starts_with("http://localhost:")
}

/// Sube el .zip a la dirección firmada.
pub fn upload(url: &str, zip_path: &Path) -> Result<(), String> {
    if !allowed(url) {
        return Err("La dirección de subida no es válida.".into());
    }
    crate::updates::curl(&["--max-time", "900", "--upload-file", &zip_path.to_string_lossy(), url]).map(|_| ()).map_err(|e| format!("No se pudo subir la copia: {e}"))
}

/// Baja el .zip de la dirección firmada.
pub fn download(url: &str, zip_path: &Path) -> Result<(), String> {
    if !allowed(url) {
        return Err("La dirección de descarga no es válida.".into());
    }
    if let Some(parent) = zip_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    crate::updates::curl(&["--max-time", "900", "--output", &zip_path.to_string_lossy(), url]).map(|_| ()).map_err(|e| format!("No se pudo bajar la copia: {e}"))
}

/// Nombre de archivo seguro a partir del identificador de un juego.
pub fn slug(game_id: &str) -> String {
    let text: String = game_id.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' }).collect();
    let mut short: String = text.trim_matches('-').chars().take(60).collect();
    if short.is_empty() {
        short = "juego".into();
    }
    short
}

/// Empaqueta y sube las partidas de un juego. El .zip temporal se borra al acabar.
pub fn backup(folder: &Path, work_dir: &Path, game_id: &str, url: &str, max_bytes: u64) -> Result<Packed, String> {
    let zip_path = work_dir.join("nube").join(format!("{}-subida.zip", slug(game_id)));
    let packed = pack(folder, &zip_path, max_bytes)?;
    let sent = upload(url, &zip_path);
    let _ = fs::remove_file(&zip_path);
    sent.map(|_| packed)
}

/// Baja la copia de un juego y la pone en su carpeta. Antes guarda en el disco lo que había,
/// en `nube/<juego>-antes-de-restaurar.zip`, por si la copia de la nube era más vieja.
pub fn restore(folder: &Path, work_dir: &Path, game_id: &str, url: &str) -> Result<usize, String> {
    let dir = work_dir.join("nube");
    let zip_path = dir.join(format!("{}-bajada.zip", slug(game_id)));
    download(url, &zip_path)?;
    let result = (|| {
        let has_files = folder.is_dir() && fs::read_dir(folder).map(|mut d| d.next().is_some()).unwrap_or(false);
        if has_files {
            pack(folder, &dir.join(format!("{}-antes-de-restaurar.zip", slug(game_id))), u64::MAX)?;
        }
        unpack(&zip_path, folder)
    })();
    let _ = fs::remove_file(&zip_path);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("redlevel-saves-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn empaqueta_y_restaura_una_carpeta_con_subcarpetas() {
        let dir = temp("ida-y-vuelta");
        let saves = dir.join("partidas");
        fs::create_dir_all(saves.join("perfil 1")).unwrap();
        fs::write(saves.join("ajustes.ini"), "volumen=7").unwrap();
        fs::write(saves.join("perfil 1").join("ranura.sav"), vec![3u8; 5000]).unwrap();

        let zip_path = dir.join("copia.zip");
        let packed = pack(&saves, &zip_path, 1024 * 1024).unwrap();
        assert_eq!(packed.files, 2);
        assert!(packed.bytes > 0 && packed.bytes < 5000, "se comprime");

        // Restaurar pisa lo cambiado y recupera lo borrado, sin tocar archivos que la copia no trae.
        fs::write(saves.join("ajustes.ini"), "volumen=0").unwrap();
        fs::remove_file(saves.join("perfil 1").join("ranura.sav")).unwrap();
        fs::write(saves.join("nuevo.txt"), "de hoy").unwrap();
        assert_eq!(unpack(&zip_path, &saves).unwrap(), 2);
        assert_eq!(fs::read_to_string(saves.join("ajustes.ini")).unwrap(), "volumen=7");
        assert_eq!(fs::read(saves.join("perfil 1").join("ranura.sav")).unwrap().len(), 5000);
        assert!(saves.join("nuevo.txt").exists());

        // También en un PC donde la carpeta todavía no existe.
        let other = dir.join("otro-pc").join("partidas");
        assert_eq!(unpack(&zip_path, &other).unwrap(), 2);
        assert!(other.join("perfil 1").join("ranura.sav").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rechaza_carpetas_vacias_inexistentes_o_demasiado_grandes() {
        let dir = temp("limites");
        assert!(pack(&dir.join("no-existe"), &dir.join("a.zip"), 1000).is_err());
        fs::create_dir_all(dir.join("vacia")).unwrap();
        assert!(pack(&dir.join("vacia"), &dir.join("b.zip"), 1000).unwrap_err().contains("vacía"));

        // Datos que no se comprimen: el .zip pasa del límite y no se deja a medias en el disco.
        let big = dir.join("grande");
        fs::create_dir_all(&big).unwrap();
        let mut noise = Vec::new();
        let mut seed = 12345u32;
        for _ in 0..200_000 {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            noise.push((seed >> 24) as u8);
        }
        fs::write(big.join("todo.bin"), &noise).unwrap();
        let error = pack(&big, &dir.join("c.zip"), 50_000).unwrap_err();
        assert!(error.contains("juego entero"), "{error}");
        assert!(!dir.join("c.zip").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_restaura_copias_con_rutas_que_se_salen_de_la_carpeta() {
        let dir = temp("rutas");
        let zip_path = dir.join("mala.zip");
        let mut writer = ZipWriter::new(File::create(&zip_path).unwrap());
        writer.start_file("bien.txt", SimpleFileOptions::default()).unwrap();
        writer.write_all(b"hola").unwrap();
        writer.start_file("../../fuera.txt", SimpleFileOptions::default()).unwrap();
        writer.write_all(b"malo").unwrap();
        writer.finish().unwrap();

        let target = dir.join("a").join("b").join("partidas");
        assert!(unpack(&zip_path, &target).is_err());
        assert!(!dir.join("a").join("fuera.txt").exists());
        assert!(!target.join("bien.txt").exists(), "si la copia no es de fiar no se restaura nada");

        fs::write(dir.join("rota.zip"), b"esto no es un zip").unwrap();
        assert!(unpack(&dir.join("rota.zip"), &target).unwrap_err().contains("dañada"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn nombres_de_archivo_y_direcciones() {
        assert_eq!(slug("steam:620"), "steam-620");
        assert_eq!(slug("local:auto:c:/juegos/portal 2/portal2.exe").len() <= 60, true);
        assert_eq!(slug("::"), "juego");
        assert!(allowed("https://cuenta.r2.cloudflarestorage.com/x"));
        assert!(!allowed("http://ejemplo.test/x"));
        assert!(!allowed("file:///c:/x"));
    }

    #[test]
    fn sube_y_baja_contra_un_servidor() {
        // Servidor mínimo en el propio equipo: guarda lo que se le sube y lo devuelve.
        use std::io::{BufRead, BufReader, Read};
        use std::net::TcpListener;
        use std::sync::{Arc, Mutex};
        if std::process::Command::new("curl").arg("--version").output().is_err() {
            return;
        }
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let stored: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
        let shared = stored.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut first = String::new();
                reader.read_line(&mut first).unwrap();
                let mut length = 0usize;
                let mut expect = false;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    let lower = line.to_ascii_lowercase();
                    if let Some(value) = lower.strip_prefix("content-length:") {
                        length = value.trim().parse().unwrap_or(0);
                    }
                    if lower.starts_with("expect:") {
                        expect = true;
                    }
                    if line.trim().is_empty() {
                        break;
                    }
                }
                let mut stream = stream;
                if first.starts_with("PUT") {
                    if expect {
                        stream.write_all(b"HTTP/1.1 100 Continue\r\n\r\n").unwrap();
                    }
                    let mut body = vec![0u8; length];
                    reader.read_exact(&mut body).unwrap();
                    *shared.lock().unwrap() = body;
                    stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                } else {
                    let body = shared.lock().unwrap().clone();
                    stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).as_bytes()).unwrap();
                    stream.write_all(&body).unwrap();
                }
            }
        });

        let dir = temp("red");
        let saves = dir.join("partidas");
        fs::create_dir_all(&saves).unwrap();
        fs::write(saves.join("ranura.sav"), "partida de ayer").unwrap();
        let url = format!("http://127.0.0.1:{port}/copia.zip");
        let packed = backup(&saves, &dir, "local:juego", &url, 1024 * 1024).unwrap();
        assert_eq!(packed.files, 1);
        assert_eq!(stored.lock().unwrap().len() as u64, packed.bytes);
        assert!(!dir.join("nube").join("local-juego-subida.zip").exists(), "el temporal se borra");

        // Se sigue jugando; al restaurar vuelve la partida de la nube y lo de hoy queda guardado aparte.
        fs::write(saves.join("ranura.sav"), "partida de hoy").unwrap();
        assert_eq!(restore(&saves, &dir, "local:juego", &url).unwrap(), 1);
        assert_eq!(fs::read_to_string(saves.join("ranura.sav")).unwrap(), "partida de ayer");
        let kept = dir.join("nube").join("local-juego-antes-de-restaurar.zip");
        assert!(kept.exists());
        let check = dir.join("comprobar");
        unpack(&kept, &check).unwrap();
        assert_eq!(fs::read_to_string(check.join("ranura.sav")).unwrap(), "partida de hoy");
        let _ = fs::remove_dir_all(&dir);
    }
}
