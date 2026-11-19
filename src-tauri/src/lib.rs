//! La ventana de Red Level y los comandos que la interfaz le pide al sistema.
//! La lógica vive en `redlevel-core`; aquí solo se conecta con Tauri.

use redlevel_core::store::{self, Data, Settings};
use redlevel_core::tracker::{self, Probe};
use redlevel_core::{apps, epic, folders, guard, steam, system, updates, wifi, Achievements, Game};
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
    /// App que se ve ahora en el segundo monitor y cómo se abrió cada una ("app" instalada o "web").
    second_active: Mutex<Option<String>>,
    /// Apps abiertas en el segundo monitor, con los procesos dueños de sus ventanas.
    second_pids: Mutex<std::collections::HashMap<String, Vec<u32>>>,
    /// Hasta cuándo no se interpreta un cambio de ventana como un toque del usuario sobre un cuadro.
    second_quiet: Mutex<std::time::Instant>,
    exiting: AtomicBool,
    /// Juegos encontrados en las carpetas de juegos en la última búsqueda.
    found: Mutex<Vec<folders::Found>>,
    /// Ya hay una búsqueda de portadas en marcha.
    art_busy: AtomicBool,
    /// Red Level está minimizado a petición del usuario: Windows queda libre hasta que vuelva.
    minimized: AtomicBool,
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

/// Rectángulo del segundo monitor. Para las pruebas automáticas (máquinas con una sola pantalla) se puede
/// fingir uno con REDLEVEL_SEGUNDO_FALSO="x,y,ancho,alto".
fn second_monitor(app: &AppHandle) -> Option<apps::Rect> {
    if let Ok(fake) = std::env::var("REDLEVEL_SEGUNDO_FALSO") {
        let n: Vec<i32> = fake.split(',').filter_map(|v| v.trim().parse().ok()).collect();
        if n.len() == 4 {
            return Some(apps::Rect { x: n[0], y: n[1], width: n[2], height: n[3] });
        }
    }
    list_monitors(app)
        .into_iter()
        .find(|m| !m.primary)
        .map(|m| apps::Rect { x: m.x, y: m.y, width: m.width as i32, height: m.height as i32 })
}

/// El segundo monitor se reparte en una barra arriba (la interfaz de Red Level) y el hueco para la app.
fn second_layout(app: &AppHandle) -> Option<(apps::Rect, apps::Rect)> {
    let screen = second_monitor(app)?;
    let bar = ((screen.height as f64 * 0.052).round() as i32).clamp(44, 110);
    Some((
        apps::Rect { x: screen.x, y: screen.y, width: screen.width, height: bar },
        apps::Rect { x: screen.x, y: screen.y + bar, width: screen.width, height: screen.height - bar },
    ))
}

const SECOND_BAR: &str = "second-bar";
const SECOND_BACK: &str = "second-back";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SecondApp {
    id: String,
    name: String,
    /// Está abierta en el segundo monitor.
    open: bool,
    /// Icono en PNG (base64), si se eligió de la lista de programas instalados.
    icon: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SecondState {
    /// Hay un segundo monitor conectado.
    available: bool,
    /// "free": con interfaz y apps. "black": apagado.
    mode: String,
    /// En pantalla sola, la app que se ve. En cuadrícula, la que está abierta en grande.
    active: Option<String>,
    /// En cuántos cuadros está dividido el segundo monitor (1 = pantalla sola).
    layout: u8,
    /// Tema visual elegido, para que la barra del segundo monitor vaya a juego.
    theme: String,
    apps: Vec<SecondApp>,
}

fn second_state_of(app: &AppHandle) -> SecondState {
    let state = app.state::<AppState>();
    let open = lock(&state.second_pids).clone();
    let (mode, user_apps, layout, theme) = {
        let data = lock(&state.data);
        (data.settings.second_monitor.clone(), data.apps.clone(), apps::valid_layout(data.second_layout), data.settings.theme.clone())
    };
    let active = lock(&state.second_active).clone();
    SecondState {
        available: second_monitor(app).is_some(),
        mode,
        active,
        layout,
        theme,
        apps: user_apps.into_iter().map(|a| SecondApp { open: open.contains_key(&a.id), id: a.id, name: a.name, icon: a.icon }).collect(),
    }
}

fn second_changed(app: &AppHandle) {
    let _ = app.emit("second-changed", second_state_of(app));
}

fn place(window: &tauri::WebviewWindow, rect: apps::Rect) {
    let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
    let _ = window.set_size(PhysicalSize::new(rect.width.max(1) as u32, rect.height.max(1) as u32));
}

/// Crea, recoloca o quita la interfaz del segundo monitor según los ajustes y los monitores conectados.
fn sync_second(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mode = lock(&state.data).settings.second_monitor.clone();
    let layout = second_layout(app);
    let fake = std::env::var("REDLEVEL_SEGUNDO_FALSO").is_ok();
    let (Some((bar, content)), false) = (layout, mode == "black") else {
        // Apagado o sin segundo monitor: fuera la barra; el negro lo pone sync_blackout.
        for (label, window) in app.webview_windows() {
            if label == SECOND_BAR || label == SECOND_BACK {
                let _ = window.close();
            }
        }
        *lock(&state.second_active) = None;
        sync_blackout(app, mode == "black" && state.guard_enabled);
        return;
    };
    sync_blackout(app, false);
    // Fondo: una ventana negra que no roba el foco ni se pone delante de las apps al tocarla.
    match app.get_webview_window(SECOND_BACK) {
        Some(window) => place(&window, content),
        None => {
            if let Ok(window) = WebviewWindowBuilder::new(app, SECOND_BACK, WebviewUrl::App("index.html".into()))
                .title("Red Level")
                .decorations(false)
                .resizable(false)
                .skip_taskbar(true)
                .focusable(false)
                .focused(false)
                .always_on_top(fake)
                .build()
            {
                place(&window, content);
            }
        }
    }
    match app.get_webview_window(SECOND_BAR) {
        Some(window) => place(&window, bar),
        None => {
            if let Ok(window) = WebviewWindowBuilder::new(app, SECOND_BAR, WebviewUrl::App("index.html".into()))
                .title("Red Level")
                .decorations(false)
                .resizable(false)
                .skip_taskbar(true)
                .focused(false)
                .always_on_top(fake)
                .build()
            {
                place(&window, bar);
            }
        }
    }
}

/// Procesos de una app del segundo monitor: los que ya se le conocían más los que se llaman como su archivo.
fn app_pids(app: &AppHandle, probe: &mut Probe, id: &str, path: &str) -> Vec<u32> {
    let mut pids = lock(&app.state::<AppState>().second_pids).get(id).cloned().unwrap_or_default();
    let name = apps::process_name(path);
    for pid in tracker::pids_named(&probe.running(), &[name.as_str()]) {
        if !pids.contains(&pid) {
            pids.push(pid);
        }
    }
    pids
}

/// La prueba automática simula el segundo monitor en media pantalla: ahí las ventanas se fijan por encima.
fn fake_second() -> bool {
    std::env::var("REDLEVEL_SEGUNDO_FALSO").is_ok()
}

fn layout_of(app: &AppHandle) -> u8 {
    apps::valid_layout(lock(&app.state::<AppState>().data).second_layout)
}

/// Durante este rato, que una ventana tome el teclado no cuenta como un toque sobre su cuadro
/// (los programas lo toman solos al abrirse o al recolocarlos).
fn quiet_second(app: &AppHandle, millis: u64) {
    *lock(&app.state::<AppState>().second_quiet) = std::time::Instant::now() + Duration::from_millis(millis);
}

/// Pone cada app abierta donde le toca. En pantalla sola, la elegida ocupa todo y las demás se minimizan.
/// En cuadrícula, cada una va a su cuadro y la elegida, si la hay, se abre en grande por encima.
/// Devuelve las apps que tenían alguna ventana que colocar.
fn arrange(app: &AppHandle, focus: bool) -> Vec<String> {
    let state = app.state::<AppState>();
    let Some((_, content)) = second_layout(app) else {
        return Vec::new();
    };
    let layout = layout_of(app);
    let active = lock(&state.second_active).clone();
    let open: Vec<String> = lock(&state.second_pids).keys().cloned().collect();
    let user_apps: Vec<_> = lock(&state.data).apps.iter().filter(|a| open.contains(&a.id)).cloned().collect();
    let pinned = fake_second();
    let cells = apps::cells(content, layout);
    let mut probe = Probe::new();
    let mut shown = Vec::new();
    let mut front: Option<(String, Vec<u32>)> = None;
    for (index, user_app) in user_apps.iter().enumerate() {
        let pids = app_pids(app, &mut probe, &user_app.id, &user_app.path);
        if active.as_deref() == Some(user_app.id.as_str()) {
            front = Some((user_app.id.clone(), pids));
        } else if layout > 1 && index < cells.len() {
            if apps::place_windows_of(&pids, cells[index], false, pinned) > 0 {
                shown.push(user_app.id.clone());
            }
        } else {
            apps::minimize_windows_of(&pids);
        }
    }
    // La elegida va la última para quedar por encima de los cuadros.
    if let Some((id, pids)) = front {
        let target = if layout > 1 { apps::popup_rect(content) } else { content };
        if apps::place_windows_of(&pids, target, focus, pinned) > 0 {
            shown.push(id);
        }
    }
    shown
}

fn open_second(app: &AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let user_app = lock(&state.data).apps.iter().find(|a| a.id == id).cloned().ok_or("Esa app ya no está en tu barra.")?;
    if lock(&state.data).settings.second_monitor == "black" {
        lock(&state.data).settings.second_monitor = "free".into();
        persist(&state);
    }
    sync_second(app);
    second_layout(app).ok_or("Conecta un segundo monitor para abrir apps ahí.")?;
    let layout = layout_of(app);
    let was_open = lock(&state.second_pids).contains_key(id);

    // Si ya tiene una ventana, basta con colocarla; si no, se lanza y se espera a que aparezca.
    let before = apps::visible_windows();
    let front_before = apps::foreground().0;
    let known = app_pids(app, &mut Probe::new(), id, &user_app.path);
    let launched = !before.iter().any(|(_, pid)| known.contains(pid));
    if launched {
        redlevel_core::launch_program(&user_app.path)?;
    }
    lock(&state.second_pids).insert(id.to_string(), known);
    // En pantalla sola, la app elegida ocupa todo. En cuadrícula, una app nueva va a su cuadro
    // y tocar una que ya estaba abierta la abre en grande.
    *lock(&state.second_active) = if layout == 1 || was_open { Some(id.to_string()) } else { None };
    quiet_second(app, 8000);
    arrange(app, true);

    let handle = app.clone();
    let id = id.to_string();
    std::thread::spawn(move || {
        // La ventana tarda en aparecer y muchos programas enseñan antes una de carga: se insiste un rato.
        let mut probe = Probe::new();
        let mut placed = 0;
        for round in 0..40 {
            std::thread::sleep(Duration::from_millis(500));
            let state = handle.state::<AppState>();
            let still_open = lock(&state.second_pids).contains_key(&id);
            let replaced = layout_of(&handle) == 1 && lock(&state.second_active).as_deref() != Some(id.as_str());
            if !still_open || replaced {
                return;
            }
            let mut pids = app_pids(&handle, &mut probe, &id, &user_app.path);
            let windows = apps::visible_windows();
            let mut found = windows.iter().any(|(_, pid)| pids.contains(pid));
            if !found && launched && round >= 6 {
                // Hay programas que arrancan con un lanzador y terminan en un proceso con otro nombre:
                // se adoptan las ventanas que hayan aparecido desde que se lanzó.
                let mut adopted: Vec<u32> = apps::new_windows(&before, &windows, std::process::id()).into_iter().map(|(_, pid)| pid).collect();
                // Si ya estaba abierta, Windows solo trae su ventana al frente: se adopta esa.
                let (front, front_pid) = apps::foreground();
                let taken = lock(&state.second_pids).iter().any(|(other, list)| other != &id && list.contains(&front_pid));
                if adopted.is_empty() && front != front_before && front_pid != std::process::id() && front_pid != 0 && !taken {
                    adopted.push(front_pid);
                }
                for pid in adopted {
                    found = true;
                    if !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
            if found {
                lock(&state.second_pids).insert(id.clone(), pids);
                quiet_second(&handle, 3000);
                arrange(&handle, placed == 0);
                placed += 1;
                if placed >= 3 {
                    return;
                }
            }
        }
        if placed == 0 {
            redlevel_core::log_line(&state_dir(&handle), &format!("segundo monitor: {} no mostró ninguna ventana", user_app.name));
        }
    });
    second_changed(app);
    Ok(())
}

/// En cuadrícula, tocar el cuadro de una app la abre en grande para manejarla.
/// Se nota porque su ventana pasa a tener el teclado.
fn watch_second(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: isize = 0;
        loop {
            std::thread::sleep(Duration::from_millis(250));
            let (window, pid) = apps::foreground();
            if window == last {
                continue;
            }
            last = window;
            let state = app.state::<AppState>();
            if std::time::Instant::now() < *lock(&state.second_quiet) || layout_of(&app) == 1 {
                continue;
            }
            let owner = lock(&state.second_pids).iter().find(|(_, pids)| pids.contains(&pid)).map(|(id, _)| id.clone());
            let Some(id) = owner else {
                continue;
            };
            if lock(&state.second_active).as_deref() == Some(id.as_str()) {
                continue;
            }
            *lock(&state.second_active) = Some(id.clone());
            quiet_second(&app, 1200);
            arrange(&app, true);
            redlevel_core::log_line(&state_dir(&app), &format!("segundo monitor: {id} en grande tras tocar su cuadro"));
            second_changed(&app);
        }
    });
}

fn state_dir(app: &AppHandle) -> std::path::PathBuf {
    app.state::<AppState>().data_dir.clone()
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

/// Carpetas donde se buscan juegos de fuera de las tiendas: las que añadió el usuario y las habituales de cada disco.
fn game_folder_list(state: &AppState) -> (Vec<String>, Vec<String>) {
    let chosen = lock(&state.data).game_folders.clone();
    // Solo para la prueba automática: carpetas fijadas desde fuera, separadas por ";".
    if let Ok(forced) = std::env::var("REDLEVEL_CARPETAS_DE_JUEGOS") {
        return (chosen, forced.split(';').filter(|p| !p.is_empty()).map(String::from).collect());
    }
    let letters: Vec<String> = system::disks().into_iter().map(|d| d.letter).collect();
    let usual = folders::usual_folders(&letters).into_iter().filter(|p| !chosen.iter().any(|c| c.eq_ignore_ascii_case(p))).collect();
    (chosen, usual)
}

fn collect_games(state: &AppState) -> Vec<Game> {
    let mut games = Vec::new();
    if let Some(root) = steam::find_root() {
        games.extend(steam::scan(&root));
    }
    if let Some(dir) = epic::manifests_dir() {
        games.extend(epic::scan(&dir));
    }
    let (chosen, usual) = game_folder_list(state);
    let found: Vec<folders::Found> = chosen.iter().chain(usual.iter()).flat_map(|folder| folders::scan_folder(std::path::Path::new(folder))).collect();
    let store_dirs: Vec<String> = games.iter().filter_map(|g| g.install_dir.clone()).collect();
    *lock(&state.found) = found.clone();
    let data = lock(&state.data);
    games.extend(data.local_as_games(&state.data_dir, &found, &store_dirs));
    data.apply_play(&mut games);
    games
}

/// Busca en segundo plano la portada de los juegos locales que aún no la tienen y avisa a la interfaz al terminar.
fn find_missing_art(app: &AppHandle, games: &[Game]) {
    let state = app.state::<AppState>();
    let titles = lock(&state.data).titles_without_art(games);
    if titles.is_empty() || state.art_busy.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        let state = handle.state::<AppState>();
        let mut found_any = false;
        for title in titles.iter().take(40) {
            match folders::find_art(title) {
                Ok(appid) => {
                    found_any |= appid.is_some();
                    lock(&state.data).art.insert(folders::norm_title(title), appid.unwrap_or(0));
                }
                // Sin conexión: se deja para la próxima vez.
                Err(_) => break,
            }
            std::thread::sleep(Duration::from_millis(350));
        }
        persist(&state);
        state.art_busy.store(false, Ordering::SeqCst);
        if found_any {
            let _ = handle.emit("library-changed", ());
        }
    });
}

#[tauri::command]
async fn scan_library(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    let games = collect_games(&state);
    *lock(&state.games) = games.clone();
    find_missing_art(&app, &games);
    Ok(games)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GameFolders {
    /// Las que añadió el usuario.
    chosen: Vec<String>,
    /// Las habituales que Red Level encontró solo.
    usual: Vec<String>,
}

#[tauri::command]
fn game_folders(state: State<'_, AppState>) -> GameFolders {
    let (chosen, usual) = game_folder_list(&state);
    GameFolders { chosen, usual }
}

/// Añade una carpeta donde el usuario tiene juegos: cada subcarpeta con un programa se trata como un juego.
#[tauri::command]
async fn add_game_folder(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let mut dialog = app.dialog().file().set_title("Elige la carpeta donde tienes tus juegos");
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(path) = dialog.blocking_pick_folder().and_then(|folder| folder.into_path().ok()) else {
        return Ok(false);
    };
    let text = path.to_string_lossy().to_string();
    let mut data = lock(&state.data);
    if !data.game_folders.iter().any(|f| f.eq_ignore_ascii_case(&text)) {
        data.game_folders.push(text);
    }
    drop(data);
    persist(&state);
    Ok(true)
}

#[tauri::command]
fn remove_game_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    lock(&state.data).game_folders.retain(|f| !f.eq_ignore_ascii_case(&path));
    persist(&state);
    Ok(())
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
    let found = lock(&state.found).clone();
    let mut data = lock(&state.data);
    data.adopt(&id, &found);
    if let Some(game) = data.local_games.iter_mut().find(|g| g.id == id) {
        game.title = title;
    }
    drop(data);
    persist(&state);
    Ok(())
}

#[tauri::command]
fn remove_local_game(id: String, state: State<'_, AppState>) -> Result<(), String> {
    lock(&state.data).remove_local(&id);
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
    let found = lock(&state.found).clone();
    let old = {
        let mut data = lock(&state.data);
        data.adopt(&id, &found);
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
    lock(&state.data).settings = settings;
    persist(&state);
    apply_guard(&state);
    sync_second(&app);
    second_changed(&app);
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

#[tauri::command]
fn second_state(app: AppHandle) -> SecondState {
    second_state_of(&app)
}

/// Muestra en el segundo monitor una de las apps de la barra; la abre si no lo estaba.
#[tauri::command]
async fn second_open(id: String, app: AppHandle) -> Result<SecondState, String> {
    open_second(&app, &id)?;
    Ok(second_state_of(&app))
}

/// Quita una app de la pantalla: su ventana se minimiza y el programa sigue abierto.
#[tauri::command]
async fn second_close(id: String, app: AppHandle) -> Result<SecondState, String> {
    let state = app.state::<AppState>();
    let user_app = lock(&state.data).apps.iter().find(|a| a.id == id).cloned();
    if let Some(user_app) = user_app {
        apps::minimize_windows_of(&app_pids(&app, &mut Probe::new(), &id, &user_app.path));
    }
    lock(&state.second_pids).remove(&id);
    let mut active = lock(&state.second_active);
    if active.as_deref() == Some(id.as_str()) {
        *active = None;
    }
    drop(active);
    quiet_second(&app, 1500);
    arrange(&app, false);
    second_changed(&app);
    Ok(second_state_of(&app))
}

/// Añade a la barra del segundo monitor un programa del PC, elegido por el usuario.
#[tauri::command]
async fn second_add_app(app: AppHandle, window: tauri::WebviewWindow) -> Result<SecondState, String> {
    let dialog = app.dialog().file().set_title("Elige el programa que quieres tener en el segundo monitor").add_filter("Programas", &["exe"]).set_parent(&window);
    if let Some(path) = dialog.blocking_pick_file().and_then(|file| file.into_path().ok()) {
        let state = app.state::<AppState>();
        lock(&state.data).add_app(&path.to_string_lossy())?;
        persist(&state);
        second_changed(&app);
    }
    Ok(second_state_of(&app))
}

/// Programas instalados en el PC, con su icono, para elegir cuáles van a la barra del segundo monitor.
#[tauri::command]
async fn installed_apps(app: AppHandle) -> Result<Vec<system::InstalledApp>, String> {
    let dir = state_dir(&app);
    tauri::async_runtime::spawn_blocking(move || system::installed_apps(&dir)).await.map_err(|e| e.to_string())?
}

/// Añade a la barra un programa elegido de la lista de instalados.
#[tauri::command]
async fn second_add_installed(chosen: system::InstalledApp, app: AppHandle) -> Result<SecondState, String> {
    let state = app.state::<AppState>();
    lock(&state.data).add_installed_app(&chosen)?;
    persist(&state);
    second_changed(&app);
    Ok(second_state_of(&app))
}

const SECOND_PICKER: &str = "second-picker";

/// Abre o cierra, en el propio segundo monitor, la lista de programas instalados para añadir a la barra.
#[tauri::command]
async fn second_picker(open: bool, app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SECOND_PICKER) {
        if open {
            let _ = window.set_focus();
        } else {
            let _ = window.close();
        }
        return Ok(());
    }
    if !open {
        return Ok(());
    }
    let (_, content) = second_layout(&app).ok_or("Conecta un segundo monitor para añadir apps ahí.")?;
    let window = WebviewWindowBuilder::new(&app, SECOND_PICKER, WebviewUrl::App("index.html".into()))
        .title("Red Level")
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .build()
        .map_err(|e| e.to_string())?;
    place(&window, content);
    Ok(())
}

/// Espacio libre de los discos fijos del PC.
#[tauri::command]
fn disks() -> Vec<system::Disk> {
    system::disks()
}

/// Minimiza Red Level y deja Windows libre (teclas, barra de tareas y avisos) hasta que el usuario vuelva.
#[tauri::command]
async fn minimize(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.minimized.store(true, Ordering::SeqCst);
    guard::release_all();
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Quita una app de la barra. Si estaba en pantalla, su ventana se minimiza.
#[tauri::command]
async fn second_remove_app(id: String, app: AppHandle) -> Result<SecondState, String> {
    let state = app.state::<AppState>();
    let user_app = lock(&state.data).apps.iter().find(|a| a.id == id).cloned();
    let was_open = lock(&state.second_pids).contains_key(&id);
    if let (Some(user_app), true) = (user_app, was_open) {
        apps::minimize_windows_of(&app_pids(&app, &mut Probe::new(), &id, &user_app.path));
    }
    lock(&state.second_pids).remove(&id);
    lock(&state.data).remove_app(&id);
    persist(&state);
    let mut active = lock(&state.second_active);
    if active.as_deref() == Some(id.as_str()) {
        *active = None;
    }
    drop(active);
    quiet_second(&app, 1500);
    arrange(&app, false);
    second_changed(&app);
    Ok(second_state_of(&app))
}

/// En pantalla sola deja solo la barra, sin cerrar las apps. En cuadrícula devuelve a su cuadro la app abierta en grande.
#[tauri::command]
async fn second_hide(app: AppHandle) -> Result<SecondState, String> {
    *lock(&app.state::<AppState>().second_active) = None;
    quiet_second(&app, 1500);
    arrange(&app, false);
    second_changed(&app);
    Ok(second_state_of(&app))
}

/// Divide el segundo monitor en cuadros (de 1 a 12) y recoloca las apps abiertas.
#[tauri::command]
async fn second_set_layout(count: u8, app: AppHandle) -> Result<SecondState, String> {
    let state = app.state::<AppState>();
    let layout = apps::valid_layout(count);
    lock(&state.data).second_layout = layout;
    persist(&state);
    // En pantalla sola se ve una app: la primera abierta. En cuadrícula, todas en su cuadro.
    let open: Vec<String> = lock(&state.second_pids).keys().cloned().collect();
    let first_open = lock(&state.data).apps.iter().find(|a| open.contains(&a.id)).map(|a| a.id.clone());
    *lock(&state.second_active) = if layout == 1 { first_open } else { None };
    quiet_second(&app, 1500);
    arrange(&app, layout == 1);
    second_changed(&app);
    Ok(second_state_of(&app))
}

/// ¿Hay publicada una versión más nueva que la instalada?
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<updates::Update>, String> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || updates::check(&current)).await.map_err(|e| e.to_string())?
}

/// Baja el instalador de la versión nueva, lo lanza y cierra Red Level para que pueda reemplazarlo.
/// El instalador se abre en modo desatendido (/P) y vuelve a abrir Red Level al terminar (/R).
#[tauri::command]
async fn install_update(url: String, app: AppHandle) -> Result<(), String> {
    let dest = std::env::temp_dir().join("RedLevel-Actualizacion.exe");
    let target = dest.clone();
    let size = tauri::async_runtime::spawn_blocking(move || updates::download(&url, &target)).await.map_err(|e| e.to_string())??;
    if size < 500_000 {
        return Err("La descarga llegó incompleta. Inténtalo de nuevo.".into());
    }
    redlevel_core::log_line(&app.state::<AppState>().data_dir, &format!("actualización descargada ({size} bytes): se lanza el instalador"));
    std::process::Command::new(&dest).args(["/P", "/R"]).spawn().map_err(|e| format!("No se pudo abrir el instalador: {e}"))?;
    shutdown(&app);
    Ok(())
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
            if rounds < 3 {
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
                    // Hay juegos que al cerrarse dejan el puntero encerrado u oculto.
                    system::restore_pointer();
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

    let mut app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let data_dir = match std::env::var("REDLEVEL_DATA_DIR") {
                Ok(dir) => PathBuf::from(dir),
                Err(_) => app.path().app_data_dir()?,
            };
            let data = store::load(&data_dir);
            app.manage(AppState {
                data_dir,
                data: Mutex::new(data),
                games: Mutex::new(Vec::new()),
                running: Mutex::new(None),
                launched: Mutex::new(None),
                guard_enabled,
                notifications: Mutex::new(String::new()),
                second_active: Mutex::new(None),
                second_pids: Mutex::new(std::collections::HashMap::new()),
                second_quiet: Mutex::new(std::time::Instant::now()),
                exiting: AtomicBool::new(false),
                minimized: AtomicBool::new(false),
                found: Mutex::new(Vec::new()),
                art_busy: AtomicBool::new(false),
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
            sync_second(&handle);
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
            watch_second(handle.clone());
            // Solo para la prueba automática: añade esos programas (separados por ";") a la barra y los abre
            // en el segundo monitor, dividido en los cuadros que diga REDLEVEL_PRUEBA_DIVISION.
            if let Ok(paths) = std::env::var("REDLEVEL_PRUEBA_SEGUNDO") {
                let second_handle = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(7));
                    let dir = state_dir(&second_handle);
                    if let Some(count) = std::env::var("REDLEVEL_PRUEBA_DIVISION").ok().and_then(|n| n.parse::<u8>().ok()) {
                        lock(&second_handle.state::<AppState>().data).second_layout = apps::valid_layout(count);
                    }
                    let mut added = Vec::new();
                    for path in paths.split(';').filter(|p| !p.is_empty()) {
                        let user_app = lock(&second_handle.state::<AppState>().data).add_app(path);
                        let result = match &user_app {
                            Ok(user_app) => open_second(&second_handle, &user_app.id),
                            Err(e) => Err(e.clone()),
                        };
                        redlevel_core::log_line(&dir, &format!("prueba: abrir {path} en el segundo monitor: {result:?}"));
                        added.extend(user_app.ok());
                        std::thread::sleep(Duration::from_secs(2));
                    }
                    std::thread::sleep(Duration::from_secs(8));
                    for user_app in added {
                        let pids = app_pids(&second_handle, &mut Probe::new(), &user_app.id, &user_app.path);
                        let windows = apps::visible_windows().into_iter().filter(|(_, pid)| pids.contains(pid)).count();
                        redlevel_core::log_line(&dir, &format!("prueba: ventanas de {} en el segundo monitor: {windows}", user_app.name));
                    }
                });
            }
            // Solo para la prueba automática: el propio programa pulsa la salida de emergencia pasado un tiempo.
            if let Some(seconds) = std::env::var("REDLEVEL_PRUEBA_SALIDA").ok().and_then(|s| s.parse::<u64>().ok()) {
                let probe_handle = handle.clone();
                std::thread::spawn(move || {
                    let dir = probe_handle.state::<AppState>().data_dir.clone();
                    std::thread::sleep(Duration::from_secs(8));
                    guard::press_keys(&[0x7E]);
                    std::thread::sleep(Duration::from_millis(300));
                    redlevel_core::log_line(&dir, &format!("prueba: tras pulsar F15: {}", guard::keyboard_diagnostics()));
                    std::thread::sleep(Duration::from_secs(seconds.saturating_sub(8)));
                    guard::press_keys(&[0x11, 0x12, 0x10, 0x51]);
                    std::thread::sleep(Duration::from_millis(300));
                    redlevel_core::log_line(&dir, &format!("prueba: tras pulsar la salida: {}", guard::keyboard_diagnostics()));
                });
            }
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
            second_state,
            second_open,
            second_close,
            second_hide,
            second_add_app,
            second_remove_app,
            second_set_layout,
            installed_apps,
            game_folders,
            add_game_folder,
            remove_game_folder,
            second_add_installed,
            second_picker,
            disks,
            minimize,
            check_update,
            install_update,
            power,
        ])
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar Red Level");

    // Imprescindible para el bloqueo de teclas: por defecto la ventana se registra para recibir
    // entrada "cruda" del teclado, y Windows deja de avisar al gancho de teclado de un programa
    // que hace eso mientras su ventana tiene el foco. Red Level no usa esa entrada, así que se quita.
    app.set_device_event_filter(tauri::DeviceEventFilter::Always);

    app.run(|app, event| match event {
        // Cerrar la ventana principal por cualquier vía cierra todo y restaura Windows.
        RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label == "main" => shutdown(app),
        // Al volver de un minimizado se recupera el modo consola.
        RunEvent::WindowEvent { label, event: tauri::WindowEvent::Focused(true), .. } if label == "main" => {
            let state = app.state::<AppState>();
            if state.minimized.swap(false, Ordering::SeqCst) {
                apply_guard(&state);
                system::restore_pointer();
            }
        }
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
    // Con la barra oculta y No molestar activo, el gancho tiene que seguir viendo las teclas.
    guard::set_taskbar_visible(false);
    guard::press_keys(&[0x7E]);
    std::thread::sleep(Duration::from_millis(300));
    let keyboard_seen_guarded = guard::keyboard_diagnostics();
    guard::set_taskbar_visible(true);
    let dnd_restore = guard::set_notifications_silenced(false);
    let dnd_after = guard::notifications_mode();

    let wifi = wifi::status();
    let processes = Probe::new().running().len();

    // Actualizaciones: consultar la última publicación y bajar su instalador de verdad.
    let latest = updates::latest();
    let update_file = std::env::temp_dir().join("RedLevel-Autoprueba.exe");
    let downloaded = match &latest {
        Ok(Some(update)) => updates::download(&update.url, &update_file).map_err(|e| e.to_string()),
        Ok(None) => Err("no hay ninguna versión publicada".to_string()),
        Err(error) => Err(error.clone()),
    };
    let _ = std::fs::remove_file(&update_file);

    let installed = system::installed_apps(&std::env::temp_dir().join("redlevel-autoprueba"));
    // Portadas: un juego conocido debe encontrarse por su nombre (Portal 2 es el 620 en la tienda de Steam).
    let art = folders::find_art("Portal 2");
    let local_found: Vec<String> = std::env::var("REDLEVEL_CARPETAS_DE_JUEGOS")
        .map(|list| list.split(';').flat_map(|folder| folders::scan_folder(std::path::Path::new(folder))).map(|f| format!("{} = {}", f.title, f.exe)).collect())
        .unwrap_or_default();

    let report = serde_json::json!({
        "windowsName": redlevel_core::windows_display_name(),
        "steam": { "root": steam_root, "games": steam_games.len(), "titles": steam_games.iter().map(|g| &g.title).collect::<Vec<_>>(),
                   "minutes": steam_games.iter().map(|g| g.minutes).collect::<Vec<_>>(),
                   "covers": steam_games.iter().filter(|g| g.cover_file.is_some()).count(),
                   "achievements": achievements.as_ref().map(|a| format!("{}/{}", a.unlocked, a.total)) },
        "epic": { "dir": epic_dir, "games": epic_games.len(), "titles": epic_games.iter().map(|g| &g.title).collect::<Vec<_>>() },
        "keyboard": { "hookInstalled": hook, "modeSet": mode_set, "emergencyExitRecognized": emergency, "seen": keyboard_seen, "seenWithGuardOn": keyboard_seen_guarded },
        "taskbar": { "found": taskbars, "hidden": hidden, "restored": !guard::taskbar_hidden() },
        "notifications": { "before": dnd_before, "set": dnd_set.clone().err().unwrap_or_else(|| "ok".into()), "during": dnd_during,
                           "restore": dnd_restore.err().unwrap_or_else(|| "ok".into()), "after": dnd_after },
        "wifi": { "available": wifi.available, "networks": wifi.networks.len(), "message": wifi.message },
        "processes": processes,
        "installedApps": { "count": installed.as_ref().map(|list| list.len()).unwrap_or(0),
                           "withIcon": installed.as_ref().map(|list| list.iter().filter(|a| a.icon.is_some()).count()).unwrap_or(0),
                           "sample": installed.as_ref().map(|list| list.iter().take(6).map(|a| a.name.clone()).collect::<Vec<_>>()).unwrap_or_default(),
                           "error": installed.as_ref().err() },
        "disks": system::disks(),
        "art": { "portal2": art.as_ref().ok().and_then(|id| *id), "error": art.as_ref().err() },
        "localFound": local_found,
        "updates": { "latest": latest.as_ref().ok().and_then(|u| u.as_ref()).map(|u| &u.version), "expectedBytes": latest.as_ref().ok().and_then(|u| u.as_ref()).map(|u| u.size),
                     "downloadedBytes": downloaded.as_ref().ok(), "error": downloaded.as_ref().err() },
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
