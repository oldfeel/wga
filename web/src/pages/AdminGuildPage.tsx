import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function AdminGuildPage() {
  const auth = useAuth();
  const [msg, setMsg] = useState("");
  const [guilds, setGuilds] = useState<
    Array<{
      id: string;
      name: string;
      flavor: string;
      region_key: string;
      realm_name: string;
      created_by?: string;
    }>
  >([]);
  const [claims, setClaims] = useState<
    Array<{
      id: string;
      guild_name: string;
      username: string;
      character_name?: string;
    }>
  >([]);

  async function refresh() {
    const me = await api.me(auth.token);
    auth.setIsAdmin(!!me.user?.is_admin);
    if (!me.user?.is_admin) return;
    const [g, c] = await Promise.all([
      api.adminListGuilds(auth.token),
      api.adminListClaims(auth.token),
    ]);
    setGuilds(g.guilds || []);
    setClaims(c.applications || []);
  }

  useEffect(() => {
    if (!auth.token) return;
    refresh().catch((e) => setMsg(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  if (!auth.token) return <Navigate to="/login" replace />;
  if (!auth.isAdmin) {
    return (
      <div className="card">
        <p className="muted">需要平台管理员权限（环境变量 ADMIN_USERNAMES）</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>待认证公会</h2>
        {guilds.length === 0 && <p className="muted">无</p>}
        <ul className="list">
          {guilds.map((g) => (
            <li key={g.id} className="act-row">
              <span style={{ flex: 1 }}>
                {g.flavor}/{g.region_key}/{g.realm_name} · {g.name}
                {g.created_by ? ` · @${g.created_by}` : ""}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.adminVerifyGuild(auth.token, g.id, "verify");
                    setMsg(`已认证 ${g.name}`);
                    await refresh();
                  } catch (ex) {
                    setMsg(ex instanceof Error ? ex.message : String(ex));
                  }
                }}
              >
                认证
              </button>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  try {
                    await api.adminVerifyGuild(auth.token, g.id, "reject");
                    setMsg(`已拒绝 ${g.name}`);
                    await refresh();
                  } catch (ex) {
                    setMsg(ex instanceof Error ? ex.message : String(ex));
                  }
                }}
              >
                拒绝
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>待审认领</h2>
        {claims.length === 0 && <p className="muted">无</p>}
        <ul className="list">
          {claims.map((a) => (
            <li key={a.id} className="act-row">
              <span style={{ flex: 1 }}>
                {a.guild_name} · @{a.username}
                {a.character_name ? ` · ${a.character_name}` : ""}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.adminDecideClaim(auth.token, a.id, "approve");
                    setMsg("认领已通过（并已认证）");
                    await refresh();
                  } catch (ex) {
                    setMsg(ex instanceof Error ? ex.message : String(ex));
                  }
                }}
              >
                通过
              </button>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  try {
                    await api.adminDecideClaim(auth.token, a.id, "reject");
                    setMsg("认领已拒绝");
                    await refresh();
                  } catch (ex) {
                    setMsg(ex instanceof Error ? ex.message : String(ex));
                  }
                }}
              >
                拒绝
              </button>
            </li>
          ))}
        </ul>
      </section>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
