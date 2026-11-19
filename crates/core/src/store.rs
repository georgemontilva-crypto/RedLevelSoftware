//! Lo que Red Level guarda en el disco: perfil, ajustes, juegos locales y horas contadas.

use crate::Game;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub name: String,
    /// Nombre del archivo de la foto dentro de la carpeta de datos.
    pub avatar: Option<String>,
}

impl Default for Profile {
    fn default() -> Self {
        Self { name: String::new(), avatar: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Anular la tecla Windows, Alt+Tab y compañía mientras Red Level está abierto.
    pub block_keys: bool,
    /// Con un juego abierto, anular también Alt+Tab.
    pub block_alt_tab_in_game: bool,
    pub hide_taskbar: bool,
    pub silence_notifications: bool,
    /// "free": se puede usar para Discord, Spotify o YouTube. "black": tapado en negro.
    pub second_monitor: String,
    /// "recent" | "played" | "name"
    pub sort: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            block_keys: true,
            block_alt_tab_in_game: false,
            hide_taskbar: true,
            silence_notifications: true,
            second_monitor: "free".into(),
            sort: "recent".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalGame {
    pub id: String,
    pub title: String,
    pub exe: String,
    #[serde(default)]
    pub cover: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayStat {
    pub seconds: u64,
    pub last_played: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Data {
    pub onboarded: bool,
    pub profile: Profile,
    pub settings: Settings,
    pub local_games: Vec<LocalGame>,
    pub play: HashMap<String, PlayStat>,
}

pub fn data_file(dir: &Path) -> PathBuf {
    dir.join("redlevel.json")
}

pub fn load(dir: &Path) -> Data {
    fs::read_to_string(data_file(dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Guarda escribiendo primero un archivo temporal, para no dejar el bueno a medias.
pub fn save(dir: &Path, data: &Data) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("redlevel.json.tmp");
    let text = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, data_file(dir)).map_err(|e| e.to_string())
}

impl Data {
    /// Añade un juego local a partir de su ejecutable. El título sale del nombre de la carpeta
    /// o, si esa no dice nada, del nombre del archivo.
    pub fn add_local(&mut self, exe: &str) -> Result<LocalGame, String> {
        let exe_text = exe.to_string();
        if self.local_games.iter().any(|g| crate::norm_path(&g.exe) == crate::norm_path(&exe_text)) {
            return Err("Ese juego ya está en tu biblioteca.".into());
        }
        let (parent, file) = crate::split_path(exe);
        let stem = file.rsplit_once('.').map_or(file, |(stem, _)| stem).to_string();
        let folder = crate::split_path(parent).1.to_string();
        let generic = ["bin", "binaries", "win64", "x64", "game", "games", "juegos", "desktop", "escritorio", "downloads", "descargas", ""];
        let title = if generic.contains(&folder.to_lowercase().as_str()) { stem } else { folder };
        let id = format!("local:{:x}", crate::now_secs() * 1000 + self.local_games.len() as u64);
        let game = LocalGame { id, title, exe: exe_text, cover: None };
        self.local_games.push(game.clone());
        Ok(game)
    }

    pub fn local_as_games(&self, data_dir: &Path) -> Vec<Game> {
        self.local_games
            .iter()
            .map(|local| {
                let dir = Some(crate::split_path(&local.exe).0.to_string()).filter(|d| !d.is_empty());
                Game {
                    id: local.id.clone(),
                    store: "local".into(),
                    title: local.title.clone(),
                    launch: local.exe.clone(),
                    install_dir: dir,
                    exe: Some(local.exe.clone()),
                    minutes: 0,
                    last_played: None,
                    size_bytes: None,
                    cover_file: local.cover.as_ref().map(|file| data_dir.join(file).to_string_lossy().to_string()),
                    hero_file: None,
                    cover_urls: vec![],
                    hero_urls: vec![],
                    hours_source: "redlevel".into(),
                    has_achievements: false,
                }
            })
            .collect()
    }

    /// Completa las horas que cuenta Red Level (Epic y locales) y la última partida.
    pub fn apply_play(&self, games: &mut [Game]) {
        for game in games {
            let Some(stat) = self.play.get(&game.id) else {
                continue;
            };
            if game.hours_source == "redlevel" {
                game.minutes = stat.seconds / 60;
            }
            if stat.last_played > game.last_played.unwrap_or(0) {
                game.last_played = Some(stat.last_played);
            }
        }
    }

    pub fn add_play(&mut self, id: &str, seconds: u64) {
        let stat = self.play.entry(id.to_string()).or_default();
        stat.seconds += seconds;
        stat.last_played = crate::now_secs();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_and_loads() {
        let dir = std::env::temp_dir().join(format!("redlevel-store-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut data = Data::default();
        assert!(data.settings.block_keys);
        data.profile.name = "Jorge".into();
        let local = data.add_local("D:\\Juegos\\Hollow Deep\\game.exe").unwrap();
        assert_eq!(local.title, "Hollow Deep");
        assert!(data.add_local("d:/juegos/hollow deep/GAME.exe").is_err());
        assert_eq!(data.add_local("D:\\Descargas\\Tetra.exe").unwrap().title, "Tetra");
        data.add_play(&local.id, 3700);
        save(&dir, &data).unwrap();
        let loaded = load(&dir);
        assert_eq!(loaded, data);

        let mut games = loaded.local_as_games(&dir);
        loaded.apply_play(&mut games);
        assert_eq!(games[0].minutes, 61);
        assert!(games[0].last_played.is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn old_or_partial_file_gets_defaults() {
        let data: Data = serde_json::from_str(r#"{"profile":{"name":"Ana"},"settings":{"hideTaskbar":false}}"#).unwrap();
        assert_eq!(data.profile.name, "Ana");
        assert!(!data.settings.hide_taskbar);
        assert!(data.settings.block_keys);
        assert_eq!(data.settings.second_monitor, "free");
    }
}
