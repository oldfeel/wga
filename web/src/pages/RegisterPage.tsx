import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function RegisterPage() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadCaptcha() {
    try {
      const c = await api.captcha();
      setCaptchaId(c.captcha_id);
      setCaptchaImg(c.image);
      setCaptchaCode("");
    } catch (ex) {
      setCaptchaImg("");
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  useEffect(() => {
    loadCaptcha();
  }, []);

  if (auth.token) return <Navigate to="/characters" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const data = await api.register(
        username.trim(),
        password,
        username.trim(),
        captchaId,
        captchaCode.trim()
      );
      auth.setSession(data.token, data.user.username, data.user.is_admin);
      const me = await api.me(data.token);
      auth.setGuilds(me.guilds || []);
      auth.setIsAdmin(!!me.user?.is_admin);
      if (me.guilds?.[0]) auth.setGuildId(me.guilds[0].id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
      await loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>注册</h1>
        <p className="muted">创建 WGA 账号</p>
        <label>
          用户名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>
        <label>
          验证码
          <div className="row" style={{ alignItems: "center", marginTop: 4 }}>
            {captchaImg ? (
              <img
                src={captchaImg}
                alt="验证码"
                width={140}
                height={48}
                style={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
                title="点击刷新"
                onClick={loadCaptcha}
              />
            ) : (
              <span className="muted">加载中…</span>
            )}
            <button
              type="button"
              className="secondary"
              onClick={loadCaptcha}
              disabled={busy}
            >
              刷新
            </button>
          </div>
          <input
            value={captchaCode}
            onChange={(e) => setCaptchaCode(e.target.value)}
            placeholder="输入图中字符"
            required
            autoComplete="off"
            style={{ marginTop: 8 }}
          />
        </label>
        {err && <p className="error">{err}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>
            注册
          </button>
          <Link to="/login" className="muted">
            去登录
          </Link>
        </div>
      </form>
    </div>
  );
}
