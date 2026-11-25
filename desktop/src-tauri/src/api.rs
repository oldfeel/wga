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

    pub async fn captcha(&self, cfg: &AppConfig) -> Result<Value, String> {
        self.request(cfg, reqwest::Method::GET, "/auth/captcha", None, false)
            .await
    }

    pub async fn register(
        &self,
        cfg: &AppConfig,
        username: &str,
        password: &str,
        display_name: &str,
        captcha_id: &str,
        captcha_code: &str,
    ) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::POST,
            "/auth/register",
            Some(&serde_json::json!({
                "username": username,
                "password": password,
                "display_name": display_name,
                "captcha_id": captcha_id,
                "captcha_code": captcha_code
            })),
            false,
        )
        .await
    }

    pub async fn me(&self, cfg: &AppConfig) -> Result<Value, String> {
        self.request(cfg, reqwest::Method::GET, "/auth/me", None, true)
            .await
    }

    pub async fn lookup_guild(
        &self,
        cfg: &AppConfig,
        flavor: &str,
        region_key: &str,
        realm_name: &str,
        guild_name: &str,
    ) -> Result<Value, String> {
        let q = format!(
            "/guilds/lookup?flavor={}&region_key={}&realm_name={}&guild_name={}",
            urlencoding_lite(flavor),
            urlencoding_lite(region_key),
            urlencoding_lite(realm_name),
            urlencoding_lite(guild_name),
        );
        self.request(cfg, reqwest::Method::GET, &q, None, true)
            .await
    }

    pub async fn create_guild(
        &self,
        cfg: &AppConfig,
        name: &str,
        flavor: &str,
        region_key: &str,
        realm_name: &str,
    ) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::POST,
            "/guilds",
            Some(&serde_json::json!({
                "name": name,
                "flavor": flavor,
                "region_key": region_key,
                "realm_name": realm_name
            })),
            true,
        )
        .await
    }

    pub async fn apply_join_guild(
        &self,
        cfg: &AppConfig,
        guild_id: &str,
        message: &str,
    ) -> Result<Value, String> {
        let path = format!("/guilds/{guild_id}/join-applications");
        self.request(
            cfg,
            reqwest::Method::POST,
            &path,
            Some(&serde_json::json!({ "message": message })),
            true,
        )
        .await
    }

    pub async fn apply_claim_guild(
        &self,
        cfg: &AppConfig,
        guild_id: &str,
        character_name: &str,
        realm_name: &str,
        is_leader: bool,
        message: &str,
    ) -> Result<Value, String> {
        let path = format!("/guilds/{guild_id}/claim-applications");
        self.request(
            cfg,
            reqwest::Method::POST,
            &path,
            Some(&serde_json::json!({
                "is_leader": is_leader,
                "character_name": character_name,
                "realm_name": realm_name,
                "message": message
            })),
            true,
        )
        .await
    }

    pub async fn list_join_applications(
        &self,
        cfg: &AppConfig,
        guild_id: &str,
    ) -> Result<Value, String> {
        let path = format!("/guilds/{guild_id}/join-applications?status=pending");
        self.request(cfg, reqwest::Method::GET, &path, None, true)
            .await
    }

    pub async fn decide_join_application(
        &self,
        cfg: &AppConfig,
        guild_id: &str,
        app_id: &str,
        decision: &str,
    ) -> Result<Value, String> {
        let path = format!("/guilds/{guild_id}/join-applications/{app_id}/decide");
        self.request(
            cfg,
            reqwest::Method::POST,
            &path,
            Some(&serde_json::json!({ "decision": decision })),
            true,
        )
        .await
    }

    pub async fn admin_list_guilds(&self, cfg: &AppConfig) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::GET,
            "/admin/guilds?status=pending",
            None,
            true,
        )
        .await
    }

    pub async fn admin_verify_guild(
        &self,
        cfg: &AppConfig,
        guild_id: &str,
        decision: &str,
        region_key: &str,
    ) -> Result<Value, String> {
        let path = format!("/admin/guilds/{guild_id}/verify");
        let mut body = serde_json::json!({ "decision": decision });
        if !region_key.is_empty() {
            body["region_key"] = Value::String(region_key.to_string());
        }
        self.request(cfg, reqwest::Method::POST, &path, Some(&body), true)
            .await
    }

    pub async fn admin_list_claims(&self, cfg: &AppConfig) -> Result<Value, String> {
        self.request(
            cfg,
            reqwest::Method::GET,
            "/admin/claim-applications?status=pending",
            None,
            true,
        )
        .await
    }

    pub async fn admin_decide_claim(
        &self,
        cfg: &AppConfig,
        app_id: &str,
        decision: &str,
    ) -> Result<Value, String> {
        let path = format!("/admin/claim-applications/{app_id}/decide");
        self.request(
            cfg,
            reqwest::Method::POST,
            &path,
            Some(&serde_json::json!({ "decision": decision })),
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

fn urlencoding_lite(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
