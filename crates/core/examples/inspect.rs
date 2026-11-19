//! Muestra lo que Red Level lee de las bibliotecas de este equipo (o de las de prueba,
//! con REDLEVEL_STEAM_ROOT y REDLEVEL_EPIC_MANIFESTS). Sirve para diagnosticar sin abrir la app.

use redlevel_core::{epic, steam};

fn main() {
    match steam::find_root() {
        Some(root) => {
            println!("Steam: {}", root.display());
            for game in steam::scan(&root) {
                let appid: u64 = game.id.trim_start_matches("steam:").parse().unwrap_or(0);
                let achievements = steam::achievements(&root, appid).map(|a| format!("{}/{}", a.unlocked, a.total)).unwrap_or_else(|| "-".into());
                println!("  {:<24} {:>6} min  logros {:<7} carátula {}", game.title, game.minutes, achievements, if game.cover_file.is_some() { "sí" } else { "no" });
            }
        }
        None => println!("Steam: no encontrado"),
    }
    match epic::manifests_dir() {
        Some(dir) => {
            println!("Epic: {}", dir.display());
            for game in epic::scan(&dir) {
                println!("  {:<24} {}", game.title, game.launch);
            }
        }
        None => println!("Epic: no encontrado"),
    }
}
