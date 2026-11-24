import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Equip = {
  slot?: string;
  name?: string;
  item_level?: number;
  item_id?: number;
};

type Lockout = {
  instance_name?: string;
  difficulty?: string;
  bosses_killed?: number;
  bosses_total?: number;
  reset_at?: string;
};

type Prof = {
  name?: string;
  skill_current?: number;
  skill_max?: number;
};

export default function CharacterDetailPage() {
  const { charId } = useParams();
  const auth = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.character>> | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string; captured_at: string; addon_version?: string }>
  >([]);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!auth.guildId || !charId) return;
    Promise.all([
      api.character(auth.token, auth.guildId, charId),
      api.characterSnapshots(auth.token, auth.guildId, charId),
    ])
      .then(([c, s]) => {
        setData(c);
        setNote(c.availability_note || "");
        setHistory(s.snapshots || []);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, [auth.token, auth.guildId, charId]);

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!auth.guildId || !charId) return;
    try {
      await api.patchCharacter(auth.token, auth.guildId, charId, {
        availability_note: note,
      });
      setMsg("可上线备注已保存");
      const c = await api.character(auth.token, auth.guildId, charId);
      setData(c);
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  if (!auth.guildId) {
    return (
      <div className="card">
        <p>
          请先选择公会。<Link to="/guild">去公会</Link>
        </p>
      </div>
    );
  }

  if (err) return <div className="card error">{err}</div>;
  if (!data) return <div className="card muted">加载中…</div>;

  const payload = data.latest_snapshot?.payload as
    | {
        equipment?: Equip[];
        lockouts?: Lockout[];
        professions?: Prof[];
        talents?: { loadout_string?: string };
      }
    | undefined;

  return (
    <div className="stack">
      <p>
        <Link to="/characters">← 角色列表</Link>
      </p>
      <section className="card hero-card">
        <div className="hero-main">
          <h1>
            {data.name}
            <span className="muted"> - {data.realm}</span>
          </h1>
          <p className="hero-meta">
            {[data.race, data.class, data.spec].filter(Boolean).join(" · ")}
            {data.level != null ? ` · Lv${data.level}` : ""}
            {data.item_level != null ? ` · ilvl ${data.item_level}` : ""}
          </p>
        </div>
      </section>

      <section className="card">
        <h2>可上线时段</h2>
        <form className="row" onSubmit={saveNote}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：工作日 20:00-23:00，周末全天"
          />
          <button type="submit">保存</button>
        </form>
        {msg && <p className="muted">{msg}</p>}
      </section>

      <section className="card">
        <h2>装备</h2>
        {!payload?.equipment?.length && <p className="muted">无装备数据</p>}
        <ul className="equip-list">
          {(payload?.equipment || []).map((e, i) => (
            <li key={i}>
              <span className="slot">{e.slot || "-"}</span>
              <span>{e.name || e.item_id || "-"}</span>
              <span className="muted">{e.item_level ?? ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>副本 CD</h2>
          {!payload?.lockouts?.length && <p className="muted">无 CD</p>}
          <ul className="list">
            {(payload?.lockouts || []).map((l, i) => (
              <li key={i} className="act-row">
                <div>
                  <strong>{l.instance_name}</strong>
                  <div className="muted">
                    {l.difficulty} · {l.bosses_killed}/{l.bosses_total}
                    {l.reset_at
                      ? ` · 重置 ${new Date(l.reset_at).toLocaleString()}`
                      : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>专业</h2>
          {!payload?.professions?.length && <p className="muted">无专业</p>}
          <ul className="list">
            {(payload?.professions || []).map((p, i) => (
              <li key={i}>
                {p.name}{" "}
                <span className="muted">
                  {p.skill_current}/{p.skill_max}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h2>快照历史</h2>
        <ul className="list">
          {history.map((s) => (
            <li key={s.id} className="muted">
              {new Date(s.captured_at).toLocaleString()}
              {s.addon_version ? ` · addon ${s.addon_version}` : ""}
            </li>
          ))}
        </ul>
        {history.length === 0 && <p className="muted">暂无历史</p>}
      </section>
    </div>
  );
}
