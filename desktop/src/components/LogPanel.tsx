import { useSyncExternalStore } from "react";
import { getLogs, subscribeLogs } from "../log";

export default function LogPanel() {
  const rows = useSyncExternalStore(subscribeLogs, getLogs, getLogs);
  return (
    <section className="card">
      <h2>日志</h2>
      <div style={{ maxHeight: 180, overflow: "auto" }}>
        {rows.length === 0 ? (
          <p className="muted">暂无</p>
        ) : (
          <ul className="plain-list">
            {rows.map((row, i) => (
              <li key={`${row.at}-${i}`}>
                <span
                  className="muted"
                  style={{
                    color:
                      row.level === "error"
                        ? "#e08a8a"
                        : row.level === "warn"
                          ? "#e0c080"
                          : undefined,
                  }}
                >
                  [{row.level}]
                </span>{" "}
                {row.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
