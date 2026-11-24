import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type Member = {
  id: string;
  username: string;
  display_name?: string;
  role: string;
  joined_at: string;
};

export default function GuildPage() {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState("");
  const [members, setMembers] = useState<Member[]>([]);

  const current = auth.guilds.find((g) => g.id === auth.guildId);
  const isOwner = current?.role === "owner";

  async function refresh() {
    const me = await api.me(auth.token);
    auth.setGuilds(me.guilds || []);
    const gid = auth.guildId || me.guilds?.[0]?.id;
    if (gid) {
      if (!auth.guildId) auth.setGuildId(gid);
      const m = await api.members(auth.token, gid);
      setMembers(m.members || []);
    } else {
      setMembers([]);
    }
  }

  useEffect(() => {
    refresh().catch((e) => setMsg(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.guildId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const g = await api.createGuild(auth.token, name.trim());
      setMsg(`已创建，邀请码 ${g.invite_code}`);
      auth.setGuildId(g.id);
      await refresh();
      setName("");
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    try {
      const g = await api.joinGuild(auth.token, invite.trim());
      setMsg(`已加入 ${g.name}`);
      auth.setGuildId(g.id);
      await refresh();
      setInvite("");
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>我的公会</h2>
        {auth.guilds.length === 0 && <p className="muted">尚未加入公会</p>}
        <ul className="list">
          {auth.guilds.map((g) => (
            <li key={g.id} className="act-row">
              <button
                type="button"
                className={g.id === auth.guildId ? "active block" : "block"}
                onClick={() => auth.setGuildId(g.id)}
                style={{ flex: 1 }}
              >
                {g.name} · {g.role} · 邀请码 {g.invite_code}
              </button>
              {g.role === "owner" && g.id === auth.guildId && (
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    try {
                      const r = await api.rotateInvite(auth.token, g.id);
                      setMsg(`新邀请码：${r.invite_code}`);
                      await refresh();
                    } catch (ex) {
                      setMsg(ex instanceof Error ? ex.message : String(ex));
                    }
                  }}
                >
                  重置邀请码
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {auth.guildId && (
        <section className="card">
          <h2>成员</h2>
          <table className="table">
            <thead>
              <tr>
                <th>用户</th>
                <th>角色</th>
                <th>加入时间</th>
                {isOwner && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.display_name || m.username}
                    <span className="muted"> @{m.username}</span>
                  </td>
                  <td>{m.role}</td>
                  <td className="muted">
                    {new Date(m.joined_at).toLocaleString()}
                  </td>
                  {isOwner && (
                    <td>
                      <select
                        value={m.role}
                        onChange={async (e) => {
                          const role = e.target.value;
                          try {
                            await api.patchMember(
                              auth.token,
                              auth.guildId,
                              m.id,
                              role
                            );
                            setMsg(`${m.username} → ${role}`);
                            await refresh();
                          } catch (ex) {
                            setMsg(
                              ex instanceof Error ? ex.message : String(ex)
                            );
                            await refresh();
                          }
                        }}
                      >
                        <option value="member">member</option>
                        <option value="officer">officer</option>
                        <option value="owner">owner</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 0 && <p className="muted">暂无成员数据</p>}
        </section>
      )}

      <section className="card">
        <h2>创建公会</h2>
        <form className="row" onSubmit={create}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="公会名"
            required
          />
          <button type="submit">创建</button>
        </form>
      </section>
      <section className="card">
        <h2>加入公会</h2>
        <form className="row" onSubmit={join}>
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="邀请码"
            required
          />
          <button type="submit">加入</button>
        </form>
      </section>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
