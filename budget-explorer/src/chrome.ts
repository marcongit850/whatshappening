import { esc } from "./format";
import { CANONICAL_ORIGIN } from "./host";

/** Bump the version segment when a brand file changes. The cache is a year. */
const V = "v1";

export const LOGO_LIGHT = `/assets/logo-full-light.${V}.png`;
export const LOGO_DARK = `/assets/logo-full-dark.${V}.png`;
export const LOGO_ICON = `/assets/logo-icon.${V}.png`;
export const FAVICON_PNG = `/assets/favicon-32.${V}.png`;
export const APPLE_TOUCH = `/assets/apple-touch-icon.${V}.png`;
export const ICON_192 = `/assets/icon-192.${V}.png`;
export const ICON_512 = `/assets/icon-512.${V}.png`;
export const MANIFEST_PATH = `/assets/site.${V}.webmanifest`;

export const BRAND_NAME = "How They Spend My Taxes";
export const BUDGET_BOOK_URL = "https://budget-waltoncountyfl.com";
export const AUDIT_REPORT_URL = "https://www.flauditor.gov/pages/county_efile%20rpts/2025%20walton%20county.pdf";

export const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";

export const WEB_MANIFEST = JSON.stringify({
  name: BRAND_NAME,
  short_name: "Spend My Taxes",
  icons: [
    { src: ICON_192, sizes: "192x192", type: "image/png" },
    { src: ICON_512, sizes: "512x512", type: "image/png" },
    { src: APPLE_TOUCH, sizes: "180x180", type: "image/png" },
  ],
  display: "standalone",
  background_color: "#f6f4ee",
  theme_color: "#14232f",
});

export function headAssets(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONT_STYLESHEET}" rel="stylesheet">
<link rel="stylesheet" href="/assets/app.css">
<link rel="icon" href="${FAVICON_PNG}" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${APPLE_TOUCH}" sizes="180x180">
<link rel="manifest" href="${MANIFEST_PATH}">`;
}

export type ChromeMode = "public" | "dashboard";

export interface ChromeOpts {
  mode: ChromeMode;
  active: string;
  reportHref: string;
  showRequest?: boolean;
  admin?: boolean;
  csrf?: string;
  dataAsOf?: string;
}

const DASH_NAV = [
  ["overview", "/", "Overview"],
  ["vendors", "/vendors", "Vendors"],
  ["search", "/search", "Payments"],
  ["revenue", "/revenue", "Revenue"],
  ["reserves", "/reserves", "Savings"],
  ["about", "/about", "About"],
] as const;

function navLink(on: boolean, href: string, label: string): string {
  return `<a class="${on ? "on" : ""}" href="${href}">${label}</a>`;
}

/** Public pages stay on this host. Dashboard HTML uses the canonical site so prefixing does not rewrite them. */
function publicHref(mode: ChromeMode, path: string): string {
  if (mode === "public") return path;
  return `${CANONICAL_ORIGIN}${path === "/" ? "/" : path}`;
}

function primaryNav(opts: ChromeOpts): string {
  if (opts.mode === "public") {
    return [
      navLink(opts.active === "home", "/", "Home"),
      navLink(opts.active === "florida", "/florida", "Florida"),
      navLink(opts.active === "walton", "/walton", "Walton County"),
      navLink(opts.active === "request", "/request", "Request your county"),
    ].join("");
  }
  const items = DASH_NAV.map(([key, href, label]) => navLink(opts.active === key, href, label)).join("");
  const admin = opts.admin ? navLink(opts.active === "admin", "/admin", "Admin") : "";
  const logout = opts.csrf
    ? `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${esc(opts.csrf)}"><button class="linkish" type="submit">Log out</button></form>`
    : "";
  return `${items}${admin}${logout}`;
}

export function siteHeader(opts: ChromeOpts): string {
  const home = "/";
  return `<header class="site-header"><div class="header-inner">
<a class="brand" href="${home}"><img class="brand-logo" src="${LOGO_LIGHT}" alt="${esc(BRAND_NAME)}" width="140" height="40"></a>
<input class="nav-toggle" id="nav-toggle" type="checkbox" aria-label="Menu">
<label class="nav-btn" for="nav-toggle">Menu</label>
<div class="nav-scroller"><nav aria-label="Primary">${primaryNav(opts)}</nav></div>
</div></header>`;
}

export function siteFooter(opts: ChromeOpts): string {
  const home = "/";
  const request =
    opts.showRequest === false
      ? ""
      : `<nav class="footer-col" aria-label="Request your county"><p class="footer-label">Request</p><a href="${publicHref(opts.mode, "/request")}">Request your county</a></nav>`;
  const asOf = opts.dataAsOf ? `<p class="footer-asof">Data as of ${esc(opts.dataAsOf)}.</p>` : "";
  return `<footer class="site-footer"><div class="footer-inner">
<div class="footer-grid">
<div class="footer-col footer-brand">
<a class="footer-logo" href="${home}"><img src="${LOGO_DARK}" alt="${esc(BRAND_NAME)}" width="168" height="48"></a>
<p class="footer-mission">See who county taxes are paid to, and why.</p>
<p class="footer-report"><a data-report href="${esc(opts.reportHref)}">Report a problem or share an idea</a></p>
</div>
<nav class="footer-col" aria-label="Sources">
<p class="footer-label">Sources</p>
<a href="${BUDGET_BOOK_URL}">County budget book</a>
<a href="${AUDIT_REPORT_URL}">Audited financial report</a>
</nav>
${request}
</div>
<p class="footer-built">Built from public records.</p>
${asOf}
</div></footer>`;
}
