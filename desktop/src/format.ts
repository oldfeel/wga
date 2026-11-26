export function text(v: unknown, fallback = "-") {
  if (v == null || v === "") return fallback;
  return String(v);
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
