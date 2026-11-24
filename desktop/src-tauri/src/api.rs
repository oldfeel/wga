use crate::config::AppConfig;
use reqwest::Client;
use serde_json::Value;

#[derive(Clone)]
pub struct Api {
    client: Client,
}

impl Api {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    async fn request(
        &self,
        cfg: &AppConfig,
        method: reqwest::Method,
        path: &str,
        body: Option<&Value>,
        auth: bool,
    ) -> Result<Value, String> {
        let url = format!(
            "{}{}",
            cfg.api_base_url.trim_end_matches('/'),
            path
        );
        let mut req = self.client.request(method, &url);
        if auth {
            if cfg.token.is_empty() {
                return Err("not logged in".into());
            }
            req = req.bearer_auth(&cfg.token);
        }
        if let Some(b) = body {
            req = req.json(b);
        }
        let res = req.send().await.map_err(|e| e.to_string())?;
        let status = res.status();
        let text = res.text().await.map_err(|e| e.to_string())?;
        let data: Value = if text.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text).unwrap_or(serde_json::json!({ "raw": text }))
        };
        if !status.is_success() {
            let msg = data
                .pointer("/error/message")
                .and_then(|v| v.as_str())
                .unwrap_or(status.as_str());
            return Err(msg.to_string());
        }
        Ok(data)
    }

    pub async fn login(&self, cfg: &AppConfig, username: &str, password: &str) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::POST,
            "/auth/login",
            Some(&serde_json::json!({ "username": username, "password": password })),
            false,
        )
        .await
    }

    pub async fn register(
        &self,
        cfg: &AppConfig,
        username: &str,
        password: &str,
        display_name: &str,
    ) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::POST,
            "/auth/register",
            Some(&serde_json::json!({
                "username": username,
                "password": password,
                "display_name": display_name
            })),
            false,
        )
        .await
    }

    pub async fn me(&self, cfg: &AppConfig) -> Result<Value, String> {
        self.request(cfg, reqwest::Method::GET, "/auth/me", None, true)
            .await
    }

    pub async fn create_guild(&self, cfg: &AppConfig, name: &str) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::POST,
            "/guilds",
            Some(&serde_json::json!({ "name": name })),
            true,
        )
        .await
    }

    pub async fn join_guild(&self, cfg: &AppConfig, invite_code: &str) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::POST,
            "/guilds/join",
            Some(&serde_json::json!({ "invite_code": invite_code })),
            true,
        )
        .await
    }

    pub async fn upload_snapshot(
        &self,
        cfg: &AppConfig,
        guild_id: &str,
        payload: &Value,
    ) -> Result<Value, String> {
        let path = format!("/guilds/{guild_id}/snapshots");
        self.request(cfg, reqwest::Method::POST, &path, Some(payload), true)
            .await
    }
}
