import type { CSSProperties, ReactNode } from "react";
import { RichTooltip } from "@wga/ui";
import { text } from "../format";
import type { SnapTalentGroup, SnapTalentNode, SnapTalentTab } from "../types";
import { buildTalentTipHtml, layoutTalentTree } from "../talent";
import { useFileIcon } from "../useFileIcon";

function TalentGlyph({ fileId, className }: { fileId?: number; className: string }) {
  const src = useFileIcon(fileId);
  return (
    <span
      className={className + (src ? " has-icon" : "")}
      style={src ? { backgroundImage: `url("${src}")` } : undefined}
    />
  );
}

function TalentNodeButton({
  node,
  className,
  style,
  children,
}: {
  node: SnapTalentNode;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <RichTooltip html={buildTalentTipHtml(node)}>
      <button type="button" className={className} style={style}>
        {children}
      </button>
    </RichTooltip>
  );
}

function TalentTree({ nodes }: { nodes: SnapTalentNode[] }) {
  const layout = layoutTalentTree(nodes);
  if (layout.mode === "empty") {
    return <p className="muted talent-col-empty">此系无节点</p>;
  }
  if (layout.mode === "list") {
    return (
      <div className="talent-node-list">
        {layout.nodes.map((n, i) => {
          const rank = n.rank ?? 0;
          const max = n.max_rank ?? rank;
          const on = rank > 0;
          const name = text(n.name, `节点 ${n.node_id}`);
          return (
            <RichTooltip key={`${n.node_id ?? "n"}-${i}`} html={buildTalentTipHtml(n)}>
              <div className={"talent-list-row " + (on ? "learned" : "empty")}>
                <TalentGlyph fileId={n.icon_file_id} className="talent-list-icon" />
                <span className="talent-list-name">{name}</span>
                <span className="talent-list-rank">
                  {rank}/{max}
                </span>
              </div>
            </RichTooltip>
          );
        })}
      </div>
    );
  }
  return (
    <div className="talent-canvas-wrap">
      <div className="talent-canvas" style={{ width: layout.width, height: layout.height }}>
        {layout.cells.map((cell, i) => {
          const n = cell.node;
          const rank = n.rank ?? 0;
          const max = n.max_rank ?? Math.max(rank, 1);
          const on = rank > 0;
          const maxed = on && rank >= max;
          const rankLabel = max <= 1 ? String(rank) : `${rank}/${max}`;
          return (
            <TalentNodeButton
              key={`${n.node_id ?? "n"}-${i}`}
              node={n}
              className={
                "talent-node " + (on ? (maxed ? "maxed" : "learned") : "empty")
              }
              style={{
                left: cell.left,
                top: cell.top,
                width: layout.nodeSize,
                height: layout.nodeSize,
              }}
            >
              <TalentGlyph fileId={n.icon_file_id} className="talent-node-icon" />
              {on ? (
                <span className={"talent-node-rank" + (maxed ? " maxed" : "")}>
                  {rankLabel}
                </span>
              ) : null}
            </TalentNodeButton>
          );
        })}
      </div>
    </div>
  );
}

function TalentColumn({ tab, index }: { tab: SnapTalentTab; index: number }) {
  return (
    <div className="talent-col" data-col={index}>
      <div className="talent-col-head">
        <TalentGlyph fileId={tab.icon_file_id} className="talent-col-icon" />
        <span className="talent-col-title">{text(tab.name, `系${index + 1}`)}</span>
        <span className="talent-col-points">{tab.points_spent ?? 0}</span>
      </div>
      <div className="talent-col-body">
        <TalentTree nodes={tab.nodes || []} />
      </div>
    </div>
  );
}

function TalentHead({
  group,
  total,
}: {
  group: SnapTalentGroup;
  total?: number;
}) {
  return (
    <div className="talent-head">
      <strong>{text(group.name, "天赋")}</strong>
      {group.active ? <span className="tab-badge">激活</span> : null}
      {group.config_name ? <span className="muted">{text(group.config_name)}</span> : null}
      {total != null ? <span className="talent-unused">已投入 {total}</span> : null}
    </div>
  );
}

export default function TalentPanel({ group }: { group: SnapTalentGroup }) {
  const tabs = group.tabs || [];
  const flatNodes = group.nodes || [];
  if (!group.active && !tabs.length && !flatNodes.length) {
    return (
      <div className="snap-talents">
        <TalentHead group={group} />
        <p className="muted">
          此套天赋暂无数据。请升级插件 0.1.27+ 后 /wga；若仍为空，先切换到该天赋再采一次。
        </p>
      </div>
    );
  }
  const tabSum = tabs.reduce((s, t) => s + (t.points_spent ?? 0), 0);
  const nodeSum = flatNodes.reduce((s, n) => s + (n.rank ?? 0), 0);
  const totalSpent = tabSum || nodeSum;

  if (!tabs.length && flatNodes.length) {
    return (
      <div className="snap-talents">
        <TalentHead group={group} total={totalSpent} />
        <p className="muted small">当前快照无三系分页（需插件 0.1.24+ 后 /wga）</p>
        <TalentTree nodes={flatNodes} />
      </div>
    );
  }
  if (!tabs.length) {
    return (
      <div className="snap-talents">
        <TalentHead group={group} />
        <p className="muted">未采集到天赋树（请升级插件 0.1.24+ 后 /wga）</p>
      </div>
    );
  }
  return (
    <div className="snap-talents">
      <TalentHead group={group} total={totalSpent} />
      <div className="talent-trees">
        {tabs.map((tab, i) => (
          <TalentColumn key={`${tab.group_id ?? tab.name ?? i}`} tab={tab} index={i} />
        ))}
      </div>
    </div>
  );
}
