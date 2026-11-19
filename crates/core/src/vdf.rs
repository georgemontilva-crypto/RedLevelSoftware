//! Lectores del formato VDF de Valve: el de texto (appmanifest, libraryfolders, localconfig)
//! y el binario (esquema y progreso de logros en appcache/stats).

#[derive(Debug, Clone, PartialEq)]
pub enum Vdf {
    Str(String),
    Obj(Vec<(String, Vdf)>),
}

impl Vdf {
    pub fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Obj(items) => items.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            Vdf::Str(_) => None,
        }
    }

    pub fn path(&self, keys: &[&str]) -> Option<&Vdf> {
        keys.iter().try_fold(self, |node, key| node.get(key))
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Vdf::Str(s) => Some(s),
            Vdf::Obj(_) => None,
        }
    }

    pub fn entries(&self) -> &[(String, Vdf)] {
        match self {
            Vdf::Obj(items) => items,
            Vdf::Str(_) => &[],
        }
    }

    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Vdf::as_str)
    }

    pub fn get_u64(&self, key: &str) -> Option<u64> {
        self.get_str(key).and_then(|s| s.trim().parse().ok())
    }
}

#[derive(Debug, PartialEq)]
enum Token {
    Open,
    Close,
    Text(String),
}

fn tokenize(input: &str) -> Vec<Token> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
        } else if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
        } else if c == '{' {
            tokens.push(Token::Open);
            i += 1;
        } else if c == '}' {
            tokens.push(Token::Close);
            i += 1;
        } else if c == '"' {
            i += 1;
            let mut text = String::new();
            while i < chars.len() && chars[i] != '"' {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    i += 1;
                    text.push(match chars[i] {
                        'n' => '\n',
                        't' => '\t',
                        other => other,
                    });
                } else {
                    text.push(chars[i]);
                }
                i += 1;
            }
            i += 1;
            tokens.push(Token::Text(text));
        } else {
            let start = i;
            while i < chars.len() && !chars[i].is_whitespace() && !matches!(chars[i], '{' | '}' | '"') {
                i += 1;
            }
            let text: String = chars[start..i].iter().collect();
            // Las condiciones tipo [$WIN32] no aportan nada aquí.
            if !(text.starts_with('[') && text.ends_with(']')) {
                tokens.push(Token::Text(text));
            }
        }
    }
    tokens
}

fn parse_pairs(tokens: &[Token], pos: &mut usize) -> Vec<(String, Vdf)> {
    let mut items = Vec::new();
    while *pos < tokens.len() {
        let key = match &tokens[*pos] {
            Token::Close => {
                *pos += 1;
                break;
            }
            Token::Open => {
                *pos += 1;
                continue;
            }
            Token::Text(text) => text.clone(),
        };
        *pos += 1;
        match tokens.get(*pos) {
            Some(Token::Open) => {
                *pos += 1;
                items.push((key, Vdf::Obj(parse_pairs(tokens, pos))));
            }
            Some(Token::Text(value)) => {
                items.push((key, Vdf::Str(value.clone())));
                *pos += 1;
            }
            _ => break,
        }
    }
    items
}

/// Lee un VDF de texto. Nunca falla: un archivo roto devuelve lo que se pudo leer.
pub fn parse_text(input: &str) -> Vdf {
    let tokens = tokenize(input);
    let mut pos = 0;
    Vdf::Obj(parse_pairs(&tokens, &mut pos))
}

#[derive(Debug, Clone, PartialEq)]
pub enum Bin {
    Obj(Vec<(String, Bin)>),
    Str(String),
    Int(i64),
    Float(f32),
}

impl Bin {
    pub fn get(&self, key: &str) -> Option<&Bin> {
        match self {
            Bin::Obj(items) => items.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn entries(&self) -> &[(String, Bin)] {
        match self {
            Bin::Obj(items) => items,
            _ => &[],
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Bin::Str(s) => Some(s),
            _ => None,
        }
    }

    /// Entero, aunque Steam lo haya guardado como texto.
    pub fn as_int(&self) -> Option<i64> {
        match self {
            Bin::Int(n) => Some(*n),
            Bin::Str(s) => s.trim().parse().ok(),
            _ => None,
        }
    }
}

fn read_cstr(buf: &[u8], pos: &mut usize) -> Option<String> {
    let end = buf[*pos..].iter().position(|b| *b == 0)? + *pos;
    let text = String::from_utf8_lossy(&buf[*pos..end]).into_owned();
    *pos = end + 1;
    Some(text)
}

fn read_bytes<'a>(buf: &'a [u8], pos: &mut usize, len: usize) -> Option<&'a [u8]> {
    let slice = buf.get(*pos..*pos + len)?;
    *pos += len;
    Some(slice)
}

fn parse_bin_obj(buf: &[u8], pos: &mut usize, depth: u32) -> Option<Vec<(String, Bin)>> {
    if depth > 32 {
        return None;
    }
    let mut items = Vec::new();
    while *pos < buf.len() {
        let kind = buf[*pos];
        *pos += 1;
        if kind == 0x08 || kind == 0x0B {
            break;
        }
        let key = read_cstr(buf, pos)?;
        let value = match kind {
            0x00 => Bin::Obj(parse_bin_obj(buf, pos, depth + 1)?),
            0x01 => Bin::Str(read_cstr(buf, pos)?),
            0x02 | 0x04 | 0x06 => {
                let b = read_bytes(buf, pos, 4)?;
                Bin::Int(i32::from_le_bytes([b[0], b[1], b[2], b[3]]) as i64)
            }
            0x03 => {
                let b = read_bytes(buf, pos, 4)?;
                Bin::Float(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            }
            0x07 | 0x0A => {
                let b = read_bytes(buf, pos, 8)?;
                let mut raw = [0u8; 8];
                raw.copy_from_slice(b);
                Bin::Int(i64::from_le_bytes(raw))
            }
            _ => return None,
        };
        items.push((key, value));
    }
    Some(items)
}

/// Lee un VDF binario. Devuelve None si el archivo no tiene ese formato.
pub fn parse_binary(buf: &[u8]) -> Option<Bin> {
    let mut pos = 0;
    let items = parse_bin_obj(buf, &mut pos, 0)?;
    if items.is_empty() {
        None
    } else {
        Some(Bin::Obj(items))
    }
}

#[cfg(test)]
pub(crate) mod testutil {
    //! Escritor de VDF binario para armar archivos de prueba.
    pub fn obj(out: &mut Vec<u8>, key: &str, body: impl FnOnce(&mut Vec<u8>)) {
        out.push(0x00);
        out.extend_from_slice(key.as_bytes());
        out.push(0);
        body(out);
        out.push(0x08);
    }
    pub fn text(out: &mut Vec<u8>, key: &str, value: &str) {
        out.push(0x01);
        out.extend_from_slice(key.as_bytes());
        out.push(0);
        out.extend_from_slice(value.as_bytes());
        out.push(0);
    }
    pub fn int(out: &mut Vec<u8>, key: &str, value: i32) {
        out.push(0x02);
        out.extend_from_slice(key.as_bytes());
        out.push(0);
        out.extend_from_slice(&value.to_le_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_manifest() {
        let vdf = parse_text(
            "\"AppState\"\n{\n\t\"appid\"\t\t\"1245620\"\n\t\"name\"\t\t\"Juego de prueba\"\n\t\"installdir\"\t\t\"Prueba\"\n\t\"UserConfig\"\n\t{\n\t\t\"language\"\t\t\"spanish\"\n\t}\n}\n",
        );
        let app = vdf.get("appstate").unwrap();
        assert_eq!(app.get_u64("appid"), Some(1245620));
        assert_eq!(app.get_str("name"), Some("Juego de prueba"));
        assert_eq!(app.path(&["UserConfig", "language"]).and_then(Vdf::as_str), Some("spanish"));
    }

    #[test]
    fn text_escapes_and_comments() {
        let vdf = parse_text("// cabecera\n\"libraryfolders\" { \"0\" { \"path\" \"D:\\\\Juegos\\\\Steam\" } }");
        assert_eq!(vdf.path(&["libraryfolders", "0", "path"]).and_then(Vdf::as_str), Some("D:\\Juegos\\Steam"));
    }

    #[test]
    fn text_broken_file_does_not_panic() {
        let vdf = parse_text("\"a\" { \"b\" \"c\" \"d\" {");
        assert_eq!(vdf.path(&["a", "b"]).and_then(Vdf::as_str), Some("c"));
    }

    #[test]
    fn binary_roundtrip() {
        let mut buf = Vec::new();
        testutil::obj(&mut buf, "cache", |b| {
            testutil::int(b, "crc", -5);
            testutil::obj(b, "1", |b| testutil::int(b, "data", 0b101));
            testutil::text(b, "name", "hola");
        });
        buf.push(0x08);
        let bin = parse_binary(&buf).unwrap();
        let cache = bin.get("cache").unwrap();
        assert_eq!(cache.get("crc").and_then(Bin::as_int), Some(-5));
        assert_eq!(cache.get("1").and_then(|s| s.get("data")).and_then(Bin::as_int), Some(5));
        assert_eq!(cache.get("name").and_then(Bin::as_str), Some("hola"));
    }

    #[test]
    fn binary_garbage_is_rejected() {
        assert!(parse_binary(&[0x55, 0x41, 0x00, 0x99]).is_none());
        assert!(parse_binary(&[]).is_none());
    }
}
