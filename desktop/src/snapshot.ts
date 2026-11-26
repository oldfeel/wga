import {
  coerceForeverRegionKey,
  foreverRulesetLabel,
} from "@wga/ui";
import type { SnapEquipItem, SnapTalentGroup, SnapshotPayload } from "./types";

export type SnapTab =
  | { key: string; kind: "equip"; label: string; items: SnapEquipItem[] }
  | { key: string; kind: "talent"; label: string; group: SnapTalentGroup };

export function snapGuildKey(snap: SnapshotPayload | null) {
  const g = snap?.guild;
  if (!g?.name) return null;
  const flavor = g.flavor || "forever";
  return {
    flavor,
    region_key:
      flavor === "forever"
        ? coerceForeverRegionKey(g.region_key)
        : g.region_key || "UNKNOWN",
    realm_name: g.realm_name || snap?.character?.realm || "",
    guild_name: g.name,
    is_leader: !!g.is_leader,
    character_name: snap?.character?.name || "",
  };
}

export function guildInfoText(snap: SnapshotPayload | null) {
  if (!snap) return "从本地快照读取游戏公会…";
  const ver = snap.addon_version || "";
  const g = snap.guild;
  if (!g?.name) {
    const stale =
      !!ver &&
      (() => {
        const m = /^(\d+)\.(\d+)\.(\d+)/.exec(ver);
        if (!m) return true;
        const n = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
        return n < 120;
      })();
    return stale
      ? `快照插件版本 ${ver || "未知"} 过旧（无公会字段）。请确认游戏加载 WGA 0.1.20+ → /reload → /wga → 再 /reload。`
      : `快照中无公会（插件 ${ver || "?"}）。请确认角色已加入游戏公会后重新 /wga，再 /reload。`;
  }
  const leader = g.is_leader ? " · 游戏会长" : "";
  const flavor = g.flavor || "forever";
  const region =
    flavor === "forever"
      ? foreverRulesetLabel(g.region_key)
      : g.region_key || "UNKNOWN";
  return `${flavor} / ${region} / ${
    g.realm_name || snap.character?.realm || "?"
  } · ${g.name}${leader}（插件 ${ver || "?"}）`;
}

/** 方案物品常无 tip：用当前身上同槽/同 ID 装备补全 tooltip_lines */
export function enrichEquipSetItems(
  setItems: SnapEquipItem[],
  worn: SnapEquipItem[] | undefined,
  isEquipped: boolean | undefined
): SnapEquipItem[] {
  if (isEquipped && worn?.length) return worn;
  if (!setItems.length) return worn?.length ? worn : setItems;
  const bySlot = new Map<string, SnapEquipItem>();
  const byId = new Map<number, SnapEquipItem>();
  for (const e of worn || []) {
    if (e.slot) bySlot.set(e.slot, e);
    if (e.item_id != null) byId.set(e.item_id, e);
  }
  return setItems.map((it) => {
    if ((it.tooltip_lines || []).length) return it;
    const hit =
      (it.slot && bySlot.get(it.slot)?.item_id === it.item_id
        ? bySlot.get(it.slot)
        : undefined) || (it.item_id != null ? byId.get(it.item_id) : undefined);
    if (!hit) return it;
    return {
      ...it,
      name: it.name || hit.name,
      quality: it.quality ?? hit.quality,
      icon_file_id: it.icon_file_id ?? hit.icon_file_id,
      desc: it.desc || hit.desc,
      tooltip_lines: hit.tooltip_lines,
      transmog: it.transmog || hit.transmog,
      item_level: it.item_level ?? hit.item_level,
    };
  });
}

export function buildSnapTabs(payload: SnapshotPayload): SnapTab[] {
  const tabs: SnapTab[] = [];
  const sets = payload.equipment_sets || [];
  const worn = payload.equipment || [];
  if (sets.length) {
    for (const s of sets) {
      const raw = s.items && s.items.length ? s.items : [];
      tabs.push({
        key: `equip:${s.id ?? s.name}`,
        kind: "equip",
        label: s.name || "装备方案",
        items: enrichEquipSetItems(raw, worn, s.is_equipped),
      });
    }
  } else {
    tabs.push({
      key: "equip:current",
      kind: "equip",
      label: "当前装备",
      items: worn,
    });
  }
  const groups = payload.talents?.groups || [];
  if (groups.length) {
    for (const g of groups) {
      tabs.push({
        key: `talent:${g.index ?? g.name}`,
        kind: "talent",
        label: g.name || `天赋${g.index ?? ""}`,
        group: g,
      });
    }
  } else {
    tabs.push({
      key: "talent:1",
      kind: "talent",
      label: "天赋",
      group: { name: "天赋", active: true, nodes: [], trees: [] },
    });
  }
  return tabs;
}

export function defaultTabKey(payload: SnapshotPayload, tabs: SnapTab[]) {
  const equipped = tabs.find(
    (t) =>
      t.kind === "equip" &&
      (payload.equipment_sets || []).some(
        (s) => s.is_equipped && t.key === `equip:${s.id ?? s.name}`
      )
  );
  if (!equipped && tabs[0]) return tabs[0].key;
  return equipped?.key || tabs[0]?.key || "";
}

export function equipTabWearing(payload: SnapshotPayload, tab: SnapTab) {
  return (
    tab.kind === "equip" &&
    (payload.equipment_sets || []).some(
      (s) => s.is_equipped && tab.key === `equip:${s.id ?? s.name}`
    )
  );
}
