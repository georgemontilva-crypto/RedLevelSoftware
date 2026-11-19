//! Biblioteca de Steam leída de los archivos del propio Steam: juegos instalados, horas jugadas
//! y logros. No hace falta clave de API ni perfil público.

use crate::vdf::{parse_binary, parse_text, Bin, Vdf};
use crate::{Achievement, Achievements, Game};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const CDN: &str = "https://cdn.cloudflare.steamstatic.com/steam/apps";

/// Direcciones de la carátula y del fondo de un juego de la tienda de Steam, de mejor a peor.
pub fn art_urls(appid: u64) -> (Vec<String>, Vec<String>) {
    (vec![format!("{CDN}/{appid}/library_600x900.jpg"), format!("{CDN}/{appid}/header.jpg")], vec![format!("{CDN}/{appid}/library_hero.jpg"), format!("{CDN}/{appid}/header.jpg")])
}
const ACHIEVEMENT_ICONS: &str = "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps";

/// Herramientas que Steam instala como si fueran juegos.
const TOOL_APPIDS: &[u64] = &[228980, 1070560, 1391110, 1628350, 1493710, 2180100, 250820, 1826330];

pub fn find_root() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("REDLEVEL_STEAM_ROOT") {
        let path = PathBuf::from(path);
        return path.is_dir().then_some(path);
    }
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;
        let candidates = [
            (HKEY_CURRENT_USER, "Software\\Valve\\Steam", "SteamPath"),
            (HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath"),
            (HKEY_LOCAL_MACHINE, "SOFTWARE\\Valve\\Steam", "InstallPath"),
        ];
        for (hive, key, value) in candidates {
            if let Ok(found) = RegKey::predef(hive).open_subkey(key).and_then(|k| k.get_value::<String, _>(value)) {
                let path = PathBuf::from(found.replace('/', "\\"));
                if path.is_dir() {
                    return Some(path);
                }
            }
        }
        let fallback = PathBuf::from("C:\\Program Files (x86)\\Steam");
        if fallback.is_dir() {
            return Some(fallback);
        }
    }
    None
}

/// Carpetas de biblioteca: la de Steam y las que el usuario haya añadido en otros discos.
pub fn library_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![root.to_path_buf()];
    let file = root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = fs::read_to_string(file) {
        let vdf = parse_text(&text);
        if let Some(folders) = vdf.get("libraryfolders") {
            for (key, value) in folders.entries() {
                let path = match value {
                    Vdf::Obj(_) => value.get_str("path"),
                    Vdf::Str(s) if key.chars().all(|c| c.is_ascii_digit()) => Some(s.as_str()),
                    _ => None,
                };
                if let Some(path) = path {
                    let path = PathBuf::from(path);
                    let known = dirs.iter().any(|d| crate::norm_path(&d.to_string_lossy()) == crate::norm_path(&path.to_string_lossy()));
                    if !known && path.is_dir() {
                        dirs.push(path);
                    }
                }
            }
        }
    }
    dirs
}

/// Identificador corto (el de la carpeta userdata) de la cuenta con sesión abierta.
pub fn active_user(root: &Path) -> Option<u32> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        if std::env::var("REDLEVEL_STEAM_ROOT").is_err() {
            if let Ok(id) = RegKey::predef(HKEY_CURRENT_USER)
                .open_subkey("Software\\Valve\\Steam\\ActiveProcess")
                .and_then(|k| k.get_value::<u32, _>("ActiveUser"))
            {
                if id != 0 && root.join("userdata").join(id.to_string()).is_dir() {
                    return Some(id);
                }
            }
        }
    }
    if let Ok(text) = fs::read_to_string(root.join("config").join("loginusers.vdf")) {
        let vdf = parse_text(&text);
        if let Some(users) = vdf.get("users") {
            let recent = users
                .entries()
                .iter()
                .find(|(_, user)| user.get_str("MostRecent") == Some("1"))
                .or_else(|| users.entries().first());
            if let Some(id64) = recent.and_then(|(id, _)| id.parse::<u64>().ok()) {
                let id3 = id64.wrapping_sub(76_561_197_960_265_728) as u32;
                if root.join("userdata").join(id3.to_string()).is_dir() {
                    return Some(id3);
                }
            }
        }
    }
    // Última opción: la cuenta cuya configuración se tocó más recientemente.
    let mut best: Option<(std::time::SystemTime, u32)> = None;
    for entry in fs::read_dir(root.join("userdata")).ok()?.flatten() {
        let Some(id) = entry.file_name().to_string_lossy().parse::<u32>().ok().filter(|id| *id != 0) else {
            continue;
        };
        let modified = fs::metadata(entry.path().join("config").join("localconfig.vdf"))
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        if best.map_or(true, |(time, _)| modified > time) {
            best = Some((modified, id));
        }
    }
    best.map(|(_, id)| id)
}

/// Minutos jugados y fecha de la última partida de cada juego, según Steam.
pub fn playtimes(root: &Path, user: u32) -> HashMap<u64, (u64, Option<u64>)> {
    let mut out = HashMap::new();
    let file = root.join("userdata").join(user.to_string()).join("config").join("localconfig.vdf");
    let Ok(bytes) = fs::read(file) else {
        return out;
    };
    let vdf = parse_text(&String::from_utf8_lossy(&bytes));
    if let Some(apps) = vdf.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"]) {
        for (appid, app) in apps.entries() {
            if let Ok(appid) = appid.parse::<u64>() {
                let minutes = app.get_u64("Playtime").unwrap_or(0);
                let last = app.get_u64("LastPlayed").filter(|t| *t > 0);
                out.insert(appid, (minutes, last));
            }
        }
    }
    out
}

fn find_art(root: &Path, appid: u64, names: &[&str]) -> Option<PathBuf> {
    let cache = root.join("appcache").join("librarycache");
    for name in names {
        let flat = cache.join(format!("{appid}_{name}"));
        if flat.is_file() {
            return Some(flat);
        }
    }
    // Steam nuevo: una carpeta por juego, a veces con una subcarpeta de nombre aleatorio.
    let dir = cache.join(appid.to_string());
    for name in names {
        let direct = dir.join(name);
        if direct.is_file() {
            return Some(direct);
        }
        for sub in fs::read_dir(&dir).ok()?.flatten() {
            let nested = sub.path().join(name);
            if nested.is_file() {
                return Some(nested);
            }
        }
    }
    None
}

fn stats_files(root: &Path, user: u32, appid: u64) -> (PathBuf, PathBuf) {
    let stats = root.join("appcache").join("stats");
    (
        stats.join(format!("UserGameStatsSchema_{appid}.bin")),
        stats.join(format!("UserGameStats_{user}_{appid}.bin")),
    )
}

pub fn scan(root: &Path) -> Vec<Game> {
    let user = active_user(root);
    let times = user.map(|u| playtimes(root, u)).unwrap_or_default();
    let mut games: Vec<Game> = Vec::new();
    for library in library_dirs(root) {
        let steamapps = library.join("steamapps");
        let Ok(entries) = fs::read_dir(&steamapps) else {
            continue;
        };
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !(file_name.starts_with("appmanifest_") && file_name.ends_with(".acf")) {
                continue;
            }
            let Ok(text) = fs::read_to_string(entry.path()) else {
                continue;
            };
            let vdf = parse_text(&text);
            let Some(app) = vdf.get("AppState") else {
                continue;
            };
            let (Some(appid), Some(name), Some(installdir)) = (app.get_u64("appid"), app.get_str("name"), app.get_str("installdir")) else {
                continue;
            };
            let lower = name.to_lowercase();
            if TOOL_APPIDS.contains(&appid)
                || lower.starts_with("proton ")
                || lower.starts_with("steam linux runtime")
                || lower.contains("redistributable")
                || games.iter().any(|g| g.id == format!("steam:{appid}"))
            {
                continue;
            }
            let install_dir = steamapps.join("common").join(installdir);
            let (minutes, last_local) = times.get(&appid).copied().unwrap_or((0, None));
            let last_played = last_local.or_else(|| app.get_u64("LastPlayed").filter(|t| *t > 0));
            let has_achievements = user.map_or(false, |u| stats_files(root, u, appid).0.is_file());
            games.push(Game {
                id: format!("steam:{appid}"),
                store: "steam".into(),
                title: name.to_string(),
                launch: format!("steam://rungameid/{appid}"),
                install_dir: Some(install_dir.to_string_lossy().to_string()),
                exe: None,
                minutes,
                last_played,
                size_bytes: app.get_u64("SizeOnDisk").filter(|s| *s > 0),
                cover_file: find_art(root, appid, &["library_600x900.jpg", "library_600x900.png", "library_capsule.jpg"])
                    .map(|p| p.to_string_lossy().to_string()),
                hero_file: find_art(root, appid, &["library_hero.jpg", "library_hero.png"]).map(|p| p.to_string_lossy().to_string()),
                cover_urls: vec![format!("{CDN}/{appid}/library_600x900.jpg"), format!("{CDN}/{appid}/header.jpg")],
                hero_urls: vec![format!("{CDN}/{appid}/library_hero.jpg"), format!("{CDN}/{appid}/header.jpg")],
                hours_source: "steam".into(),
                has_achievements,
            });
        }
    }
    games
}

fn localized(node: Option<&Bin>) -> String {
    match node {
        Some(Bin::Str(s)) => s.clone(),
        Some(obj @ Bin::Obj(_)) => ["spanish", "latam", "english"]
            .iter()
            .find_map(|lang| obj.get(lang).and_then(Bin::as_str))
            .or_else(|| obj.entries().iter().filter(|(k, _)| k != "token").find_map(|(_, v)| v.as_str()))
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

/// Logros de un juego a partir de dos archivos de Steam: el esquema (qué logros existen)
/// y el progreso del usuario (cuáles tiene y desde cuándo).
pub fn achievements_from(schema: &[u8], user_stats: Option<&[u8]>, appid: u64) -> Option<Achievements> {
    let schema = parse_binary(schema)?;
    let root = schema.entries().first().map(|(_, v)| v)?;
    let stats = root.get("stats")?;
    let progress = user_stats.and_then(parse_binary);
    let progress_root = progress.as_ref().and_then(|p| p.entries().first().map(|(_, v)| v));

    let mut items = Vec::new();
    for (stat_id, stat) in stats.entries() {
        let Some(bits) = stat.get("bits") else {
            continue;
        };
        let user_stat = progress_root.and_then(|p| p.get(stat_id));
        let mask = user_stat.and_then(|s| s.get("data")).and_then(Bin::as_int).unwrap_or(0) as u32;
        let times = user_stat.and_then(|s| s.get("AchievementTimes").or_else(|| s.get("achievement_times")));
        for (bit_key, bit) in bits.entries() {
            let index = bit.get("bit").and_then(Bin::as_int).or_else(|| bit_key.parse().ok()).unwrap_or(0) as u32;
            let unlocked = index < 32 && mask & (1 << index) != 0;
            let display = bit.get("display");
            let name = localized(display.and_then(|d| d.get("name")));
            let name = if name.is_empty() {
                bit.get("name").and_then(Bin::as_str).unwrap_or("Logro").to_string()
            } else {
                name
            };
            let icon_key = if unlocked { "icon" } else { "icon_gray" };
            let icon = display
                .and_then(|d| d.get(icon_key).or_else(|| d.get("icon")))
                .and_then(Bin::as_str)
                .filter(|s| !s.is_empty());
            items.push(Achievement {
                name,
                description: localized(display.and_then(|d| d.get("desc"))),
                unlocked,
                unlocked_at: times
                    .and_then(|t| t.get(&index.to_string()))
                    .and_then(Bin::as_int)
                    .filter(|t| *t > 0)
                    .map(|t| t as u64),
                hidden: display.and_then(|d| d.get("hidden")).and_then(Bin::as_int).unwrap_or(0) != 0,
                icon_url: icon.map(|file| format!("{ACHIEVEMENT_ICONS}/{appid}/{file}")),
            });
        }
    }
    if items.is_empty() {
        return None;
    }
    // Primero los conseguidos, del más reciente al más antiguo.
    items.sort_by(|a, b| b.unlocked.cmp(&a.unlocked).then(b.unlocked_at.cmp(&a.unlocked_at)));
    Some(Achievements {
        total: items.len() as u32,
        unlocked: items.iter().filter(|a| a.unlocked).count() as u32,
        items,
    })
}

pub fn achievements(root: &Path, appid: u64) -> Option<Achievements> {
    let user = active_user(root)?;
    let (schema_file, stats_file) = stats_files(root, user, appid);
    let schema = fs::read(schema_file).ok()?;
    let stats = fs::read(stats_file).ok();
    achievements_from(&schema, stats.as_deref(), appid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vdf::testutil::{int, obj, text};

    fn schema() -> Vec<u8> {
        let mut buf = Vec::new();
        obj(&mut buf, "4242", |b| {
            obj(b, "stats", |b| {
                obj(b, "1", |b| {
                    text(b, "type", "4");
                    obj(b, "bits", |b| {
                        for (i, (name, es)) in [("ACH_A", "Primer paso"), ("ACH_B", "Sin daño"), ("ACH_C", "Final secreto")].iter().enumerate() {
                            obj(b, &i.to_string(), |b| {
                                text(b, "name", name);
                                int(b, "bit", i as i32);
                                obj(b, "display", |b| {
                                    obj(b, "name", |b| {
                                        text(b, "english", "English name");
                                        text(b, "spanish", es);
                                        text(b, "token", "NEW_ACHIEVEMENT_NAME");
                                    });
                                    obj(b, "desc", |b| text(b, "english", "Do the thing"));
                                    text(b, "hidden", if i == 2 { "1" } else { "0" });
                                    text(b, "icon", "abc.jpg");
                                    text(b, "icon_gray", "abc_gray.jpg");
                                });
                            });
                        }
                    });
                });
                obj(b, "2", |b| {
                    text(b, "type", "1");
                    text(b, "name", "kills");
                });
            });
        });
        buf.push(0x08);
        buf
    }

    fn progress(mask: i32) -> Vec<u8> {
        let mut buf = Vec::new();
        obj(&mut buf, "cache", |b| {
            int(b, "crc", 1);
            obj(b, "1", |b| {
                int(b, "data", mask);
                obj(b, "AchievementTimes", |b| int(b, "1", 1_760_000_000));
            });
        });
        buf.push(0x08);
        buf
    }

    #[test]
    fn achievements_counts_bits() {
        let result = achievements_from(&schema(), Some(&progress(0b010)), 4242).unwrap();
        assert_eq!((result.total, result.unlocked), (3, 1));
        let first = &result.items[0];
        assert_eq!(first.name, "Sin daño");
        assert!(first.unlocked);
        assert_eq!(first.unlocked_at, Some(1_760_000_000));
        assert_eq!(first.icon_url.as_deref(), Some("https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/4242/abc.jpg"));
        assert!(result.items.iter().any(|a| a.hidden && a.name == "Final secreto"));
        assert_eq!(result.items[1].description, "Do the thing");
    }

    #[test]
    fn achievements_without_progress_are_all_locked() {
        let result = achievements_from(&schema(), None, 4242).unwrap();
        assert_eq!((result.total, result.unlocked), (3, 0));
        assert!(result.items[0].icon_url.as_deref().unwrap().ends_with("abc_gray.jpg"));
    }

    #[test]
    fn scans_fake_steam_folder() {
        let root = std::env::temp_dir().join(format!("redlevel-steam-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let apps = root.join("steamapps");
        fs::create_dir_all(apps.join("common").join("Prueba")).unwrap();
        fs::create_dir_all(root.join("userdata").join("1234").join("config")).unwrap();
        fs::create_dir_all(root.join("config")).unwrap();
        fs::create_dir_all(root.join("appcache").join("stats")).unwrap();
        fs::create_dir_all(root.join("appcache").join("librarycache").join("4242").join("a1b2")).unwrap();
        fs::write(apps.join("appmanifest_4242.acf"), "\"AppState\"\n{\n\"appid\" \"4242\"\n\"name\" \"Juego de prueba\"\n\"installdir\" \"Prueba\"\n\"SizeOnDisk\" \"1048576\"\n}").unwrap();
        fs::write(apps.join("appmanifest_228980.acf"), "\"AppState\" { \"appid\" \"228980\" \"name\" \"Steamworks Common Redistributables\" \"installdir\" \"x\" }").unwrap();
        fs::write(root.join("config").join("loginusers.vdf"), format!("\"users\" {{ \"{}\" {{ \"MostRecent\" \"1\" }} }}", 76_561_197_960_265_728u64 + 1234)).unwrap();
        fs::write(
            root.join("userdata").join("1234").join("config").join("localconfig.vdf"),
            "\"UserLocalConfigStore\" { \"Software\" { \"Valve\" { \"Steam\" { \"apps\" { \"4242\" { \"LastPlayed\" \"1760000000\" \"Playtime\" \"754\" } } } } } }",
        )
        .unwrap();
        fs::write(root.join("appcache").join("stats").join("UserGameStatsSchema_4242.bin"), schema()).unwrap();
        fs::write(root.join("appcache").join("stats").join("UserGameStats_1234_4242.bin"), progress(0b011)).unwrap();
        fs::write(root.join("appcache").join("librarycache").join("4242").join("a1b2").join("library_600x900.jpg"), b"x").unwrap();

        assert_eq!(active_user(&root), Some(1234));
        let games = scan(&root);
        assert_eq!(games.len(), 1);
        let game = &games[0];
        assert_eq!(game.id, "steam:4242");
        assert_eq!(game.minutes, 754);
        assert_eq!(game.last_played, Some(1_760_000_000));
        assert_eq!(game.size_bytes, Some(1_048_576));
        assert!(game.has_achievements);
        assert!(game.cover_file.as_deref().unwrap().ends_with("library_600x900.jpg"));
        assert!(game.install_dir.as_deref().unwrap().ends_with("Prueba"));
        let ach = achievements(&root, 4242).unwrap();
        assert_eq!((ach.total, ach.unlocked), (3, 2));
        let _ = fs::remove_dir_all(&root);
    }
}
