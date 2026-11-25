//! 装备图标：仅本地 CASC（fileId → BLP → PNG 缓存）

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use crate::casc_local;

#[derive(Debug, Clone, Serialize)]
pub struct IconSrc {
    /// PNG 的 base64（不含 data: 前缀，前端转 Blob）
    pub b64: String,
    pub source: String,
    pub ms: u64,
}

fn icons_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("WGA")
        .join("icons");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn cached_png_path(file_id: u32) -> PathBuf {
    icons_dir().join(format!("{file_id}.png"))
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

fn load_cached(file_id: u32) -> Option<Vec<u8>> {
    let path = cached_png_path(file_id);
    let png = fs::read(&path).ok()?;
    if png.len() < 8 || !png.starts_with(&[0x89, b'P', b'N', b'G']) {
        return None;
    }
    Some(png)
}

/// 仅按 icon_file_id 从本地 CASC 解析（PNG 磁盘缓存加速二次加载）
pub async fn resolve_equip_icon(
    _icon: Option<String>,
    icon_file_id: Option<u32>,
    _item_id: Option<i64>,
) -> Result<IconSrc, String> {
    let t0 = Instant::now();
    let file_id = icon_file_id
        .filter(|x| *x > 0)
        .ok_or_else(|| "missing icon_file_id".to_string())?;

    if let Some(png) = load_cached(file_id) {
        let ms = t0.elapsed().as_millis() as u64;
        eprintln!("[icon] {file_id} cache hit png={} ms={ms}", png.len());
        return Ok(IconSrc {
            b64: B64.encode(&png),
            source: "cache".into(),
            ms,
        });
    }

    eprintln!("[icon] {file_id} casc miss → read");
    let blp = casc_local::read_blp_by_fdid(file_id).await?;
    let png = blp_bytes_to_png(&blp)?;
    let _ = fs::write(cached_png_path(file_id), &png);
    let ms = t0.elapsed().as_millis() as u64;
    eprintln!(
        "[icon] {file_id} casc ok blp={} png={} ms={ms}",
        blp.len(),
        png.len()
    );
    Ok(IconSrc {
        b64: B64.encode(&png),
        source: "local_casc".into(),
        ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blp_sample_converts() {
        let sample = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/sample.blp");
        if !sample.exists() {
            return;
        }
        let blp = fs::read(sample).unwrap();
        let png = blp_bytes_to_png(&blp).expect("png");
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
    }
}
