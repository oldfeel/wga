import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Char = {
  id: string;
  name: string;
  realm: string;
  class?: string;
  spec?: string;
  level?: number;
  item_level?: number;
  last_snapshot_at?: string;
};

export default function CharactersPage() {
  const auth = useAuth();
  const [list, setList] = useState<Char[]>([]);
  const [classFilter, setClassFilter] = useState("");
  const [minIlvl, setMinIlvl] = useState("");
  const [profession, setProfession] = useState("");
  const [hasLockout, setHasLockout] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!auth.guildId) return;
    const q: Record<string, string> = {};
    if (classFilter.trim()) q.class = classFilter.trim();
    if (minIlvl.trim()) q.min_ilvl = minIlvl.trim();
    if (profession.trim()) q.profession = profession.trim();
    if (hasLockout) q.has_lockout = "1";
    api
      .characters(auth.token, auth.guildId, q)
      .then((r) => setList(r.characters || []))
      .catch((e) => setErr(e.message || String(e)));
  }, [auth.token, auth.guildId, classFilter, minIlvl, profession, hasLockout]);

  if (!auth.guildId) {
    return (
      <div className="card">
        <p>
          请先在 <Link to="/guild">公会</Link> 页创建或加入并选择公会。
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>角色档案</h2>
        <div className="filters">
          <input
            placeholder="职业（如 战士）"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          />
          <input
            placeholder="最低装等"
            value={minIlvl}
            onChange={(e) => setMinIlvl(e.target.value)}
          />
          <input
            placeholder="专业（如 锻造）"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
          />
          <label className="check-inline">
            <input
              type="checkbox"
              checked={hasLockout}
              onChange={(e) => setHasLockout(e.target.checked)}
            />
            有副本 CD
          </label>
        </div>
        {err && <p className="error">{err}</p>}
        {list.length === 0 && (
          <p className="muted">
            暂无角色。用桌面端上传快照后会出现在这里。
          </p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>角色</th>
              <th>职业/专精</th>
              <th>等级</th>
              <th>装等</th>
              <th>最近快照</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/characters/${c.id}`}>
                    {c.name}-{c.realm}
                  </Link>
                </td>
                <td>
                  {c.class || "-"} / {c.spec || "-"}
                </td>
                <td>{c.level ?? "-"}</td>
                <td>{c.item_level ?? "-"}</td>
                <td>
                  {c.last_snapshot_at
                    ? new Date(c.last_snapshot_at).toLocaleString()
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
