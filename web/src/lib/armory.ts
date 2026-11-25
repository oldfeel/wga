import itemIconCache from "./item-icon-cache.json";

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

/** 纸娃娃左侧（贴角色左边） */
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

/** 纸娃娃右侧 */
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

/** 底部：主手 / 副手 / 圣物（无限神像·圣契·图腾） */
export const ARMORY_WEAPONS = ["MAINHAND", "OFFHAND", "RELIC"] as const;

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

/** 社区图标 CDN（按 icon 文件名；纯数字 fileId / INVTYPE 不可用） */
const ICON_CDNS = [
  "https://render.worldofwarcraft.com/us/icons/56/",
  "https://wow.zamimg.com/images/wow/icons/large/",
];

const iconNameCache = new Map<number, string | null>();
const iconNamePending = new Map<number, Promise<string | null>>();

export function isIconName(icon?: string | null): icon is string {
  return !!icon && !/^\d+$/.test(icon) && !/^invtype_/i.test(icon);
}

function cachedIconName(itemId?: number | null): string | null {
  if (!itemId) return null;
  return (itemIconCache as Record<string, string>)[String(itemId)] || null;
}

export function iconUrl(icon?: string | null) {
  if (!isIconName(icon)) return null;
  return `${ICON_CDNS[0]}${icon.toLowerCase()}.jpg`;
}

/** img onerror 时可依次尝试的备用地址 */
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

/** 本地缓存优先，再用 Wowhead（经典物品可用；无限新增物可能没有） */
export async function resolveIconName(
  itemId?: number | null,
  icon?: string | null
): Promise<string | null> {
  if (isIconName(icon)) return icon.toLowerCase();
  const local = cachedIconName(itemId);
  if (local) {
    if (itemId) iconNameCache.set(itemId, local);
    return local;
  }
  if (!itemId || itemId <= 0) return null;
  if (iconNameCache.has(itemId)) return iconNameCache.get(itemId)!;
  const pending = iconNamePending.get(itemId);
  if (pending) return pending;

  const job = (async () => {
    const urls = [
      `https://nether.wowhead.com/tooltip/item/${itemId}`,
      `https://www.wowhead.com/tooltip/item/${itemId}`,
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) continue;
        const data = (await r.json()) as { icon?: string };
        if (data?.icon && isIconName(data.icon)) {
          const name = data.icon.toLowerCase();
          iconNameCache.set(itemId, name);
          return name;
        }
      } catch {
        /* try next */
      }
    }
    iconNameCache.set(itemId, null);
    return null;
  })();

  iconNamePending.set(itemId, job);
  try {
    return await job;
  } finally {
    iconNamePending.delete(itemId);
  }
}
