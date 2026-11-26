type RefreshFn = (path: string) => Promise<void>;

let current: RefreshFn | null = null;

export function bindHomeRefresh(fn: RefreshFn | null) {
  current = fn;
}

export function homeRefreshBound() {
  return current != null;
}

export function runHomeRefresh(path: string) {
  return current?.(path);
}
