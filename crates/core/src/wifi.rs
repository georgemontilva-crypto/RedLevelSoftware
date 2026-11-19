//! Redes wifi a través de `netsh`, que viene con Windows. La salida de netsh cambia con el idioma
//! del sistema, así que se lee por la forma de las líneas y no por sus palabras.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub ssid: String,
    /// 0 a 100.
    pub signal: u8,
    pub secured: bool,
    /// Texto de seguridad tal como lo da Windows (WPA2-Personal, Abierta…).
    pub security: String,
    /// Ya hay una clave guardada para esta red.
    pub known: bool,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// Hay adaptador wifi y se pudo consultar.
    pub available: bool,
    pub connected_ssid: Option<String>,
    pub signal: Option<u8>,
    pub networks: Vec<Network>,
    /// Explicación para el usuario cuando no se puede listar.
    pub message: Option<String>,
}

fn value_of(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    Some((key.trim(), value.trim()))
}

fn percent(text: &str) -> Option<u8> {
    let end = text.find('%')?;
    let digits: String = text[..end].chars().rev().take_while(|c| c.is_ascii_digit()).collect::<String>().chars().rev().collect();
    digits.parse::<u8>().ok().map(|n| n.min(100))
}

fn is_ssid_header(key: &str) -> bool {
    key.strip_prefix("SSID ").map_or(false, |rest| !rest.is_empty() && rest.trim().chars().all(|c| c.is_ascii_digit()))
}

/// Lee la salida de `netsh wlan show networks mode=bssid`.
pub fn parse_networks(output: &str) -> Vec<Network> {
    let mut networks: Vec<Network> = Vec::new();
    let mut field = 0;
    let mut in_block = false;
    for line in output.lines() {
        let Some((key, value)) = value_of(line) else {
            continue;
        };
        if is_ssid_header(key) {
            in_block = !value.is_empty();
            field = 0;
            if in_block && !networks.iter().any(|n| n.ssid == value) {
                networks.push(Network { ssid: value.to_string(), signal: 0, secured: true, security: String::new(), known: false, connected: false });
            } else if networks.iter().any(|n| n.ssid == value) {
                in_block = false;
            }
            continue;
        }
        if !in_block {
            continue;
        }
        field += 1;
        let network = networks.last_mut().expect("hay un bloque abierto");
        // Dentro de cada red el orden es fijo: tipo de red, autenticación, cifrado.
        if field == 2 {
            let lower = value.to_lowercase();
            network.secured = !(lower.starts_with("open") || lower.starts_with("abiert"));
            network.security = value.to_string();
        }
        if let Some(signal) = percent(value) {
            network.signal = network.signal.max(signal);
        }
    }
    networks.sort_by(|a, b| b.signal.cmp(&a.signal));
    networks
}

/// Lee `netsh wlan show interfaces`: red conectada y su señal.
pub fn parse_interface(output: &str) -> (Option<String>, Option<u8>) {
    let mut ssid = None;
    let mut signal = None;
    for line in output.lines() {
        let Some((key, value)) = value_of(line) else {
            continue;
        };
        if key == "SSID" && !value.is_empty() {
            ssid = Some(value.to_string());
        } else if ssid.is_some() && signal.is_none() {
            signal = percent(value);
        }
    }
    (ssid, signal)
}

/// Lee `netsh wlan show profiles`: nombres de las redes con clave guardada.
pub fn parse_profiles(output: &str) -> Vec<String> {
    output
        .lines()
        .filter(|line| line.starts_with(' ') || line.starts_with('\t'))
        .filter_map(value_of)
        .map(|(_, value)| value.to_string())
        .filter(|value| !value.is_empty() && !value.starts_with('<'))
        .collect()
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// Perfil de red para `netsh wlan add profile`.
pub fn profile_xml(ssid: &str, password: Option<&str>, security: &str) -> String {
    let name = xml_escape(ssid);
    let auth = match password {
        None => "<authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX>".to_string(),
        Some(_) if security.to_uppercase().contains("WPA3") => {
            "<authentication>WPA3SAE</authentication><encryption>AES</encryption><useOneX>false</useOneX>".to_string()
        }
        Some(_) => "<authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX>".to_string(),
    };
    let key = password
        .map(|p| format!("<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{}</keyMaterial></sharedKey>", xml_escape(p)))
        .unwrap_or_default();
    format!(
        "<?xml version=\"1.0\"?>\n<WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\"><name>{name}</name><SSIDConfig><SSID><name>{name}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption>{auth}</authEncryption>{key}</security></MSM></WLANProfile>\n"
    )
}

#[cfg(windows)]
mod sys {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// netsh con salida en UTF-8 (sin esto, los nombres con acentos llegan rotos).
    pub fn netsh_text(args: &str) -> Result<String, String> {
        let output = Command::new("cmd")
            .raw_arg(format!("/D /C \"chcp 65001>nul & netsh {args}\""))
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;
        Ok(format!("{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)))
    }

    pub fn netsh(args: &[&str]) -> Result<String, String> {
        let output = Command::new("netsh").args(args).creation_flags(CREATE_NO_WINDOW).output().map_err(|e| e.to_string())?;
        let text = format!("{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
        if output.status.success() {
            Ok(text)
        } else {
            Err(text.trim().to_string())
        }
    }
}

#[cfg(windows)]
pub fn status() -> Status {
    let Ok(interface) = sys::netsh_text("wlan show interfaces") else {
        return Status { message: Some("No se pudo consultar el wifi de Windows.".into()), ..Default::default() };
    };
    // Sin adaptador o con el servicio apagado, netsh no devuelve ninguna línea "clave : valor" de interfaz.
    let has_interface = interface.lines().filter(|line| line.starts_with(' ')).filter_map(value_of).count() >= 3;
    if !has_interface {
        return Status { message: Some("Este PC no tiene wifi o está apagado.".into()), ..Default::default() };
    }
    let (connected_ssid, signal) = parse_interface(&interface);
    let listing = sys::netsh_text("wlan show networks mode=bssid").unwrap_or_default();
    let mut networks = parse_networks(&listing);
    let profiles = sys::netsh_text("wlan show profiles").map(|text| parse_profiles(&text)).unwrap_or_default();
    for network in &mut networks {
        network.known = profiles.contains(&network.ssid);
        network.connected = connected_ssid.as_deref() == Some(network.ssid.as_str());
    }
    networks.sort_by(|a, b| b.connected.cmp(&a.connected).then(b.signal.cmp(&a.signal)));
    let message = (networks.is_empty() && connected_ssid.is_none()).then(|| {
        "Windows no devolvió redes. Activa la ubicación en Configuración > Privacidad y seguridad > Ubicación para que las apps puedan ver las redes wifi.".to_string()
    });
    Status { available: true, connected_ssid, signal, networks, message }
}

#[cfg(windows)]
pub fn connect(ssid: &str, password: Option<&str>, security: &str, known: bool) -> Result<(), String> {
    if !(known && password.is_none()) {
        let file = std::env::temp_dir().join(format!("redlevel-wifi-{}.xml", std::process::id()));
        std::fs::write(&file, profile_xml(ssid, password, security)).map_err(|e| e.to_string())?;
        let added = sys::netsh(&["wlan", "add", "profile", &format!("filename={}", file.display()), "user=current"]);
        let _ = std::fs::remove_file(&file);
        added?;
    }
    sys::netsh(&["wlan", "connect", &format!("name={ssid}"), &format!("ssid={ssid}")]).map(|_| ())
}

#[cfg(windows)]
pub fn disconnect() -> Result<(), String> {
    sys::netsh(&["wlan", "disconnect"]).map(|_| ())
}

#[cfg(not(windows))]
pub fn status() -> Status {
    Status { message: Some("El wifi solo se gestiona en Windows.".into()), ..Default::default() }
}

#[cfg(not(windows))]
pub fn connect(_ssid: &str, _password: Option<&str>, _security: &str, _known: bool) -> Result<(), String> {
    Err("El wifi solo se gestiona en Windows.".into())
}

#[cfg(not(windows))]
pub fn disconnect() -> Result<(), String> {
    Err("El wifi solo se gestiona en Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const EN: &str = "\nInterface name : Wi-Fi \nThere are 3 networks currently visible. \n\nSSID 1 : Casa Montilva\n    Network type            : Infrastructure\n    Authentication          : WPA2-Personal\n    Encryption              : CCMP \n    BSSID 1                 : aa:bb:cc:dd:ee:01\n         Signal             : 62%  \n         Radio type         : 802.11ac\n         Channel            : 36 \n    BSSID 2                 : aa:bb:cc:dd:ee:02\n         Signal             : 88%  \n\nSSID 2 : Cafe_Libre\n    Network type            : Infrastructure\n    Authentication          : Open\n    Encryption              : None \n    BSSID 1                 : 11:22:33:44:55:66\n         Signal             : 40%  \n\nSSID 3 : \n    Network type            : Infrastructure\n    Authentication          : WPA2-Personal\n    Encryption              : CCMP \n    BSSID 1                 : 99:88:77:66:55:44\n         Signal             : 99%  \n";

    const ES: &str = "\nNombre de interfaz : Wi-Fi \nActualmente hay 2 redes visibles. \n\nSSID 1 : Señal Ñandú 5G\n    Tipo de red             : Infraestructura\n    Autenticación           : WPA3-Personal\n    Cifrado                 : CCMP \n    BSSID 1                 : aa:bb:cc:dd:ee:01\n         Señal              : 71%  \n\nSSID 2 : Plaza\n    Tipo de red             : Infraestructura\n    Autenticación           : Abierta\n    Cifrado                 : Ninguna \n    BSSID 1                 : 11:22:33:44:55:66\n         Señal              : 35%  \n";

    #[test]
    fn networks_in_english() {
        let nets = parse_networks(EN);
        assert_eq!(nets.len(), 2, "la red oculta no se lista");
        assert_eq!((nets[0].ssid.as_str(), nets[0].signal, nets[0].secured), ("Casa Montilva", 88, true));
        assert_eq!(nets[0].security, "WPA2-Personal");
        assert_eq!((nets[1].ssid.as_str(), nets[1].signal, nets[1].secured), ("Cafe_Libre", 40, false));
    }

    #[test]
    fn networks_in_spanish() {
        let nets = parse_networks(ES);
        assert_eq!(nets.len(), 2);
        assert_eq!((nets[0].ssid.as_str(), nets[0].signal, nets[0].secured), ("Señal Ñandú 5G", 71, true));
        assert!(!nets[1].secured);
    }

    #[test]
    fn interface_and_profiles() {
        let out = "\nThere is 1 interface on the system: \n\n    Name                   : Wi-Fi\n    Description            : Intel(R) Wi-Fi 6 AX200\n    State                  : connected\n    SSID                   : Casa Montilva\n    BSSID                  : aa:bb:cc:dd:ee:02\n    Radio type             : 802.11ac\n    Signal                 : 88% \n    Profile                : Casa Montilva \n";
        assert_eq!(parse_interface(out), (Some("Casa Montilva".into()), Some(88)));
        assert_eq!(parse_interface("    Name : Wi-Fi\n    State : disconnected\n"), (None, None));

        let profiles = "\nProfiles on interface Wi-Fi:\n\nGroup policy profiles (read only)\n---------------------------------\n    <None>\n\nUser profiles\n-------------\n    All User Profile     : Casa Montilva\n    All User Profile     : Oficina 2.4\n";
        assert_eq!(parse_profiles(profiles), vec!["Casa Montilva", "Oficina 2.4"]);
    }

    #[test]
    fn profile_xml_escapes_and_picks_security() {
        let xml = profile_xml("Tom & Jerry", Some("a<b>\"c"), "WPA2-Personal");
        assert!(xml.contains("<name>Tom &amp; Jerry</name>"));
        assert!(xml.contains("<keyMaterial>a&lt;b&gt;&quot;c</keyMaterial>"));
        assert!(xml.contains("WPA2PSK"));
        assert!(profile_xml("x", Some("clave1234"), "WPA3-Personal").contains("WPA3SAE"));
        let open = profile_xml("Plaza", None, "Abierta");
        assert!(open.contains("<authentication>open</authentication>") && !open.contains("sharedKey"));
    }
}
