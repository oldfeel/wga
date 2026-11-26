import { pushLog } from "./log";
import { api } from "./tauri";

const cache = new Map<string, string>();
const pending = new Map<string, Array<(url: string) => void>>();
let queue: Promise<void> = Promise.resolve();
let stats = { ok: 0, fail: 0, skip: 0 };
let generation = 0;
const genListeners = new Set<() => void>();

export function resetIconSession() {
  stats = { ok: 0, fail: 0, skip: 0 };
  queue = Promise.resolve();
  generation += 1;
  genListeners.forEach((fn) => fn());
}

export function getIconGeneration() {
  return generation;
}

export function subscribeIconGeneration(fn: () => void) {
  genListeners.add(fn);
  return () => {
    genListeners.delete(fn);
  };
}

export function iconStats() {
  return stats;
}

export function whenIconsIdle() {
  return queue.catch(() => undefined);
}

export function peekIcon(fileId: number) {
  return cache.get(String(fileId)) ?? null;
}

export function noteIconSkip(slot: string, itemId: number | undefined, keys: string) {
  stats.skip += 1;
  pushLog(
    "warn",
    `装备 ${slot} 无 icon_file_id (item=${itemId ?? "?"}) keys=${keys}`
  );
}

export function fileIdOf(e?: { icon_file_id?: number; iconFileId?: number } | null) {
  const raw = e?.icon_file_id ?? e?.iconFileId;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function b64ToImgSrc(b64: string) {
  return `data:image/png;base64,${b64}`;
}

/** 串行解析同一队列；同一 fileId 合并回调 */
export function requestIcon(fileId: number, apply: (url: string) => void) {
  const key = String(fileId);
  const cached = cache.get(key);
  if (cached) {
    stats.ok += 1;
    apply(cached);
    return () => {};
  }
  let list = pending.get(key);
  const first = !list;
  if (!list) {
    list = [];
    pending.set(key, list);
  }
  list.push(apply);
  if (first) {
    const waiters = list;
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        const t0 = performance.now();
        pushLog("info", `图标请求 #${fileId}…`);
        const hit = await api.resolveEquipIcon(fileId);
        const listeners = pending.get(key) || waiters;
        pending.delete(key);
        if (!hit?.b64) {
          stats.fail += 1;
          pushLog(
            "warn",
            `图标 #${fileId} 空结果 (${Math.round(performance.now() - t0)}ms)`
          );
          return;
        }
        const url = b64ToImgSrc(hit.b64);
        cache.set(key, url);
        stats.ok += Math.max(listeners.length, 1);
        pushLog(
          "info",
          `图标 #${fileId} ← ${hit.source || "?"} rust=${hit.ms ?? "?"}ms ui=${Math.round(performance.now() - t0)}ms`
        );
        for (const fn of listeners) fn(url);
      })
      .catch((err) => {
        stats.fail += 1;
        pending.delete(key);
        pushLog("warn", `图标 #${fileId} 异常: ${String(err)}`);
      });
  }
  return () => {
    const ls = pending.get(key);
    if (!ls) return;
    const i = ls.indexOf(apply);
    if (i >= 0) ls.splice(i, 1);
  };
}
