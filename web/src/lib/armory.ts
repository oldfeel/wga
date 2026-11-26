/** Web 侧：共享 armory + 本地图标缓存 / Wowhead 解析 */
export * from "@wga/ui";
import itemIconCache from "./item-icon-cache.json";
import { isIconName } from "@wga/ui";

const iconNameCache = new Map<number, string | null>();
const iconNamePending = new Map<number, Promise<string | null>>();

function cachedIconName(itemId?: number | null): string | null {
  if (!itemId) return null;
  return (itemIconCache as Record<string, string>)[String(itemId)] || null;
}

/** 本地缓存优先，再用 Wowhead */
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
