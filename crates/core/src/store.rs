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
    /// "free": con su barra y las apps que el usuario añada. "black": tapado en negro.
    pub second_monitor: String,
    /// "recent" | "played" | "name"
    pub sort: String,
    /// Tema visual elegido en la tienda.
    pub theme: String,
    /// Estilo de la interfaz (formas y efectos): "clasico", "glitch", "cristal"…
    pub look: String,
    /// Sonidos de la interfaz al moverse, abrir y cerrar.
    pub sounds: bool,
    /// Volumen de esos sonidos, de 0 a 100.
    pub sound_volume: u8,
    /// Cómo se ve la biblioteca: "shelf" (fila de carátulas), "grid" (cuadrícula) o "list" (lista).
    pub view: String,
    /// Dejar que el dueño de la cuenta abra y cierre juegos de este PC desde la web, en su teléfono.
    pub remote_control: bool,
    /// Abrir los juegos locales (los que no son de una tienda) como administrador.
    pub local_as_admin: bool,
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
            theme: "red-level".into(),
            look: "clasico".into(),
            sounds: true,
            sound_volume: 70,
            view: "shelf".into(),
            remote_control: true,
            local_as_admin: false,
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

/// Un programa del PC que el usuario añadió a la barra del segundo monitor.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct UserApp {
    pub id: String,
    pub name: String,
    pub path: String,
    /// Icono en PNG (base64), cuando se eligió de la lista de programas instalados.
    pub icon: Option<String>,
    /// Programas (en minúsculas, con .exe) que resultaron ser los de esta app al abrirla: muchas arrancan
    /// con un lanzador y acaban en un proceso con otro nombre. Sirven para reconocer sus ventanas la próxima vez.
    pub processes: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Data {
    pub onboarded: bool,
    pub profile: Profile,
    pub settings: Settings,
    pub local_games: Vec<LocalGame>,
    pub play: HashMap<String, PlayStat>,
    pub apps: Vec<UserApp>,
    /// En cuántos cuadros se divide el segundo monitor (0 en datos antiguos: pantalla sola).
    pub second_layout: u8,
    /// Carpetas del PC donde el usuario tiene juegos de fuera de las tiendas.
    pub game_folders: Vec<String>,
    /// Juegos encontrados en esas carpetas que el usuario quitó de su biblioteca.
    pub ignored: Vec<String>,
    /// Portadas ya buscadas: título normalizado → juego de la tienda de Steam (0 = no se encontró).
    pub art: HashMap<String, u64>,
    /// Juegos que el usuario ocultó de su biblioteca.
    pub hidden: Vec<String>,
    /// Bibliotecas que crea el usuario para agrupar los juegos que quiera.
    pub collections: Vec<Collection>,
    /// Logros de Red Level ya conseguidos: "juego|logro".
    pub milestones: Vec<String>,
    /// Ya se anotaron los logros que correspondían a las horas de antes de existir los logros.
    pub milestones_ready: bool,
    /// Carpeta de partidas de cada juego en este PC, para el guardado en la nube. Clave: id del juego.
    pub save_folders: HashMap<String, String>,
}

/// Una biblioteca personalizada: un nombre y los juegos que el usuario metió en ella.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub games: Vec<String>,
}

/// Logros propios de Red Level, por tiempo jugado: (identificador, nombre, minutos necesarios).
/// Valen para cualquier juego, también los que no vienen de una tienda con logros.
pub const MILESTONES: &[(&str, &str, u64)] = &[
    ("primera", "Primera partida", 1),
    ("h1", "Una hora de juego", 60),
    ("h5", "5 horas de juego", 300),
    ("h10", "10 horas de juego", 600),
    ("h25", "25 horas de juego", 1500),
    ("h50", "50 horas de juego", 3000),
    ("h100", "100 horas de juego", 6000),
    ("h250", "250 horas de juego", 15_000),
];

/// Identificador nuevo que no repite ninguno de los que ya hay (ni siquiera al quitar y añadir en el mismo segundo).
fn unique_id(prefix: &str, taken: impl Fn(&str) -> bool) -> String {
    let mut number = crate::now_secs() * 1000;
    loop {
        let id = format!("{prefix}:{number:x}");
        if !taken(&id) {
            return id;
        }
        number += 1;
    }
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
        let id = unique_id("local", |id| self.local_games.iter().any(|g| g.id == id));
        let game = LocalGame { id, title, exe: exe_text, cover: None };
        self.local_games.push(game.clone());
        Ok(game)
    }

    /// Anota los logros de Red Level que correspondan a las horas de cada juego y devuelve los recién conseguidos,
    /// como (título del juego, nombre del logro). La primera vez anota en silencio los de las horas ya jugadas.
    pub fn new_milestones(&mut self, games: &[Game]) -> Vec<(String, String)> {
        let mut fresh = Vec::new();
        for game in games {
            for (id, name, minutes) in MILESTONES {
                let key = format!("{}|{id}", game.id);
                if game.minutes >= *minutes && !self.milestones.contains(&key) {
                    self.milestones.push(key);
                    fresh.push((game.title.clone(), name.to_string()));
                }
            }
        }
        if !self.milestones_ready {
            self.milestones_ready = true;
            return Vec::new();
        }
        fresh
    }

    pub fn set_hidden(&mut self, id: &str, hidden: bool) {
        self.hidden.retain(|h| h != id);
        if hidden {
            self.hidden.push(id.to_string());
        }
    }

    /// Crea una biblioteca personalizada o le cambia el nombre a una que ya existe.
    pub fn save_collection(&mut self, id: Option<&str>, name: &str) -> Result<String, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Ponle un nombre a la biblioteca.".into());
        }
        if self.collections.iter().any(|c| c.name.eq_ignore_ascii_case(name) && Some(c.id.as_str()) != id) {
            return Err("Ya tienes una biblioteca con ese nombre.".into());
        }
        if let Some(existing) = id.and_then(|id| self.collections.iter_mut().find(|c| c.id == id)) {
            existing.name = name.to_string();
            return Ok(existing.id.clone());
        }
        if self.collections.len() >= 20 {
            return Err("Puedes tener hasta 20 bibliotecas.".into());
        }
        let id = unique_id("biblioteca", |id| self.collections.iter().any(|c| c.id == id));
        self.collections.push(Collection { id: id.clone(), name: name.to_string(), games: Vec::new() });
        Ok(id)
    }

    pub fn delete_collection(&mut self, id: &str) {
        self.collections.retain(|c| c.id != id);
    }

    /// Mete un juego en una biblioteca, o lo saca si ya estaba.
    pub fn toggle_in_collection(&mut self, collection: &str, game: &str) {
        if let Some(found) = self.collections.iter_mut().find(|c| c.id == collection) {
            if found.games.iter().any(|g| g == game) {
                found.games.retain(|g| g != game);
            } else {
                found.games.push(game.to_string());
            }
        }
    }

    /// Añade a la barra un programa elegido de la lista de instalados, con su nombre y su icono.
    pub fn add_installed_app(&mut self, app: &crate::system::InstalledApp) -> Result<UserApp, String> {
        let path = if app.id.contains(":\\") { app.id.clone() } else { format!("{}{}", crate::system::SHELL_PREFIX, app.id) };
        let mut added = self.add_app(&path)?;
        added.name = app.name.trim().to_string();
        added.icon = app.icon.clone();
        if let Some(saved) = self.apps.iter_mut().find(|a| a.id == added.id) {
            *saved = added.clone();
        }
        Ok(added)
    }

    /// Añade un programa a la barra del segundo monitor. El nombre sale del archivo.
    pub fn add_app(&mut self, path: &str) -> Result<UserApp, String> {
        if self.apps.iter().any(|a| crate::norm_path(&a.path) == crate::norm_path(path)) {
            return Err("Esa app ya está en tu barra.".into());
        }
        if self.apps.len() >= 12 {
            return Err("La barra admite hasta 12 apps. Quita una para añadir otra.".into());
        }
        let id = unique_id("app", |id| self.apps.iter().any(|a| a.id == id));
        let app = UserApp { id, name: crate::apps::display_name(path), path: path.to_string(), icon: None, processes: Vec::new() };
        self.apps.push(app.clone());
        Ok(app)
    }

    pub fn remove_app(&mut self, id: &str) {
        self.apps.retain(|a| a.id != id);
    }

    /// Convierte en juego de la biblioteca, con sus datos guardados, uno encontrado en una carpeta.
    /// Así se le puede cambiar el nombre o la carátula como a cualquier juego añadido a mano.
    pub fn adopt(&mut self, id: &str, found: &[crate::folders::Found]) -> bool {
        if self.local_games.iter().any(|g| g.id == id) {
            return true;
        }
        let Some(game) = found.iter().find(|f| crate::folders::auto_id(&f.exe) == id) else {
            return false;
        };
        self.local_games.push(LocalGame { id: id.to_string(), title: game.title.clone(), exe: game.exe.clone(), cover: None });
        true
    }

    /// Quita un juego local de la biblioteca. Si salía de una carpeta de juegos, no vuelve a aparecer.
    pub fn remove_local(&mut self, id: &str) {
        self.local_games.retain(|g| g.id != id);
        if id.starts_with("local:auto:") && !self.ignored.iter().any(|i| i == id) {
            self.ignored.push(id.to_string());
        }
    }

    fn art_of(&self, title: &str) -> (Vec<String>, Vec<String>) {
        match self.art.get(&crate::folders::norm_title(title)) {
            Some(appid) if *appid > 0 => crate::steam::art_urls(*appid),
            _ => (vec![], vec![]),
        }
    }

    /// Títulos de juegos locales cuya portada todavía no se ha buscado.
    pub fn titles_without_art(&self, games: &[Game]) -> Vec<String> {
        let mut titles: Vec<String> = games.iter().filter(|g| g.store == "local" && g.cover_file.is_none() && !self.art.contains_key(&crate::folders::norm_title(&g.title))).map(|g| g.title.clone()).collect();
        titles.dedup();
        titles
    }

    /// Los juegos locales: los añadidos a mano y los encontrados en las carpetas de juegos.
    /// `store_dirs` son las carpetas de los juegos de Steam y Epic, para no repetirlos.
    pub fn local_as_games(&self, data_dir: &Path, found: &[crate::folders::Found], store_dirs: &[String]) -> Vec<Game> {
        let mut games: Vec<Game> = self.manual_as_games(data_dir);
        let store_dirs: Vec<String> = store_dirs.iter().map(|d| crate::norm_path(d)).collect();
        for item in found {
            let id = crate::folders::auto_id(&item.exe);
            let dir = crate::norm_path(&item.dir);
            let known = self.local_games.iter().any(|g| g.id == id || crate::norm_path(&g.exe) == crate::norm_path(&item.exe));
            let from_store = store_dirs.iter().any(|store| *store == dir || store.starts_with(&format!("{dir}\\")) || dir.starts_with(&format!("{store}\\")));
            if known || from_store || self.ignored.contains(&id) {
                continue;
            }
            let (cover_urls, hero_urls) = self.art_of(&item.title);
            games.push(Game {
                id,
                store: "local".into(),
                title: item.title.clone(),
                launch: item.exe.clone(),
                install_dir: Some(item.dir.clone()),
                exe: Some(item.exe.clone()),
                minutes: 0,
                last_played: None,
                size_bytes: None,
                cover_file: None,
                hero_file: None,
                cover_urls,
                hero_urls,
                hours_source: "redlevel".into(),
                has_achievements: false,
            });
        }
        games
    }

    fn manual_as_games(&self, data_dir: &Path) -> Vec<Game> {
        self.local_games
            .iter()
            .map(|local| {
                let dir = Some(crate::split_path(&local.exe).0.to_string()).filter(|d| !d.is_empty());
                let (cover_urls, hero_urls) = self.art_of(&local.title);
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
                    cover_urls,
                    hero_urls,
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

        let mut games = loaded.local_as_games(&dir, &[], &[]);
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

    #[test]
    fn apps_for_the_second_monitor_are_added_once_and_removed() {
        let mut data = Data::default();
        let app = data.add_app(r"C:\Program Files\Chat Voz\Chat Voz.exe").unwrap();
        assert_eq!(app.name, "Chat Voz");
        assert!(data.add_app(r"c:\program files\chat voz\CHAT VOZ.EXE").is_err(), "la misma ruta no entra dos veces");
        let other = data.add_app(r"D:\Musica\Reproductor.exe").unwrap();
        assert_ne!(app.id, other.id);
        data.remove_app(&app.id);
        assert_eq!(data.apps, vec![other]);
        let listed = crate::system::InstalledApp { name: " Música ".into(), id: "Musica.App_abc123!App".into(), icon: Some("AAAA".into()) };
        let music = data.add_installed_app(&listed).unwrap();
        assert_eq!((music.name.as_str(), music.path.as_str(), music.icon.as_deref()), ("Música", r"shell:AppsFolder\Musica.App_abc123!App", Some("AAAA")));
        assert_eq!(data.apps.last(), Some(&music), "queda guardada con su nombre y su icono");
        assert!(data.add_installed_app(&listed).is_err());
        data.remove_app(&music.id);
        // Los datos guardados por versiones anteriores no traen la lista y se leen igual.
        let old: Data = serde_json::from_str(r#"{"onboarded":true}"#).unwrap();
        assert!(old.apps.is_empty());
    }

    #[test]
    fn games_found_in_folders_join_the_library_once() {
        use crate::folders::{auto_id, Found};
        let found = vec![
            Found { title: "Halcyon Drift".into(), exe: r"D:\Juegos\Halcyon\hd.exe".into(), dir: r"D:\Juegos\Halcyon".into() },
            Found { title: "Tetra".into(), exe: r"D:\Juegos\Tetra\tetra.exe".into(), dir: r"D:\Juegos\Tetra".into() },
            Found { title: "De Steam".into(), exe: r"D:\Juegos\SteamLibrary\steamapps\common\Kiln\kiln.exe".into(), dir: r"D:\Juegos\SteamLibrary".into() },
        ];
        let store_dirs = vec![r"D:\Juegos\SteamLibrary\steamapps\common\Kiln".to_string()];
        let mut data = Data::default();
        data.add_local(r"D:\Juegos\Tetra\tetra.exe").unwrap();
        data.art.insert("halcyondrift".into(), 4242);
        let dir = Path::new("datos");
        let games = data.local_as_games(dir, &found, &store_dirs);
        assert_eq!(games.iter().map(|g| g.title.as_str()).collect::<Vec<_>>(), vec!["Tetra", "Halcyon Drift"], "ni el repetido ni el de Steam entran dos veces");
        let halcyon = &games[1];
        assert_eq!(halcyon.id, auto_id(r"D:\Juegos\Halcyon\hd.exe"));
        assert!(halcyon.cover_urls[0].contains("/4242/"), "lleva la portada encontrada por su nombre");
        assert_eq!(data.titles_without_art(&games), vec!["Tetra".to_string()]);

        // Al cambiarle algo pasa a guardarse como un juego más, con el mismo identificador (y sus horas).
        assert!(data.adopt(&halcyon.id, &found));
        assert!(!data.adopt("local:auto:nada", &found));
        assert_eq!(data.local_as_games(dir, &found, &store_dirs).len(), 2);
        // Al quitarlo no vuelve a aparecer aunque siga en la carpeta.
        data.remove_local(&halcyon.id);
        assert_eq!(data.local_as_games(dir, &found, &store_dirs).iter().map(|g| g.title.as_str()).collect::<Vec<_>>(), vec!["Tetra"]);
    }

    #[test]
    fn libraries_hidden_games_and_milestones() {
        let mut data = Data::default();
        let favorites = data.save_collection(None, "  Favoritos ").unwrap();
        assert!(data.save_collection(None, "favoritos").is_err(), "no se repite el nombre");
        assert!(data.save_collection(None, "  ").is_err());
        assert_eq!(data.save_collection(Some(&favorites), "Para jugar con amigos").unwrap(), favorites);
        data.toggle_in_collection(&favorites, "steam:1");
        data.toggle_in_collection(&favorites, "local:2");
        data.toggle_in_collection(&favorites, "steam:1");
        assert_eq!(data.collections[0].games, vec!["local:2".to_string()]);
        assert_eq!(data.collections[0].name, "Para jugar con amigos");
        data.delete_collection(&favorites);
        assert!(data.collections.is_empty());

        data.set_hidden("steam:1", true);
        data.set_hidden("steam:1", true);
        assert_eq!(data.hidden, vec!["steam:1".to_string()]);
        data.set_hidden("steam:1", false);
        assert!(data.hidden.is_empty());

        let mut game = Game { id: "local:2".into(), title: "Tetra".into(), minutes: 700, ..Default::default() };
        assert!(data.new_milestones(&[game.clone()]).is_empty(), "las horas de antes se anotan sin avisar");
        assert_eq!(data.milestones.len(), 4);
        assert!(data.new_milestones(&[game.clone()]).is_empty());
        game.minutes = 1500;
        assert_eq!(data.new_milestones(&[game.clone()]), vec![("Tetra".to_string(), "25 horas de juego".to_string())]);
        assert!(data.new_milestones(&[game]).is_empty(), "cada logro se anuncia una sola vez");
    }
}
