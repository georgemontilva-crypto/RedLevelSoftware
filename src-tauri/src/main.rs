// Sin consola negra detrás de la ventana en Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--selftest") {
        let out = args.get(i + 1).cloned().unwrap_or_else(|| "selftest.json".into());
        std::process::exit(red_level_lib::selftest(&out));
    }
    red_level_lib::run();
}
