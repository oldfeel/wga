use regex::Regex;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

fn last_json_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?:\["last_json"\]|last_json)\s*=\s*"((?:\\.|[^"\\])*)""#).expect("regex")
    })
}

fn unescape_lua_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('"') => out.push('"'),
                Some('n') => out.push('\n'),
                Some('r') => out.push('\r'),
                Some('\\') => out.push('\\'),
                Some(other) => {
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(c);
        }
    }
    out
}

pub fn extract_last_json(lua_text: &str) -> Option<String> {
    let caps = last_json_re().captures(lua_text)?;
    Some(unescape_lua_string(caps.get(1)?.as_str()))
}

#[derive(Debug)]
pub struct ParsedSnapshot {
    pub payload: serde_json::Value,
    pub hash: String,
    pub source: String,
}

pub fn read_snapshot_from_lua(path: &Path) -> Result<ParsedSnapshot, String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json_str =
        extract_last_json(&text).ok_or_else(|| "no last_json (run /wga snapshot in-game)".to_string())?;
    let payload: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("invalid JSON: {e}"))?;
    let ver = payload
        .get("schema_version")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if ver != 1 {
        return Err("unsupported schema_version".into());
    }
    let mut hasher = Sha256::new();
    hasher.update(json_str.as_bytes());
    let hash = hex::encode(hasher.finalize());
    Ok(ParsedSnapshot {
        payload,
        hash,
        source: path.display().to_string(),
    })
}
