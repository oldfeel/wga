import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getIconGeneration,
  peekIcon,
  requestIcon,
  subscribeIconGeneration,
} from "./icons";

export function useIconGeneration() {
  return useSyncExternalStore(
    subscribeIconGeneration,
    getIconGeneration,
    getIconGeneration
  );
}

export function useFileIcon(fileId?: number | null) {
  const id = fileId && Number.isFinite(fileId) && fileId > 0 ? fileId : 0;
  const gen = useIconGeneration();
  const [src, setSrc] = useState<string | null>(() => (id ? peekIcon(id) : null));

  useEffect(() => {
    if (!id) {
      setSrc(null);
      return;
    }
    const cached = peekIcon(id);
    if (cached) setSrc(cached);
    return requestIcon(id, setSrc);
  }, [id, gen]);

  return src;
}
