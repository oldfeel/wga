/** 无限服官方规则集 → 存库用的 region_key（稳定英文码） */
export const FOREVER_RULESETS = [
  { value: "NORMAL", label: "普通" },
  { value: "PVP", label: "PvP" },
  { value: "RP", label: "角色扮演" },
  { value: "RP_PVP", label: "角色扮演 PvP" },
  { value: "HARDCORE", label: "专家模式" },
  { value: "UNKNOWN", label: "未知（需自选）" },
] as const;

export type ForeverRuleset = (typeof FOREVER_RULESETS)[number]["value"];

const LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  FOREVER_RULESETS.map((r) => [r.value, r.label])
);

/** 旧数据 / 别名 → 官方码 */
export function coerceForeverRegionKey(raw?: string | null): ForeverRuleset {
  const u = String(raw || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (u === "PVE" || u === "NORMAL" || u === "普通") return "NORMAL";
  if (u === "PVP") return "PVP";
  if (u === "RP" || u === "ROLEPLAY" || u === "角色扮演") return "RP";
  if (
    u === "RP_PVP" ||
    u === "RPPVP" ||
    u === "ROLEPLAY_PVP" ||
    u === "角色扮演PVP" ||
    u === "角色扮演_PVP"
  ) {
    return "RP_PVP";
  }
  if (u === "HARDCORE" || u === "HC" || u === "专家模式" || u === "专家") {
    return "HARDCORE";
  }
  if (u === "UNKNOWN" || !u) return "UNKNOWN";
  // 不在表内的原样尽量保留为 UNKNOWN，避免脏键进唯一约束
  if ((FOREVER_RULESETS as readonly { value: string }[]).some((r) => r.value === u)) {
    return u as ForeverRuleset;
  }
  return "UNKNOWN";
}

export function foreverRulesetLabel(raw?: string | null): string {
  const key = coerceForeverRegionKey(raw);
  return LABEL_BY_VALUE[key] || key;
}
