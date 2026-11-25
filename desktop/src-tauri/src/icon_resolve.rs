//! 装备图标解析：CDN 文件名 / 物品对照表 / fileId→BLP→PNG 本地缓存

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize)]
pub struct IconSrc {
    /// CDN URL 或 data:image/png;base64,...
    pub src: String,
    pub source: String,
}

fn icons_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("WGA")
        .join("icons");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn item_name_map() -> &'static HashMap<String, String> {
    static MAP: OnceLock<HashMap<String, String>> = OnceLock::new();
    MAP.get_or_init(|| {
        serde_json::from_str(include_str!("../item-icon-cache.json")).unwrap_or_default()
    })
}

fn is_icon_name(s: &str) -> bool {
    !s.is_empty()
        && !s.chars().all(|c| c.is_ascii_digit())
        && !s.to_ascii_lowercase().starts_with("invtype_")
}

fn cdn_url(name: &str) -> String {
    format!(
        "https://render.worldofwarcraft.com/us/icons/56/{}.jpg",
        name.to_ascii_lowercase()
    )
}

fn cached_png_path(file_id: u32) -> PathBuf {
    icons_dir().join(format!("{file_id}.png"))
}

fn png_to_data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", B64.encode(png))
}

fn blp_bytes_to_png(blp: &[u8]) -> Result<Vec<u8>, String> {
    use image_blp::convert::blp_to_image;
    use image_blp::parser::load_blp_from_buf;
    use std::io::Cursor;

    let blp_file = load_blp_from_buf(blp).map_err(|e| format!("parse blp: {e}"))?;
    let img = blp_to_image(&blp_file, 0).map_err(|e| format!("blp convert: {e}"))?;
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageOutputFormat::Png)
        .map_err(|e| format!("encode png: {e}"))?;
    Ok(out.into_inner())
}

async fn fetch_blp(file_id: u32) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) WGA-Sync/0.1")
        .timeout(std::time::Duration::from_secs(12))
        .connect_timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|e| e.to_string())?;
    // 社区 CASC 镜像：零售/共用 fileId 可用；无限私有资源可能 404
    let url = format!("https://wago.tools/api/casc/{file_id}");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("casc http {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() < 4 {
        return Err("empty casc payload".into());
    }
    let mag = &bytes[0..4];
    if mag != b"BLP2" && mag != b"BLP1" && mag != b"BLP0" {
        return Err("not a BLP payload".into());
    }
    Ok(bytes.to_vec())
}

fn load_cached_data_url(file_id: u32) -> Option<IconSrc> {
    let path = cached_png_path(file_id);
    let png = fs::read(&path).ok()?;
    if png.is_empty() {
        return None;
    }
    Some(IconSrc {
        src: png_to_data_url(&png),
        source: "cache".into(),
    })
}

/// 解析单个装备图标（优先文件名 CDN → 物品对照表 → fileId 拉 BLP 缓存）
pub async fn resolve_equip_icon(
    icon: Option<String>,
    icon_file_id: Option<u32>,
    item_id: Option<i64>,
) -> Option<IconSrc> {
    if let Some(name) = icon.as_deref().map(str::trim).filter(|s| is_icon_name(s)) {
        return Some(IconSrc {
            src: cdn_url(name),
            source: "cdn".into(),
        });
    }

    if let Some(id) = item_id.filter(|x| *x > 0) {
        if let Some(name) = item_name_map().get(&id.to_string()) {
            if is_icon_name(name) {
                return Some(IconSrc {
                    src: cdn_url(name),
                    source: "item_cache".into(),
                });
            }
        }
    }

    let file_id = icon_file_id.filter(|x| *x > 0)?;
    if let Some(hit) = load_cached_data_url(file_id) {
        return Some(hit);
    }

    let blp = fetch_blp(file_id).await.ok()?;
    let png = blp_bytes_to_png(&blp).ok()?;
    let path = cached_png_path(file_id);
    let _ = fs::write(&path, &png);
    Some(IconSrc {
        src: png_to_data_url(&png),
        source: "file_id".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blp_sample_converts() {
        // 可选：有网络时手工把 BLP 放到此测；无文件则跳过
        let sample = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/sample.blp");
        if !sample.exists() {
            return;
        }
        let blp = fs::read(sample).unwrap();
        let png = blp_bytes_to_png(&blp).expect("png");
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
    }
}
