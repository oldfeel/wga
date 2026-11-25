import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function LoginPage() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (auth.token) return <Navigate to="/characters" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const data = await api.login(username.trim(), password);
      auth.setSession(data.token, data.user.username);
      const me = await api.me(data.token);
      auth.setGuilds(me.guilds || []);
      if (me.guilds?.[0] && !auth.guildId) auth.setGuildId(me.guilds[0].id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>登录</h1>
        <p className="muted">自托管公会助手</p>
        <label>
          用户名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            minLength={6}
          />
        </label>
        {err && <p className="error">{err}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>
            登录
          </button>
          <Link to="/register" className="muted">
            去注册
          </Link>
        </div>
      </form>
    </div>
  );
}
