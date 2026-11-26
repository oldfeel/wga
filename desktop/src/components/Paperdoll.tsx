import { useEffect, useState, type CSSProperties } from "react";
import {
  ARMORY_LEFT,
  ARMORY_RIGHT,
  ARMORY_WEAPONS,
  RichTooltip,
  SLOT_LABEL,
  buildEquipTipHtml,
  indexBySlot,
  qualityColor,
  transmogText,
  type EquipItem,
} from "@wga/ui";
import { text } from "../format";
import { fileIdOf, noteIconSkip } from "../icons";
import { pushLog } from "../log";
import type { SnapCharacter, SnapEquipItem } from "../types";
import { useFileIcon, useIconGeneration } from "../useFileIcon";

function ArmoryIcon({ fileId }: { fileId: number }) {
  const src = useFileIcon(fileId);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const show = !!src && !broken;
  return (
    <div className="armory-icon">
      {show ? (
        <img
          alt=""
          decoding="async"
          src={src}
          onError={() => {
            pushLog("warn", "图标 img.onerror");
            setBroken(true);
          }}
        />
      ) : (
        <span className="armory-icon-ph" />
      )}
    </div>
  );
}

function ArmorySlot({
  slot,
  item,
  side,
}: {
  slot: string;
  item?: SnapEquipItem;
  side: "left" | "right" | "weapon";
}) {
  const empty = !item?.name && !item?.item_id;
  const border = qualityColor(item?.quality);
  const tm = transmogText(item?.transmog);
  const fileId = fileIdOf(item);
  const gen = useIconGeneration();
  const skipKey =
    item && !(fileId > 0) && (item.item_id || item.name)
      ? `${item.slot}|${item.item_id}|${Object.keys(item).join(",")}`
      : "";

  useEffect(() => {
    if (!skipKey || !item) return;
    noteIconSkip(item.slot || "?", item.item_id, Object.keys(item).join(","));
  }, [skipKey, gen, item]);

  const tip = !empty && item ? buildEquipTipHtml(item as EquipItem, slot) : "";
  const meta = (
    <div className="armory-meta">
      <div className="armory-slot">{SLOT_LABEL[slot] || slot}</div>
      <div className="armory-name" style={{ color: empty ? "var(--muted)" : border }}>
        {empty ? "空" : text(item?.name)}
        {item?.item_level != null ? <span className="muted"> {item.item_level}</span> : null}
      </div>
      {item?.desc ? <div className="armory-desc muted">{text(item.desc)}</div> : null}
      {tm ? <div className="armory-tm muted">→ {tm}</div> : null}
    </div>
  );
  const icon = <ArmoryIcon fileId={fileId} />;
  const row = (
    <div
      className={
        "armory-item" +
        (empty ? " empty" : "") +
        (side === "left" ? " side-left" : "") +
        (side === "weapon" ? " side-weapon" : "") +
        (tip ? " has-tip" : "")
      }
      style={{ "--q": border } as CSSProperties}
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
  if (!tip) return row;
  return (
    <RichTooltip html={tip}>
      {row}
    </RichTooltip>
  );
}

export default function Paperdoll({
  items,
  character,
}: {
  items: SnapEquipItem[];
  character?: SnapCharacter;
}) {
  const list = items || [];
  const bySlot = indexBySlot(list);
  const ch = character || {};

  useEffect(() => {
    const withFid = list.filter((e) => fileIdOf(e) > 0).length;
    pushLog(
      "info",
      `纸娃娃挂载 · 物品 ${list.length} · fileId ${withFid} · 角色 ${ch.name || "?"}`
    );
  }, [list, ch.name]);

  const col = (slots: readonly string[], side: "left" | "right") => (
    <div className="armory-col">
      {slots.map((slot) => (
        <ArmorySlot key={slot} slot={slot} item={bySlot.get(slot)} side={side} />
      ))}
    </div>
  );
  return (
    <div className="paperdoll">
      {col(ARMORY_LEFT, "left")}
      <div className="paperdoll-center">
        <div className="paperdoll-figure">
          <div className="paperdoll-silhouette" aria-hidden="true">
            <img className="paperdoll-art" src="/paperdoll-figure.jpg" alt="" />
          </div>
          <div className="paperdoll-info">
            <div className="paperdoll-name">
              {text(ch.name, "角色")}
              {ch.realm ? <span className="muted"> - {text(ch.realm)}</span> : null}
            </div>
            <div className="muted">
              {[ch.race, ch.class, ch.spec].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="paperdoll-stats">
              {ch.level != null ? <span>Lv{ch.level}</span> : null}
              {ch.item_level != null ? <span>ilvl {ch.item_level}</span> : null}
            </div>
          </div>
        </div>
        <div className="paperdoll-weapons">
          {ARMORY_WEAPONS.map((slot) => (
            <ArmorySlot key={slot} slot={slot} item={bySlot.get(slot)} side="weapon" />
          ))}
        </div>
      </div>
      {col(ARMORY_RIGHT, "right")}
    </div>
  );
}
