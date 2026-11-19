//! Núcleo de Red Level. Todo lo que no depende de la ventana vive aquí para poder probarlo
//! por separado: bibliotecas de juegos, horas, logros, wifi y los controles de Windows.

pub mod apps;
pub mod epic;
pub mod folders;
pub mod guard;
pub mod saves;
pub mod steam;
pub mod store;
pub mod system;
pub mod tracker;
pub mod uninstall;
pub mod updates;
pub mod vdf;
pub mod wifi;

use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    /// "steam:730", "epic:Fortnite", "local:ab12…"
    pub id: String,
    /// "steam" | "epic" | "local"
    pub store: String,
    pub title: String,
    /// Dirección o ejecutable con el que se abre.
    pub launch: String,
    pub install_dir: Option<String>,
    pub exe: Option<String>,
    /// Minutos jugados. En Steam los cuenta Steam; en el resto, Red Level.
    pub minutes: u64,
    /// Segundos Unix de la última partida.
    pub last_played: Option<u64>,
    pub size_bytes: Option<u64>,
    /// Carátula guardada en el disco, si la hay.
    pub cover_file: Option<String>,
    pub hero_file: Option<String>,
    /// Carátulas en internet, por orden de preferencia.
    pub cover_urls: Vec<String>,
    pub hero_urls: Vec<String>,
    /// Quién lleva la cuenta de las horas: "steam" o "redlevel".
    pub hours_source: String,
    pub has_achievements: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub name: String,
    pub description: String,
    pub unlocked: bool,
    pub unlocked_at: Option<u64>,
    pub hidden: bool,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Achievements {
    pub total: u32,
    pub unlocked: u32,
    pub items: Vec<Achievement>,
}

/// Ruta en minúsculas y con barras de Windows, para comparar sin sorpresas.
pub fn norm_path(path: &str) -> String {
    path.replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Carpeta y nombre de archivo de una ruta, acepte la barra que acepte.
pub fn split_path(path: &str) -> (&str, &str) {
    let trimmed = path.trim_end_matches(['\\', '/']);
    match trimmed.rfind(['\\', '/']) {
        Some(i) => (&trimmed[..i], &trimmed[i + 1..]),
        None => ("", trimmed),
    }
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Nombre completo de la cuenta de Windows; si no hay, el nombre de usuario.
pub fn windows_display_name() -> String {
    let real = whoami::realname();
    let real = real.trim();
    if !real.is_empty() && !real.eq_ignore_ascii_case("unknown") {
        return real.to_string();
    }
    whoami::username()
}

/// Abre una dirección (steam://, com.epicgames.launcher://, https://) con el programa que le toque.
pub fn open_uri(uri: &str) -> Result<(), String> {
    open::that_detached(uri).map_err(|e| e.to_string())
}

/// Lanza un juego: los de tienda por su dirección, los locales por su ejecutable.
pub fn launch(game: &Game) -> Result<(), String> {
    if game.store == "local" {
        let exe = std::path::Path::new(&game.launch);
        let mut cmd = std::process::Command::new(exe);
        if let Some(dir) = exe.parent() {
            cmd.current_dir(dir);
        }
        cmd.spawn().map(|_| ()).map_err(|e| format!("No se pudo abrir {}: {e}", game.launch))
    } else {
        open_uri(&game.launch)
    }
}

/// Abre un juego local como administrador. Windows pregunta primero (el aviso de control de cuentas):
/// si el usuario dice que no, el juego no se abre. `window` es la ventana de Red Level, para que el aviso
/// salga delante y no escondido en la barra de tareas. Vale para un .exe, un acceso directo o un .bat.
pub fn launch_as_admin(game: &Game, window: isize) -> Result<(), String> {
    let (dir, _) = split_path(&game.launch);
    system::run_as_admin(window, &game.launch, "", dir, true).map_err(|reason| match reason {
        system::AdminError::Refused => "No diste el permiso de administrador, así que el juego no se abrió.".to_string(),
        system::AdminError::Failed(code) => format!("Windows no pudo abrir {} como administrador (código {code}).", game.launch),
    })
}

/// Convierte a bytes una imagen que llega en base64 desde la interfaz.
pub fn decode_base64(text: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(text.trim()).map_err(|e| format!("La imagen llegó dañada: {e}"))
}

/// Abre un programa del PC: por su ruta, desde su propia carpeta, o por su identificador del menú Inicio
/// (así se abren también las apps de la Tienda de Windows).
pub fn launch_program(path: &str) -> Result<(), String> {
    let mut cmd = if path.starts_with("shell:") {
        let mut explorer = std::process::Command::new("explorer.exe");
        explorer.arg(path);
        explorer
    } else {
        let exe = std::path::Path::new(path);
        let mut direct = std::process::Command::new(exe);
        if let Some(dir) = exe.parent().filter(|d| !d.as_os_str().is_empty()) {
            direct.current_dir(dir);
        }
        direct
    };
    cmd.spawn().map(|_| ()).map_err(|e| format!("No se pudo abrir {path}: {e}"))
}

/// Apunta una línea en el registro de Red Level (redlevel.log, en la carpeta de datos).
/// Sirve para saber qué pasó en el PC de un usuario sin pedirle que repita nada.
pub fn log_line(data_dir: &std::path::Path, message: &str) {
    use std::io::Write;
    let _ = std::fs::create_dir_all(data_dir);
    let file = data_dir.join("redlevel.log");
    // El registro no crece sin límite: pasado un tamaño, se empieza de nuevo.
    if std::fs::metadata(&file).map(|m| m.len() > 512 * 1024).unwrap_or(false) {
        let _ = std::fs::remove_file(&file);
    }
    if let Ok(mut out) = std::fs::OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(out, "{} {}", now_secs(), message);
    }
}
