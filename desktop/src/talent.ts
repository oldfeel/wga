import { wowTextToHtml } from "@wga/ui";
import { escapeHtml, text } from "./format";
import type { SnapTalentNode, SnapTalentTipLine } from "./types";

export type TalentLayout =
  | { mode: "empty" }
  | { mode: "list"; nodes: SnapTalentNode[] }
  | {
      mode: "canvas";
      width: number;
      height: number;
      nodeSize: number;
      cells: Array<{ node: SnapTalentNode; left: number; top: number }>;
    };

function talentNodesHaveLayout(nodes: SnapTalentNode[]) {
  const withPos = nodes.filter((n) => (n.pos_x ?? 0) !== 0 || (n.pos_y ?? 0) !== 0);
  if (withPos.length < 2) return false;
  const xs = new Set(withPos.map((n) => n.pos_x ?? 0));
  const ys = new Set(withPos.map((n) => n.pos_y ?? 0));
  return xs.size > 1 || ys.size > 1;
}

function buildTalentAxis(values: number[], mergeRatio = 0.35): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 1;
  const thresh = Math.max(1, med * mergeRatio);
  const axis: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - axis[axis.length - 1] > thresh) axis.push(sorted[i]);
  }
  return axis;
}

function nearestAxisIndex(axis: number[], v: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < axis.length; i++) {
    const d = Math.abs(axis[i] - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function layoutTalentTree(nodes: SnapTalentNode[]): TalentLayout {
  const drawable = nodes.filter((n) => (n.max_rank ?? 0) > 0 || (n.rank ?? 0) > 0);
  if (!drawable.length) return { mode: "empty" };
  if (!talentNodesHaveLayout(drawable)) {
    const sorted = drawable
      .slice()
      .sort(
        (a, b) => (b.rank ?? 0) - (a.rank ?? 0) || (a.node_id ?? 0) - (b.node_id ?? 0)
      );
    return { mode: "list", nodes: sorted };
  }
  const axisX = buildTalentAxis(drawable.map((n) => n.pos_x ?? 0));
  const axisY = buildTalentAxis(drawable.map((n) => n.pos_y ?? 0));
  const nodeSize = 40;
  const gap = 14;
  const cell = nodeSize + gap;
  const pad = 16;
  const cols = Math.max(axisX.length, 1);
  const rows = Math.max(axisY.length, 1);
  return {
    mode: "canvas",
    width: pad * 2 + cols * cell - gap,
    height: pad * 2 + rows * cell - gap,
    nodeSize,
    cells: drawable.map((n) => ({
      node: n,
      left: pad + nearestAxisIndex(axisX, n.pos_x ?? 0) * cell,
      top: pad + nearestAxisIndex(axisY, n.pos_y ?? 0) * cell,
    })),
  };
}

function tipLooksSparse(lines: SnapTalentTipLine[] | undefined) {
  if (!lines?.length) return true;
  const meaningful = lines.filter((ln) => {
    const t = (ln.left || "").replace(/\s+/g, "");
    return t && t !== "被动" && t !== "Passive";
  });
  return meaningful.length <= 1;
}

function renderTalentTipLines(lines: SnapTalentTipLine[] | undefined) {
  if (!lines?.length) return "";
  return lines
    .map((ln) => {
      const c = ln.color;
      const style =
        c && c.r != null ? `style="color:rgb(${c.r},${c.g ?? 0},${c.b ?? 0})"` : "";
      const leftRaw = ln.left || "";
      const rightRaw = ln.right || "";
      if (!leftRaw && !rightRaw) return `<div class="item-tip-blank"></div>`;
      const left = wowTextToHtml(leftRaw);
      const right = wowTextToHtml(rightRaw);
      if (rightRaw) {
        return `<div class="item-tip-row" ${style}><span>${left}</span><span>${right}</span></div>`;
      }
      return `<div class="item-tip-line" ${style}>${left}</div>`;
    })
    .join("");
}

export function buildTalentTipHtml(node: SnapTalentNode) {
  const name = node.name || "天赋";
  const rank = node.rank ?? 0;
  const max = node.max_rank ?? rank;
  const spell = node.spell_id;
  const tipBody = renderTalentTipLines(node.tooltip_lines);
  const descOnly =
    node.description && !tipBody.includes(escapeHtml(node.description).slice(0, 12))
      ? `<div class="item-tip-line">${wowTextToHtml(node.description)}</div>`
      : "";
  if (tipBody) {
    return `${tipBody}${
      descOnly && tipLooksSparse(node.tooltip_lines) ? descOnly : ""
    }<div class="item-tip-line muted">等级 ${rank}/${max}</div>`;
  }
  return `
    <div class="item-tip-name" style="color:#ffe9a8">${escapeHtml(text(name))}</div>
    <div class="item-tip-line">等级 ${rank}/${max}</div>
    ${
      node.description
        ? `<div class="item-tip-line">${wowTextToHtml(node.description)}</div>`
        : `<div class="item-tip-line muted">暂无详情（需插件 0.1.26+ 后 /wga）</div>`
    }
    ${spell ? `<div class="item-tip-id muted">法术 #${spell}</div>` : ""}
  `;
}
