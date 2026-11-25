import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { newSession, sha256Hex, signSession } from "../src/auth";
import { DASHBOARD_PREFIXES, isDashboardPath, isTaxesHost, prefixHtml, prefixLocation, prefixPath, robotsTxt, sitemapXml } from "../src/host";
import { INTAKE_GLOBAL_DAY_LIMIT, INTAKE_GLOBAL_HOUR_LIMIT, INTAKE_HOUR_LIMIT, intakeNetworkKey } from "../src/intake";
import { safeRedirectLocation, unsafeRequestPath } from "../src/redirect-path";
import { COUNTIES } from "../src/places";
import { US_STATES } from "../src/states";
import { PUBLIC_PATHS } from "../src/view";

const TAXES = "https://howtheyspendmytaxes.com";
const WWW = "https://www.howtheyspendmytaxes.com";
const BUDGET = "https://budget.whatshappeningnetwork.com";
const WORKERS = "https://budget-explorer.352marc.workers.dev";

function openDb(): D1Database {
  const raw = new DatabaseSync(":memory:");
  const root = join(import.meta.dirname, "..", "migrations");
  for (const name of readdirSync(root).filter((file) => file.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(join(root, name), "utf8"));
  }
  const db = {
    prepare(sql: string) {
      const stmt = raw.prepare(sql);
      let bound: unknown[] = [];
      const api = {
        bind(...args: unknown[]) {
          bound = args;
          return api;
        },
        async first<T>(): Promise<T | null> {
          return (stmt.get(...(bound as never[])) as T | undefined) ?? null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: stmt.all(...(bound as never[])) as T[] };
        },
        async run() {
          const info = stmt.run(...(bound as never[]));
          return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
        },
      };
      return api;
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  return db as unknown as D1Database;
}

function envFor(db: D1Database) {
  return {
    DB: db,
    AI: { async run() { return { response: "" }; } },
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
}

async function signed(): Promise<string> {
  const session = newSession(false);
  const token = await signSession("session-secret", session);
  return `be_session=${token}`;
}

function cookieValue(header: string | null): string {
  return (header || "").split(";")[0];
}

describe("host routing helpers", () => {
  it("recognizes only the taxes hosts and prefixes dashboard paths", () => {
    expect(isTaxesHost("howtheyspendmytaxes.com")).toBe(true);
    expect(isTaxesHost("WWW.HowTheySpendMyTaxes.com")).toBe(true);
    expect(isTaxesHost("budget.whatshappeningnetwork.com")).toBe(false);
    expect(isTaxesHost("budget-explorer.352marc.workers.dev")).toBe(false);
    expect(isTaxesHost("localhost")).toBe(false);
    expect(PUBLIC_PATHS.filter((path) => path !== "/").every((path) => isDashboardPath(path))).toBe(true);
    expect(DASHBOARD_PREFIXES).toContain("/revenue");
    expect(DASHBOARD_PREFIXES).toContain("/reserves");
    expect(isDashboardPath("/")).toBe(false);
    expect(isDashboardPath("/florida")).toBe(false);
    expect(isDashboardPath("/search.csv")).toBe(true);
    expect(isDashboardPath("/funds/001")).toBe(true);
    expect(prefixPath("/")).toBe("/walton");
    expect(prefixPath("/funds/001")).toBe("/walton/funds/001");
    expect(prefixPath("/assets/app.css")).toBe("/assets/app.css");
    expect(prefixPath("/walton/ask")).toBe("/walton/ask");
    expect(prefixPath("/ask#question")).toBe("/walton/ask#question");
    expect(prefixPath("/reserves#class-general")).toBe("/walton/reserves#class-general");
    expect(prefixHtml(`<a href="/departments">Departments</a><a href="/assets/app.css">css</a><form action="/ask"></form>`, "/walton")).toBe(
      `<a href="/walton/departments">Departments</a><a href="/assets/app.css">css</a><form action="/walton/ask"></form>`,
    );
    expect(prefixLocation("/login?next=%2Ffunds%2F001")).toBe("/walton/login?next=%2Fwalton%2Ffunds%2F001");
    expect(prefixLocation("/walton")).toBe("/walton");
    expect(prefixLocation("//evil.com")).toBe("/walton");
    expect(prefixLocation("/\\evil.com")).toBe("/walton");
    expect(prefixLocation("/login?next=%2F%2Fevil.com")).toBe("/walton/login?next=%2Fwalton");
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATES.map((state) => state.abbr)).size).toBe(51);
    expect(US_STATES.some((state) => state.abbr === "DC" && state.slug === "district-of-columbia")).toBe(true);
    expect(new Set(US_STATES.map((state) => state.slug)).size).toBe(51);
  });
});

describe("taxes host public door", () => {
  const env = () => envFor(openDb());

  it("serves an indexable Walton intro and keeps the old hosts on the dashboard", async () => {
    const dbEnv = env();
    const home = await app.request(`${TAXES}/`, {}, dbEnv);
    const html = await home.text();
    expect(home.status).toBe(200);
    expect(home.headers.get("X-Robots-Tag")).toBe("index, follow");
    expect(home.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(html).toContain("See how Walton County spends your tax dollars");
    expect(html).toContain("Skip to content");
    expect(html).toContain('href="#content"');
    expect(html).toContain("Explore the Walton County budget");
    expect(html).toContain('href="/walton">Explore the Walton County budget</a>');
    expect(html).toContain("FY2027 adopted budget");
    expect(html).toContain("$345.2M");
    expect(html).toContain("$345,223,508.00");
    expect(html).toContain("September 28, 2026");
    expect(html).not.toContain("Paid so far");
    expect(html).not.toContain("Skip to the state picker");
    expect(html).not.toContain('action="/pick"');
    expect(html).not.toContain('name="state"');
    expect(html).not.toContain('name="county"');
    expect(html).not.toContain("Request your county");
    expect(html).not.toContain("Coming to your county");
    expect(html).not.toContain("Coming soon");
    expect(html).not.toContain("Pick a state");
    expect(html).toContain('href="/walton/vendors"');
    expect(html).toContain('href="/walton/revenue"');
    expect(html).toContain('href="/walton/search"');
    expect(html).toContain('alt="How They Spend My Taxes"');
    expect(html).toContain(">Home<");
    expect(html).toContain(">Walton County<");
    expect(html).not.toContain('href="/florida">Florida</a>');
    expect(html).not.toContain("Built from public records. Unofficial. No county seal used.");
    expect(html).not.toContain("Unofficial. Not a county website.");
    expect(html).not.toContain(">About<");
    expect(html).not.toContain(">Ask AI<");
    expect(html).not.toContain('href="/ask"');
    expect(html).toContain("Report a problem or share an idea");
    expect(html).toContain("Built from public records");
    expect(html).toContain("family=Inter");
    expect(html).toContain("display=swap");
    expect(html).not.toContain("Fraunces");
    expect(html).toContain('rel="canonical" href="https://howtheyspendmytaxes.com/"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).not.toContain("noindex");
    expect(html).not.toContain("mapbox");
    expect(html).not.toContain("leaflet");
    expect(html).not.toContain("mailto:");
    expect(html).not.toMatch(/\u2014|\u2013/);
    expect(html).not.toContain("Okaloosa");

    const icon = await app.request(`${TAXES}/assets/favicon-32.v1.png`, {}, dbEnv);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toContain("image/png");
    expect(icon.headers.get("cache-control")).toContain("max-age=31536000");
    expect(icon.headers.get("cache-control")).toContain("immutable");
    expect((await icon.arrayBuffer()).byteLength).toBeGreaterThan(100);
    const manifest = await app.request(`${TAXES}/assets/site.v1.webmanifest`, {}, dbEnv);
    expect(manifest.status).toBe(200);
    expect(await manifest.text()).toContain("/assets/icon-512.v1.png");
    const css = await (await app.request(`${TAXES}/assets/app.css`, {}, dbEnv)).text();
    expect(css).toContain(".door-section .body-copy { font-size: 22px;");
    expect(css).toContain("body.door { background: var(--paper); font-size: 18px;");
    expect(css).not.toContain(".map-card { display: none; }");

    const www = await (await app.request(`${WWW}/`, {}, dbEnv)).text();
    expect(www).toContain('rel="canonical" href="https://howtheyspendmytaxes.com/"');

    const florida = await app.request(`${TAXES}/florida`, {}, dbEnv);
    expect(florida.status).toBe(301);
    expect(florida.headers.get("Location")).toBe("/");
    const alias = await app.request(`${TAXES}/states/texas`, {}, dbEnv);
    expect(alias.status).toBe(301);
    expect(alias.headers.get("Location")).toBe("/");
    const soon = await app.request(`${TAXES}/texas`, {}, dbEnv);
    expect(soon.status).toBe(301);
    expect(soon.headers.get("Location")).toBe("/");

    const budget = await app.request(`${BUDGET}/`, {}, dbEnv);
    expect(budget.status).toBe(303);
    expect(budget.headers.get("Location")).toBe("/login?next=%2F");
    const workers = await app.request(`${WORKERS}/florida`, {}, dbEnv);
    expect(workers.status).toBe(303);
    expect(workers.headers.get("Location")).toBe("/login?next=%2Fflorida");
  });

  it("publishes robots and a sitemap for the public pages only", async () => {
    const dbEnv = env();
    const robots = await app.request(`${TAXES}/robots.txt`, {}, dbEnv);
    const robotsBody = await robots.text();
    expect(robots.status).toBe(200);
    expect(robotsBody).toBe(robotsTxt());
    expect(robotsBody).toContain("Disallow: /walton/");
    expect(robotsBody).toContain("Disallow: /funds");
    expect(robotsBody).toContain("Disallow: /revenue");
    expect(robotsBody).toContain("Disallow: /reserves");
    expect(robotsBody).toContain("Sitemap: https://howtheyspendmytaxes.com/sitemap.xml");
    expect(robotsBody).not.toBe("User-agent: *\nDisallow: /\n");

    const map = await app.request(`${TAXES}/sitemap.xml`, {}, dbEnv);
    const xml = await map.text();
    expect(map.headers.get("content-type")).toContain("xml");
    expect(xml).toBe(sitemapXml());
    expect(xml).toContain("https://howtheyspendmytaxes.com/</loc>");
    expect(xml).toContain("https://howtheyspendmytaxes.com/walton</loc>");
    expect(xml).not.toContain("https://howtheyspendmytaxes.com/alaska</loc>");
    expect(xml).not.toContain("https://howtheyspendmytaxes.com/texas</loc>");
    expect(xml).not.toContain("https://howtheyspendmytaxes.com/district-of-columbia</loc>");
    expect(xml.match(/<loc>/g)).toHaveLength(2);
    expect(xml).not.toContain("/walton/");
    expect(xml).not.toContain("/florida/");
    expect(xml).not.toContain("/texas/");
    expect(xml).not.toContain("/funds");
    expect(xml).not.toContain("/login");
    expect(xml).not.toContain("/report");
    expect(robotsBody).toContain("Disallow: /florida/");
    expect(robotsBody).toContain("Disallow: /texas/");
    expect(robotsBody).toContain("Disallow: /data/");

    const oldRobots = await (await app.request(`${BUDGET}/robots.txt`, {}, dbEnv)).text();
    expect(oldRobots).toBe("User-agent: *\nDisallow: /\n");
    const oldMap = await app.request(`${WORKERS}/sitemap.xml`, {}, dbEnv);
    expect(oldMap.status).toBe(303);
  });

  it("redirects former state, picker, and request paths to / and keeps /walton", async () => {
    const dbEnv = env();
    for (const path of ["/alaska", "/hawaii", "/district-of-columbia", "/louisiana", "/virginia", "/florida", "/texas", "/pick", "/request", "/florida/request", "/states/texas", "/states/florida/request", "/data/counties/florida.json", "/florida/okaloosa"]) {
      const response = await app.request(`${TAXES}${path}`, {}, dbEnv);
      expect(response.status, path).toBe(301);
      expect(response.headers.get("Location"), path).toBe("/");
    }
    const slash = await app.request(`${TAXES}/florida/`, {}, dbEnv);
    expect(slash.status).toBe(301);
    expect(slash.headers.get("Location")).toBe("/");
    const live = await app.request(`${TAXES}/florida/walton`, {}, dbEnv);
    expect(live.status).toBe(301);
    expect(live.headers.get("Location")).toBe("/walton");
    const walton = await app.request(`${TAXES}/walton`, {}, dbEnv);
    expect(walton.status).toBe(200);
    expect(walton.headers.get("Location")).toBeNull();
  });

  it("moves the Walton dashboard under /walton and redirects old paths", async () => {
    const dbEnv = env();
    const cookie = await signed();
    const landing = await app.request(`${TAXES}/walton`, {}, dbEnv);
    const landingHtml = await landing.text();
    expect(landing.status).toBe(200);
    expect(landing.headers.get("X-Robots-Tag")).toBe("index, follow");
    expect(landingHtml).not.toContain("noindex");
    expect(landingHtml).not.toContain("unofficial look at how Walton County spends county money");
    expect(landingHtml).not.toContain("It is not a county website. Access is currently private.");
    expect(landingHtml).not.toContain("One shared password opens the Walton County pages.");
    expect(landingHtml).toContain("It is built from public records provided by the Walton County Clerk and Comptroller.");
    expect(landingHtml).toContain("Walton County Clerk and Comptroller");
    expect(landingHtml).toContain(">Sign in<");
    expect(landingHtml).toContain('action="/walton/login"');
    expect(landingHtml).toContain('type="password"');
    expect(landingHtml).toContain('rel="canonical" href="https://howtheyspendmytaxes.com/walton"');
    expect(landingHtml).not.toMatch(/\u2014|\u2013/);

    const deep = await app.request(`${TAXES}/walton/funds/001`, {}, dbEnv);
    expect(deep.status).toBe(303);
    expect(deep.headers.get("Location")).toBe("/walton/login?next=%2Fwalton%2Ffunds%2F001");
    const login = await app.request(`${TAXES}/walton/login?next=%2Fwalton%2Ffunds%2F001`, {}, dbEnv);
    const loginHtml = await login.text();
    expect(login.status).toBe(200);
    expect(login.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(loginHtml).toContain("noindex");
    expect(loginHtml).toContain("<title>Sign in | Budget Explorer</title>");
    expect(loginHtml).not.toMatch(/<title>[^<]*[.\u2014\u2013]/);
    expect(loginHtml).toContain("Walton County Clerk and Comptroller");
    expect(loginHtml).toContain("Built from public records.");
    expect(loginHtml).toContain('alt="How They Spend My Taxes"');
    expect(loginHtml).not.toContain("Unofficial");
    expect(loginHtml).not.toContain("not a county website");

    const vendorGate = await app.request(`${TAXES}/walton/vendors`, {}, dbEnv);
    expect(vendorGate.status).toBe(303);
    expect(vendorGate.headers.get("Location")).toBe("/walton/login?next=%2Fwalton%2Fvendors");
    const vendorLine = await app.request(`${TAXES}/walton/vendors/1001`, {}, dbEnv);
    expect(vendorLine.status).toBe(303);
    expect(vendorLine.headers.get("Location")).toBe("/walton/login?next=%2Fwalton%2Fvendors%2F1001");

    for (const path of ["/funds/001", "/departments/00133000", "/revenue", "/reserves", "/vendors", "/vendors/1001", "/search?fund=114", "/ask", "/sheriff", "/about", "/plat", "/search.csv"]) {
      const redirected = await app.request(`${TAXES}${path}`, { headers: { cookie } }, dbEnv);
      expect(redirected.status, path).toBe(301);
      const target = path.startsWith("/search.csv") ? "/walton/search.csv" : `/walton${path}`;
      expect(redirected.headers.get("Location"), path).toBe(target);
    }

    const dash = await app.request(`${TAXES}/walton`, { headers: { cookie } }, dbEnv);
    const dashHtml = await dash.text();
    expect(dash.status).toBe(200);
    expect(dash.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(dashHtml).toContain("noindex");
    expect(dashHtml).toContain("Built from public records.");
    expect(dashHtml).not.toContain("Unofficial");
    expect(dashHtml).toContain('alt="How They Spend My Taxes"');
    expect(dashHtml).toContain('href="/walton/vendors"');
    expect(dashHtml).toContain('href="/walton/about"');
    expect(dashHtml).toContain('href="/walton/ask">Ask AI</a>');
    expect(dashHtml.indexOf('href="/walton/about"')).toBeLessThan(dashHtml.indexOf('href="/walton/ask"'));
    expect(dashHtml).toContain('href="/walton/revenue"');
    expect(dashHtml).toContain('href="/walton/reserves"');
    expect(dashHtml).toContain('href="/walton/search"');
    expect(dashHtml).toContain('href="/assets/app.css"');
    expect(dashHtml).not.toContain('href="/departments"');
    expect(dashHtml).not.toContain('href="/revenue"');

    const old = await (await app.request(`${BUDGET}/`, { headers: { cookie } }, dbEnv)).text();
    expect(old).toContain('href="/vendors"');
    expect(old).toContain('href="/revenue"');
    expect(old).not.toContain('href="/walton/');
    const workers = await (await app.request(`${WORKERS}/`, { headers: { cookie } }, dbEnv)).text();
    expect(workers).toContain('href="/vendors"');
    expect(workers).not.toContain('href="/walton/');

    const revenue = await app.request(`${TAXES}/walton/revenue`, { headers: { cookie } }, dbEnv);
    expect(revenue.status).toBe(200);
    expect(revenue.headers.get("X-Robots-Tag")).toContain("noindex");
    const reserves = await app.request(`${TAXES}/walton/reserves`, { headers: { cookie } }, dbEnv);
    expect(reserves.status).toBe(200);
    expect((await reserves.text())).toContain('href="/walton"');
  });

  it("accepts the shared password on the Walton login", async () => {
    const dbEnv = env();
    const landing = await app.request(`${TAXES}/walton`, {}, dbEnv);
    const html = await landing.text();
    const token = /name="form_token" value="([^"]+)"/.exec(html)?.[1] || "";
    const formCookie = cookieValue(landing.headers.get("set-cookie"));
    expect(token).not.toBe("");
    const posted = await app.request(`${TAXES}/walton/login`, {
      method: "POST",
      headers: { cookie: formCookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "site-secret", next: "/walton", form_token: token }),
    }, dbEnv);
    expect(posted.status).toBe(303);
    expect(posted.headers.get("Location")).toBe("/walton");
  });
});

const ASKER = "ada@county.test";

async function openForm(url: string, dbEnv: ReturnType<typeof envFor>) {
  const response = await app.request(url, {}, dbEnv);
  const html = await response.text();
  const token = /name="form_token" value="([^"]+)"/.exec(html)?.[1] || "";
  return { response, html, token, cookie: cookieValue(response.headers.get("set-cookie")) };
}

function postForm(
  url: string,
  dbEnv: ReturnType<typeof envFor>,
  cookie: string,
  fields: Record<string, string>,
  ip: string | null = "203.0.113.44",
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    cookie,
    origin: new URL(url).origin,
    "content-type": "application/x-www-form-urlencoded",
  };
  if (ip) headers["cf-connecting-ip"] = ip;
  Object.assign(headers, extra);
  return app.request(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  }, dbEnv);
}

describe("county catalog and request form", () => {
  it("keeps Walton as the only live county in the catalog", () => {
    expect(COUNTIES.filter((county) => county.live)).toEqual([
      { stateSlug: "florida", slug: "walton", name: "Walton County", live: true, href: "/walton" },
    ]);
  });

  it("redirects former request form paths, including POST, and does not write a row", async () => {
    const dbEnv = envFor(openDb());
    for (const path of ["/florida/request", "/request", "/texas/request"]) {
      const get = await app.request(`${TAXES}${path}`, {}, dbEnv);
      expect(get.status, path).toBe(301);
      expect(get.headers.get("Location"), path).toBe("/");
      const posted = await postForm(`${TAXES}${path}`, dbEnv, "", {
        form_token: "tok",
        name: "Ada",
        email: ASKER,
        county_name: "Bay County",
        note: "",
        company_website: "",
      });
      expect(posted.status, `POST ${path}`).toBe(301);
      expect(posted.headers.get("Location"), `POST ${path}`).toBe("/");
    }
    const added = { stateSlug: "florida", slug: "sample", name: "Sample County", live: false };
    COUNTIES.push(added);
    try {
      const page = await app.request(`${TAXES}/florida/sample`, {}, dbEnv);
      expect(page.status).toBe(301);
      expect(page.headers.get("Location")).toBe("/");
    } finally {
      COUNTIES.pop();
    }
    const count = await dbEnv.DB.prepare("SELECT COUNT(*) AS n FROM county_requests").first<{ n: number }>();
    expect(Number(count?.n)).toBe(0);
  });
});

describe("report a problem or share an idea", () => {
  it("is public and noindex on both hosts, including /walton/report", async () => {
    const dbEnv = envFor(openDb());
    const taxes = await openForm(`${TAXES}/report?from=/florida`, dbEnv);
    expect(taxes.response.status).toBe(200);
    expect(taxes.response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(taxes.html).toContain('content="noindex, nofollow"');
    expect(taxes.html).toContain("What is this about?");
    expect(taxes.html).toContain("Required. Choose the county this note is about.");
    expect(taxes.html).toContain('<select id="county" name="county" required>');
    expect(taxes.html).toContain("We never publish your email.");
    expect(taxes.html).not.toContain("Large type. Nothing here is published with your email.");
    expect(taxes.html).toContain("Something looks wrong");
    expect(taxes.html).toContain("An idea for using this data better");
    expect(taxes.html).toContain("Your idea");
    expect(taxes.html).toContain('value="/florida"');
    expect(taxes.html).toContain('action="/report"');
    expect(taxes.html).not.toContain(ASKER);
    expect(taxes.html).not.toMatch(/\u2014|\u2013/);

    const evil = await (await app.request(`${TAXES}/report?from=https://evil.example/phish`, {}, dbEnv)).text();
    expect(evil).not.toContain("evil.example");

    const walton = await openForm(`${TAXES}/walton/report?from=/walton/revenue`, dbEnv);
    expect(walton.response.status).toBe(200);
    expect(walton.response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(walton.html).toContain('action="/walton/report"');
    expect(walton.html).toContain('value="/walton/revenue"');
    expect(walton.html).toContain('<option value="walton" selected>');

    const old = await openForm(`${BUDGET}/report`, dbEnv);
    expect(old.response.status).toBe(200);
    expect(old.response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(old.html).toContain('action="/report"');
    expect(old.html).toContain('<option value="walton" selected>');
    expect(old.html).not.toContain('action="/walton/report"');

    const home = await (await app.request(`${TAXES}/`, {}, dbEnv)).text();
    expect(home).toContain("Report a problem or share an idea");
    expect(home).toContain('href="/report?from=%2F"');
    const cookie = await signed();
    const dash = await (await app.request(`${TAXES}/walton`, { headers: { cookie } }, dbEnv)).text();
    expect(dash).toContain("Report a problem or share an idea");
    expect(dash).toContain('href="/walton/report"');
    const budget = await (await app.request(`${BUDGET}/`, { headers: { cookie } }, dbEnv)).text();
    expect(budget).toContain('href="/report"');
    expect(budget).not.toContain('href="/walton/report"');

    const robots = await (await app.request(`${TAXES}/robots.txt`, {}, dbEnv)).text();
    expect(robots).toContain("Disallow: /report");
    const map = await (await app.request(`${TAXES}/sitemap.xml`, {}, dbEnv)).text();
    expect(map).not.toContain("/report");
  });

  it("stores a problem or an idea, and keeps the same protections", async () => {
    const dbEnv = envFor(openDb());
    const page = await openForm(`${TAXES}/report`, dbEnv);
    const idea = await postForm(`${TAXES}/report`, dbEnv, page.cookie, {
      form_token: page.token,
      kind: "idea",
      idea: "Show one picture of the budget",
      page_ref: "",
      correction: "",
      source: "",
      county: "walton",
      name: "Ada",
      email: ASKER,
      company_website: "",
    });
    expect(idea.status).toBe(303);
    expect(idea.headers.get("Location")).toBe("/report?thanks=idea");
    const ideaThanks = await (await app.request(`${TAXES}/report?thanks=idea`, {}, dbEnv)).text();
    expect(ideaThanks).toContain("Thank you. We saved your idea.");
    expect(ideaThanks).not.toContain(ASKER);
    const ideaRow = await dbEnv.DB.prepare("SELECT kind, subject, correction, requester_email, county_name FROM data_reports").first<{
      kind: string;
      subject: string;
      correction: string;
      requester_email: string;
      county_name: string;
    }>();
    expect(ideaRow).toMatchObject({
      kind: "idea",
      subject: "Show one picture of the budget",
      correction: "",
      requester_email: ASKER,
      county_name: "Walton County",
    });

    const missing = await postForm(`${TAXES}/report`, dbEnv, page.cookie, {
      form_token: page.token,
      kind: "problem",
      idea: "",
      page_ref: "",
      correction: "",
      source: "",
      county: "walton",
      name: "",
      email: ASKER,
      company_website: "",
    });
    const missingHtml = await missing.text();
    expect(missing.status).toBe(400);
    expect(missingHtml).toContain("what page or number looks wrong");
    expect(missingHtml).not.toContain(ASKER);
    const afterMissing = await dbEnv.DB.prepare("SELECT COUNT(*) AS n FROM data_reports").first<{ n: number }>();
    expect(Number(afterMissing?.n)).toBe(1);

    const honeypot = await postForm(`${TAXES}/report`, dbEnv, page.cookie, {
      form_token: page.token,
      kind: "problem",
      page_ref: "/florida",
      correction: "The figure should be lower",
      idea: "",
      source: "",
      county: "walton",
      name: "",
      email: ASKER,
      company_website: "filled",
    });
    expect(honeypot.status).toBe(303);
    const afterHoney = await dbEnv.DB.prepare("SELECT COUNT(*) AS n FROM data_reports").first<{ n: number }>();
    expect(Number(afterHoney?.n)).toBe(1);

    const problem = await postForm(`${TAXES}/report`, dbEnv, page.cookie, {
      form_token: page.token,
      kind: "problem",
      page_ref: "/florida",
      correction: "The figure should be lower",
      idea: "",
      source: "budget PDF",
      county: "not-sure",
      name: "",
      email: "",
      company_website: "",
    });
    expect(problem.status).toBe(303);
    const problemRow = await dbEnv.DB.prepare("SELECT kind, subject, correction, county_name, source_note FROM data_reports WHERE kind = 'problem'").first<{
      kind: string;
      subject: string;
      correction: string;
      county_name: string;
      source_note: string;
    }>();
    expect(problemRow).toMatchObject({
      kind: "problem",
      subject: "/florida",
      correction: "The figure should be lower",
      county_name: "Not sure",
      source_note: "budget PDF",
    });

    for (let i = 2; i < INTAKE_HOUR_LIMIT; i += 1) {
      const again = await postForm(`${TAXES}/report`, dbEnv, page.cookie, {
        form_token: page.token,
        kind: "problem",
        page_ref: "/florida",
        correction: "Again",
        county: "walton",
        company_website: "",
      });
      expect(again.status).toBe(303);
    }
    const limited = await postForm(`${TAXES}/report`, dbEnv, page.cookie, {
      form_token: page.token,
      kind: "problem",
      page_ref: "/florida",
      correction: "Stop",
      county: "walton",
      email: ASKER,
      company_website: "",
    });
    const limitedHtml = await limited.text();
    expect(limited.status).toBe(429);
    expect(limitedHtml).toContain("Too many notes");
    expect(limitedHtml).not.toContain(ASKER);
  });
});

function locationIsOpen(location: string | null): boolean {
  if (!location) return false;
  const trimmed = location.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("\\") || trimmed.startsWith("/\\")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  let decoded = trimmed;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }
  return decoded.startsWith("//") || decoded.startsWith("\\") || decoded.startsWith("/\\") || decoded.includes("\\");
}

describe("public redirect hardening", () => {
  it("collapses protocol-relative locations and 404s slash tricks", async () => {
    expect(unsafeRequestPath("//evil.com/")).toBe(true);
    expect(unsafeRequestPath("/\\evil.com/")).toBe(true);
    expect(unsafeRequestPath("///evil.com/")).toBe(true);
    expect(unsafeRequestPath("/%2f%2fevil.com")).toBe(true);
    expect(unsafeRequestPath("/%2F%2Fevil.com/")).toBe(true);
    expect(unsafeRequestPath("/%5Cevil.com")).toBe(true);
    expect(unsafeRequestPath("/%5cevil.com/")).toBe(true);
    expect(unsafeRequestPath("%252f%252fevil.com")).toBe(true);
    expect(unsafeRequestPath("/florida/")).toBe(false);
    expect(safeRedirectLocation("//evil.com")).toBe("/evil.com");
    expect(safeRedirectLocation("/\\evil.com")).toBe("/evil.com");
    expect(safeRedirectLocation("///evil.com")).toBe("/evil.com");
    expect(safeRedirectLocation("/%2f%2fevil.com")).toBe("/evil.com");
    expect(safeRedirectLocation("/%5Cevil.com")).toBe("/evil.com");
    expect(safeRedirectLocation("/florida/")).toBe("/florida/");
    expect(safeRedirectLocation("/report?thanks=idea")).toBe("/report?thanks=idea");

    const dbEnv = envFor(openDb());
    const attacks = [
      "//evil.com/",
      "/\\evil.com/",
      "///evil.com/",
      "/%2f%2fevil.com",
      "/%2f%2fevil.com/",
      "/%5Cevil.com",
      "/%5Cevil.com/",
      "/%2F%2Fevil.com/",
    ];
    for (const path of attacks) {
      const response = await app.request(`${TAXES}${path}`, {}, dbEnv);
      const location = response.headers.get("Location");
      expect(locationIsOpen(location), `${path} -> ${location}`).toBe(false);
      expect(response.status, path).toBe(404);
      expect(location, path).toBeNull();
      if (response.status === 404 && !path.startsWith("/\\")) {
        expect(await response.text(), path).toContain("That page is not here");
      }
    }

    const florida = await app.request(`${TAXES}/florida/`, {}, dbEnv);
    expect(florida.status).toBe(301);
    expect(florida.headers.get("Location")).toBe("/");
    const search = await app.request(`${TAXES}/search/?fund=114`, {}, dbEnv);
    expect(search.status).toBe(301);
    expect(search.headers.get("Location")).toBe("/walton/search?fund=114");
    const login = await (await app.request(`${BUDGET}/login?next=%2F%2Fevil.com`, {}, dbEnv)).text();
    expect(login).not.toContain("evil.com");
  });
});

describe("intake network and global caps", () => {
  const reportFields = {
    kind: "idea",
    idea: "Show the budget more clearly",
    county: "walton",
    company_website: "",
    email: ASKER,
  };

  it("groups an IPv6 /64 and keeps full IPv4 addresses apart", () => {
    const prefix = "2001:db8:85a3:8d3::1";
    expect(intakeNetworkKey(prefix)).toBe("6:2001:db8:85a3:8d3");
    expect(intakeNetworkKey("2001:0db8:85a3:08d3:ffff:ffff:ffff:ffff")).toBe(intakeNetworkKey(prefix));
    expect(intakeNetworkKey("2001:DB8:85A3:8D3:0:0:0:2")).toBe(intakeNetworkKey(prefix));
    expect(intakeNetworkKey("2001:db8:85a3:8d4::1")).not.toBe(intakeNetworkKey(prefix));
    expect(intakeNetworkKey("203.0.113.10")).toBe("4:203.0.113.10");
    expect(intakeNetworkKey("203.0.113.11")).not.toBe(intakeNetworkKey("203.0.113.10"));
    expect(intakeNetworkKey("::ffff:203.0.113.9")).toBe("4:203.0.113.9");
    expect(intakeNetworkKey("not-an-ip")).toBeNull();
    expect(INTAKE_GLOBAL_HOUR_LIMIT).toBe(200);
    expect(INTAKE_GLOBAL_DAY_LIMIT).toBe(1000);
  });

  it("shares the 5 an hour limit across one IPv6 /64", async () => {
    const dbEnv = envFor(openDb());
    const page = await openForm(`${TAXES}/report`, dbEnv);
    const same = ["2001:db8:85a3:8d3::1", "2001:db8:85a3:8d3:ffff::2", "2001:0db8:85a3:08d3::3", "2001:db8:85a3:8d3:1:2:3:4", "2001:db8:85a3:8d3::5"];
    const hashes = new Set<string>();
    for (const ip of same) {
      const posted = await postForm(`${TAXES}/report`, dbEnv, page.cookie, { ...reportFields, form_token: page.token }, ip);
      expect(posted.status, ip).toBe(303);
    }
    const rows = await dbEnv.DB.prepare("SELECT ip_hash FROM data_reports").all<{ ip_hash: string }>();
    for (const row of rows.results) hashes.add(row.ip_hash);
    expect(hashes.size).toBe(1);
    expect([...hashes][0]).toBe(await sha256Hex(`session-secret:report:${intakeNetworkKey(same[0])}`));
    const blocked = await postForm(
      `${TAXES}/report`,
      dbEnv,
      page.cookie,
      { ...reportFields, form_token: page.token },
      "2001:db8:85a3:8d3:aaaa::9",
    );
    expect(blocked.status).toBe(429);
    const other = await postForm(
      `${TAXES}/report`,
      dbEnv,
      page.cookie,
      { ...reportFields, form_token: page.token },
      "2001:db8:85a3:8d4::1",
    );
    expect(other.status).toBe(303);
    const v4block = await postForm(`${TAXES}/report`, dbEnv, page.cookie, { ...reportFields, form_token: page.token, idea: "Holmes County idea" }, "203.0.113.10");
    expect(v4block.status).toBe(303);
  });

  async function seedForms(db: D1Database, countyCount: number, reportCount: number, iso: string) {
    for (let i = 0; i < countyCount; i += 1) {
      await db
        .prepare(
          `INSERT INTO county_requests (created_at, state_name, state_slug, county_name, county_slug, requester_name, requester_email, note, ip_hash)
           VALUES (?, 'Florida', 'florida', 'Sample', 'sample', 'Ada', 'ada@county.test', '', ?)`,
        )
        .bind(iso, `seed-c-${i}`)
        .run();
    }
    for (let i = 0; i < reportCount; i += 1) {
      await db
        .prepare(
          `INSERT INTO data_reports (created_at, kind, county_name, subject, correction, source_note, requester_name, requester_email, ip_hash)
           VALUES (?, 'idea', 'Walton County', 'Idea', '', '', '', '', ?)`,
        )
        .bind(iso, `seed-r-${i}`)
        .run();
    }
  }

  it("stops both forms at the shared hourly and daily caps", async () => {
    const dbEnv = envFor(openDb());
    const page = await openForm(`${TAXES}/report`, dbEnv);
    const report = await openForm(`${TAXES}/report`, dbEnv);
    const now = new Date().toISOString();
    await seedForms(dbEnv.DB, 120, 79, now);
    const room = await postForm(`${TAXES}/report`, dbEnv, page.cookie, { ...reportFields, form_token: page.token }, "203.0.113.70");
    expect(room.status).toBe(303);
    const countyBlocked = await postForm(`${TAXES}/report`, dbEnv, page.cookie, { ...reportFields, form_token: page.token }, "203.0.113.71");
    const countyHtml = await countyBlocked.text();
    expect(countyBlocked.status).toBe(503);
    expect(countyHtml).toContain("a lot of notes");
    expect(countyHtml).not.toContain("You can close this page");
    expect(countyHtml).not.toContain(ASKER);
    const reportBlocked = await postForm(
      `${TAXES}/report`,
      dbEnv,
      report.cookie,
      { form_token: report.token, kind: "idea", idea: "A picture of the budget", county: "walton", company_website: "", email: ASKER },
      "203.0.113.72",
    );
    expect(reportBlocked.status).toBe(503);
    expect(await reportBlocked.text()).toContain("a lot of notes");
    const honeypot = await postForm(
      `${TAXES}/report`,
      dbEnv,
      page.cookie,
      { ...reportFields, form_token: page.token, company_website: "https://spam.example" },
      "203.0.113.73",
    );
    expect(honeypot.status).toBe(303);
    const cross = await postForm(
      `${TAXES}/report`,
      dbEnv,
      page.cookie,
      { ...reportFields, form_token: page.token },
      "203.0.113.74",
      { origin: "https://evil.example" },
    );
    expect(cross.status).toBe(403);

    const dayEnv = envFor(openDb());
    const dayPage = await openForm(`${TAXES}/report`, dayEnv);
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await seedForms(dayEnv.DB, 400, 600, old);
    const dayBlocked = await postForm(
      `${TAXES}/report`,
      dayEnv,
      dayPage.cookie,
      { ...reportFields, form_token: dayPage.token },
      "203.0.113.80",
    );
    expect(dayBlocked.status).toBe(503);
    expect(await dayBlocked.text()).toContain("a lot of notes");
    const savedReports = await dayEnv.DB.prepare("SELECT COUNT(*) AS n FROM data_reports").first<{ n: number }>();
    const savedCounty = await dayEnv.DB.prepare("SELECT COUNT(*) AS n FROM county_requests").first<{ n: number }>();
    expect(Number(savedReports?.n)).toBe(600);
    expect(Number(savedCounty?.n)).toBe(400);
  });

  it("returns 503 when CF-Connecting-IP is missing and ignores other client headers", async () => {
    const dbEnv = envFor(openDb());
    const page = await openForm(`${TAXES}/report`, dbEnv);
    const missing = await postForm(`${TAXES}/report`, dbEnv, page.cookie, { ...reportFields, form_token: page.token }, null);
    const missingHtml = await missing.text();
    expect(missing.status).toBe(503);
    expect(missingHtml).toContain("This form is not available right now. Please try again later.");
    expect(missingHtml).not.toContain(ASKER);
    expect(missingHtml).not.toContain("You can close this page");
    const forwarded = await postForm(
      `${TAXES}/report`,
      dbEnv,
      page.cookie,
      { ...reportFields, form_token: page.token },
      null,
      { "x-forwarded-for": "198.51.100.20" },
    );
    expect(forwarded.status).toBe(503);
    const invalid = await postForm(`${TAXES}/report`, dbEnv, page.cookie, { ...reportFields, form_token: page.token }, "not-an-ip");
    expect(invalid.status).toBe(503);
    const report = await openForm(`${TAXES}/report`, dbEnv);
    const reportMissing = await postForm(
      `${TAXES}/report`,
      dbEnv,
      report.cookie,
      { form_token: report.token, kind: "idea", idea: "Show one picture", county: "walton", company_website: "" },
      null,
    );
    expect(reportMissing.status).toBe(503);
    const kept = await postForm(
      `${TAXES}/report`,
      dbEnv,
      page.cookie,
      { ...reportFields, form_token: page.token },
      "203.0.113.44",
      { "x-forwarded-for": "198.51.100.99" },
    );
    expect(kept.status).toBe(303);
    const row = await dbEnv.DB.prepare("SELECT ip_hash FROM data_reports").first<{ ip_hash: string }>();
    expect(row?.ip_hash).toBe(await sha256Hex(`session-secret:report:${intakeNetworkKey("203.0.113.44")}`));
    expect(row?.ip_hash).not.toBe(await sha256Hex("session-secret:report:4:198.51.100.99"));
    const total = await dbEnv.DB.prepare("SELECT COUNT(*) AS n FROM data_reports").first<{ n: number }>();
    expect(Number(total?.n)).toBe(1);
  });
});
