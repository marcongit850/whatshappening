import { safeRedirectLocation, unsafeRequestPath } from "./redirect-path";

/** Apex host used in canonical URLs, Open Graph, and the sitemap. */
export const CANONICAL_ORIGIN = "https://howtheyspendmytaxes.com";

export const TAXES_HOSTS = new Set(["howtheyspendmytaxes.com", "www.howtheyspendmytaxes.com"]);

export const WALTON_PREFIX = "/walton";

/** Shared files stay at the host root so both the public door and the dashboard can load them. */
const SHARED_FILES = [/^\/assets\//, /^\/favicon\.svg$/];

/**
 * Password-protected routes. `/` is not included: on the taxes host `/` is the public homepage.
 * `PUBLIC_PATHS` is checked in tests so a new nav item is not left off this list.
 */
export const DASHBOARD_PREFIXES = [
  "/revenue",
  "/reserves",
  "/funds",
  "/departments",
  "/search",
  "/ask",
  "/plat",
  "/sheriff",
  "/about",
  "/login",
  "/logout",
  "/admin",
] as const;

export function isTaxesHost(hostname: string): boolean {
  return TAXES_HOSTS.has(hostname.toLowerCase().replace(/\.$/, ""));
}

export function canonicalUrl(pathname: string): string {
  if (!pathname || pathname === "/") return `${CANONICAL_ORIGIN}/`;
  return `${CANONICAL_ORIGIN}${pathname}`;
}

export function isDashboardPath(pathname: string): boolean {
  return DASHBOARD_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}.`));
}

function isSharedFile(pathname: string): boolean {
  return SHARED_FILES.some((pattern) => pattern.test(pathname));
}

/** Prefix a root-relative path. Leaves shared files, hashes, and already prefixed paths alone. */
export function prefixPath(path: string, base = WALTON_PREFIX): string {
  if (!base || !path.startsWith("/") || path.startsWith("//")) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const queryAt = beforeHash.indexOf("?");
  const query = queryAt >= 0 ? beforeHash.slice(queryAt) : "";
  const pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  if (isSharedFile(pathname) || pathname === base || pathname.startsWith(`${base}/`)) return path;
  if (pathname === "/") return `${base}${query}${hash}`;
  return `${base}${pathname}${query}${hash}`;
}

const ATTR = /(\s(?:href|action|src)=["'])(\/[^"']*)/g;

/** Rewrite root-relative links in dashboard HTML so they stay under `/walton`. */
export function prefixHtml(html: string, base = WALTON_PREFIX): string {
  if (!base) return html;
  return html.replace(ATTR, (_match, attr: string, path: string) => `${attr}${prefixPath(path, base)}`);
}

/** Rewrite a root-relative Location, including a `next` path inside the query string. */
export function prefixLocation(location: string, base = WALTON_PREFIX): string {
  const pathPart = location.split("?")[0] || "";
  if (!base || unsafeRequestPath(pathPart) || location.includes("\\") || !location.startsWith("/") || location.startsWith("//")) {
    return base || "/";
  }
  const url = new URL(location, CANONICAL_ORIGIN);
  const next = url.searchParams.get("next");
  if (next) {
    if (unsafeRequestPath(next) || next.includes("\\") || !next.startsWith("/") || next.startsWith("//")) {
      url.searchParams.set("next", prefixPath("/", base));
    } else {
      url.searchParams.set("next", prefixPath(next, base));
    }
  }
  url.pathname = prefixPath(url.pathname, base).split(/[?#]/)[0];
  return safeRedirectLocation(`${url.pathname}${url.search}`);
}

export const SITEMAP_PATHS = ["/", "/florida", "/walton"] as const;

export function robotsTxt(): string {
  const lines = [
    "User-agent: *",
    "Allow: /walton$",
    "Disallow: /walton/",
    "Disallow: /login",
    "Disallow: /logout",
    "Disallow: /admin",
    "Disallow: /states/",
    "Disallow: /florida/",
    "Disallow: /report",
  ];
  for (const prefix of DASHBOARD_PREFIXES) {
    if (prefix === "/login" || prefix === "/logout" || prefix === "/admin") continue;
    lines.push(`Disallow: ${prefix}`);
  }
  lines.push(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

export function sitemapXml(): string {
  const urls = SITEMAP_PATHS.map((path) => `  <url><loc>${canonicalUrl(path)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
