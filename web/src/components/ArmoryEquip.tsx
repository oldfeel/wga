import { useEffect, useState } from "react";
import {
  ARMORY_LEFT,
  ARMORY_RIGHT,
  ARMORY_WEAPONS,
  SLOT_LABEL,
  iconUrl,
  iconUrlCandidates,
  indexBySlot,
  isIconName,
  qualityColor,
  resolveIconName,
  transmogText,
  wowTextToHtml,
  type CharSummary,
  type EquipItem,
} from "../lib/armory";

function SlotIcon({ e }: { e?: EquipItem }) {
  const [src, setSrc] = useState<string | null>(() => iconUrl(e?.icon));
  const [fallbacks, setFallbacks] = useState<string[]>(() =>
    iconUrlCandidates(e?.icon).slice(1)
  );

  useEffect(() => {
    let cancelled = false;
    setSrc(iconUrl(e?.icon));
    setFallbacks(iconUrlCandidates(e?.icon).slice(1));
    if (isIconName(e?.icon)) return;
    if (!e?.item_id) return;
    resolveIconName(e.item_id, e.icon).then((name) => {
      if (cancelled || !name) return;
      setSrc(iconUrl(name));
      setFallbacks(iconUrlCandidates(name).slice(1));
    });
    return () => {
      cancelled = true;
    };
  }, [e?.icon, e?.item_id]);

  return (
    <div className="armory-icon">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(ev) => {
            const next = fallbacks[0];
            if (next) {
              setFallbacks((f) => f.slice(1));
              setSrc(next);
              return;
            }
            (ev.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="armory-icon-ph" />
      )}
    </div>
  );
}

const QUALITY_LABEL = [
  "粗糙",
  "普通",
  "优秀",
  "精良",
  "史诗",
  "传说",
  "神器",
  "传家宝",
];

function EquipTooltip({ slot, e }: { slot: string; e: EquipItem }) {
  const q = e.quality ?? 1;
  const color = qualityColor(q);
  const tm = transmogText(e.transmog);
  const lines = e.tooltip_lines || [];
  return (
    <div className="item-tip-panel">
      {!lines.length ? (
        <div className="item-tip-name" style={{ color }}>
          {e.name || "未知物品"}
        </div>
      ) : null}
      {lines.length
        ? lines.map((ln, i) => {
            const c = ln.color;
            const style =
              c && c.r != null
                ? { color: `rgb(${c.r},${c.g ?? 0},${c.b ?? 0})` }
                : undefined;
            const left = ln.left || "";
            const right = ln.right || "";
            if (!left && !right) {
              return <div key={i} className="item-tip-blank" />;
            }
            if (right) {
              return (
                <div key={i} className="item-tip-row" style={style}>
                  <span dangerouslySetInnerHTML={{ __html: wowTextToHtml(left) }} />
                  <span dangerouslySetInnerHTML={{ __html: wowTextToHtml(right) }} />
                </div>
              );
            }
            return (
              <div
                key={i}
                className="item-tip-line"
                style={style}
                dangerouslySetInnerHTML={{ __html: wowTextToHtml(left) }}
              />
            );
          })
        : (
          <>
            <div className="item-tip-line">
              {SLOT_LABEL[slot] || slot}
              {e.item_level != null ? ` · 物品等级 ${e.item_level}` : ""}
            </div>
            {e.quality != null ? (
              <div className="item-tip-line" style={{ color }}>
                {QUALITY_LABEL[e.quality] || `品质 ${e.quality}`}
              </div>
            ) : null}
            {e.desc ? (
              <div
                className="item-tip-line"
                dangerouslySetInnerHTML={{ __html: wowTextToHtml(e.desc) }}
              />
            ) : null}
            <div className="item-tip-line muted">
              （请升级插件并重新快照以获取完整属性）
            </div>
          </>
        )}
      {e.item_id != null ? (
        <div className="item-tip-id muted">物品ID {e.item_id}</div>
      ) : null}
      {tm ? (
        <div
          className="item-tip-tm"
          dangerouslySetInnerHTML={{ __html: `外观：${wowTextToHtml(tm)}` }}
        />
      ) : null}
    </div>
  );
}

function SlotRow({
  slot,
  e,
  side,
}: {
  slot: string;
  e?: EquipItem;
  side: "left" | "right" | "weapon";
}) {
  const empty = !e?.name && !e?.item_id;
  const border = qualityColor(e?.quality);
  const tm = transmogText(e?.transmog);
  const meta = (
    <div className="armory-meta">
      <div className="armory-slot">{SLOT_LABEL[slot] || slot}</div>
      <div
        className="armory-name"
        style={{ color: empty ? undefined : border }}
      >
        {empty ? "空" : e?.name || "-"}
        {e?.item_level != null ? (
          <span className="muted"> {e.item_level}</span>
        ) : null}
      </div>
      {e?.desc ? <div className="armory-desc muted">{e.desc}</div> : null}
      {tm ? <div className="armory-tm muted">→ {tm}</div> : null}
    </div>
  );
  const icon = <SlotIcon e={e} />;
  return (
    <div
      className={
        "armory-item" +
        (empty ? " empty" : "") +
        (!empty ? " has-tip" : "") +
        (side === "left" ? " side-left" : "") +
        (side === "weapon" ? " side-weapon" : "")
      }
      style={{ ["--q" as string]: border }}
    >
      {side === "left" ? (
        <>
          {meta}
          {icon}
        </>
      ) : (
        <>
          {icon}
          {meta}
        </>
      )}
      {!empty && e ? <EquipTooltip slot={slot} e={e} /> : null}
    </div>
  );
}

export default function ArmoryEquip({
  equipment,
  character,
}: {
  equipment: EquipItem[];
  character?: CharSummary | null;
}) {
  const bySlot = indexBySlot(equipment || []);
  const hasAny = (equipment || []).some((e) => e.name || e.item_id);
  if (!hasAny && !(equipment || []).length) {
    return <p className="muted">无装备数据</p>;
  }
  const c = character || {};
  return (
    <div className="paperdoll">
      <div className="armory-col">
        {ARMORY_LEFT.map((slot) => (
          <SlotRow key={slot} slot={slot} e={bySlot.get(slot)} side="left" />
        ))}
      </div>
      <div className="paperdoll-center">
        <div className="paperdoll-figure">
          <div className="paperdoll-silhouette" aria-hidden>
            <img className="paperdoll-art" src="/paperdoll-figure.jpg" alt="" />
          </div>
          <div className="paperdoll-info">
            <div className="paperdoll-name">
              {c.name || "角色"}
              {c.realm ? (
                <span className="muted"> - {c.realm}</span>
              ) : null}
            </div>
            <div className="muted">
              {[c.race, c.class, c.spec].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="paperdoll-stats">
              {c.level != null ? <span>Lv{c.level}</span> : null}
              {c.item_level != null ? <span>ilvl {c.item_level}</span> : null}
            </div>
          </div>
        </div>
        <div className="paperdoll-weapons">
          {ARMORY_WEAPONS.map((slot) => (
            <SlotRow
              key={slot}
              slot={slot}
              e={bySlot.get(slot)}
              side="weapon"
            />
          ))}
        </div>
      </div>
      <div className="armory-col">
        {ARMORY_RIGHT.map((slot) => (
          <SlotRow key={slot} slot={slot} e={bySlot.get(slot)} side="right" />
        ))}
      </div>
    </div>
  );
}
