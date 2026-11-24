import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Signup = {
  id: string;
  user_id: string;
  character_id?: string | null;
  status: string;
  note?: string | null;
};

type RosterRow = {
  id?: string;
  character_id?: string | null;
  user_id?: string | null;
  group_name?: string | null;
  slot_role?: string | null;
  sort_order?: number;
  note?: string | null;
};

export default function ActivityDetailPage() {
  const { activityId } = useParams();
  const auth = useAuth();
  const [title, setTitle] = useState("");
  const [starts, setStarts] = useState("");
  const [status, setStatus] = useState("");
  const [signups, setSignups] = useState<Signup[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [chars, setChars] = useState<
    Array<{ id: string; name: string; realm: string }>
  >([]);
  const [pickChar, setPickChar] = useState("");
  const [signupChar, setSignupChar] = useState("");
  const [groupName, setGroupName] = useState("A");
  const [slotRole, setSlotRole] = useState("DPS");
  const [msg, setMsg] = useState("");

  async function load() {
    if (!activityId) return;
    const a = await api.getActivity(auth.token, activityId);
    setTitle(a.title);
    setStarts(a.starts_at);
    setStatus(a.status);
    setSignups((a.signups as Signup[]) || []);
    setRoster((a.roster as RosterRow[]) || []);
    if (auth.guildId) {
      const c = await api.characters(auth.token, auth.guildId);
      setChars(c.characters || []);
    }
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, auth.token, auth.guildId]);

  async function addToRoster(e: FormEvent) {
    e.preventDefault();
    if (!pickChar) return;
    const next = [
      ...roster,
      {
        character_id: pickChar,
        group_name: groupName,
        slot_role: slotRole,
        sort_order: roster.length,
      },
    ];
    try {
      await api.putRoster(auth.token, activityId!, next);
      setMsg("排表已保存");
      await load();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function clearRoster() {
    try {
      await api.putRoster(auth.token, activityId!, []);
      setMsg("排表已清空");
      await load();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  function charLabel(id?: string | null) {
    if (!id) return "-";
    const c = chars.find((x) => x.id === id);
    return c ? `${c.name}-${c.realm}` : id.slice(0, 8);
  }

  return (
    <div className="stack">
      <p>
        <Link to="/activities">← 活动列表</Link>
      </p>
      <section className="card">
        <h1>{title || "活动"}</h1>
        <p className="muted">
          {starts ? new Date(starts).toLocaleString() : ""} · {status}
        </p>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select
            value={signupChar}
            onChange={(e) => setSignupChar(e.target.value)}
          >
            <option value="">报名角色（可选）</option>
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}-{c.realm}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              api
                .signup(
                  auth.token,
                  activityId!,
                  signupChar ? { character_id: signupChar } : undefined
                )
                .then(() => load())
                .then(() => setMsg("已报名"))
                .catch((e) => setMsg(e.message))
            }
          >
            报名
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              api
                .checkIn(auth.token, activityId!)
                .then(() => setMsg("已签到"))
                .catch((e) => setMsg(e.message))
            }
          >
            签到
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              api
                .patchActivity(auth.token, activityId!, { status: "locked" })
                .then(() => load())
                .then(() => setMsg("活动已锁定"))
                .catch((e) => setMsg(e.message))
            }
          >
            锁定
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              api
                .patchActivity(auth.token, activityId!, { status: "done" })
                .then(() => load())
                .then(() => setMsg("活动已结束"))
                .catch((e) => setMsg(e.message))
            }
          >
            结束
          </button>
        </div>
      </section>

      <section className="card">
        <h2>报名</h2>
        <ul className="list">
          {signups.map((s) => (
            <li key={s.id} className="act-row">
              <span>
                用户 {s.user_id.slice(0, 8)}… · {charLabel(s.character_id)}
              </span>
              <span className="muted">{s.status}</span>
            </li>
          ))}
        </ul>
        {signups.length === 0 && <p className="muted">暂无报名</p>}
      </section>

      <section className="card">
        <h2>排表（官员+）</h2>
        <form className="row" onSubmit={addToRoster}>
          <select
            value={pickChar}
            onChange={(e) => setPickChar(e.target.value)}
            required
          >
            <option value="">选择角色</option>
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}-{c.realm}
              </option>
            ))}
          </select>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="分组"
            style={{ maxWidth: 80 }}
          />
          <input
            value={slotRole}
            onChange={(e) => setSlotRole(e.target.value)}
            placeholder="职责"
            style={{ maxWidth: 100 }}
          />
          <button type="submit">加入排表</button>
          <button type="button" className="secondary" onClick={clearRoster}>
            清空
          </button>
        </form>
        <ul className="list" style={{ marginTop: 12 }}>
          {roster.map((r, i) => (
            <li key={i} className="act-row">
              <span>
                [{r.group_name || "-"}] {charLabel(r.character_id)} ·{" "}
                {r.slot_role || "-"}
              </span>
            </li>
          ))}
        </ul>
        {roster.length === 0 && <p className="muted">暂无排表</p>}
      </section>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
