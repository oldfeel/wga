use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub api_base_url: String,
    pub wow_root: String,
    pub auto_upload: bool,
    pub token: String,
    pub username: String,
    pub guild_id: String,
    pub guild_name: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_base_url: "http://127.0.0.1:8088/api/v1".into(),
            wow_root: r"D:\World of Warcraft\_forever_".into(),
            auto_upload: true,
            token: String::new(),
            username: String::new(),
            guild_id: String::new(),
            guild_name: String::new(),
        }
    }
}

pub fn config_path() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("WGA");
    fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

pub fn load() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save(cfg: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let s = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, s).map_err(|e| e.to_string())
}

pub fn list_wga_lua_files(wow_root: &str) -> Vec<PathBuf> {
    let account_root = Path::new(wow_root).join("WTF").join("Account");
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(&account_root) else {
        return out;
    };
    for ent in entries.flatten() {
        if !ent.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let p = ent
            .path()
            .join("SavedVariables")
            .join("WGA.lua");
        if p.exists() {
            out.push(p);
        }
    }
    let shared = account_root.join("SavedVariables").join("WGA.lua");
    if shared.exists() {
        out.push(shared);
    }
    out
}
