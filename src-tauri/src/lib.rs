//! La ventana de Red Level y los comandos que la interfaz le pide al sistema.
//! La lógica vive en `redlevel-core`; aquí solo se conecta con Tauri.

use redlevel_core::store::{self, Data, Settings};
use redlevel_core::tracker::{self, Probe};
use redlevel_core::{apps, epic, guard, steam, wifi, Achievements, Game};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Running {
    id: String,
    /// Segundos Unix en que se detectó el juego abierto.
    since: u64,
}

struct AppState {
    data_dir: PathBuf,
    data: Mutex<Data>,
    games: Mutex<Vec<Game>>,
    running: Mutex<Option<Running>>,
    /// Juego recién lanzado desde Red Level, para darle prioridad al detectar.
    launched: Mutex<Option<String>>,
    /// Falso con --sin-bloqueo: no se tocan teclas, barra de tareas ni notificaciones.
    guard_enabled: bool,
    notifications: Mutex<String>,
    exiting: AtomicBool,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    primary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileView {
    name: String,
    avatar_file: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    version: String,
    onboarded: bool,
    profile: ProfileView,
    windows_name: String,
    settings: Settings,
    monitors: Vec<MonitorInfo>,
    guard: guard::GuardReport,
    guard_enabled: bool,
    running: Option<Running>,
}

fn profile_view(state: &AppState) -> ProfileView {
    let data = lock(&state.data);
    ProfileView {
        name: data.profile.name.clone(),
        avatar_file: data.profile.avatar.as_ref().map(|file| state.data_dir.join(file).to_string_lossy().to_string()),
    }
}

fn list_monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    let Some(window) = app.get_webview_window("main") else {
        return vec![];
    };
    let primary = window.primary_monitor().ok().flatten().map(|m| *m.position());
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, monitor)| MonitorInfo {
            name: monitor.name().cloned().unwrap_or_else(|| format!("Monitor {}", i + 1)),
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            primary: Some(*monitor.position()) == primary,
        })
        .collect()
}

fn second_monitor(app: &AppHandle) -> Option<apps::Rect> {
    list_monitors(app)
        .into_iter()
        .find(|m| !m.primary)
        .map(|m| apps::Rect { x: m.x, y: m.y, width: m.width as i32, height: m.height as i32 })
}

/// Tapa en negro (o destapa) los monitores que no son el principal.
fn sync_blackout(app: &AppHandle, on: bool) {
    let existing: Vec<_> = app.webview_windows().into_iter().filter(|(label, _)| label.starts_with("blackout-")).collect();
    if !on {
        for (_, window) in existing {
            let _ = window.close();
        }
        return;
    }
    if !existing.is_empty() {
        return;
    }
    for (i, monitor) in list_monitors(app).into_iter().enumerate().filter(|(_, m)| !m.primary) {
        let built = WebviewWindowBuilder::new(app, format!("blackout-{i}"), WebviewUrl::App("blackout.html".into()))
            .title("Red Level")
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .focused(false)
            .build();
        if let Ok(window) = built {
            let _ = window.set_position(PhysicalPosition::new(monitor.x, monitor.y));
            let _ = window.set_size(PhysicalSize::new(monitor.width, monitor.height));
        }
    }
}

/// Aplica los ajustes de bloqueo al sistema. No crea ventanas: se puede llamar desde cualquier hilo.
fn apply_guard(state: &AppState) {
    let settings = lock(&state.data).settings.clone();
    if !state.guard_enabled {
        guard::set_mode(guard::MODE_OFF);
        *lock(&state.notifications) = "desactivado".into();
        return;
    }
    guard::set_alt_tab_in_game(settings.block_alt_tab_in_game);
    let playing = lock(&state.running).is_some();
    guard::set_mode(match (settings.block_keys, playing) {
        (false, _) => guard::MODE_OFF,
        (true, true) => guard::MODE_GAME,
        (true, false) => guard::MODE_LAUNCHER,
    });
    if settings.hide_taskbar != guard::taskbar_hidden() {
        guard::set_taskbar_visible(!settings.hide_taskbar);
    }
    *lock(&state.notifications) = match guard::set_notifications_silenced(settings.silence_notifications) {
        Ok(()) => "ok".into(),
        Err(reason) => reason,
    };
}

fn guard_report(state: &AppState) -> guard::GuardReport {
    guard::GuardReport {
        keyboard_hook: guard::keyboard_guard_active(),
        taskbars_found: 0,
        notifications: lock(&state.notifications).clone(),
    }
}

fn persist(state: &AppState) {
    let data = lock(&state.data).clone();
    if let Err(error) = store::save(&state.data_dir, &data) {
        eprintln!("No se pudo guardar: {error}");
    }
}

/// Deja Windows como estaba y cierra. Único camino de salida.
fn shutdown(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.exiting.swap(true, Ordering::SeqCst) {
        return;
    }
    redlevel_core::log_line(&state.data_dir, "cerrando: se restaura Windows");
    guard::release_all();
    persist(&state);
    // Red de seguridad: si la ventana no termina de cerrarse por las buenas, el proceso sale igual.
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(3));
        std::process::exit(0);
    });
    app.exit(0);
}

#[tauri::command]
fn bootstrap(app: AppHandle, state: State<'_, AppState>) -> Bootstrap {
    let data = lock(&state.data).clone();
    Bootstrap {
        version: app.package_info().version.to_string(),
        onboarded: data.onboarded,
        profile: profile_view(&state),
        windows_name: redlevel_core::windows_display_name(),
        settings: data.settings,
        monitors: list_monitors(&app),
        guard: guard_report(&state),
        guard_enabled: state.guard_enabled,
        running: lock(&state.running).clone(),
    }
}

fn collect_games(state: &AppState) -> Vec<Game> {
    let mut games = Vec::new();
    if let Some(root) = steam::find_root() {
        games.extend(steam::scan(&root));
    }
    if let Some(dir) = epic::manifests_dir() {
        games.extend(epic::scan(&dir));
    }
    let data = lock(&state.data);
    games.extend(data.local_as_games(&state.data_dir));
    data.apply_play(&mut games);
    games
}

#[tauri::command]
async fn scan_library(state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    let games = collect_games(&state);
    *lock(&state.games) = games.clone();
    Ok(games)
}

#[tauri::command]
async fn achievements(id: String) -> Result<Option<Achievements>, String> {
    let Some(appid) = id.strip_prefix("steam:").and_then(|s| s.parse::<u64>().ok()) else {
        return Ok(None);
    };
    Ok(steam::find_root().and_then(|root| steam::achievements(&root, appid)))
}

#[tauri::command]
fn launch_game(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let game = lock(&state.games).iter().find(|g| g.id == id).cloned().ok_or("Ese juego ya no está en la biblioteca.")?;
    redlevel_core::launch(&game)?;
    *lock(&state.launched) = Some(id);
    Ok(())
}

#[tauri::command]
async fn add_local_game(app: AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file().set_title("Elige el ejecutable del juego").add_filter("Juegos", &["exe", "lnk", "bat"]);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(path) = dialog.blocking_pick_file().and_then(|file| file.into_path().ok()) else {
        return Ok(None);
    };
    let added = lock(&state.data).add_local(&path.to_string_lossy())?;
    persist(&state);
    Ok(Some(added.id))
}

#[tauri::command]
fn rename_local_game(id: String, title: String, state: State<'_, AppState>) -> Result<(), String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("El nombre no puede quedar vacío.".into());
    }
    if let Some(game) = lock(&state.data).local_games.iter_mut().find(|g| g.id == id) {
        game.title = title;
    }
    persist(&state);
    Ok(())
}

#[tauri::command]
fn remove_local_game(id: String, state: State<'_, AppState>) -> Result<(), String> {
    lock(&state.data).local_games.retain(|g| g.id != id);
    persist(&state);
    Ok(())
}

/// Copia una imagen elegida por el usuario a la carpeta de datos y devuelve el nombre del archivo.
fn import_image(app: &AppHandle, state: &AppState, title: &str, prefix: &str) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file().set_title(title).add_filter("Imágenes", &["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(path) = dialog.blocking_pick_file().and_then(|file| file.into_path().ok()) else {
        return Ok(None);
    };
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase();
    let name = format!("{prefix}-{}.{ext}", redlevel_core::now_secs());
    std::fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    std::fs::copy(&path, state.data_dir.join(&name)).map_err(|e| format!("No se pudo copiar la imagen: {e}"))?;
    Ok(Some(name))
}

#[tauri::command]
async fn set_local_cover(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let Some(file) = import_image(&app, &state, "Elige la carátula", "caratula")? else {
        return Ok(false);
    };
    let old = {
        let mut data = lock(&state.data);
        let game = data.local_games.iter_mut().find(|g| g.id == id).ok_or("Ese juego ya no está en la biblioteca.")?;
        game.cover.replace(file)
    };
    if let Some(old) = old {
        let _ = std::fs::remove_file(state.data_dir.join(old));
    }
    persist(&state);
    Ok(true)
}

#[tauri::command]
async fn pick_avatar(app: AppHandle, state: State<'_, AppState>) -> Result<ProfileView, String> {
    if let Some(file) = import_image(&app, &state, "Elige tu foto de perfil", "perfil")? {
        let old = lock(&state.data).profile.avatar.replace(file);
        if let Some(old) = old {
            let _ = std::fs::remove_file(state.data_dir.join(old));
        }
        persist(&state);
    }
    Ok(profile_view(&state))
}

#[tauri::command]
fn save_profile(name: String, state: State<'_, AppState>) -> Result<ProfileView, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Escribe un nombre.".into());
    }
    {
        let mut data = lock(&state.data);
        data.profile.name = name;
        data.onboarded = true;
    }
    persist(&state);
    Ok(profile_view(&state))
}

#[tauri::command]
async fn save_settings(settings: Settings, app: AppHandle, state: State<'_, AppState>) -> Result<guard::GuardReport, String> {
    let black = settings.second_monitor == "black";
    lock(&state.data).settings = settings;
    persist(&state);
    apply_guard(&state);
    sync_blackout(&app, black && state.guard_enabled);
    Ok(guard_report(&state))
}

#[tauri::command]
async fn wifi_status() -> Result<wifi::Status, String> {
    tauri::async_runtime::spawn_blocking(wifi::status).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn wifi_connect(ssid: String, password: Option<String>, security: String, known: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let password = password.filter(|p| !p.is_empty());
        wifi::connect(&ssid, password.as_deref(), &security, known)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn wifi_disconnect() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(wifi::disconnect).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn monitors(app: AppHandle) -> Vec<MonitorInfo> {
    list_monitors(&app)
}

/// Abre Discord, Spotify o YouTube en el segundo monitor. Devuelve "app" si abrió el programa
/// instalado o "web" si abrió la versión web en una ventana propia.
#[tauri::command]
async fn open_companion(id: String, app: AppHandle) -> Result<String, String> {
    let companion = apps::companion(&id).ok_or("App desconocida.")?;
    let target = second_monitor(&app).ok_or("Conecta un segundo monitor para abrir apps ahí.")?;
    sync_blackout(&app, false);

    if apps::is_installed(companion.scheme) {
        redlevel_core::open_uri(companion.uri)?;
        let processes = companion.processes;
        std::thread::spawn(move || {
            // La ventana tarda en aparecer (y Discord enseña antes una de carga): se insiste un rato.
            let mut probe = Probe::new();
            let mut placed = 0;
            for _ in 0..30 {
                std::thread::sleep(Duration::from_millis(1000));
                let pids = tracker::pids_named(&probe.running(), processes);
                if !pids.is_empty() && apps::move_windows_of(&pids, target) > 0 {
                    placed += 1;
                    if placed >= 4 {
                        break;
                    }
                }
            }
        });
        return Ok("app".into());
    }

    let label = format!("companion-{id}");
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_focus();
        return Ok("web".into());
    }
    let url = companion.web.parse().map_err(|_| "Dirección no válida.".to_string())?;
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .title(format!("Red Level · {id}"))
        .decorations(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = window.set_position(PhysicalPosition::new(target.x, target.y));
    let _ = window.set_size(PhysicalSize::new(target.width as u32, target.height as u32));
    Ok("web".into())
}

#[tauri::command]
async fn close_companion(id: String, app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&format!("companion-{id}")) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Apps abiertas por Red Level en ventana propia (las que se pueden cerrar desde aquí).
#[tauri::command]
fn open_companions(app: AppHandle) -> Vec<String> {
    app.webview_windows().keys().filter_map(|label| label.strip_prefix("companion-").map(str::to_string)).collect()
}

#[tauri::command]
fn power(action: String, app: AppHandle) -> Result<(), String> {
    let flag = match action.as_str() {
        "exit" => None,
        "restart" => Some("/r"),
        "shutdown" => Some("/s"),
        _ => return Err("Acción desconocida.".into()),
    };
    if let Some(flag) = flag {
        guard::release_all();
        persist(&app.state::<AppState>());
        let mut command = std::process::Command::new("shutdown");
        command.args([flag, "/t", "0"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        command.spawn().map_err(|e| format!("Windows no aceptó la orden: {e}"))?;
    }
    shutdown(&app);
    Ok(())
}

/// Hilo que vigila qué juego está abierto: cuenta las horas, cambia el modo de bloqueo y
/// trae Red Level al frente cuando el juego se cierra. También atiende la salida de emergencia.
fn watch_games(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let mut probe = Probe::new();
        let mut last_tick = Instant::now();
        let mut unsaved = 0u64;
        let mut rounds = 0;
        loop {
            for _ in 0..12 {
                std::thread::sleep(Duration::from_millis(250));
                if guard::take_exit_request() {
                    redlevel_core::log_line(&state.data_dir, "salida de emergencia (Ctrl+Alt+Mayús+Q)");
                    shutdown(&app);
                    return;
                }
                if state.exiting.load(Ordering::SeqCst) {
                    return;
                }
            }
            if rounds < 8 {
                rounds += 1;
                redlevel_core::log_line(&state.data_dir, &format!("vigía {rounds}: {}", guard::keyboard_diagnostics()));
            }
            let games = lock(&state.games).clone();
            let prefer = lock(&state.launched).clone();
            let found = tracker::find_running(&probe.running(), &games, prefer.as_deref()).map(|g| g.id.clone());
            let previous = lock(&state.running).clone();
            let elapsed = last_tick.elapsed().as_secs();
            last_tick = Instant::now();

            if let Some(running) = &previous {
                lock(&state.data).add_play(&running.id, elapsed.min(30));
                unsaved += elapsed;
            }
            let previous_id = previous.as_ref().map(|r| r.id.clone());
            if found != previous_id {
                *lock(&state.running) = found.as_ref().map(|id| Running { id: id.clone(), since: redlevel_core::now_secs() });
                if found.is_none() {
                    *lock(&state.launched) = None;
                }
                apply_guard(&state);
                persist(&state);
                unsaved = 0;
                let _ = app.emit("running-changed", lock(&state.running).clone());
                if found.is_none() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            } else if unsaved >= 60 {
                persist(&state);
                unsaved = 0;
            }
        }
    });
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let guard_enabled = !args.iter().any(|a| a == "--sin-bloqueo") && std::env::var("REDLEVEL_SIN_BLOQUEO").is_err();
    let windowed = args.iter().any(|a| a == "--ventana");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let data_dir = match std::env::var("REDLEVEL_DATA_DIR") {
                Ok(dir) => PathBuf::from(dir),
                Err(_) => app.path().app_data_dir()?,
            };
            let data = store::load(&data_dir);
            let black = data.settings.second_monitor == "black";
            app.manage(AppState {
                data_dir,
                data: Mutex::new(data),
                games: Mutex::new(Vec::new()),
                running: Mutex::new(None),
                launched: Mutex::new(None),
                guard_enabled,
                notifications: Mutex::new(String::new()),
                exiting: AtomicBool::new(false),
            });
            let handle = app.handle().clone();
            let state = handle.state::<AppState>();
            *lock(&state.games) = collect_games(&state);

            if let Some(window) = handle.get_webview_window("main") {
                if windowed {
                    let _ = window.set_fullscreen(false);
                    let _ = window.set_decorations(true);
                    let _ = window.set_size(PhysicalSize::new(1280u32, 720u32));
                }
                let _ = window.set_focus();
            }
            if guard_enabled {
                guard::start_keyboard_guard();
            }
            apply_guard(&state);
            sync_blackout(&handle, black && guard_enabled);
            // El gancho de teclado se instala en su propio hilo: se le da un momento antes de anotar su estado.
            let log_handle = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(800));
                let state = log_handle.state::<AppState>();
                redlevel_core::log_line(
                    &state.data_dir,
                    &format!(
                        "inicio {}: juegos={} bloqueo={} teclado={} modo={} barra_oculta={} notificaciones={}",
                        log_handle.package_info().version,
                        lock(&state.games).len(),
                        state.guard_enabled,
                        guard::keyboard_guard_active(),
                        guard::mode(),
                        guard::taskbar_hidden(),
                        lock(&state.notifications)
                    ),
                );
            });
            watch_games(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            scan_library,
            achievements,
            launch_game,
            add_local_game,
            rename_local_game,
            remove_local_game,
            set_local_cover,
            pick_avatar,
            save_profile,
            save_settings,
            wifi_status,
            wifi_connect,
            wifi_disconnect,
            monitors,
            open_companion,
            close_companion,
            open_companions,
            power,
        ])
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar Red Level");

    app.run(|app, event| match event {
        // Cerrar la ventana principal por cualquier vía cierra todo y restaura Windows.
        RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label == "main" => shutdown(app),
        RunEvent::Exit => guard::release_all(),
        _ => {}
    });
}

/// Autoprueba sin ventana: ejercita en un Windows real lo que no se puede probar en otro sistema
/// y deja el resultado en un archivo JSON. La usa la compilación automática antes de publicar.
pub fn selftest(out: &str) -> i32 {
    let steam_root = steam::find_root();
    let steam_games = steam_root.as_deref().map(steam::scan).unwrap_or_default();
    let epic_dir = epic::manifests_dir();
    let epic_games = epic_dir.as_deref().map(epic::scan).unwrap_or_default();
    let first_with_achievements = steam_games.iter().find(|g| g.has_achievements);
    let achievements = first_with_achievements.and_then(|g| {
        let appid = g.id.strip_prefix("steam:")?.parse().ok()?;
        steam::achievements(steam_root.as_deref()?, appid)
    });

    guard::start_keyboard_guard();
    std::thread::sleep(Duration::from_millis(600));
    let hook = guard::keyboard_guard_active();
    guard::set_mode(guard::MODE_LAUNCHER);
    let mode_set = guard::mode() == guard::MODE_LAUNCHER;
    // Ctrl+Alt+Mayús+Q pulsadas de verdad: el gancho tiene que reconocer la salida de emergencia.
    guard::press_keys(&[0x11, 0x12, 0x10, 0x51]);
    std::thread::sleep(Duration::from_millis(400));
    let emergency = guard::take_exit_request();
    let keyboard_seen = guard::keyboard_diagnostics();
    guard::set_mode(guard::MODE_OFF);

    let taskbars = guard::set_taskbar_visible(false);
    let hidden = guard::taskbar_hidden();
    std::thread::sleep(Duration::from_millis(300));
    guard::set_taskbar_visible(true);

    let dnd_before = guard::notifications_mode();
    let dnd_set = guard::set_notifications_silenced(true);
    let dnd_during = guard::notifications_mode();
    let dnd_restore = guard::set_notifications_silenced(false);
    let dnd_after = guard::notifications_mode();

    let wifi = wifi::status();
    let processes = Probe::new().running().len();

    let report = serde_json::json!({
        "windowsName": redlevel_core::windows_display_name(),
        "steam": { "root": steam_root, "games": steam_games.len(), "titles": steam_games.iter().map(|g| &g.title).collect::<Vec<_>>(),
                   "minutes": steam_games.iter().map(|g| g.minutes).collect::<Vec<_>>(),
                   "covers": steam_games.iter().filter(|g| g.cover_file.is_some()).count(),
                   "achievements": achievements.as_ref().map(|a| format!("{}/{}", a.unlocked, a.total)) },
        "epic": { "dir": epic_dir, "games": epic_games.len(), "titles": epic_games.iter().map(|g| &g.title).collect::<Vec<_>>() },
        "keyboard": { "hookInstalled": hook, "modeSet": mode_set, "emergencyExitRecognized": emergency, "seen": keyboard_seen },
        "taskbar": { "found": taskbars, "hidden": hidden, "restored": !guard::taskbar_hidden() },
        "notifications": { "before": dnd_before, "set": dnd_set.clone().err().unwrap_or_else(|| "ok".into()), "during": dnd_during,
                           "restore": dnd_restore.err().unwrap_or_else(|| "ok".into()), "after": dnd_after },
        "wifi": { "available": wifi.available, "networks": wifi.networks.len(), "message": wifi.message },
        "processes": processes,
        "discordInstalled": apps::is_installed("discord"),
    });
    let text = serde_json::to_string_pretty(&report).unwrap_or_default();
    let written = std::fs::write(out, &text).is_ok();
    guard::release_all();
    if written && hook && processes > 0 {
        0
    } else {
        1
    }
}
