import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import GuildPanel from "../components/GuildPanel";
import LogPanel from "../components/LogPanel";
import SnapshotView from "../components/SnapshotView";
import { bindHomeRefresh } from "../homeRefresh";
import { iconStats, resetIconSession, whenIconsIdle } from "../icons";
import { pushLog } from "../log";
import { api } from "../tauri";
import type { SnapshotPayload } from "../types";

export default function HomePage() {
  const [snap, setSnap] = useState<SnapshotPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const started = useRef(0);

  const refreshSnapshot = useCallback(async () => {
    const t0 = performance.now();
    started.current = t0;
    // 已有数据时不退回 loading，避免刷新失败/卡住时整页空白
    setStatus((s) => (s === "ready" ? s : "loading"));
    pushLog("info", "刷新开始…");
    resetIconSession();
    const data = await Promise.race([
      api.getLocalSnapshot(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("读取快照超时（30s），请再点刷新")), 30_000)
      ),
    ]);
    pushLog(
      "info",
      `invoke 返回 keys=${data ? Object.keys(data as object).join(",") : "(null)"}`
    );
    const payload = (data && data.payload) || (data as unknown as SnapshotPayload) || {};
    const equip = payload.equipment || [];
    const withFid = equip.filter((e) => Number(e.icon_file_id) > 0).length;
    pushLog(
      "info",
      `快照已读 ${Math.round(performance.now() - t0)}ms · 装备 ${equip.length} · 有fileId ${withFid} · 插件 ${payload.addon_version || "?"}`
    );
    const sample = equip[0];
    pushLog(
      "info",
      `首件字段: ${sample ? Object.keys(sample).join(",") : "(无)"} fileId=${sample?.icon_file_id ?? "?"}`
    );
    if (!equip.length && !payload.character) {
      pushLog("warn", "快照 payload 为空，请检查 SavedVariables /wga");
    }
    setSnap(payload);
    setError("");
    setStatus("ready");
    setEpoch((n) => n + 1);
    pushLog("info", "纸娃娃已渲染 · 图标队列已挂起");
  }, []);

  useEffect(() => {
    if (!epoch) return;
    const t0 = started.current;
    let cancel = false;
    whenIconsIdle().then(() => {
      if (cancel) return;
      const s = iconStats();
      pushLog(
        "info",
        `图标完成 ok=${s.ok} fail=${s.fail} skip=${s.skip} · 总耗时 ${Math.round(performance.now() - t0)}ms`
      );
    });
    return () => {
      cancel = true;
    };
  }, [epoch]);

  useEffect(() => {
    refreshSnapshot().catch((e) => {
      setStatus((s) => (s === "ready" ? s : "error"));
      setError(String(e));
      pushLog("error", "刷新失败: " + String(e));
    });
  }, [refreshSnapshot]);

  useEffect(() => {
    bindHomeRefresh(async (path) => {
      try {
        await refreshSnapshot();
      } catch (e) {
        setStatus((s) => (s === "ready" ? s : "error"));
        setError(String(e));
        pushLog("error", "刷新失败: " + String(e));
        return;
      }
      try {
        await api.uploadPath(path);
      } catch (err) {
        pushLog("error", String(err));
      }
    });
    return () => bindHomeRefresh(null);
  }, [refreshSnapshot]);

  async function onRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      await refreshSnapshot();
    } catch (e) {
      setStatus((s) => (s === "ready" ? s : "error"));
      setError(String(e));
      pushLog("error", "刷新失败: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload() {
    try {
      await api.uploadNow();
      await refreshSnapshot();
    } catch (e) {
      pushLog("error", String(e));
    }
  }

  return (
    <>
      <p className="disclaimer">监听本地快照并上传到自建 API</p>
      <GuildPanel snap={snap} />
      <section className="card">
        <div className="row between">
          <h2>本地快照</h2>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" disabled={busy} onClick={() => void onRefresh()}>
              {busy ? "刷新中…" : "刷新"}
            </Button>
            <Button variant="contained" onClick={() => void onUpload()}>
              上传
            </Button>
          </Stack>
        </div>
        <p className="hint">
          读取插件 SavedVariables。插件无法直接写任意文件；手动 /wga 默认会自动 Reload
          落盘（可用 /wga flush off 关闭）。
        </p>
        {status === "loading" && !snap ? (
          <div className="muted">正在读取本地快照…</div>
        ) : null}
        {status === "error" && !snap ? (
          <div className="error">{error || "读取失败"}</div>
        ) : null}
        {snap ? (
          <SnapshotView payload={snap} epoch={epoch} />
        ) : status === "ready" ? (
          <div className="muted">暂无快照数据（请在游戏内 /wga 后点刷新）</div>
        ) : null}
      </section>
      <LogPanel />
    </>
  );
}
