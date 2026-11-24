use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn spawn_watcher(app: AppHandle, wow_root: String) {
    std::thread::spawn(move || {
        let account = PathBuf::from(&wow_root).join("WTF").join("Account");
        if !account.exists() {
            let _ = app.emit(
                "wga-log",
                serde_json::json!({
                    "level": "warn",
                    "message": format!("未找到账号目录: {}", account.display())
                }),
            );
            return;
        }

        let (tx, rx) = mpsc::channel();
        let mut debouncer = match new_debouncer(Duration::from_millis(800), tx) {
            Ok(d) => d,
            Err(e) => {
                let _ = app.emit(
                    "wga-log",
                    serde_json::json!({
                        "level": "error",
                        "message": format!("watcher error: {e}")
                    }),
                );
                return;
            }
        };

        if let Err(e) = debouncer.watcher().watch(&account, RecursiveMode::Recursive) {
            let _ = app.emit(
                "wga-log",
                serde_json::json!({
                    "level": "error",
                    "message": format!("watch failed: {e}")
                }),
            );
            return;
        }

        let _ = app.emit(
            "wga-log",
            serde_json::json!({
                "level": "info",
                "message": format!("正在监听: {}/**/SavedVariables/WGA.lua", account.display())
            }),
        );

        while let Ok(events) = rx.recv() {
            let Ok(events) = events else { continue };
            for ev in events {
                if ev.kind != DebouncedEventKind::Any {
                    continue;
                }
                let name = ev
                    .path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                if name != "WGA.lua" {
                    continue;
                }
                let _ = app.emit(
                    "wga-sv-changed",
                    serde_json::json!({ "path": ev.path.display().to_string() }),
                );
            }
        }

        // keep debouncer alive for the channel loop lifetime
        drop(debouncer);
    });
}
