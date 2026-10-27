import { unsafeRequestPath } from "./redirect-path";

const CONTROL = /[\u0000-\u001F\u007F]/;

/** Path-only redirect target on this origin. Anything else becomes the home page. */
export function safeNext(value: string, origin: string): string {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return "/";
  if (trimmed.includes("\\") || CONTROL.test(trimmed)) return "/";
  const pathShaped = trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.includes("%");
  if (pathShaped && unsafeRequestPath(trimmed.startsWith("/") || trimmed.startsWith("\\") ? trimmed : `/${trimmed}`)) return "/";
  let decoded = trimmed;
  for (let pass = 0; pass < 3; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return "/";
    }
    if (next === decoded) break;
    decoded = next;
    if (decoded.includes("\\") || CONTROL.test(decoded) || decoded.startsWith("//") || decoded.startsWith("/\\")) return "/";
  }
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
  if (unsafeRequestPath(url.pathname)) return "/";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  if (path === "/login" || path.startsWith("/login?") || path.startsWith("/login/")) return "/";
  return path;
}
