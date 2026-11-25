//! 本地 Forever CASC：按 FileDataID 读 BLP（绕过 casc-lib `read_by_ckey` 误用 read_raw 的 bug）

use casc_lib::blte::decoder::decode_blte_with_keys;
use casc_lib::extract::pipeline::{CascStorage, OpenConfig};
use casc_lib::root::flags::LocaleFlags;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::config;

enum CascState {
    Ready(CascStorage),
    Failed(String),
}

fn state() -> &'static Mutex<Option<CascState>> {
    static S: OnceLock<Mutex<Option<CascState>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn empty_listfile_path() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("WGA");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("empty-listfile.csv");
    if !path.exists() {
        let _ = std::fs::write(
            &path,
            "# empty listfile — FDID reads use root, not paths\n",
        );
    }
    path
}

/// 从插件目录（`…/_forever_`）向上找带 `.build.info` + `Data/` 的安装根。
pub fn resolve_install_dir(wow_root: &str) -> Option<PathBuf> {
    let mut cur = PathBuf::from(wow_root.trim());
    if cur.as_os_str().is_empty() {
        return None;
    }
    for _ in 0..5 {
        if cur.join(".build.info").is_file() && cur.join("Data").is_dir() {
            return Some(cur);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

fn open_storage(install_dir: &Path) -> Result<CascStorage, String> {
    let listfile = empty_listfile_path();
    let try_products = ["wowf", "wow"];
    let mut last_err = String::from("no product");
    for product in try_products {
        match CascStorage::open(&OpenConfig {
            install_dir: install_dir.to_path_buf(),
            product: Some(product.into()),
            keyfile: None,
            listfile: Some(listfile.clone()),
            output_dir: None,
        }) {
            Ok(s) => return Ok(s),
            Err(e) => last_err = format!("{product}: {e}"),
        }
    }
    Err(last_err)
}

fn ensure_ready(guard: &mut Option<CascState>) -> Result<&CascStorage, String> {
    // Failed 可重试（换盘符 / 首次锁文件等）
    let need_open = match guard.as_ref() {
        None => true,
        Some(CascState::Failed(_)) => true,
        Some(CascState::Ready(_)) => false,
    };
    if need_open {
        let cfg = config::load();
        let install = resolve_install_dir(&cfg.wow_root).ok_or_else(|| {
            format!(
                "未找到 CASC 安装根（需含 .build.info）。当前 wow_root={}",
                cfg.wow_root
            )
        })?;
        eprintln!(
            "[casc] opening {} (wow_root={})",
            install.display(),
            cfg.wow_root
        );
        let opened = open_storage(&install);
        match &opened {
            Ok(s) => {
                let info = s.info();
                eprintln!(
                    "[casc] ready product={} ver={} root={}",
                    info.product, info.version, info.root_entries
                );
            }
            Err(e) => eprintln!("[casc] open failed: {e}"),
        }
        *guard = Some(match opened {
            Ok(s) => CascState::Ready(s),
            Err(e) => CascState::Failed(e),
        });
    }
    match guard.as_ref().unwrap() {
        CascState::Ready(s) => Ok(s),
        CascState::Failed(e) => Err(e.clone()),
    }
}

/// 正确读路径：root → encoding → index → `read_entry`（跳过 30B header）→ BLTE。
fn read_blp_fdid(storage: &CascStorage, fdid: u32) -> Result<Vec<u8>, String> {
    let root = storage
        .root
        .find_by_fdid(fdid, LocaleFlags::NONE)
        .or_else(|| storage.root.find_by_fdid(fdid, LocaleFlags::ZH_CN))
        .or_else(|| storage.root.find_by_fdid(fdid, LocaleFlags::EN_US))
        .ok_or_else(|| format!("fdid {fdid} not in root"))?;

    let enc = storage
        .encoding
        .find_ekey(&root.ckey)
        .ok_or_else(|| format!("fdid {fdid}: encoding miss"))?;
    let ekey = enc
        .ekeys
        .first()
        .ok_or_else(|| format!("fdid {fdid}: no ekey"))?;
    let idx = storage
        .index
        .find(ekey)
        .ok_or_else(|| format!("fdid {fdid}: index miss (not resident?)"))?;

    let blte = storage
        .data
        .read_entry(idx.archive_number, idx.archive_offset, idx.size)
        .map_err(|e| format!("fdid {fdid}: read {e}"))?;

    let data = decode_blte_with_keys(blte, Some(&storage.keystore))
        .map_err(|e| format!("fdid {fdid}: blte {e}"))?;

    if data.len() < 4
        || !(data.starts_with(b"BLP2") || data.starts_with(b"BLP1") || data.starts_with(b"BLP0"))
    {
        return Err(format!("fdid {fdid}: not BLP"));
    }
    Ok(data)
}

fn read_blp_sync(fdid: u32) -> Result<Vec<u8>, String> {
    let mut guard = state()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let storage = ensure_ready(&mut guard)?;
    read_blp_fdid(storage, fdid)
}

/// 异步按 FileDataID 从本地 CASC 取 BLP。
pub async fn read_blp_by_fdid(fdid: u32) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || read_blp_sync(fdid))
        .await
        .map_err(|e| e.to_string())?
}

/// 后台预热（首次打开约数秒）。
pub fn warm_up_async() {
    std::thread::spawn(|| {
        let mut guard = state()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let _ = ensure_ready(&mut guard);
    });
}

/// 配置变更后清缓存（例如换了 wow_root）。
pub fn reset() {
    if let Ok(mut g) = state().lock() {
        *g = None;
    } else if let Err(e) = state().lock() {
        *e.into_inner() = None;
    }
}
