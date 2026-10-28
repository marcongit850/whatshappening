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
import { countiesIn, countyChoices, stateBySlug } from "./places";
import { applyPublicHeaders, publicHtml, publicJson, publicRedirect } from "./public-http";
import { safeRedirectLocation, unsafeRequestPath } from "./redirect-path";
import { renderAboutSite, renderPublicHome, renderPublicMissing, renderRequestStart, renderStatePage, renderWaltonLanding } from "./public-page";

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
  if (pathname === "/pick") return pickResponse(c);
  const dataMatch = /^\/data\/counties\/([a-z-]+)\.json$/.exec(pathname);
  if (dataMatch) return countyData(c, dataMatch[1]);
  if (pathname === "/about-this-site") {
    if (c.req.method === "GET" || c.req.method === "HEAD") return html(renderAboutSite(), 200, true);
    return text("Not found", "text/plain; charset=utf-8", 404, false);
  }
  if (pathname === "/request") {
    if (c.req.method === "GET" || c.req.method === "HEAD") return html(renderRequestStart(), 200, false);
    return text("Not found", "text/plain; charset=utf-8", 404, false);
  }
  const requestSlug = requestStateSlug(pathname);
  if (requestSlug) {
    const state = stateBySlug(requestSlug);
    if (!state) return html(renderPublicMissing(), 404, false);
    return handleCountyForm(c.req.raw, c.env, { action: pathname, state, county: null });
  }
  const stateAlias = /^\/states\/([a-z-]+)$/.exec(pathname);
  if (stateAlias) {
    const state = stateBySlug(stateAlias[1]);
    if (!state) return c.req.method === "GET" || c.req.method === "HEAD" ? html(renderPublicMissing(), 404, false) : text("Not found", "text/plain; charset=utf-8", 404, false);
    if (c.req.method === "GET" || c.req.method === "HEAD") return redirect(`/${state.slug}`, 301);
  }
  const bareState = /^\/([a-z-]+)$/.exec(pathname);
  if (bareState) {
    const state = stateBySlug(bareState[1]);
    if (state && countiesIn(state.slug).length === 0) {
      return handleCountyForm(c.req.raw, c.env, { action: pathname, state, county: null });
    }
  }
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    if (pathname === "/") return html(renderPublicHome(), 200, true);
    if (pathname === WALTON_PREFIX) {
      const session = await readSession(c.env.SESSION_SECRET || "", readCookie(c.req.header("cookie"), SESSION_COOKIE));
      if (!session) return waltonLanding();
    }
    const stateSlug = pathname.startsWith("/") && !pathname.slice(1).includes("/") ? pathname.slice(1) : "";
    const state = stateSlug ? stateBySlug(stateSlug) : undefined;
    if (state) return html(renderStatePage(state), 200, true);
  }

  const countyMatch = /^\/([a-z-]+)\/([a-z0-9-]+)$/.exec(pathname);
  if (countyMatch && !pathname.startsWith(`${WALTON_PREFIX}/`) && pathname !== WALTON_PREFIX) {
    const state = stateBySlug(countyMatch[1]);
    if (state?.slug === "florida") {
      if (countyMatch[2] === "walton") return redirect("/walton", 301);
      return redirect("/florida/request", 301);
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

function requestStateSlug(pathname: string): string | null {
  const legacy = /^\/states\/([a-z-]+)\/request$/.exec(pathname);
  if (legacy) return legacy[1];
  const direct = /^\/([a-z-]+)\/request$/.exec(pathname);
  if (!direct || direct[1] === WALTON_PREFIX.slice(1) || direct[1] === "states") return null;
  return stateBySlug(direct[1]) ? direct[1] : null;
}

function pickResponse(c: Context<{ Bindings: AppEnv }>): Response {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return text("Not found", "text/plain; charset=utf-8", 404, false);
  const url = new URL(c.req.url);
  const state = stateBySlug((url.searchParams.get("state") || "").toLowerCase());
  if (!state) return redirect("/", 303);
  if (url.searchParams.get("to") === "request") return redirect(`/${state.slug}/request`, 303);
  const countySlug = (url.searchParams.get("county") || "").toLowerCase();
  if (state.slug === "florida" && /^[a-z0-9-]+$/.test(countySlug)) {
    if (countySlug === "walton") return redirect("/walton", 303);
    if (countySlug === "request") return redirect("/florida/request", 303);
  }
  return redirect(`/${state.slug}`, 303);
}

function countyData(c: Context<{ Bindings: AppEnv }>, slug: string): Response {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return text("Not found", "text/plain; charset=utf-8", 404, false);
  const state = stateBySlug(slug);
  if (!state) return text("Not found", "text/plain; charset=utf-8", 404, false);
  return publicJson(JSON.stringify(countyChoices(state.slug)));
}

function taxesTarget(pathname: string): string | null {
  if (unsafeRequestPath(pathname)) return null;
  if (pathname === WALTON_PREFIX || pathname.startsWith(`${WALTON_PREFIX}/`)) return pathname;
  if (isDashboardPath(pathname)) return prefixPath(pathname);
  return pathname;
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
