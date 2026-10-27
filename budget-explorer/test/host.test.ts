import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { DASHBOARD_PREFIXES, isDashboardPath, isTaxesHost, prefixHtml, prefixLocation, prefixPath, robotsTxt, sitemapXml } from "../src/host";
import { INTAKE_HOUR_LIMIT } from "../src/intake";
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
    expect(prefixPath("/reserves#class-general")).toBe("/walton/reserves#class-general");
    expect(prefixHtml(`<a href="/departments">Departments</a><a href="/assets/app.css">css</a><form action="/ask"></form>`, "/walton")).toBe(
      `<a href="/walton/departments">Departments</a><a href="/assets/app.css">css</a><form action="/walton/ask"></form>`,
    );
    expect(prefixLocation("/login?next=%2Ffunds%2F001")).toBe("/walton/login?next=%2Fwalton%2Ffunds%2F001");
    expect(prefixLocation("/walton")).toBe("/walton");
    expect(US_STATES).toHaveLength(50);
    expect(new Set(US_STATES.map((state) => state.abbr)).size).toBe(50);
    expect(new Set(US_STATES.map((state) => `${state.col},${state.row}`)).size).toBe(50);
  });
});

describe("taxes host public door", () => {
  const env = () => envFor(openDb());

  it("serves an indexable homepage and Florida page, and keeps the old hosts on the dashboard", async () => {
    const dbEnv = env();
    const home = await app.request(`${TAXES}/`, {}, dbEnv);
    const html = await home.text();
    expect(home.status).toBe(200);
    expect(home.headers.get("X-Robots-Tag")).toBe("index, follow");
    expect(html).toContain("See how your county spends your tax dollars");
    expect(html).toContain("Pick a state. Then pick a county.");
    expect(html).toContain("<svg");
    expect(html).toContain('href="/florida"');
    expect(html).toContain("Coming soon");
    expect(html).toContain("Fraunces");
    expect(html).toContain("IBM+Plex+Sans");
    expect(html).toContain('rel="canonical" href="https://howtheyspendmytaxes.com/"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).not.toContain("noindex");
    expect(html).not.toContain("mapbox");
    expect(html).not.toContain("leaflet");
    expect(html).not.toContain("mailto:");
    expect(html).not.toMatch(/\u2014|\u2013/);
    for (const state of US_STATES) expect(html).toContain(state.name);
    expect(html).not.toContain("Okaloosa");

    const www = await (await app.request(`${WWW}/`, {}, dbEnv)).text();
    expect(www).toContain('rel="canonical" href="https://howtheyspendmytaxes.com/"');

    const florida = await app.request(`${TAXES}/florida`, {}, dbEnv);
    const floridaHtml = await florida.text();
    expect(florida.status).toBe(200);
    expect(florida.headers.get("X-Robots-Tag")).toBe("index, follow");
    expect(floridaHtml).toContain(">Walton County, live<");
    expect(floridaHtml).toContain('href="/walton"');
    expect(floridaHtml).toContain('rel="canonical" href="https://howtheyspendmytaxes.com/florida"');
    expect(floridaHtml).toContain('"@type":"WebPage"');
    expect(floridaHtml).not.toContain("Okaloosa");
    expect(floridaHtml).not.toContain("mailto:");
    expect(floridaHtml).not.toContain("noindex");
    expect(floridaHtml).not.toMatch(/\u2014|\u2013/);

    const soon = await app.request(`${TAXES}/states/texas`, {}, dbEnv);
    const soonHtml = await soon.text();
    expect(soon.status).toBe(200);
    expect(soon.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(soonHtml).toContain("Coming soon");
    expect(soonHtml).toContain("No counties are listed for Texas");
    expect(soonHtml).not.toContain("Walton");
    expect(soonHtml).not.toContain("Okaloosa");

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
    expect(xml).toContain("https://howtheyspendmytaxes.com/florida</loc>");
    expect(xml).toContain("https://howtheyspendmytaxes.com/walton</loc>");
    expect(xml).not.toContain("/walton/");
    expect(xml).not.toContain("/funds");
    expect(xml).not.toContain("/login");

    const oldRobots = await (await app.request(`${BUDGET}/robots.txt`, {}, dbEnv)).text();
    expect(oldRobots).toBe("User-agent: *\nDisallow: /\n");
    const oldMap = await app.request(`${WORKERS}/sitemap.xml`, {}, dbEnv);
    expect(oldMap.status).toBe(303);
  });

  it("moves the Walton dashboard under /walton and redirects old paths", async () => {
    const dbEnv = env();
    const cookie = await signed();
    const landing = await app.request(`${TAXES}/walton`, {}, dbEnv);
    const landingHtml = await landing.text();
    expect(landing.status).toBe(200);
    expect(landing.headers.get("X-Robots-Tag")).toBe("index, follow");
    expect(landingHtml).not.toContain("noindex");
    expect(landingHtml).toContain("unofficial look at how Walton County spends county money");
    expect(landingHtml).toContain("Walton County Clerk and Comptroller");
    expect(landingHtml).toContain("Access is currently private");
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
    expect(loginHtml).toContain("Walton County Clerk and Comptroller");
    expect(loginHtml).toContain("Unofficial. Built from public records");

    for (const path of ["/funds/001", "/departments/00133000", "/revenue", "/reserves", "/search?fund=114", "/ask", "/sheriff", "/about", "/plat", "/search.csv"]) {
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
    expect(dashHtml).toContain("Unofficial. Built from public records");
    expect(dashHtml).toContain('href="/walton/departments"');
    expect(dashHtml).toContain('href="/walton/revenue"');
    expect(dashHtml).toContain('href="/walton/reserves"');
    expect(dashHtml).toContain('href="/walton/funds"');
    expect(dashHtml).toContain('href="/walton/search"');
    expect(dashHtml).toContain('href="/walton/ask"');
    expect(dashHtml).toContain('href="/assets/app.css"');
    expect(dashHtml).not.toContain('href="/departments"');
    expect(dashHtml).not.toContain('href="/revenue"');

    const old = await (await app.request(`${BUDGET}/`, { headers: { cookie } }, dbEnv)).text();
    expect(old).toContain('href="/departments"');
    expect(old).toContain('href="/revenue"');
    expect(old).not.toContain('href="/walton/');
    const workers = await (await app.request(`${WORKERS}/`, { headers: { cookie } }, dbEnv)).text();
    expect(workers).toContain('href="/departments"');
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

function postForm(url: string, dbEnv: ReturnType<typeof envFor>, cookie: string, fields: Record<string, string>) {
  return app.request(url, {
    method: "POST",
    headers: {
      cookie,
      origin: new URL(url).origin,
      "content-type": "application/x-www-form-urlencoded",
      "cf-connecting-ip": "203.0.113.44",
    },
    body: new URLSearchParams(fields),
  }, dbEnv);
}

describe("county catalog and request form", () => {
  it("keeps Walton as the only live county in the catalog", () => {
    expect(COUNTIES.filter((county) => county.live)).toEqual([
      { stateSlug: "florida", slug: "walton", name: "Walton County", live: true, href: "/walton" },
    ]);
  });

  it("accepts a request, hides the email, drops the honeypot, and limits repeats", async () => {
    const dbEnv = envFor(openDb());
    const page = await openForm(`${TAXES}/florida/request`, dbEnv);
    expect(page.response.status).toBe(200);
    expect(page.response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(page.html).toContain("Request this county");
    expect(page.html).toContain("Florida");
    expect(page.html).not.toContain(ASKER);
    expect(page.html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(page.html).not.toMatch(/\u2014|\u2013/);

    const honeypot = await postForm(`${TAXES}/florida/request`, dbEnv, page.cookie, {
      form_token: page.token,
      name: "Ada",
      email: ASKER,
      county_name: "Sample County",
      note: "Please add it",
      company_website: "https://spam.example",
    });
    expect(honeypot.status).toBe(303);
    expect(honeypot.headers.get("Location")).not.toContain("@");
    const honeypotCount = await dbEnv.DB.prepare("SELECT COUNT(*) AS n FROM county_requests").first<{ n: number }>();
    expect(Number(honeypotCount?.n)).toBe(0);

    const posted = await postForm(`${TAXES}/florida/request`, dbEnv, page.cookie, {
      form_token: page.token,
      name: "Ada",
      email: ASKER,
      county_name: "Sample County",
      note: "Please add it",
      company_website: "",
    });
    expect(posted.status).toBe(303);
    const thanks = await app.request(`${TAXES}${posted.headers.get("Location")}`, {}, dbEnv);
    const thanksHtml = await thanks.text();
    expect(thanks.status).toBe(200);
    expect(thanksHtml).toContain("Thank you. We saved your request.");
    expect(thanksHtml).not.toContain(ASKER);
    expect(thanksHtml).not.toMatch(/\u2014|\u2013/);
    const row = await dbEnv.DB.prepare("SELECT state_slug, county_name, county_slug, requester_email, note, ip_hash FROM county_requests").first<{
      state_slug: string;
      county_name: string;
      county_slug: string;
      requester_email: string;
      note: string;
      ip_hash: string;
    }>();
    expect(row).toMatchObject({ state_slug: "florida", county_name: "Sample County", county_slug: "sample-county", requester_email: ASKER, note: "Please add it" });
    expect(row?.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.ip_hash).not.toContain("203.0.113.44");

    const expired = await postForm(`${TAXES}/florida/request`, dbEnv, page.cookie, {
      form_token: "nope",
      name: "Ada",
      email: ASKER,
      county_name: "Sample County",
      note: "",
      company_website: "",
    });
    const expiredHtml = await expired.text();
    expect(expired.status).toBe(400);
    expect(expiredHtml).not.toContain(ASKER);

    for (let i = 1; i < INTAKE_HOUR_LIMIT; i += 1) {
      const again = await postForm(`${TAXES}/florida/request`, dbEnv, page.cookie, {
        form_token: page.token,
        name: "Ada",
        email: ASKER,
        county_name: "Sample County",
        note: "",
        company_website: "",
      });
      expect(again.status).toBe(303);
    }
    const limited = await postForm(`${TAXES}/florida/request`, dbEnv, page.cookie, {
      form_token: page.token,
      name: "Ada",
      email: ASKER,
      county_name: "Sample County",
      note: "",
      company_website: "",
    });
    const limitedHtml = await limited.text();
    expect(limited.status).toBe(429);
    expect(limitedHtml).toContain("Too many requests");
    expect(limitedHtml).not.toContain(ASKER);
    const total = await dbEnv.DB.prepare("SELECT COUNT(*) AS n FROM county_requests").first<{ n: number }>();
    expect(Number(total?.n)).toBe(INTAKE_HOUR_LIMIT);
  });

  it("shows a coming soon page with the county filled in when that county is not live", async () => {
    const added = { stateSlug: "florida", slug: "sample", name: "Sample County", live: false };
    COUNTIES.push(added);
    try {
      const dbEnv = envFor(openDb());
      const page = await openForm(`${TAXES}/florida/sample`, dbEnv);
      expect(page.response.status).toBe(200);
      expect(page.response.headers.get("X-Robots-Tag")).toContain("noindex");
      expect(page.html).toContain("Coming soon");
      expect(page.html).toContain("Sample County");
      expect(page.html).toContain("Request this county");
      expect(page.html).toContain(">Florida<");
      expect(page.html).not.toContain('name="county_name"');
      expect(page.html).not.toContain(ASKER);
      const florida = await (await app.request(`${TAXES}/florida`, {}, dbEnv)).text();
      expect(florida).toContain(">Sample County, coming soon<");
      expect(florida).toContain('href="/florida/sample"');
      expect(florida).toContain(">Walton County, live<");

      const posted = await postForm(`${TAXES}/florida/sample`, dbEnv, page.cookie, {
        form_token: page.token,
        name: "Ada",
        email: ASKER,
        county_name: "Okaloosa County",
        note: "",
        company_website: "",
      });
      expect(posted.status).toBe(303);
      const row = await dbEnv.DB.prepare("SELECT county_name, county_slug, requester_email FROM county_requests").first<{
        county_name: string;
        county_slug: string;
        requester_email: string;
      }>();
      expect(row).toMatchObject({ county_name: "Sample County", county_slug: "sample", requester_email: ASKER });
      const thanks = await (await app.request(`${TAXES}${posted.headers.get("Location")}`, {}, dbEnv)).text();
      expect(thanks).not.toContain(ASKER);
      expect(thanks).not.toContain("Okaloosa");
    } finally {
      COUNTIES.pop();
    }
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
