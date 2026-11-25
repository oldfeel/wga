import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import ArmoryEquip from "../components/ArmoryEquip";
import type { EquipItem } from "../lib/armory";

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

type Quest = {
  quest_id?: number;
  title?: string;
  level?: number;
  is_complete?: boolean;
  objectives?: Array<{
    text?: string;
    finished?: boolean;
    num_fulfilled?: number;
    num_required?: number;
  }>;
};

export default function CharacterDetailPage() {
  const { charId } = useParams();
  const auth = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.character>> | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!auth.guildId || !charId) return;
    api
      .character(auth.token, auth.guildId, charId)
      .then((c) => {
        setData(c);
        setNote(c.availability_note || "");
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
        equipment?: EquipItem[];
        lockouts?: Lockout[];
        professions?: Prof[];
        quests?: Quest[];
        talents?: { loadout_string?: string };
      }
    | undefined;

  return (
    <div className="stack">
      <p>
        <Link to="/characters">← 角色列表</Link>
      </p>
      <section className="card">
        <h2>角色装备</h2>
        <ArmoryEquip
          equipment={payload?.equipment || []}
          character={{
            name: data.name,
            realm: data.realm,
            race: data.race,
            class: data.class,
            spec: data.spec,
            level: data.level,
            item_level: data.item_level,
          }}
        />
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
        <h2>当前任务</h2>
        {!payload?.quests?.length && (
          <p className="muted">无任务数据（需插件 0.1.1+ 重新快照）</p>
        )}
        <ul className="list">
          {(payload?.quests || []).map((q, i) => (
            <li key={q.quest_id ?? i} className="announce-item">
              <h3>
                {q.title || `任务 ${q.quest_id ?? "?"}`}
                {q.is_complete ? (
                  <span className="muted"> · 已完成</span>
                ) : null}
              </h3>
              <p className="muted" style={{ marginBottom: 4 }}>
                {q.level != null ? `Lv${q.level}` : ""}
                {q.quest_id != null ? ` · #${q.quest_id}` : ""}
              </p>
              {(q.objectives || []).length > 0 && (
                <ul className="list">
                  {(q.objectives || []).map((o, j) => (
                    <li key={j} className="muted">
                      {o.finished ? "✓ " : "· "}
                      {o.text ||
                        (o.num_required != null
                          ? `${o.num_fulfilled ?? 0}/${o.num_required}`
                          : "")}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
