//! Crea una biblioteca de mentira (Steam, Epic y datos de Red Level) con juegos inventados.
//! La compilación automática la usa para abrir el programa real en Windows y comprobar que
//! lee horas, logros y carátulas tal como lo haría con un Steam de verdad.
//!
//!   cargo run -p redlevel-core --example make_demo -- <carpeta>

use std::fs;
use std::path::Path;

fn obj(out: &mut Vec<u8>, key: &str, body: impl FnOnce(&mut Vec<u8>)) {
    out.push(0x00);
    out.extend_from_slice(key.as_bytes());
    out.push(0);
    body(out);
    out.push(0x08);
}

fn text(out: &mut Vec<u8>, key: &str, value: &str) {
    out.push(0x01);
    out.extend_from_slice(key.as_bytes());
    out.push(0);
    out.extend_from_slice(value.as_bytes());
    out.push(0);
}

fn int(out: &mut Vec<u8>, key: &str, value: i32) {
    out.push(0x02);
    out.extend_from_slice(key.as_bytes());
    out.push(0);
    out.extend_from_slice(&value.to_le_bytes());
}

const NAMES: &[(&str, &str)] = &[
    ("Primer vuelo", "Completa el tutorial."),
    ("Sin rozar la pared", "Termina una pista sin chocar."),
    ("Coleccionista", "Encuentra los 40 fragmentos."),
    ("Madrugador", "Juega antes de las 6 de la mañana."),
    ("Viento de cola", "Alcanza la velocidad máxima."),
    ("Contra el reloj", "Bate el tiempo del desarrollador."),
    ("Final verdadero", "Descubre lo que hay tras la última puerta."),
    ("Manos de seda", "Encadena 50 derrapes perfectos."),
];

fn schema(appid: u32, total: usize) -> Vec<u8> {
    let mut buf = Vec::new();
    obj(&mut buf, &appid.to_string(), |b| {
        obj(b, "stats", |b| {
            obj(b, "1", |b| {
                text(b, "type", "4");
                obj(b, "bits", |b| {
                    for i in 0..total {
                        let (name, desc) = NAMES[i % NAMES.len()];
                        obj(b, &i.to_string(), |b| {
                            text(b, "name", &format!("ACH_{i}"));
                            int(b, "bit", i as i32);
                            obj(b, "display", |b| {
                                obj(b, "name", |b| {
                                    text(b, "english", name);
                                    text(b, "spanish", name);
                                });
                                obj(b, "desc", |b| text(b, "spanish", desc));
                                text(b, "hidden", if i % 7 == 6 { "1" } else { "0" });
                            });
                        });
                    }
                });
            });
        });
    });
    buf.push(0x08);
    buf
}

fn progress(unlocked: usize, now: u64) -> Vec<u8> {
    let mask: u32 = (0..unlocked).fold(0, |m, i| m | (1 << i));
    let mut buf = Vec::new();
    obj(&mut buf, "cache", |b| {
        int(b, "crc", 7);
        obj(b, "1", |b| {
            int(b, "data", mask as i32);
            obj(b, "AchievementTimes", |b| {
                for i in 0..unlocked {
                    int(b, &i.to_string(), (now - (i as u64) * 172_800) as i32);
                }
            });
        });
    });
    buf.push(0x08);
    buf
}

fn main() {
    let out = std::env::args().nth(1).expect("falta la carpeta de destino");
    let out = Path::new(&out);
    let now = redlevel_core::now_secs();
    let day = 86_400u64;

    // (appid, título, carpeta, minutos, días desde la última partida, logros totales, conseguidos, carátula)
    let steam_games: &[(u32, &str, &str, u64, u64, usize, usize, Option<&str>)] = &[
        (910_001, "Halcyon Drift", "HalcyonDrift", 7462, 0, 25, 8, Some("halcyon")),
        (910_002, "Emberfall", "Emberfall", 3120, 1, 30, 19, Some("emberfall")),
        (910_003, "Saltwind", "Saltwind", 1290, 6, 18, 11, Some("saltwind")),
        (910_004, "Ironroot Tactics", "Ironroot", 15_840, 14, 31, 27, Some("ironroot")),
        (910_005, "Paper Kingdoms", "PaperKingdoms", 402, 31, 12, 2, None),
        (910_006, "Kiln", "Kiln", 0, 0, 0, 0, None),
    ];

    let steam = out.join("steam");
    let user = 1234u32;
    let assets = Path::new(env!("CARGO_MANIFEST_DIR")).join("examples").join("assets");
    for dir in ["steamapps/common", "config", "appcache/stats", "appcache/librarycache", &format!("userdata/{user}/config")] {
        fs::create_dir_all(steam.join(dir)).unwrap();
    }
    let mut local_config = String::from("\"UserLocalConfigStore\"\n{\n\t\"Software\"\n\t{\n\t\t\"Valve\"\n\t\t{\n\t\t\t\"Steam\"\n\t\t\t{\n\t\t\t\t\"apps\"\n\t\t\t\t{\n");
    for (appid, title, dir, minutes, days, total, unlocked, art) in steam_games {
        fs::create_dir_all(steam.join("steamapps/common").join(dir)).unwrap();
        fs::write(
            steam.join(format!("steamapps/appmanifest_{appid}.acf")),
            format!("\"AppState\"\n{{\n\t\"appid\"\t\t\"{appid}\"\n\t\"name\"\t\t\"{title}\"\n\t\"StateFlags\"\t\t\"4\"\n\t\"installdir\"\t\t\"{dir}\"\n\t\"SizeOnDisk\"\t\t\"{}\"\n}}\n", (*appid as u64 % 97 + 6) * 1_073_741_824),
        )
        .unwrap();
        if *minutes > 0 {
            local_config.push_str(&format!("\t\t\t\t\t\"{appid}\"\n\t\t\t\t\t{{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"{}\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"{minutes}\"\n\t\t\t\t\t}}\n", now - days * day - 3600));
        }
        if *total > 0 {
            fs::write(steam.join(format!("appcache/stats/UserGameStatsSchema_{appid}.bin")), schema(*appid, *total)).unwrap();
            fs::write(steam.join(format!("appcache/stats/UserGameStats_{user}_{appid}.bin")), progress(*unlocked, now)).unwrap();
        }
        if let Some(art) = art {
            // Como el Steam actual: una carpeta por juego con una subcarpeta de nombre aleatorio.
            let cache = steam.join(format!("appcache/librarycache/{appid}/a1b2c3"));
            fs::create_dir_all(&cache).unwrap();
            fs::copy(assets.join(format!("{art}_cover.jpg")), cache.join("library_600x900.jpg")).unwrap();
            fs::copy(assets.join(format!("{art}_hero.jpg")), cache.join("library_hero.jpg")).unwrap();
        }
    }
    local_config.push_str("\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n");
    fs::write(steam.join(format!("userdata/{user}/config/localconfig.vdf")), local_config).unwrap();
    fs::write(
        steam.join("config/loginusers.vdf"),
        format!("\"users\"\n{{\n\t\"{}\"\n\t{{\n\t\t\"AccountName\"\t\t\"demo\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}}\n}}\n", 76_561_197_960_265_728u64 + user as u64),
    )
    .unwrap();
    fs::write(
        steam.join("steamapps/libraryfolders.vdf"),
        format!("\"libraryfolders\"\n{{\n\t\"0\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n}}\n", steam.to_string_lossy().replace('\\', "\\\\")),
    )
    .unwrap();

    let manifests = out.join("epic").join("Manifests");
    fs::create_dir_all(&manifests).unwrap();
    for (app, title) in [("nocturne01", "Nocturne Protocol"), ("vanta02", "Vanta Circuit")] {
        let install = out.join("epic").join("games").join(app);
        fs::create_dir_all(&install).unwrap();
        let item = serde_json::json!({
            "DisplayName": title, "InstallLocation": install, "LaunchExecutable": "Game.exe", "AppName": app,
            "CatalogNamespace": "demo", "CatalogItemId": format!("item-{app}"), "MainGameAppName": app,
            "AppCategories": ["public", "games", "applications"], "InstallSize": 21_474_836_480u64,
        });
        fs::write(manifests.join(format!("{app}.item")), serde_json::to_string_pretty(&item).unwrap()).unwrap();
    }

    let data_dir = out.join("data");
    let local_exe = out.join("local").join("Tetra").join("Tetra.exe");
    fs::create_dir_all(local_exe.parent().unwrap()).unwrap();
    let mut data = redlevel_core::store::Data::default();
    data.onboarded = true;
    data.profile.name = "Jorge".into();
    let local = data.add_local(&local_exe.to_string_lossy()).unwrap();
    data.add_play(&local.id, 38 * 60);
    data.add_play("epic:nocturne01", 845 * 60);
    redlevel_core::store::save(&data_dir, &data).unwrap();

    println!("Biblioteca de prueba creada en {}", out.display());
}
