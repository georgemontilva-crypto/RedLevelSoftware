//! Juegos instalados fuera de las tiendas: se buscan solos en las carpetas de juegos del PC
//! y se les pone la portada que les corresponde por su nombre.

use std::path::{Path, PathBuf};

/// Un juego encontrado en una carpeta de juegos.
#[derive(Debug, Clone, PartialEq)]
pub struct Found {
    pub title: String,
    pub exe: String,
    pub dir: String,
}

/// Identificador estable de un juego encontrado: sale de la ruta de su programa, así conserva sus horas.
pub fn auto_id(exe: &str) -> String {
    format!("local:auto:{}", crate::norm_path(exe))
}

/// Nombre presentable a partir del de la carpeta: sin etiquetas entre corchetes, versiones ni guiones bajos.
pub fn clean_title(folder: &str) -> String {
    let mut text = String::new();
    let mut depth = 0;
    for c in folder.chars() {
        match c {
            '[' | '(' | '{' => depth += 1,
            ']' | ')' | '}' => depth = (depth - 1).max(0),
            '_' | '.' if depth == 0 => text.push(' '),
            _ if depth == 0 => text.push(c),
            _ => {}
        }
    }
    let noise = ["repack", "goty", "edition", "edicion", "edición", "deluxe", "complete", "ultimate", "definitive", "remastered", "portable", "multi", "build", "gog", "steam", "rip"];
    let mut words: Vec<&str> = Vec::new();
    for word in text.split_whitespace() {
        let lower = word.to_lowercase();
        let version = lower.starts_with('v') && lower[1..].chars().next().is_some_and(|c| c.is_ascii_digit());
        let digits = lower.chars().filter(|c| c.is_ascii_digit()).count();
        // Lo que viene después de una versión o de una etiqueta de empaquetado ya no es el nombre.
        if !words.is_empty() && (version || noise.iter().any(|n| lower == *n || lower.starts_with("multi") && digits > 0) || (digits >= 3 && lower.contains(|c: char| c.is_ascii_punctuation()))) {
            break;
        }
        words.push(word);
    }
    let title = words.join(" ").trim_matches(|c: char| c == '-' || c.is_whitespace()).to_string();
    if title.is_empty() { folder.trim().to_string() } else { title }
}

/// Programas que acompañan a un juego pero no son el juego: instaladores, avisos de error, antitrampas…
pub fn is_helper_exe(name: &str) -> bool {
    let name = name.to_lowercase();
    let starts = ["unins", "setup", "install", "vc_redist", "vcredist", "dxsetup", "dxwebsetup", "directx", "dotnet", "ndp", "oalinst", "physx", "ue4prereq", "ueprereq", "crashreport", "unitycrashhandler", "crashhandler", "crashpad", "easyanticheat", "beservice", "battleye", "cefprocess", "notification_helper", "quicksfv", "redist", "update", "patch"];
    let contains = ["crashhandler", "crashreporter", "crashsender", "errorreport", "prerequisite", "uninstall", "bootstrapper", "webhelper", "subprocess", "cleanup", "benchmark", "config", "settings", "editor", "server", "dedicated"];
    starts.iter().any(|s| name.starts_with(s)) || contains.iter().any(|s| name.contains(s))
}

fn collect_exes(dir: &Path, depth: u8, out: &mut Vec<(PathBuf, u64)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            let skip = ["_commonredist", "redist", "redistributables", "directx", "support", "__installer", "_redist", "engine\\extras"];
            if depth > 0 && !skip.contains(&name.as_str()) {
                collect_exes(&path, depth - 1, out);
            }
        } else if name.ends_with(".exe") && !is_helper_exe(&name) {
            out.push((path, entry.metadata().map(|m| m.len()).unwrap_or(0)));
        }
    }
}

/// El programa principal de un juego: el más grande de los que no son auxiliares, hasta tres carpetas adentro.
pub fn main_exe(dir: &Path) -> Option<PathBuf> {
    let mut exes = Vec::new();
    collect_exes(dir, 3, &mut exes);
    exes.into_iter().max_by_key(|(_, size)| *size).map(|(path, _)| path)
}

/// Cada subcarpeta de una carpeta de juegos que tenga un programa es un juego.
pub fn scan_folder(root: &Path) -> Vec<Found> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) || name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        if let Some(exe) = main_exe(&entry.path()) {
            found.push(Found { title: clean_title(&name), exe: exe.to_string_lossy().to_string(), dir: entry.path().to_string_lossy().to_string() });
        }
    }
    found.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    found
}

/// Carpetas donde la gente suele instalar juegos, en cada disco. Solo las que existen.
pub fn usual_folders(letters: &[String]) -> Vec<String> {
    let names = ["Games", "Juegos", "Game", "Juegos PC", "PC Games", "My Games", "Mis Juegos"];
    let mut list = Vec::new();
    for letter in letters {
        for name in names {
            let path = format!("{letter}:\\{name}");
            if Path::new(&path).is_dir() && !list.iter().any(|p: &String| p.eq_ignore_ascii_case(&path)) {
                list.push(path);
            }
        }
    }
    list
}

/// Un título reducido a letras y números en minúsculas, para comparar nombres escritos de formas distintas.
pub fn norm_title(title: &str) -> String {
    title.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}

fn words(title: &str) -> Vec<String> {
    title.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(String::from).collect()
}

/// ¿El nombre de la tienda es el mismo juego, quizá con el apellido de una edición?
/// "Tetra Online Deluxe Edition" vale para "Tetra Online"; "Tetra Cube" no vale para "Tetra".
fn same_game(store_name: &str, title: &str) -> bool {
    let editions = ["edition", "deluxe", "definitive", "complete", "ultimate", "gold", "goty", "game", "of", "the", "year", "remastered", "remaster", "enhanced", "hd", "anniversary", "directors", "director", "s", "cut", "special", "standard", "digital", "premium", "collection", "collectors", "legendary", "redux"];
    let (name, wanted) = (words(store_name), words(title));
    !wanted.is_empty() && name.len() >= wanted.len() && name[..wanted.len()] == wanted[..] && name[wanted.len()..].iter().all(|w| editions.contains(&w.as_str()))
}

/// De la respuesta del buscador de la tienda de Steam, el juego cuyo nombre coincide con el título.
/// Solo se acepta una coincidencia clara: una portada equivocada es peor que ninguna.
pub fn pick_match(json: &str, title: &str) -> Option<u64> {
    let wanted = norm_title(title);
    if wanted.len() < 2 {
        return None;
    }
    let data: serde_json::Value = serde_json::from_str(json).ok()?;
    let items = data.get("items")?.as_array()?;
    let name_of = |item: &serde_json::Value| item.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
    let apps: Vec<&serde_json::Value> = items.iter().filter(|item| item.get("type").and_then(|t| t.as_str()).unwrap_or("app") == "app").collect();
    apps.iter().find(|item| norm_title(&name_of(item)) == wanted).or_else(|| apps.iter().find(|item| same_game(&name_of(item), title))).and_then(|item| item.get("id").and_then(|id| id.as_u64()))
}

fn url_encode(text: &str) -> String {
    text.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// Busca el juego por su nombre en la tienda de Steam, que es de donde salen las portadas.
pub fn find_art(title: &str) -> Result<Option<u64>, String> {
    let url = format!("https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US", url_encode(title));
    let body = crate::updates::curl(&["--max-time", "8", &url])?;
    Ok(pick_match(&String::from_utf8_lossy(&body), title))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_become_titles() {
        assert_eq!(clean_title("Halcyon.Drift.v1.4.2-REPACK"), "Halcyon Drift");
        assert_eq!(clean_title("Ironroot Tactics [Multi12] (2024)"), "Ironroot Tactics");
        assert_eq!(clean_title("Paper_Kingdoms_Deluxe_Edition"), "Paper Kingdoms");
        assert_eq!(clean_title("Signal Lost 2"), "Signal Lost 2");
        assert_eq!(clean_title("Tetra"), "Tetra");
        assert_eq!(clean_title("[x]"), "[x]");
    }

    #[test]
    fn helpers_are_not_the_game() {
        for name in ["unins000.exe", "Setup.exe", "UnityCrashHandler64.exe", "vc_redist.x64.exe", "CrashReportClient.exe", "EasyAntiCheat_Setup.exe"] {
            assert!(is_helper_exe(name), "{name}");
        }
        for name in ["HalcyonDrift.exe", "game.exe", "Launcher.exe", "tetra-win64-shipping.exe"] {
            assert!(!is_helper_exe(name), "{name}");
        }
    }

    #[test]
    fn a_games_folder_is_scanned_for_its_games() {
        let root = std::env::temp_dir().join(format!("redlevel-carpetas-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let write = |path: &str, bytes: usize| {
            let file = root.join(path);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, vec![0u8; bytes]).unwrap();
        };
        write("Halcyon.Drift.v1.4-REPACK/unins000.exe", 9000);
        write("Halcyon.Drift.v1.4-REPACK/Launcher.exe", 300);
        write("Halcyon.Drift.v1.4-REPACK/Binaries/Win64/HalcyonDrift.exe", 5000);
        write("Halcyon.Drift.v1.4-REPACK/_CommonRedist/vcredist/big.exe", 99999);
        write("Tetra/tetra.exe", 100);
        write("Solo documentos/leeme.txt", 10);
        write("suelto.exe", 100);
        let found = scan_folder(&root);
        assert_eq!(found.iter().map(|f| f.title.as_str()).collect::<Vec<_>>(), vec!["Halcyon Drift", "Tetra"]);
        assert!(found[0].exe.ends_with("HalcyonDrift.exe"), "se elige el programa del juego, no el instalador ni el lanzador pequeño: {}", found[0].exe);
        assert_ne!(auto_id(&found[0].exe), auto_id(&found[1].exe));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn covers_only_come_from_a_clear_name_match() {
        let json = r#"{"total":3,"items":[
            {"type":"app","name":"Halcyon Drift: Soundtrack","id":11},
            {"type":"bundle","name":"Halcyon Drift","id":12},
            {"type":"app","name":"Halcyon Drift","id":13},
            {"type":"app","name":"Tetra Online Deluxe","id":14}]}"#;
        assert_eq!(pick_match(json, "halcyon drift"), Some(13));
        assert_eq!(pick_match(json, "Tetra Online"), Some(14), "vale el mismo juego con apellido de edición");
        let cube = r#"{"items":[{"type":"app","name":"Tetra Cube","id":20},{"type":"app","name":"Tetra: Game of the Year Edition","id":21}]}"#;
        assert_eq!(pick_match(cube, "Tetra"), Some(21), "otro juego que empieza igual no vale");
        assert_eq!(pick_match(r#"{"items":[{"type":"app","name":"Tetra Cube","id":20}]}"#, "Tetra"), None);
        assert_eq!(pick_match(json, "Drift"), None, "una palabra suelta no basta");
        assert_eq!(pick_match(json, "Otro juego"), None);
        assert_eq!(pick_match("no es json", "Tetra"), None);
        assert_eq!(url_encode("Signal Lost 2: Ñu"), "Signal%20Lost%202%3A%20%C3%91u");
    }
}
