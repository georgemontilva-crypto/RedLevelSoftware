//! Saber qué juego está abierto mirando los procesos de Windows. Así se cuentan las horas
//! de los juegos de Epic y locales, y se sabe cuándo volver a mostrar Red Level.

use crate::{norm_path, Game};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

/// Programas que viven en la carpeta del juego pero no son el juego.
const NOT_THE_GAME: &[&str] = &["crash", "unins", "redist", "setup", "installer", "launcher_helper", "dxwebsetup", "report"];

pub struct Probe {
    system: System,
}

#[derive(Debug, Clone)]
pub struct RunningExe {
    pub pid: u32,
    /// Ruta completa normalizada (minúsculas, barras de Windows).
    pub path: String,
    pub name: String,
}

impl Default for Probe {
    fn default() -> Self {
        Self::new()
    }
}

impl Probe {
    pub fn new() -> Self {
        Self { system: System::new() }
    }

    pub fn running(&mut self) -> Vec<RunningExe> {
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
        );
        self.system
            .processes()
            .iter()
            .filter_map(|(pid, process)| {
                let exe = process.exe()?;
                let path = norm_path(&exe.to_string_lossy());
                let name = path.rsplit('\\').next().unwrap_or("").to_string();
                (!path.is_empty()).then_some(RunningExe { pid: pid.as_u32(), path, name })
            })
            .collect()
    }
}

impl Probe {
    /// Los procesos que abrió `root` y los que abrieron estos. Así se encuentran los de la interfaz de Red Level.
    pub fn descendants(&mut self, root: u32) -> Vec<u32> {
        self.system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
        let links: Vec<(u32, Option<u32>)> = self.system.processes().iter().map(|(pid, process)| (pid.as_u32(), process.parent().map(|p| p.as_u32()))).collect();
        crate::system::descendants_of(&links, root)
    }
}

fn depth(path: &str) -> usize {
    path.split('\\').filter(|part| !part.is_empty()).count()
}

/// ¿Este proceso es de este juego?
pub fn belongs(exe: &RunningExe, game: &Game) -> bool {
    if NOT_THE_GAME.iter().any(|word| exe.name.contains(word)) {
        return false;
    }
    if let Some(game_exe) = &game.exe {
        if exe.path == norm_path(game_exe) {
            return true;
        }
    }
    match &game.install_dir {
        // Una carpeta poco profunda (C:\Juegos, el Escritorio) puede tener otros programas dentro:
        // en ese caso solo vale el ejecutable exacto.
        Some(dir) if game.store != "local" || depth(&norm_path(dir)) >= 3 => {
            let prefix = format!("{}\\", norm_path(dir));
            exe.path.starts_with(&prefix)
        }
        _ => false,
    }
}

/// Juego abierto en este momento. Si hay varios, gana `prefer` (el que se acaba de lanzar).
pub fn find_running<'a>(exes: &[RunningExe], games: &'a [Game], prefer: Option<&str>) -> Option<&'a Game> {
    let running: Vec<&Game> = games.iter().filter(|game| exes.iter().any(|exe| belongs(exe, game))).collect();
    running
        .iter()
        .find(|game| Some(game.id.as_str()) == prefer)
        .or_else(|| running.first())
        .copied()
}

/// Procesos cuyo ejecutable se llama como alguno de `names` (en minúsculas, con .exe).
pub fn pids_named(exes: &[RunningExe], names: &[&str]) -> Vec<u32> {
    exes.iter().filter(|exe| names.contains(&exe.name.as_str())).map(|exe| exe.pid).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(id: &str, store: &str, dir: &str, exe: Option<&str>) -> Game {
        Game {
            id: id.into(),
            store: store.into(),
            title: id.into(),
            launch: String::new(),
            install_dir: Some(dir.into()),
            exe: exe.map(String::from),
            minutes: 0,
            last_played: None,
            size_bytes: None,
            cover_file: None,
            hero_file: None,
            cover_urls: vec![],
            hero_urls: vec![],
            hours_source: "redlevel".into(),
            has_achievements: false,
        }
    }

    fn exe(path: &str) -> RunningExe {
        let path = norm_path(path);
        RunningExe { pid: 1, name: path.rsplit('\\').next().unwrap().to_string(), path }
    }

    #[test]
    fn matches_by_install_folder() {
        let games = vec![
            game("steam:1", "steam", "D:\\SteamLibrary\\steamapps\\common\\Halcyon", None),
            game("epic:a", "epic", "D:/Epic/Aventura", None),
            game("local:x", "local", "C:\\Juegos", Some("C:\\Juegos\\tetra.exe")),
        ];
        let running = vec![exe("C:\\Windows\\explorer.exe"), exe("d:\\epic\\aventura\\Binaries\\Win64\\Aventura-Win64-Shipping.exe")];
        assert_eq!(find_running(&running, &games, None).map(|g| g.id.as_str()), Some("epic:a"));

        // El reportero de errores no cuenta como juego abierto.
        let only_crash = vec![exe("D:\\SteamLibrary\\steamapps\\common\\Halcyon\\UnityCrashHandler64.exe")];
        assert!(find_running(&only_crash, &games, None).is_none());

        // Carpeta poco profunda: otro programa en C:\Juegos no es el juego local, su exe sí.
        assert!(find_running(&[exe("C:\\Juegos\\otro.exe")], &games, None).is_none());
        assert_eq!(find_running(&[exe("c:/juegos/TETRA.EXE")], &games, None).map(|g| g.id.as_str()), Some("local:x"));
    }

    #[test]
    fn prefers_the_launched_game() {
        let games = vec![game("steam:1", "steam", "D:\\A\\B\\Uno", None), game("steam:2", "steam", "D:\\A\\B\\Dos", None)];
        let running = vec![exe("D:\\A\\B\\Uno\\uno.exe"), exe("D:\\A\\B\\Dos\\dos.exe")];
        assert_eq!(find_running(&running, &games, Some("steam:2")).map(|g| g.id.as_str()), Some("steam:2"));
        assert_eq!(find_running(&running, &games, None).map(|g| g.id.as_str()), Some("steam:1"));
    }

    #[test]
    fn probe_lists_processes() {
        let mut probe = Probe::new();
        assert!(!probe.running().is_empty());
    }
}
