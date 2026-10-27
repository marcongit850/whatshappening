const CONTROL = /[\u0000-\u001F\u007F]/;

/** Path-only redirect target on this origin. Anything else becomes the home page. */
export function safeNext(value: string, origin: string): string {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return "/";
  if (trimmed.includes("\\") || CONTROL.test(trimmed)) return "/";
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return "/";
  }
  if (decoded.includes("\\") || CONTROL.test(decoded)) return "/";
  if (/^\s*javascript:/i.test(decoded)) return "/";
  let base: URL;
  let url: URL;
  try {
    base = new URL(origin);
    url = new URL(decoded, base);
  } catch {
    return "/";
  }
  if (url.origin !== base.origin || url.protocol !== base.protocol) return "/";
  if (url.username || url.password) return "/";
  const path = `${url.pathname}${url.search}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  if (path === "/login" || path.startsWith("/login?") || path.startsWith("/login/")) return "/";
  return path;
}
