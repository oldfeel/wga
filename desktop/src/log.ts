import type { LogRow } from "./types";

let logs: LogRow[] = [];
const listeners = new Set<() => void>();

export function pushLog(level: string, message: string) {
  logs = [{ level, message, at: new Date().toISOString() }, ...logs].slice(0, 120);
  listeners.forEach((fn) => fn());
}

export function getLogs() {
  return logs;
}

export function subscribeLogs(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
