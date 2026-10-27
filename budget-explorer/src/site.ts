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
import { handleCountyForm, handleReport } from "./intake";
import { countyByPath, stateBySlug } from "./places";
import { applyPublicHeaders, publicHtml, publicRedirect } from "./public-http";
import { renderComingSoon, renderFlorida, renderPublicHome, renderPublicMissing, renderWaltonLanding } from "./public-page";

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
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const bare = pathname.slice(0, -1);
    return redirect(taxesTarget(bare) + url.search, 301);
  }

  if (pathname === "/robots.txt") return text(robotsTxt(), "text/plain; charset=utf-8");
  if (pathname === "/sitemap.xml") return text(sitemapXml(), "application/xml; charset=utf-8");
  if (pathname === "/report" || pathname === `${WALTON_PREFIX}/report`) return handleReport(c.req.raw, c.env, pathname);
  const stateRequest = /^\/states\/([a-z-]+)\/request$/.exec(pathname);
  if (stateRequest || pathname === "/florida/request") {
    const slug = stateRequest ? stateRequest[1] : "florida";
    const state = stateBySlug(slug);
    if (!state) return html(renderPublicMissing(), 404, false);
    return handleCountyForm(c.req.raw, c.env, { action: pathname, state, county: null });
  }
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    if (pathname === "/") return html(renderPublicHome(), 200, true);
    if (pathname === "/florida") return html(renderFlorida(), 200, true);
    const stateMatch = /^\/states\/([a-z-]+)$/.exec(pathname);
    if (stateMatch) {
      if (stateMatch[1] === "florida") return redirect("/florida", 301);
      const state = stateBySlug(stateMatch[1]);
      if (!state) return html(renderPublicMissing(), 404, false);
      return html(renderComingSoon(state), 200, false);
    }
    if (pathname === WALTON_PREFIX) {
      const session = await readSession(c.env.SESSION_SECRET || "", readCookie(c.req.header("cookie"), SESSION_COOKIE));
      if (!session) return waltonLanding();
    }
  }

  const countyMatch = /^\/([a-z-]+)\/([a-z0-9-]+)$/.exec(pathname);
  if (countyMatch && !pathname.startsWith(`${WALTON_PREFIX}/`) && pathname !== WALTON_PREFIX) {
    const state = stateBySlug(countyMatch[1]);
    const county = state ? countyByPath(state.slug, countyMatch[2]) : undefined;
    if (state && county) {
      if (county.live && county.href) return redirect(county.href, 301);
      return handleCountyForm(c.req.raw, c.env, { action: pathname, state, county });
    }
  }

  if (pathname === WALTON_PREFIX || pathname.startsWith(`${WALTON_PREFIX}/`)) {
    const inner = pathname === WALTON_PREFIX ? "/" : pathname.slice(WALTON_PREFIX.length) || "/";
    return forward(c, dashboard, inner);
  }
  if (pathname === "/favicon.svg" || pathname.startsWith("/assets/")) return forward(c, dashboard, pathname);
  if (isDashboardPath(pathname)) {
    if (c.req.method === "GET" || c.req.method === "HEAD") {
      return redirect(prefixPath(pathname) + url.search, 301);
    }
    return forward(c, dashboard, pathname);
  }
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return text("Not found", "text/plain; charset=utf-8", 404, false);
  return html(renderPublicMissing(), 404, false);
}

function taxesTarget(pathname: string): string {
  if (pathname === WALTON_PREFIX || pathname.startsWith(`${WALTON_PREFIX}/`)) return pathname;
  if (isDashboardPath(pathname)) return prefixPath(pathname);
  return pathname;
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
  if (location && location.startsWith("/")) headers.set("Location", prefixLocation(location));
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
