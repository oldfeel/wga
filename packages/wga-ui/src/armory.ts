export type EquipItem = {
  slot?: string;
  name?: string;
  item_level?: number;
  item_id?: number;
  quality?: number;
  icon?: string;
  icon_file_id?: number;
  desc?: string;
  tooltip_lines?: Array<{
    left?: string;
    right?: string;
    color?: { r?: number; g?: number; b?: number };
  }>;
  transmog?: {
    name?: string;
    source_id?: number;
    appearance_id?: number;
    is_transmogrified?: boolean;
    is_hidden?: boolean;
    illusion_id?: number;
    illusion_name?: string;
  };
};

export type CharSummary = {
  name?: string;
  realm?: string;
  race?: string;
  class?: string;
  spec?: string;
  level?: number;
  item_level?: number;
};

export const SLOT_LABEL: Record<string, string> = {
  HEAD: "头部",
  NECK: "颈部",
  SHOULDER: "肩部",
  BACK: "背部",
  CHEST: "胸部",
  SHIRT: "衬衣",
  TABARD: "战袍",
  WRIST: "手腕",
  HANDS: "手",
  WAIST: "腰部",
  LEGS: "腿部",
  FEET: "脚",
  FINGER1: "手指",
  FINGER2: "手指",
  TRINKET1: "饰品",
  TRINKET2: "饰品",
  MAINHAND: "主手",
  OFFHAND: "副手",
  RELIC: "圣物",
};

export const ARMORY_LEFT = [
  "HEAD",
  "NECK",
  "SHOULDER",
  "BACK",
  "CHEST",
  "SHIRT",
  "TABARD",
  "WRIST",
] as const;

export const ARMORY_RIGHT = [
  "HANDS",
  "WAIST",
  "LEGS",
  "FEET",
  "FINGER1",
  "FINGER2",
  "TRINKET1",
  "TRINKET2",
] as const;

export const ARMORY_WEAPONS = ["MAINHAND", "OFFHAND", "RELIC"] as const;

export const QUALITY_LABEL = [
  "粗糙",
  "普通",
  "优秀",
  "精良",
  "史诗",
  "传说",
  "神器",
  "传家宝",
];

const QUALITY_COLORS = [
  "#9d9d9d",
  "#ffffff",
  "#1eff00",
  "#0070dd",
  "#a335ee",
  "#ff8000",
  "#e6cc80",
  "#00ccff",
];

const ICON_CDNS = [
  "https://render.worldofwarcraft.com/us/icons/56/",
  "https://wow.zamimg.com/images/wow/icons/large/",
];

export function isIconName(icon?: string | null): icon is string {
  return !!icon && !/^\d+$/.test(icon) && !/^invtype_/i.test(icon);
}

export function iconUrl(icon?: string | null) {
  if (!isIconName(icon)) return null;
  return `${ICON_CDNS[0]}${icon.toLowerCase()}.jpg`;
}

export function iconUrlCandidates(icon?: string | null): string[] {
  if (!isIconName(icon)) return [];
  const name = icon.toLowerCase();
  return ICON_CDNS.map((base) => `${base}${name}.jpg`);
}

export function qualityColor(q?: number | null) {
  if (q == null || q < 0) return "#2c3644";
  return QUALITY_COLORS[q] || "#2c3644";
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 解析魔兽 UI 转义：|cAARRGGBB…|r、|T…|t、|H…|h…|h、|n */
export function wowTextToHtml(input: string): string {
  if (!input) return "";
  const s = String(input);
  let i = 0;
  let out = "";
  while (i < s.length) {
    if (s[i] === "|" && s[i + 1] === "|") {
      out += "|";
      i += 2;
      continue;
    }
    if (s.startsWith("|c", i) && /^[0-9a-fA-F]{8}/.test(s.slice(i + 2, i + 10))) {
      const hex = s.slice(i + 2, i + 10);
      i += 10;
      const end = s.indexOf("|r", i);
      const contentEnd = end === -1 ? s.length : end;
      const inner = wowTextToHtml(s.slice(i, contentEnd));
      const r = parseInt(hex.slice(2, 4), 16);
      const g = parseInt(hex.slice(4, 6), 16);
      const b = parseInt(hex.slice(6, 8), 16);
      out += `<span style="color:rgb(${r},${g},${b})">${inner}</span>`;
      i = end === -1 ? s.length : end + 2;
      continue;
    }
    if (s.startsWith("|r", i)) {
      i += 2;
      continue;
    }
    if (s.startsWith("|T", i)) {
      const t = s.indexOf("|t", i);
      i = t === -1 ? s.length : t + 2;
      continue;
    }
    if (s.startsWith("|H", i)) {
      const h1 = s.indexOf("|h", i);
      if (h1 === -1) {
        i += 2;
        continue;
      }
      const h2 = s.indexOf("|h", h1 + 2);
      if (h2 === -1) {
        i = h1 + 2;
        continue;
      }
      out += wowTextToHtml(s.slice(h1 + 2, h2));
      i = h2 + 2;
      continue;
    }
    if (s.startsWith("|n", i)) {
      out += "<br/>";
      i += 2;
      continue;
    }
    const next = s.indexOf("|", i);
    const chunk = next === -1 ? s.slice(i) : s.slice(i, next);
    out += escapeHtml(chunk);
    i = next === -1 ? s.length : next;
  }
  return out;
}

export function transmogText(tm?: EquipItem["transmog"]) {
  if (!tm) return "";
  let s = "";
  if (tm.is_hidden) s = "隐藏外观";
  else if (tm.is_transmogrified || tm.name) {
    s = tm.name || `外观 #${tm.appearance_id ?? tm.source_id ?? "?"}`;
  }
  if (tm.illusion_name || tm.illusion_id) {
    s += (s ? " · " : "") + (tm.illusion_name || `幻效 #${tm.illusion_id}`);
  }
  return s;
}

export function indexBySlot(equip: EquipItem[]) {
  return new Map(equip.map((e) => [e.slot || "", e]));
}

export function buildEquipTipHtml(e: EquipItem, slot: string): string {
  const q = e.quality ?? 1;
  const color = qualityColor(q);
  const tm = transmogText(e.transmog);
  const lines = e.tooltip_lines || [];
  let body = "";
  if (lines.length) {
    body = lines
      .map((ln) => {
        const c = ln.color;
        const style =
          c && c.r != null
            ? `style="color:rgb(${c.r},${c.g ?? 0},${c.b ?? 0})"`
            : "";
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
  } else {
    body = `
      <div class="item-tip-line">${SLOT_LABEL[slot] || slot}${
        e.item_level != null ? ` · 物品等级 ${e.item_level}` : ""
      }</div>
      ${
        e.quality != null
          ? `<div class="item-tip-line" style="color:${color}">${
              QUALITY_LABEL[e.quality] || `品质 ${e.quality}`
            }</div>`
          : ""
      }
      ${e.desc ? `<div class="item-tip-line">${wowTextToHtml(e.desc)}</div>` : ""}
      <div class="item-tip-line muted">（暂无属性详情：穿上该装后 /wga，或升级插件后重采）</div>
    `;
  }
  const nameHeader = lines.length
    ? ""
    : `<div class="item-tip-name" style="color:${color}">${wowTextToHtml(
        e.name || "未知物品"
      )}</div>`;
  return `
    ${nameHeader}
    ${body}
    ${
      e.item_id != null
        ? `<div class="item-tip-id muted">物品ID ${e.item_id}</div>`
        : ""
    }
    ${tm ? `<div class="item-tip-tm">外观：${wowTextToHtml(tm)}</div>` : ""}
  `;
}
