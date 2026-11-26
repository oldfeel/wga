import { Component, useMemo, useState, type ReactNode } from "react";
import { text } from "../format";
import { pushLog } from "../log";
import {
  buildSnapTabs,
  defaultTabKey,
  equipTabWearing,
  type SnapTab,
} from "../snapshot";
import type { SnapshotPayload } from "../types";
import Paperdoll from "./Paperdoll";
import TalentPanel from "./TalentPanel";

class SnapBoundary extends Component<
  { epoch: number; children: ReactNode },
  { error: string }
> {
  state = { error: "" };

  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) };
  }

  componentDidCatch(e: unknown) {
    pushLog("error", `渲染失败: ${String(e)}`);
  }

  componentDidUpdate(prev: { epoch: number }) {
    if (prev.epoch !== this.props.epoch && this.state.error) {
      this.setState({ error: "" });
    }
  }

  render() {
    if (this.state.error) return <p className="error">{this.state.error}</p>;
    return this.props.children;
  }
}

function tabLabel(payload: SnapshotPayload, tab: SnapTab) {
  let label = tab.label;
  if (tab.kind === "talent" && tab.group.active) label += " ·当前";
  if (equipTabWearing(payload, tab)) label += " ·穿着";
  return label;
}

export default function SnapshotView({
  payload,
  epoch,
}: {
  payload: SnapshotPayload;
  epoch: number;
}) {
  const [tabKey, setTabKey] = useState("");
  const tabs = useMemo(() => buildSnapTabs(payload), [payload]);
  const chosen = tabs.some((t) => t.key === tabKey) ? tabKey : defaultTabKey(payload, tabs);
  const current = tabs.find((t) => t.key === chosen) || tabs[0];
  const equipTabs = tabs.filter((t) => t.kind === "equip");
  const talentTabs = tabs.filter((t) => t.kind === "talent");
  const sets = payload.equipment_sets || [];
  const groups = payload.talents?.groups || [];
  const quests = payload.quests || [];
  const profs = payload.professions || [];
  const locks = payload.lockouts || [];

  const group = (kind: "equip" | "talent", label: string, list: SnapTab[]) => {
    if (!list.length) return null;
    return (
      <div className={`snap-tab-group ${kind}`}>
        <span className="snap-tab-group-label">{label}</span>
        <div className="snap-tab-group-row">
          {list.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={
                "snap-tab" +
                (tab.key === chosen ? " active" : "") +
                (tab.kind === "talent" ? " talent" : " equip")
              }
              onClick={() => setTabKey(tab.key)}
            >
              {tabLabel(payload, tab)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <SnapBoundary epoch={epoch}>
      <div id="snapView">
        <div className="snap-hero">
          <div className="muted small">
            采集 {text(payload.captured_at)}
            {payload.addon_version ? ` · 插件 ${payload.addon_version}` : ""}
            {sets.length ? ` · 装备方案 ${sets.length}` : ""}
            {groups.length ? ` · 天赋组 ${groups.length}` : ""}
            {` · 身上装备 ${(payload.equipment || []).length}`}
          </div>
        </div>
        <div className="snap-tabs" role="tablist">
          {group("equip", "装备", equipTabs)}
          {equipTabs.length && talentTabs.length ? (
            <div className="snap-tabs-sep" aria-hidden="true" />
          ) : null}
          {group("talent", "天赋", talentTabs)}
        </div>
        <div className="snap-main">
          {current?.kind === "talent" ? (
            <>
              <h3>天赋 · {current.label}</h3>
              <TalentPanel group={current.group} />
            </>
          ) : (
            <>
              <h3>
                装备 · {current?.kind === "equip" ? current.label : ""}
                {current?.kind === "equip"
                  ? ` (${current.items?.length || 0})`
                  : ""}
              </h3>
              <Paperdoll
                items={current?.kind === "equip" ? current.items || [] : []}
                character={payload.character}
              />
            </>
          )}
        </div>
        <div className="snap-meta">
          <div className="snap-meta-left">
            <h3>专业</h3>
            <ul className="plain-list">
              {profs.length ? (
                profs.map((p, i) => (
                  <li key={`${p.name}-${i}`}>
                    {text(p.name)} {p.skill_current ?? "?"}/{p.skill_max ?? "?"}
                  </li>
                ))
              ) : (
                <li className="muted">无</li>
              )}
            </ul>
            <h3>副本 CD</h3>
            <ul className="plain-list">
              {locks.length ? (
                locks.map((l, i) => (
                  <li key={`${l.instance_name}-${i}`}>
                    <strong>{text(l.instance_name)}</strong>
                    <div className="muted">
                      {text(l.difficulty)} · {l.bosses_killed ?? 0}/
                      {l.bosses_total ?? 0}
                    </div>
                  </li>
                ))
              ) : (
                <li className="muted">无</li>
              )}
            </ul>
          </div>
          <div className="snap-meta-right">
            <h3>
              当前任务{" "}
              <span className="muted">
                {quests.length ? `(${quests.length})` : ""}
              </span>
            </h3>
            <ul className="plain-list quest-list">
              {quests.length ? (
                quests.map((q, i) => (
                  <li key={`${q.quest_id ?? q.title}-${i}`}>
                    <strong>
                      {text(q.title)}
                      {q.is_complete ? " · 已完成" : ""}
                    </strong>
                    <div className="muted">
                      {q.level != null ? `Lv${q.level}` : ""}
                      {q.quest_id != null ? ` · #${q.quest_id}` : ""}
                    </div>
                    {(q.objectives || []).map((o, j) => (
                      <div className="muted" key={j}>
                        {o.finished ? "✓" : "·"} {text(o.text)}
                      </div>
                    ))}
                  </li>
                ))
              ) : (
                <li className="muted">无任务（需插件 0.1.1+）</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </SnapBoundary>
  );
}
