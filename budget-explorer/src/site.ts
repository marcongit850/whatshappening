import { Hono, type Context } from "hono";
import { formCookie, readCookie, readSession, SESSION_COOKIE } from "./auth";
import {
  isDashboardPath,
  isTaxesHost,
  prefixHtml,
  prefixLocation,
  prefixPath,
  robotsTxt,
  sitemapXml,
  WALTON_PREFIX,
} from "./host";
import type { AppEnv } from "./env";
import { handleReport } from "./intake";
import { loadHomeHighlights } from "./home-data";
import { stateBySlug } from "./places";
import { applyPublicHeaders, publicHtml, publicRedirect } from "./public-http";
import { safeRedirectLocation, unsafeRequestPath } from "./redirect-path";
import { renderAboutSite, renderPublicHome, renderPublicMissing, renderWaltonLanding } from "./public-page";

type DashboardApp = {
  fetch: (request: Request, env: AppEnv) => Response | Promise<Response>;
};

export function createSite(dashboard: DashboardApp): Hono<{ Bindings: AppEnv }> {
  const site = new Hono<{ Bindings: AppEnv }>();

  site.all("*", async (c) => {
    const hostname = new URL(c.req.url).hostname;
    if (!isTaxesHost(hostname)) return dashboard.fetch(c.req.raw, c.env);
    return taxesRequest(c, dashboard);
  });

  return site;
}

async function taxesRequest(c: Context<{ Bindings: AppEnv }>, dashboard: DashboardApp): Promise<Response> {
  const url = new URL(c.req.url);
  const pathname = url.pathname;
  if (unsafeRequestPath(pathname)) return notFoundFor(c.req.method);
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const bare = pathname.slice(0, -1);
    const target = taxesTarget(bare);
    if (!target) return notFoundFor(c.req.method);
    return redirect(`${target}${url.search}`, 301);
  }

  if (pathname === "/robots.txt") return text(robotsTxt(), "text/plain; charset=utf-8");
  if (pathname === "/sitemap.xml") return text(sitemapXml(), "application/xml; charset=utf-8");
  if (pathname === "/report" || pathname === `${WALTON_PREFIX}/report`) return handleReport(c.req.raw, c.env, pathname);
  if (pathname === "/about-this-site") {
    if (c.req.method === "GET" || c.req.method === "HEAD") return html(renderAboutSite(), 200, true);
    return text("Not found", "text/plain; charset=utf-8", 404, false);
  }
  if (pathname === "/florida/walton") return redirect(WALTON_PREFIX, 301);
  if (retiredPublicPath(pathname)) return redirect("/", 301);
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    if (pathname === "/") {
      const highlights = await loadHomeHighlights(c.env.DB);
      return html(renderPublicHome(highlights), 200, true);
    }
    if (pathname === WALTON_PREFIX) {
      const session = await readSession(c.env.SESSION_SECRET || "", readCookie(c.req.header("cookie"), SESSION_COOKIE));
      if (!session) return waltonLanding();
    }
  }

  if (pathname === WALTON_PREFIX || pathname.startsWith(`${WALTON_PREFIX}/`)) {
    const inner = pathname === WALTON_PREFIX ? "/" : pathname.slice(WALTON_PREFIX.length) || "/";
    return forward(c, dashboard, inner);
  }
  if (pathname === "/favicon.svg" || pathname.startsWith("/assets/")) return forward(c, dashboard, pathname);
  if (isDashboardPath(pathname)) {
    if (c.req.method === "GET" || c.req.method === "HEAD") {
      return redirect(`${prefixPath(pathname)}${url.search}`, 301);
    }
    return forward(c, dashboard, pathname);
  }
  return notFoundFor(c.req.method);
}




function taxesTarget(pathname: string): string | null {
  if (unsafeRequestPath(pathname)) return null;
  if (pathname === WALTON_PREFIX || pathname.startsWith(`${WALTON_PREFIX}/`)) return pathname;
  if (pathname === "/florida/walton") return WALTON_PREFIX;
  if (retiredPublicPath(pathname)) return "/";
  if (isDashboardPath(pathname)) return prefixPath(pathname);
  return pathname;
}

/** Former state, picker, and request-your-county paths. /walton is not included. */
function retiredPublicPath(pathname: string): boolean {
  if (pathname === "/pick" || pathname === "/request") return true;
  if (pathname.startsWith("/data/counties/") && pathname.endsWith(".json")) return true;
  if (pathname.startsWith("/states/")) return true;
  const match = /^\/([a-z-]+)(?:\/[a-z0-9-]+)?$/.exec(pathname);
  if (!match) return false;
  if (match[1] === WALTON_PREFIX.slice(1)) return false;
  return Boolean(stateBySlug(match[1]));
}

function notFoundFor(method: string): Response {
  if (method === "GET" || method === "HEAD") return html(renderPublicMissing(), 404, false);
  return text("Not found", "text/plain; charset=utf-8", 404, false);
}

function waltonLanding(): Response {
  const token = crypto.randomUUID().replace(/-/g, "");
  const response = html(renderWaltonLanding(token), 200, true);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.append("Set-Cookie", formCookie(token));
  return response;
}

async function forward(c: Context<{ Bindings: AppEnv }>, dashboard: DashboardApp, pathname: string): Promise<Response> {
  const url = new URL(c.req.url);
  url.pathname = pathname;
  const headers = new Headers(c.req.raw.headers);
  const method = c.req.method;
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = c.req.raw.body;
    init.duplex = "half";
  }
  const response = await dashboard.fetch(new Request(url.toString(), init), c.env);
  return rewriteDashboard(response);
}

async function rewriteDashboard(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  const location = headers.get("Location");
  if (location) {
    const nextLocation = location.startsWith("/") || location.startsWith("\\") ? prefixLocation(location) : safeRedirectLocation(location);
    headers.set("Location", nextLocation);
  }
  const type = headers.get("content-type") || "";
  if (!type.includes("text/html")) return new Response(response.body, { status: response.status, headers });
  const htmlBody = prefixHtml(await response.text());
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(htmlBody, { status: response.status, headers });
}

function redirect(location: string, status: 301 | 303): Response {
  return publicRedirect(location, status);
}

function html(body: string, status: number, index: boolean): Response {
  return publicHtml(body, status, index);
}

function text(body: string, type: string, status = 200, index = true): Response {
  const headers = new Headers();
  applyPublicHeaders(headers, index);
  headers.set("Content-Type", type);
  headers.set("Cache-Control", index ? "public, max-age=300" : "private, no-store");
  return new Response(body, { status, headers });
}
