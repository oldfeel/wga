import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Act = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
};

export default function ActivitiesPage() {
  const auth = useAuth();
  const [list, setList] = useState<Act[]>([]);
  const [title, setTitle] = useState("");
  const [starts, setStarts] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    if (!auth.guildId) return;
    const r = await api.activities(auth.token, auth.guildId);
    setList(r.activities || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.guildId, auth.token]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createActivity(auth.token, auth.guildId, {
        title: title.trim(),
        starts_at: new Date(starts).toISOString(),
      });
      setTitle("");
      setStarts("");
      setMsg("已创建活动");
      await load();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function signup(id: string) {
    try {
      await api.signup(auth.token, id);
      setMsg("已报名");
      await load();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function checkIn(id: string) {
    try {
      await api.checkIn(auth.token, id);
      setMsg("已签到");
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  if (!auth.guildId) {
    return (
      <div className="card">
        <p>
          请先在 <Link to="/guild">公会</Link> 页选择公会。
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>创建活动（官员+）</h2>
        <form className="stack-form" onSubmit={create}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="活动标题"
            required
          />
          <input
            type="datetime-local"
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
            required
          />
          <button type="submit">创建</button>
        </form>
      </section>
      <section className="card">
        <h2>活动列表</h2>
        <ul className="list">
          {list.map((a) => (
            <li key={a.id} className="act-row">
              <div>
                <Link to={`/activities/${a.id}`}>
                  <strong>{a.title}</strong>
                </Link>
                <div className="muted">
                  {new Date(a.starts_at).toLocaleString()} · {a.status}
                </div>
              </div>
              <div className="row">
                <button type="button" onClick={() => signup(a.id)}>
                  报名
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => checkIn(a.id)}
                >
                  签到
                </button>
              </div>
            </li>
          ))}
        </ul>
        {list.length === 0 && <p className="muted">暂无活动</p>}
      </section>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
