import { useEffect, useState, type FormEvent } from "react";
import {
  FOREVER_RULESETS,
  coerceForeverRegionKey,
  foreverRulesetLabel,
} from "@wga/ui";
import { api } from "../api";
import { useAuth } from "../auth";

type Member = {
  id: string;
  username: string;
  display_name?: string;
  role: string;
  joined_at: string;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  author?: string;
  created_at: string;
};

type JoinApp = {
  id: string;
  username: string;
  display_name?: string;
  message?: string;
  created_at: string;
};

function verifyBadge(status?: string) {
  if (status === "verified") return "已认证";
  if (status === "rejected") return "已拒绝";
  return "待认证";
}

export default function GuildPage() {
  const auth = useAuth();
  const [msg, setMsg] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [joinApps, setJoinApps] = useState<JoinApp[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");

  const [flavor, setFlavor] = useState("forever");
  const [regionKey, setRegionKey] = useState("UNKNOWN");
  const [realmName, setRealmName] = useState("");
  const [guildName, setGuildName] = useState("");
  const [isLeader, setIsLeader] = useState(false);
  const [lookup, setLookup] = useState<{
    status: string;
    id?: string;
    name?: string;
    verification_status?: string;
    is_member?: boolean;
    is_owner?: boolean;
  } | null>(null);

  const current = auth.guilds.find((g) => g.id === auth.guildId);
  const isOwner = current?.role === "owner";
  const canPost =
    current?.role === "owner" || current?.role === "officer";
  const canReviewJoin = canPost;

  async function refresh() {
    const me = await api.me(auth.token);
    auth.setGuilds(me.guilds || []);
    auth.setIsAdmin(!!me.user?.is_admin);
    const gid = auth.guildId || me.guilds?.[0]?.id;
    if (gid) {
      if (!auth.guildId) auth.setGuildId(gid);
      const [m, a] = await Promise.all([
        api.members(auth.token, gid),
        api.announcements(auth.token, gid),
      ]);
      setMembers(m.members || []);
      setAnnouncements(a.announcements || []);
      const role = (me.guilds || []).find((g) => g.id === gid)?.role;
      if (role === "owner" || role === "officer") {
        try {
          const apps = await api.listJoinApplications(auth.token, gid);
          setJoinApps(apps.applications || []);
        } catch {
          setJoinApps([]);
        }
      } else {
        setJoinApps([]);
      }
    } else {
      setMembers([]);
      setAnnouncements([]);
      setJoinApps([]);
    }
  }

  useEffect(() => {
    refresh().catch((e) => setMsg(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.guildId]);

  async function doLookup(e: FormEvent) {
    e.preventDefault();
    const fl = flavor.trim() || "forever";
    const region =
      fl === "forever"
        ? coerceForeverRegionKey(regionKey)
        : regionKey.trim() || "UNKNOWN";
    if (fl === "forever" && region === "UNKNOWN") {
      setMsg("请选择无限服规则集（普通 / PvP / 角色扮演…）");
      return;
    }
    try {
      const r = await api.lookupGuild(auth.token, {
        flavor: fl,
        region_key: region,
        realm_name: realmName.trim(),
        guild_name: guildName.trim(),
      });
      setLookup(r);
      if (r.status === "not_found") {
        setMsg(`未找到「${guildName}」，可创建公会（待认证）`);
      } else if (r.is_member) {
        setMsg(`已在公会「${r.name}」`);
        if (r.id) auth.setGuildId(r.id);
        await refresh();
      } else if (isLeader && !r.is_owner) {
        setMsg(`公会已存在。你勾选了游戏会长，可申请认领`);
      } else {
        setMsg(`公会「${r.name}」已存在，可申请加入`);
      }
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
                {g.name} · {g.role} · {verifyBadge(g.verification_status)}
                {g.realm_name
                  ? ` · ${g.flavor}/${
                      g.flavor === "forever"
                        ? foreverRulesetLabel(g.region_key)
                        : g.region_key
                    }/${g.realm_name}`
                  : ""}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>按游戏公会查询</h2>
        <p className="muted">
          填写与游戏一致的服务器层级与公会名（桌面端可从插件快照自动读取）。无限服二级为官方规则集：普通、PvP、角色扮演、角色扮演
          PvP、专家模式。
        </p>
        <form className="stack-form" onSubmit={doLookup}>
          <label>
            客户端
            <select
              value={flavor}
              onChange={(e) => {
                const next = e.target.value;
                setFlavor(next);
                if (next === "forever") {
                  setRegionKey(coerceForeverRegionKey(regionKey));
                }
              }}
            >
              <option value="forever">无限服</option>
              <option value="retail">正式服</option>
              <option value="classic">怀旧服</option>
            </select>
          </label>
          <label>
            {flavor === "forever" ? "规则集" : "大区 / 类型"}
            {flavor === "forever" ? (
              <select
                value={coerceForeverRegionKey(regionKey)}
                onChange={(e) => setRegionKey(e.target.value)}
                required
              >
                {FOREVER_RULESETS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                    {r.value !== "UNKNOWN" ? ` (${r.value})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={regionKey}
                onChange={(e) => setRegionKey(e.target.value)}
                placeholder="一区 / 二区 …"
                required
              />
            )}
          </label>
          <label>
            服务器名
            <input
              value={realmName}
              onChange={(e) => setRealmName(e.target.value)}
              required
            />
          </label>
          <label>
            公会名
            <input
              value={guildName}
              onChange={(e) => setGuildName(e.target.value)}
              required
            />
          </label>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={isLeader}
              onChange={(e) => setIsLeader(e.target.checked)}
            />
            我是游戏内会长
          </label>
          <button type="submit">查询</button>
        </form>
        {lookup && (
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {lookup.status === "not_found" && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const fl = flavor.trim() || "forever";
                    const region =
                      fl === "forever"
                        ? coerceForeverRegionKey(regionKey)
                        : regionKey.trim() || "UNKNOWN";
                    if (fl === "forever" && region === "UNKNOWN") {
                      setMsg("创建前请选择规则集");
                      return;
                    }
                    const g = await api.createGuild(auth.token, {
                      name: guildName.trim(),
                      flavor: fl,
                      region_key: region,
                      realm_name: realmName.trim(),
                    });
                    auth.setGuildId(g.id);
                    setMsg(`已创建「${g.name}」，${verifyBadge(g.verification_status)}`);
                    setLookup(null);
                    await refresh();
                  } catch (ex) {
                    setMsg(ex instanceof Error ? ex.message : String(ex));
                  }
                }}
              >
                创建公会
              </button>
            )}
            {lookup.status === "found" && !lookup.is_member && !isLeader && (
              <button
                type="button"
                onClick={async () => {
                  if (!lookup.id) return;
                  try {
                    await api.applyJoin(auth.token, lookup.id);
                    setMsg("已提交入会申请，等待会长审核");
                  } catch (ex) {
                    setMsg(ex instanceof Error ? ex.message : String(ex));
                  }
                }}
              >
                申请加入
              </button>
            )}
            {lookup.status === "found" &&
              !lookup.is_owner &&
              isLeader && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!lookup.id) return;
                    try {
                      await api.applyClaim(auth.token, lookup.id, {
                        is_leader: true,
                        realm_name: realmName.trim(),
                      });
                      setMsg("已提交认领申请，等待管理员审核");
                    } catch (ex) {
                      setMsg(ex instanceof Error ? ex.message : String(ex));
                    }
                  }}
                >
                  申请认领
                </button>
              )}
          </div>
        )}
      </section>

      {canReviewJoin && joinApps.length > 0 && (
        <section className="card">
          <h2>入会申请</h2>
          <ul className="list">
            {joinApps.map((a) => (
              <li key={a.id} className="act-row">
                <span style={{ flex: 1 }}>
                  {a.display_name || a.username}
                  {a.message ? ` · ${a.message}` : ""}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.decideJoinApplication(
                        auth.token,
                        auth.guildId,
                        a.id,
                        "approve"
                      );
                      setMsg("已通过");
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
                      await api.decideJoinApplication(
                        auth.token,
                        auth.guildId,
                        a.id,
                        "reject"
                      );
                      setMsg("已拒绝");
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
      )}

      {auth.guildId && (
        <section className="card">
          <h2>公告</h2>
          {canPost && (
            <form
              className="stack-form"
              style={{ maxWidth: "100%", marginBottom: 12 }}
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api.createAnnouncement(auth.token, auth.guildId, {
                    title: annTitle.trim(),
                    body: annBody.trim(),
                  });
                  setAnnTitle("");
                  setAnnBody("");
                  setMsg("公告已发布");
                  await refresh();
                } catch (ex) {
                  setMsg(ex instanceof Error ? ex.message : String(ex));
                }
              }}
            >
              <label>
                标题
                <input
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  required
                />
              </label>
              <label>
                正文
                <textarea
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  required
                />
              </label>
              <button type="submit">发布公告</button>
            </form>
          )}
          {announcements.length === 0 && (
            <p className="muted">暂无公告</p>
          )}
          <div>
            {announcements.map((a) => (
              <article key={a.id} className="announce-item">
                <h3>{a.title}</h3>
                <p className="muted" style={{ marginBottom: 6 }}>
                  {a.author || "未知"} ·{" "}
                  {new Date(a.created_at).toLocaleString()}
                </p>
                <p>{a.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

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

      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
