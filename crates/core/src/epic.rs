//! Juegos instalados de Epic Games, leídos de los manifiestos que deja su launcher.
//! Epic no ofrece horas ni logros a otros programas: las horas las cuenta Red Level.

use crate::Game;
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub fn manifests_dir() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("REDLEVEL_EPIC_MANIFESTS") {
        let path = PathBuf::from(path);
        return path.is_dir().then_some(path);
    }
    let base = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".into());
    let dir = PathBuf::from(base).join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests");
    dir.is_dir().then_some(dir)
}

/// Carátulas del catálogo que el launcher de Epic guarda en el disco: id del artículo → (vertical, horizontal).
fn catalog_art(manifests: &Path) -> HashMap<String, (Option<String>, Option<String>)> {
    let mut out = HashMap::new();
    let Some(file) = manifests.parent().map(|data| data.join("Catalog").join("catcache.bin")) else {
        return out;
    };
    let Ok(raw) = fs::read(file) else {
        return out;
    };
    let cleaned: Vec<u8> = raw.into_iter().filter(|b| !b.is_ascii_whitespace()).collect();
    let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(cleaned) else {
        return out;
    };
    let Ok(Value::Array(items)) = serde_json::from_slice::<Value>(&decoded) else {
        return out;
    };
    for item in items {
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        let image = |kind: &str| {
            item.get("keyImages")?.as_array()?.iter().find_map(|img| {
                (img.get("type")?.as_str()? == kind).then(|| img.get("url")?.as_str().map(str::to_string))?
            })
        };
        out.insert(id.to_string(), (image("DieselGameBoxTall"), image("DieselGameBox")));
    }
    out
}

pub fn scan(manifests: &Path) -> Vec<Game> {
    let art = catalog_art(manifests);
    let mut games: Vec<Game> = Vec::new();
    let Ok(entries) = fs::read_dir(manifests) else {
        return games;
    };
    for entry in entries.flatten() {
        if entry.path().extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        let Ok(item) = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) else {
            continue;
        };
        let field = |key: &str| item.get(key).and_then(Value::as_str).unwrap_or("").to_string();
        let (app, title, install) = (field("AppName"), field("DisplayName"), field("InstallLocation"));
        if app.is_empty() || title.is_empty() || install.is_empty() {
            continue;
        }
        // Fuera: contenido adicional, el motor Unreal y lo que no sea un juego.
        let main = field("MainGameAppName");
        if (!main.is_empty() && main != app) || app.starts_with("UE_") {
            continue;
        }
        if let Some(categories) = item.get("AppCategories").and_then(Value::as_array) {
            let is_game = categories.iter().any(|c| c.as_str() == Some("games"));
            if !categories.is_empty() && !is_game {
                continue;
            }
        }
        if games.iter().any(|g| g.id == format!("epic:{app}")) {
            continue;
        }
        let (namespace, catalog_id) = (field("CatalogNamespace"), field("CatalogItemId"));
        let launch = if namespace.is_empty() || catalog_id.is_empty() {
            format!("com.epicgames.launcher://apps/{app}?action=launch&silent=true")
        } else {
            format!("com.epicgames.launcher://apps/{namespace}%3A{catalog_id}%3A{app}?action=launch&silent=true")
        };
        let exe = field("LaunchExecutable");
        let (tall, wide) = art.get(&catalog_id).cloned().unwrap_or((None, None));
        games.push(Game {
            id: format!("epic:{app}"),
            store: "epic".into(),
            title,
            launch,
            exe: (!exe.is_empty()).then(|| Path::new(&install).join(&exe).to_string_lossy().to_string()),
            install_dir: Some(install),
            minutes: 0,
            last_played: None,
            size_bytes: item.get("InstallSize").and_then(Value::as_u64).filter(|s| *s > 0),
            cover_file: None,
            hero_file: None,
            cover_urls: tall.iter().chain(wide.iter()).cloned().collect(),
            hero_urls: wide.iter().chain(tall.iter()).cloned().collect(),
            hours_source: "redlevel".into(),
            has_achievements: false,
        });
    }
    games
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_manifests_and_catalog() {
        let data = std::env::temp_dir().join(format!("redlevel-epic-{}", std::process::id()));
        let _ = fs::remove_dir_all(&data);
        let manifests = data.join("Manifests");
        fs::create_dir_all(&manifests).unwrap();
        fs::create_dir_all(data.join("Catalog")).unwrap();
        fs::write(
            manifests.join("A.item"),
            r#"{"DisplayName":"Aventura","InstallLocation":"D:\\Epic\\Aventura","LaunchExecutable":"Aventura.exe","AppName":"abc123","CatalogNamespace":"ns","CatalogItemId":"item1","MainGameAppName":"abc123","AppCategories":["public","games","applications"],"InstallSize":2048}"#,
        )
        .unwrap();
        fs::write(
            manifests.join("B.item"),
            r#"{"DisplayName":"Aventura - Extra","InstallLocation":"D:\\Epic\\Aventura","AppName":"dlc1","MainGameAppName":"abc123","AppCategories":["public","games"]}"#,
        )
        .unwrap();
        fs::write(manifests.join("C.item"), r#"{"DisplayName":"Unreal Engine","InstallLocation":"D:\\UE","AppName":"UE_5.4","AppCategories":["public","engines"]}"#).unwrap();
        fs::write(manifests.join("roto.item"), "{").unwrap();
        let catalog = r#"[{"id":"item1","keyImages":[{"type":"DieselGameBox","url":"https://example.com/wide.jpg"},{"type":"DieselGameBoxTall","url":"https://example.com/tall.jpg"}]}]"#;
        fs::write(data.join("Catalog").join("catcache.bin"), base64::engine::general_purpose::STANDARD.encode(catalog)).unwrap();

        let games = scan(&manifests);
        assert_eq!(games.len(), 1);
        let game = &games[0];
        assert_eq!(game.id, "epic:abc123");
        assert_eq!(game.launch, "com.epicgames.launcher://apps/ns%3Aitem1%3Aabc123?action=launch&silent=true");
        assert_eq!(game.cover_urls, vec!["https://example.com/tall.jpg", "https://example.com/wide.jpg"]);
        assert_eq!(game.size_bytes, Some(2048));
        assert_eq!(game.hours_source, "redlevel");
        let _ = fs::remove_dir_all(&data);
    }
}
