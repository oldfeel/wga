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
          <div className="paperdoll-silhouette" aria-hidden />
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
