import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { pushLog } from "./log";
import { api } from "./tauri";
import type { PublicConfig } from "./types";

type Ctx = {
  config: PublicConfig | null;
  ready: boolean;
  refresh: () => Promise<PublicConfig | null>;
};

const ConfigContext = createContext<Ctx | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getConfig();
      setConfig(next);
      return next;
    } catch (e) {
      pushLog("error", "读取配置失败: " + String(e));
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ConfigContext.Provider value={{ config, ready, refresh }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("ConfigProvider missing");
  return ctx;
}
