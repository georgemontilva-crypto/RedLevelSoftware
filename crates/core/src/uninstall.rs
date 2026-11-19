//! Desinstalar un juego sin pasar por la ventana de confirmación de su tienda ni por su desinstalador:
//! se borra su carpeta y lo que la tienda guarda para darlo por instalado.
//!
//! Borrar carpetas no tiene vuelta atrás, así que antes de tocar nada se comprueba que la carpeta es de ese
//! juego y solo de ese juego. Si hay duda, no se borra.

use crate::{norm_path, Game};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// Carpetas que nunca son "la carpeta de un juego", se llamen como se llamen las de alrededor.
const NEVER: &[&str] = &[
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "users",
    "usuarios",
    "desktop",
    "escritorio",
    "documents",
    "documentos",
    "my documents",
    "mis documentos",
    "downloads",
    "descargas",
    "pictures",
    "imágenes",
    "imagenes",
    "music",
    "música",
    "musica",
    "videos",
    "vídeos",
    "onedrive",
    "appdata",
    "local",
    "roaming",
    "steam",
    "steamapps",
    "steamlibrary",
    "common",
    "epic games",
    "games",
    "juegos",
];

fn parts(path: &str) -> Vec<&str> {
    path.split('\\').filter(|part| !part.is_empty()).collect()
}

fn inside(path: &str, folder: &str) -> bool {
    path == folder || path.starts_with(&format!("{folder}\\"))
}

/// ¿Es una carpeta del sistema, del usuario o un contenedor de juegos? `home` es la carpeta personal del usuario.
pub fn is_protected(dir: &str, home: Option<&str>) -> bool {
    let dir = norm_path(dir);
    let pieces = parts(&dir);
    // La raíz de un disco, o nada.
    if pieces.len() < 2 {
        return true;
    }
    if pieces.last().is_some_and(|last| NEVER.contains(last)) {
        return true;
    }
    // Windows entero, por dentro también.
    if pieces.get(1) == Some(&"windows") {
        return true;
    }
    if let Some(home) = home.map(norm_path).filter(|h| !h.is_empty()) {
        // La carpeta personal, lo que la contiene y sus carpetas de primer nivel (Escritorio, Documentos…).
        if inside(&home, &dir) || parts(&dir).len() == parts(&home).len() + 1 && inside(&dir, &home) {
            return true;
        }
    }
    false
}

/// La carpeta que se puede borrar para desinstalar ese juego, o por qué no se debe borrar ninguna.
/// `others` son los demás juegos de la biblioteca: si alguno vive dentro, la carpeta no es solo de este.
pub fn folder_of(game: &Game, others: &[Game], home: Option<&str>) -> Result<String, String> {
    let dir = game.install_dir.clone().filter(|d| !d.trim().is_empty()).ok_or("no sé en qué carpeta está")?;
    let norm = norm_path(&dir);
    if is_protected(&norm, home) {
        return Err("está en una carpeta que no es solo suya".into());
    }
    let shares = others.iter().filter(|other| other.id != game.id).any(|other| {
        let other_dir = other.install_dir.as_deref().map(norm_path).unwrap_or_default();
        let other_exe = other.exe.as_deref().map(norm_path).unwrap_or_default();
        (!other_dir.is_empty() && (inside(&other_dir, &norm) || inside(&norm, &other_dir))) || (!other_exe.is_empty() && inside(&other_exe, &norm))
    });
    if shares {
        return Err("su carpeta tiene más juegos dentro".into());
    }
    if game.store == "local" {
        // Un acceso directo o un .bat no dicen dónde está el juego: su carpeta puede ser cualquiera.
        if !norm_path(&game.launch).ends_with(".exe") {
            return Err("se abre con un acceso directo, y no sé cuál es su carpeta".into());
        }
        // Un juego añadido a mano desde una carpeta poco profunda (D:\Cosas) puede tener al lado archivos que no son suyos.
        if !game.id.starts_with("local:auto:") && parts(&norm).len() < 3 {
            return Err("está en una carpeta que puede tener más cosas".into());
        }
        // Y tiene que ser el programa principal de su carpeta: si hay otro mayor, la carpeta es de otra cosa.
        let main = crate::folders::main_exe(Path::new(&dir)).map(|exe| norm_path(&exe.to_string_lossy()));
        if main.as_deref() != Some(norm_path(&game.launch).as_str()) {
            return Err("en su carpeta hay más programas".into());
        }
    }
    Ok(dir)
}

fn unlock(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        // No se siguen los enlaces: lo que apunten no es de este juego.
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            unlock(&entry.path());
        } else if let Ok(meta) = entry.metadata() {
            let mut permissions = meta.permissions();
            if permissions.readonly() {
                #[allow(clippy::permissions_set_readonly_false)]
                permissions.set_readonly(false);
                let _ = fs::set_permissions(entry.path(), permissions);
            }
        }
    }
}

/// Borra una carpeta entera. Los archivos de solo lectura (los hay en muchos juegos) no la frenan.
pub fn remove_tree(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    if fs::remove_dir_all(dir).is_ok() {
        return Ok(());
    }
    unlock(dir);
    fs::remove_dir_all(dir).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            "Windows no deja borrar esa carpeta: hace falta permiso de administrador o hay algo abierto dentro.".to_string()
        } else {
            format!("No se pudo borrar la carpeta: {e}")
        }
    })
}

/// Lo que hay que borrar para que Steam deje de dar un juego por instalado.
#[derive(Debug, Clone, PartialEq)]
pub struct SteamPlan {
    /// La carpeta del juego, dentro de steamapps\common.
    pub folder: PathBuf,
    /// Su ficha de instalación (appmanifest_N.acf).
    pub manifest: PathBuf,
    /// Descargas a medias, sombreadores y contenido del Workshop de ese juego.
    pub extras: Vec<PathBuf>,
}

/// Busca el juego en las bibliotecas de Steam (cada una con su carpeta steamapps).
pub fn steam_plan(libraries: &[PathBuf], appid: u64) -> Result<SteamPlan, String> {
    for library in libraries {
        let steamapps = library.join("steamapps");
        let manifest = steamapps.join(format!("appmanifest_{appid}.acf"));
        let Ok(text) = fs::read_to_string(&manifest) else {
            continue;
        };
        let vdf = crate::vdf::parse_text(&text);
        let name = vdf.get("AppState").and_then(|app| app.get_str("installdir")).unwrap_or("").trim().to_string();
        // El nombre de la carpeta lo pone la ficha: tiene que ser una sola carpeta, sin subir ni bajar de nivel.
        if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', ':']) {
            return Err("La ficha de Steam de ese juego no dice bien cuál es su carpeta.".into());
        }
        let id = appid.to_string();
        return Ok(SteamPlan {
            folder: steamapps.join("common").join(name),
            manifest,
            extras: vec![
                steamapps.join("downloading").join(&id),
                steamapps.join("temp").join(&id),
                steamapps.join("shadercache").join(&id),
                steamapps.join("workshop").join("content").join(&id),
                steamapps.join("workshop").join(format!("appworkshop_{id}.acf")),
            ],
        });
    }
    Err("Steam ya no tiene ese juego instalado.".into())
}

/// Desinstala un juego de Steam: primero su carpeta y, solo si se pudo, su ficha. Así nunca queda a medias
/// de forma que Steam lo crea instalado sin estarlo. Las partidas guardadas no se tocan.
/// `remove` es quien borra la carpeta del juego (puede pedir permiso de administrador si hace falta).
pub fn steam_with(libraries: &[PathBuf], appid: u64, remove: impl Fn(&Path) -> Result<(), String>) -> Result<(), String> {
    let plan = steam_plan(libraries, appid)?;
    remove(&plan.folder)?;
    fs::remove_file(&plan.manifest).map_err(|e| format!("Se borró el juego, pero no su ficha de Steam: {e}"))?;
    for extra in &plan.extras {
        if extra.is_dir() {
            let _ = remove_tree(extra);
        } else {
            let _ = fs::remove_file(extra);
        }
    }
    Ok(())
}

pub fn steam(libraries: &[PathBuf], appid: u64) -> Result<(), String> {
    steam_with(libraries, appid, remove_tree)
}

/// Lo que hay que borrar para que Epic deje de dar un juego por instalado.
#[derive(Debug, Clone, PartialEq)]
pub struct EpicPlan {
    pub folder: PathBuf,
    /// Las fichas del juego y de su contenido adicional.
    pub items: Vec<PathBuf>,
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

pub fn epic_plan(manifests: &Path, app: &str) -> Result<EpicPlan, String> {
    let mut folder: Option<PathBuf> = None;
    let mut items = Vec::new();
    for entry in fs::read_dir(manifests).map_err(|_| "No encuentro los datos de Epic en este PC.".to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }
        let Some(item) = read_json(&path) else {
            continue;
        };
        let field = |key: &str| item.get(key).and_then(Value::as_str).unwrap_or("");
        if field("AppName") == app {
            let location = field("InstallLocation").trim();
            if !location.is_empty() {
                folder = Some(PathBuf::from(location));
            }
            items.push(path);
        } else if field("MainGameAppName") == app {
            items.push(path);
        }
    }
    let folder = folder.ok_or("Epic ya no tiene ese juego instalado.")?;
    Ok(EpicPlan { folder, items })
}

/// Quita el juego de la lista de instalados que comparten los programas de Epic (LauncherInstalled.dat).
pub fn epic_forget(installed: &Path, app: &str) {
    let Some(mut data) = read_json(installed) else {
        return;
    };
    let Some(list) = data.get_mut("InstallationList").and_then(Value::as_array_mut) else {
        return;
    };
    let before = list.len();
    list.retain(|entry| entry.get("AppName").and_then(Value::as_str) != Some(app));
    if list.len() != before {
        if let Ok(text) = serde_json::to_string_pretty(&data) {
            let _ = fs::write(installed, text);
        }
    }
}

/// Desinstala un juego de Epic: su carpeta, sus fichas y su entrada en la lista de instalados.
pub fn epic_with(manifests: &Path, installed: Option<&Path>, app: &str, home: Option<&str>, remove: impl Fn(&Path) -> Result<(), String>) -> Result<(), String> {
    let plan = epic_plan(manifests, app)?;
    if is_protected(&plan.folder.to_string_lossy(), home) {
        return Err("Epic dice que ese juego está en una carpeta que no es solo suya, así que no la borro.".into());
    }
    remove(&plan.folder)?;
    for item in &plan.items {
        let _ = fs::remove_file(item);
    }
    if let Some(installed) = installed {
        epic_forget(installed, app);
    }
    Ok(())
}

pub fn epic(manifests: &Path, installed: Option<&Path>, app: &str, home: Option<&str>) -> Result<(), String> {
    epic_with(manifests, installed, app, home, remove_tree)
}

/// ¿Es el desinstalador de Inno Setup (el de casi todos los instaladores de juegos)? Ese se puede pasar en
/// silencio, y además de los archivos quita los accesos directos y la entrada en "Aplicaciones" de Windows.
pub fn inno_uninstaller(dir: &Path) -> Option<PathBuf> {
    let exe = crate::folders::uninstaller(dir)?;
    let name = exe.file_name()?.to_string_lossy().to_lowercase();
    (name.starts_with("unins") && exe.with_extension("dat").is_file()).then_some(exe)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("redlevel-desinstalar-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn game(id: &str, store: &str, dir: &str, exe: &str) -> Game {
        Game { id: id.into(), store: store.into(), title: id.into(), launch: exe.into(), install_dir: Some(dir.into()), exe: Some(exe.into()), ..Default::default() }
    }

    #[test]
    fn las_carpetas_del_sistema_y_del_usuario_no_se_borran_nunca() {
        let home = Some(r"C:\Users\Jorge");
        for dir in [r"C:\", r"D:", r"C:\Windows\System32\juego", r"C:\Program Files", r"C:\Users", r"C:\Users\Jorge", r"C:\Users\Jorge\Desktop", r"C:\Users\Jorge\Saved Games", r"D:\Juegos", r"D:\SteamLibrary\steamapps\common", r"C:\Users\Jorge\OneDrive\Escritorio"] {
            assert!(is_protected(dir, home), "{dir} tendría que estar protegida");
        }
        for dir in [r"D:\Juegos\Hades", r"C:\Program Files\Epic Games\Fortnite", r"C:\Users\Jorge\Downloads\Celeste", r"D:\Hades", r"D:\SteamLibrary\steamapps\common\Hades"] {
            assert!(!is_protected(dir, home), "{dir} es la carpeta de un juego");
        }
    }

    #[test]
    fn un_juego_local_solo_se_borra_si_la_carpeta_es_solo_suya() {
        let root = temp("local");
        let hades = root.join("juegos-de-prueba").join("Hades");
        fs::create_dir_all(&hades).unwrap();
        fs::write(hades.join("Hades.exe"), vec![0u8; 4096]).unwrap();
        let exe = hades.join("Hades.exe").to_string_lossy().to_string();
        let dir = hades.to_string_lossy().to_string();

        let found = game("local:auto:1", "local", &dir, &exe);
        assert_eq!(folder_of(&found, &[], None), Ok(dir.clone()));

        // Otro juego dentro de la misma carpeta: no es solo suya.
        let other = game("local:auto:2", "local", &hades.join("extra").to_string_lossy(), &hades.join("extra").join("otro.exe").to_string_lossy());
        assert!(folder_of(&found, &[other], None).is_err());

        // Un acceso directo no dice dónde está el juego.
        let shortcut = game("local:9", "local", &dir, &hades.join("Hades.lnk").to_string_lossy());
        assert!(folder_of(&shortcut, &[], None).is_err());

        // Si en la carpeta hay un programa mayor, el juego añadido a mano no es el dueño de la carpeta.
        fs::write(hades.join("Otro.exe"), vec![0u8; 90_000]).unwrap();
        let manual = game("local:3", "local", &dir, &exe);
        assert!(folder_of(&manual, &[], None).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn steam_borra_la_carpeta_la_ficha_y_los_restos_y_deja_lo_demas() {
        let root = temp("steam");
        let steamapps = root.join("steamapps");
        fs::create_dir_all(steamapps.join("common").join("Hades").join("x64")).unwrap();
        fs::create_dir_all(steamapps.join("common").join("Celeste")).unwrap();
        fs::create_dir_all(steamapps.join("shadercache").join("1145360")).unwrap();
        fs::write(steamapps.join("common").join("Hades").join("x64").join("Hades.exe"), b"juego").unwrap();
        fs::write(steamapps.join("common").join("Celeste").join("Celeste.exe"), b"otro").unwrap();
        fs::write(steamapps.join("appmanifest_1145360.acf"), "\"AppState\"\n{\n\t\"appid\"\t\"1145360\"\n\t\"name\"\t\"Hades\"\n\t\"installdir\"\t\"Hades\"\n}\n").unwrap();
        fs::write(steamapps.join("appmanifest_504230.acf"), "\"AppState\"\n{\n\t\"appid\"\t\"504230\"\n\t\"name\"\t\"Celeste\"\n\t\"installdir\"\t\"Celeste\"\n}\n").unwrap();

        // Un archivo de solo lectura no impide borrar.
        let locked = steamapps.join("common").join("Hades").join("solo-lectura.dat");
        fs::write(&locked, b"x").unwrap();
        let mut permissions = fs::metadata(&locked).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&locked, permissions).unwrap();

        assert_eq!(steam(&[root.clone()], 1145360), Ok(()));
        assert!(!steamapps.join("common").join("Hades").exists());
        assert!(!steamapps.join("appmanifest_1145360.acf").exists());
        assert!(!steamapps.join("shadercache").join("1145360").exists());
        assert!(steamapps.join("common").join("Celeste").join("Celeste.exe").exists());
        assert!(steamapps.join("appmanifest_504230.acf").exists());
        assert!(steam(&[root.clone()], 1145360).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn steam_no_se_fia_de_una_ficha_que_apunta_fuera_de_su_carpeta() {
        let root = temp("steam-raro");
        let steamapps = root.join("steamapps");
        fs::create_dir_all(steamapps.join("common")).unwrap();
        fs::write(root.join("importante.txt"), b"no tocar").unwrap();
        fs::write(steamapps.join("appmanifest_7.acf"), "\"AppState\"\n{\n\t\"appid\"\t\"7\"\n\t\"name\"\t\"Raro\"\n\t\"installdir\"\t\"..\\\\..\"\n}\n").unwrap();
        assert!(steam(&[root.clone()], 7).is_err());
        assert!(root.join("importante.txt").exists());
        assert!(steamapps.join("appmanifest_7.acf").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn epic_borra_el_juego_sus_fichas_y_su_entrada_en_la_lista() {
        let root = temp("epic");
        let manifests = root.join("Manifests");
        let folder = root.join("Epic de prueba").join("Fortnite");
        fs::create_dir_all(&manifests).unwrap();
        fs::create_dir_all(folder.join("Binaries")).unwrap();
        fs::write(folder.join("Binaries").join("Fortnite.exe"), b"juego").unwrap();
        let location = folder.to_string_lossy().replace('\\', "\\\\");
        fs::write(manifests.join("A1.item"), format!("{{\"AppName\":\"Fortnite\",\"DisplayName\":\"Fortnite\",\"InstallLocation\":\"{location}\"}}")).unwrap();
        fs::write(manifests.join("B2.item"), format!("{{\"AppName\":\"FortniteDLC\",\"MainGameAppName\":\"Fortnite\",\"InstallLocation\":\"{location}\"}}")).unwrap();
        fs::write(manifests.join("C3.item"), "{\"AppName\":\"Otro\",\"DisplayName\":\"Otro\",\"InstallLocation\":\"/no/existe/otro\"}").unwrap();
        let installed = root.join("LauncherInstalled.dat");
        fs::write(&installed, "{\"InstallationList\":[{\"AppName\":\"Fortnite\"},{\"AppName\":\"Otro\"}]}").unwrap();

        assert_eq!(epic(&manifests, Some(&installed), "Fortnite", None), Ok(()));
        assert!(!folder.exists());
        assert!(!manifests.join("A1.item").exists());
        assert!(!manifests.join("B2.item").exists());
        assert!(manifests.join("C3.item").exists());
        let left = fs::read_to_string(&installed).unwrap();
        assert!(left.contains("Otro") && !left.contains("Fortnite"));
        assert!(epic(&manifests, Some(&installed), "Fortnite", None).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn solo_el_desinstalador_de_inno_se_pasa_en_silencio() {
        let root = temp("inno");
        fs::write(root.join("unins000.exe"), b"x").unwrap();
        assert!(inno_uninstaller(&root).is_none());
        fs::write(root.join("unins000.dat"), b"x").unwrap();
        assert!(inno_uninstaller(&root).is_some_and(|exe| exe.ends_with("unins000.exe")));
        let _ = fs::remove_dir_all(root);
    }
}
