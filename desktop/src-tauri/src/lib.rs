mod api;
mod casc_local;
mod config;
mod icon_resolve;
mod parse_sv;
mod watch;

use api::Api;
use config::AppConfig;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_dialog::{DialogExt, FilePath};

struct AppState {
    cfg: Mutex<AppConfig>,
    api: Api,
    last_hash: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct PublicConfig {
    api_base_url: String,
    wow_root: String,
    auto_upload: bool,
    username: String,
    guild_id: String,
    guild_name: String,
    has_token: bool,
}

fn public_cfg(c: &AppConfig) -> PublicConfig {
    PublicConfig {
        api_base_url: c.api_base_url.clone(),
        wow_root: c.wow_root.clone(),
        auto_upload: c.auto_upload,
        username: c.username.clone(),
        guild_id: c.guild_id.clone(),
        guild_name: c.guild_name.clone(),
        has_token: !c.token.is_empty(),
    }
}

fn emit_log(app: &AppHandle, level: &str, message: impl Into<String>) {
    let _ = app.emit(
        "wga-log",
        serde_json::json!({ "level": level, "message": message.into() }),
    );
}

async fn do_upload(app: &AppHandle, state: &AppState, path: PathBuf, manual: bool) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    if cfg.token.is_empty() || cfg.guild_id.is_empty() {
        return Err("请先登录并选择公会".into());
    }
    let parsed = parse_sv::read_snapshot_from_lua(&path)?;
    {
        let mut last = state.last_hash.lock().map_err(|e| e.to_string())?;
        if !manual && last.as_deref() == Some(parsed.hash.as_str()) {
            emit_log(app, "info", "与上次上传内容相同，跳过");
            return Ok(serde_json::json!({ "skipped": true }));
        }
        *last = Some(parsed.hash.clone());
    }
    let res = state
        .api
        .upload_snapshot(&cfg, &cfg.guild_id, &parsed.payload)
        .await?;
    let name = parsed
        .payload
        .pointer("/character/name")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let realm = parsed
        .payload
        .pointer("/character/realm")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let sid = res.get("snapshot_id").and_then(|v| v.as_str()).unwrap_or("?");
    emit_log(app, "ok", format!("已上传 {name}-{realm} → snapshot {sid}"));
    Ok(res)
}

#[tauri::command]
fn get_config(state: State<'_, AppState>) -> Result<PublicConfig, String> {
    let c = state.cfg.lock().map_err(|e| e.to_string())?;
    Ok(public_cfg(&c))
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    api_base_url: Option<String>,
    wow_root: Option<String>,
    auto_upload: Option<bool>,
) -> Result<PublicConfig, String> {
    let mut c = state.cfg.lock().map_err(|e| e.to_string())?;
    if let Some(v) = api_base_url {
        c.api_base_url = v;
    }
    let mut root_changed = false;
    if let Some(v) = wow_root {
        if v != c.wow_root {
            root_changed = true;
            c.wow_root = v;
        }
    }
    if let Some(v) = auto_upload {
        c.auto_upload = v;
    }
    config::save(&c)?;
    let pubc = public_cfg(&c);
    let root = c.wow_root.clone();
    drop(c);
    if root_changed {
        casc_local::reset();
        watch::spawn_watcher(app.clone(), root);
    }
    emit_log(&app, "info", "设置已保存");
    Ok(pubc)
}

#[tauri::command]
async fn login(
    app: AppHandle,
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let data = state.api.login(&cfg, &username, &password).await?;
    let token = data
        .pointer("/token")
        .and_then(|v| v.as_str())
        .ok_or("no token")?
        .to_string();
    let uname = data
        .pointer("/user/username")
        .and_then(|v| v.as_str())
        .unwrap_or(&username)
        .to_string();
    {
        let mut c = state.cfg.lock().map_err(|e| e.to_string())?;
        c.token = token;
        c.username = uname.clone();
        config::save(&c)?;
    }
    emit_log(&app, "ok", format!("已登录 {uname}"));
    Ok(data)
}

#[tauri::command]
async fn get_captcha(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    state.api.captcha(&cfg).await
}

#[tauri::command]
async fn register(
    app: AppHandle,
    state: State<'_, AppState>,
    username: String,
    password: String,
    display_name: String,
    captcha_id: String,
    captcha_code: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let data = state
        .api
        .register(
            &cfg,
            &username,
            &password,
            &display_name,
            &captcha_id,
            &captcha_code,
        )
        .await?;
    let token = data
        .pointer("/token")
        .and_then(|v| v.as_str())
        .ok_or("no token")?
        .to_string();
    {
        let mut c = state.cfg.lock().map_err(|e| e.to_string())?;
        c.token = token;
        c.username = username.clone();
        config::save(&c)?;
    }
    emit_log(&app, "ok", format!("已注册并登录 {username}"));
    Ok(data)
}

#[tauri::command]
async fn me(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    state.api.me(&cfg).await
}

#[tauri::command]
async fn lookup_guild(
    state: State<'_, AppState>,
    flavor: String,
    region_key: String,
    realm_name: String,
    guild_name: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    state
        .api
        .lookup_guild(&cfg, &flavor, &region_key, &realm_name, &guild_name)
        .await
}

#[tauri::command]
async fn create_guild(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    flavor: String,
    region_key: String,
    realm_name: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let g = state
        .api
        .create_guild(&cfg, &name, &flavor, &region_key, &realm_name)
        .await?;
    let id = g.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let gname = g
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&name)
        .to_string();
    {
        let mut c = state.cfg.lock().map_err(|e| e.to_string())?;
        c.guild_id = id;
        c.guild_name = gname.clone();
        config::save(&c)?;
    }
    emit_log(&app, "ok", format!("已创建公会 {gname}（待认证）"));
    Ok(g)
}

#[tauri::command]
async fn apply_join_guild(
    app: AppHandle,
    state: State<'_, AppState>,
    guild_id: String,
    message: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let g = state.api.apply_join_guild(&cfg, &guild_id, &message).await?;
    emit_log(&app, "ok", "已提交入会申请，等待会长审核");
    Ok(g)
}

#[tauri::command]
async fn apply_claim_guild(
    app: AppHandle,
    state: State<'_, AppState>,
    guild_id: String,
    character_name: String,
    realm_name: String,
    is_leader: bool,
    message: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let g = state
        .api
        .apply_claim_guild(
            &cfg,
            &guild_id,
            &character_name,
            &realm_name,
            is_leader,
            &message,
        )
        .await?;
    emit_log(&app, "ok", "已提交认领申请，等待管理员审核");
    Ok(g)
}

#[tauri::command]
async fn list_join_applications(
    state: State<'_, AppState>,
    guild_id: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    state.api.list_join_applications(&cfg, &guild_id).await
}

#[tauri::command]
async fn decide_join_application(
    app: AppHandle,
    state: State<'_, AppState>,
    guild_id: String,
    app_id: String,
    decision: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let g = state
        .api
        .decide_join_application(&cfg, &guild_id, &app_id, &decision)
        .await?;
    emit_log(&app, "ok", format!("入会申请已{decision}"));
    Ok(g)
}

#[tauri::command]
async fn admin_list_guilds(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    state.api.admin_list_guilds(&cfg).await
}

#[tauri::command]
async fn admin_verify_guild(
    app: AppHandle,
    state: State<'_, AppState>,
    guild_id: String,
    decision: String,
    region_key: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let g = state
        .api
        .admin_verify_guild(&cfg, &guild_id, &decision, &region_key)
        .await?;
    emit_log(&app, "ok", format!("公会认证 {decision}"));
    Ok(g)
}

#[tauri::command]
async fn admin_list_claims(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    state.api.admin_list_claims(&cfg).await
}

#[tauri::command]
async fn admin_decide_claim(
    app: AppHandle,
    state: State<'_, AppState>,
    app_id: String,
    decision: String,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock().map_err(|e| e.to_string())?.clone();
    let g = state
        .api
        .admin_decide_claim(&cfg, &app_id, &decision)
        .await?;
    emit_log(&app, "ok", format!("认领申请已{decision}"));
    Ok(g)
}

#[tauri::command]
fn select_guild(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), String> {
    let mut c = state.cfg.lock().map_err(|e| e.to_string())?;
    c.guild_id = id;
    c.guild_name = name.clone();
    config::save(&c)?;
    emit_log(&app, "info", format!("当前公会 → {name}"));
    Ok(())
}

#[tauri::command]
fn logout(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut c = state.cfg.lock().map_err(|e| e.to_string())?;
    c.token.clear();
    c.username.clear();
    c.guild_id.clear();
    c.guild_name.clear();
    config::save(&c)?;
    emit_log(&app, "info", "已退出登录");
    Ok(())
}

fn latest_wga_lua(wow_root: &str) -> Result<PathBuf, String> {
    let mut files = config::list_wga_lua_files(wow_root);
    if files.is_empty() {
        return Err("未找到 WGA.lua，请先游戏内快照并 /reload 或小退".into());
    }
    files.sort_by_key(|p| {
        std::fs::metadata(p)
            .and_then(|m| m.modified())
            .ok()
    });
    Ok(files.pop().unwrap())
}

#[tauri::command]
fn get_local_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let wow_root = state.cfg.lock().map_err(|e| e.to_string())?.wow_root.clone();
    eprintln!("[snap] get_local_snapshot wow_root={wow_root}");
    let path = latest_wga_lua(&wow_root).map_err(|e| {
        eprintln!("[snap] latest lua err: {e}");
        e
    })?;
    let parsed = parse_sv::read_snapshot_from_lua(&path).map_err(|e| {
        eprintln!("[snap] parse err: {e}");
        e
    })?;
    let equip_n = parsed
        .payload
        .get("equipment")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let with_fid = parsed
        .payload
        .get("equipment")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter(|e| e.get("icon_file_id").and_then(|x| x.as_u64()).unwrap_or(0) > 0)
                .count()
        })
        .unwrap_or(0);
    // tip HTML 体积大：IPC 约 94KB 时前端易卡住空白；列表只保留展示字段，tip 后续按需再取
    let mut payload = parsed.payload;
    slim_talent_payload(&mut payload);
    slim_equip_tooltips(&mut payload);
    let body = serde_json::json!({
        "path": path.display().to_string(),
        "hash": parsed.hash,
        "payload": payload,
    });
    let bytes = body.to_string().len();
    eprintln!(
        "[snap] ok path={} equip={} with_file_id={} hash={} bytes={}",
        path.display(),
        equip_n,
        with_fid,
        parsed.hash,
        bytes
    );
    let char_name = body
        .pointer("/payload/character/name")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let set_n = body
        .pointer("/payload/equipment_sets")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    emit_log(
        &app,
        "info",
        &format!(
            "Rust 快照就绪 char={char_name} equip={equip_n} sets={set_n} fileId={with_fid} bytes={bytes}"
        ),
    );
    Ok(body)
}

fn slim_talent_nodes(nodes: Option<&mut Vec<serde_json::Value>>) {
    let Some(nodes) = nodes else { return };
    for n in nodes.iter_mut() {
        if let Some(obj) = n.as_object_mut() {
            obj.remove("tooltip_lines");
            obj.remove("description");
        }
    }
}

fn slim_talent_payload(payload: &mut serde_json::Value) {
    let Some(groups) = payload
        .pointer_mut("/talents/groups")
        .and_then(|v| v.as_array_mut())
    else {
        return;
    };
    for g in groups {
        slim_talent_nodes(g.get_mut("nodes").and_then(|v| v.as_array_mut()));
        if let Some(tabs) = g.get_mut("tabs").and_then(|v| v.as_array_mut()) {
            for tab in tabs {
                slim_talent_nodes(tab.get_mut("nodes").and_then(|v| v.as_array_mut()));
                if let Some(trees) = tab.get_mut("trees").and_then(|v| v.as_array_mut()) {
                    for tree in trees {
                        slim_talent_nodes(tree.get_mut("nodes").and_then(|v| v.as_array_mut()));
                    }
                }
            }
        }
        if let Some(trees) = g.get_mut("trees").and_then(|v| v.as_array_mut()) {
            for tree in trees {
                slim_talent_nodes(tree.get_mut("nodes").and_then(|v| v.as_array_mut()));
            }
        }
    }
}

fn strip_item_tooltips(items: Option<&mut Vec<serde_json::Value>>) {
    let Some(items) = items else { return };
    for it in items.iter_mut() {
        if let Some(obj) = it.as_object_mut() {
            obj.remove("tooltip_lines");
        }
    }
}

fn slim_equip_tooltips(payload: &mut serde_json::Value) {
    strip_item_tooltips(
        payload
            .get_mut("equipment")
            .and_then(|v| v.as_array_mut()),
    );
    if let Some(sets) = payload
        .get_mut("equipment_sets")
        .and_then(|v| v.as_array_mut())
    {
        for set in sets {
            strip_item_tooltips(set.get_mut("items").and_then(|v| v.as_array_mut()));
            strip_item_tooltips(set.get_mut("equipment").and_then(|v| v.as_array_mut()));
        }
    }
}

/// 用物品 ID 向 Wowhead 解析图标文件名（桌面端绕过 CORS；无限新增物品可能没有）
#[tauri::command]
async fn resolve_item_icon(item_id: i64) -> Result<Option<String>, String> {
    if item_id <= 0 {
        return Ok(None);
    }
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) WGA-Sync/0.1")
        .timeout(std::time::Duration::from_millis(1800))
        .connect_timeout(std::time::Duration::from_millis(800))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("https://nether.wowhead.com/tooltip/item/{item_id}");
    let resp = match client.get(&url).header("Accept", "application/json").send().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if !resp.status().is_success() {
        return Ok(None);
    }
    let v: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(_) => return Ok(None),
    };
    if let Some(icon) = v.get("icon").and_then(|x| x.as_str()) {
        let name = icon.to_ascii_lowercase();
        if !name.is_empty() && !name.chars().all(|c| c.is_ascii_digit()) {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

/// 本地 CASC：fileId → BLP → PNG
#[tauri::command]
async fn resolve_equip_icon(
    app: AppHandle,
    icon: Option<String>,
    icon_file_id: Option<u32>,
    item_id: Option<i64>,
) -> Result<Option<icon_resolve::IconSrc>, String> {
    eprintln!("[icon] cmd begin file_id={icon_file_id:?}");
    match icon_resolve::resolve_equip_icon(icon, icon_file_id, item_id).await {
        Ok(src) => {
            emit_log(
                &app,
                "info",
                format!(
                    "图标 {fid} ← {src} ({ms}ms)",
                    fid = icon_file_id.unwrap_or(0),
                    src = src.source,
                    ms = src.ms
                ),
            );
            Ok(Some(src))
        }
        Err(e) => {
            eprintln!("[icon] cmd err file_id={icon_file_id:?}: {e}");
            emit_log(&app, "warn", format!("图标 fileId={icon_file_id:?}: {e}"));
            Ok(None)
        }
    }
}

#[tauri::command]
async fn upload_now(app: AppHandle, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let wow_root = state.cfg.lock().map_err(|e| e.to_string())?.wow_root.clone();
    let path = match latest_wga_lua(&wow_root) {
        Ok(p) => p,
        Err(e) => {
            emit_log(&app, "warn", &e);
            return Err(e);
        }
    };
    do_upload(&app, &state, path, true).await
}

#[tauri::command]
async fn upload_path(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    let auto = state.cfg.lock().map_err(|e| e.to_string())?.auto_upload;
    if !auto {
        emit_log(&app, "info", "自动上传已关闭，跳过");
        return Ok(serde_json::json!({ "skipped": true }));
    }
    do_upload(&app, &state, PathBuf::from(path), false).await
}

#[tauri::command]
async fn pick_wow_root(app: AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .set_title("选择无限服根目录（含 Wow.exe 的 _forever_）")
        .blocking_pick_folder();
    let Some(FilePath::Path(path)) = folder else {
        return Ok(None);
    };
    let s = path.display().to_string();
    {
        let mut c = state.cfg.lock().map_err(|e| e.to_string())?;
        c.wow_root = s.clone();
        config::save(&c)?;
    }
    casc_local::reset();
    watch::spawn_watcher(app.clone(), s.clone());
    Ok(Some(s))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = config::load();
    let wow_root = cfg.wow_root.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            cfg: Mutex::new(cfg),
            api: Api::new(),
            last_hash: Mutex::new(None),
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let window_icon = Image::from_bytes(include_bytes!("../icons/128x128.png"))
                .expect("window icon");
            let tray_icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("tray icon");
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_size(tauri::Size::Logical(tauri::LogicalSize::new(1180.0, 860.0)));
                let _ = w.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
                    980.0, 640.0,
                ))));
                let _ = w.set_icon(window_icon);
            }
            casc_local::warm_up_async();
            watch::spawn_watcher(handle.clone(), wow_root);
            let show_i = MenuItem::with_id(app, "show", "打开窗口", true, None::<&str>)?;
            let upload_i = MenuItem::with_id(app, "upload", "立即上传", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &upload_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .tooltip("WGA Sync")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "upload" => {
                        let app2 = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app2.state::<AppState>();
                            let _ = upload_now(app2.clone(), state).await;
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_settings,
            login,
            get_captcha,
            register,
            me,
            lookup_guild,
            create_guild,
            apply_join_guild,
            apply_claim_guild,
            list_join_applications,
            decide_join_application,
            admin_list_guilds,
            admin_verify_guild,
            admin_list_claims,
            admin_decide_claim,
            select_guild,
            logout,
            get_local_snapshot,
            resolve_item_icon,
            resolve_equip_icon,
            upload_now,
            upload_path,
            pick_wow_root
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
