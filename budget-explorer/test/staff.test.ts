import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { siteHeader } from "../src/chrome";
import { DASHBOARD_PREFIXES, isDashboardPath, prefixHtml, prefixPath } from "../src/host";
import { moneyCompact, moneyWords } from "../src/format";
import { headlineFigures, parseStaffDir, parseStaffSort, renderStaff } from "../src/staff-page";
import { DEPARTMENTS, YEAR_TOTALS, yearTotals } from "../src/staff-data";
import { PUBLIC_PATHS } from "../src/view";

function openDb(): D1Database {
  const raw = new DatabaseSync(":memory:");
  const root = join(import.meta.dirname, "..", "migrations");
  raw.exec(readFileSync(join(root, "0001_init.sql"), "utf8"));
  raw.exec(readFileSync(join(root, "0002_settings.sql"), "utf8"));
  raw.exec(readFileSync(join(root, "0003_revenue_reserves.sql"), "utf8"));
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
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
}

async function cookie(): Promise<string> {
  const session = newSession(false);
  const token = await signSession("session-secret", session);
  return `be_session=${token}`;
}

describe("Walton staff and payroll data", () => {
  it("matches the verified headline figures from the primary payroll extract", () => {
    const figures = headlineFigures();
    expect(figures.fte2020).toBe(1088.25);
    expect(figures.fte2027).toBe(1513);
    expect(figures.pay2020).toBe(7_518_561_913);
    expect(figures.pay2027).toBe(16_422_977_100);
    expect(figures.sheriffFte2020).toBe(475);
    expect(figures.sheriffFte2027).toBe(669);
    expect(figures.sheriffPay2020).toBe(3_826_564_800);
    expect(figures.sheriffPay2027).toBe(8_360_704_200);
    expect(moneyCompact(figures.pay2020)).toBe("$75.2M");
    expect(moneyCompact(figures.pay2027)).toBe("$164.2M");
    expect(moneyCompact(figures.sheriffPay2020)).toBe("$38.3M");
    expect(moneyCompact(figures.sheriffPay2027)).toBe("$83.6M");
    expect(moneyWords(figures.pay2020)).toBe("$75.2 million");
    expect(moneyWords(figures.pay2027)).toBe("$164.2 million");
  });

  it("keeps year totals internally consistent and marks actuals through FY2025", () => {
    expect(YEAR_TOTALS).toHaveLength(8);
    for (const row of YEAR_TOTALS) {
      expect(row.bccFte + row.officersFte).toBeCloseTo(row.fte, 4);
      expect(row.sheriffFte + row.restFte).toBeCloseTo(row.fte, 4);
      expect(row.bccPersonalServicesCents + row.officersPersonalServicesCents).toBe(row.personalServicesCents);
      expect(row.sheriffPersonalServicesCents + row.restPersonalServicesCents).toBe(row.personalServicesCents);
      expect(row.salariesCents + row.benefitsCents + row.unsplitCents).toBe(row.personalServicesCents);
      if (row.fiscalYear <= 2025) expect(row.dollarsBasis).toBe("actual");
      else expect(row.dollarsBasis).toBe("adopted budget");
    }
    const fy2024 = yearTotals(2024);
    const courts = DEPARTMENTS.find((dept) => dept.label === "Circuit Court");
    expect(courts?.byYear[2024].fte).toBe(1);
    const bccDeptFte = DEPARTMENTS.filter((dept) => dept.entityGroup === "bcc").reduce((sum, dept) => sum + (dept.byYear[2024].fte || 0), 0);
    expect(bccDeptFte + 1).toBeCloseTo(fy2024.bccFte, 4);
  });
});

describe("staff page", () => {
  it("renders headline cards, charts, caveats, and source links without typographic dashes", () => {
    const html = renderStaff({ csrf: "tok", isAdmin: false, showNames: true });
    expect(html).toContain("Staff and payroll");
    expect(html).toContain("1,088.25");
    expect(html).toContain("1,513");
    expect(html).toContain("$75.2M");
    expect(html).toContain("$164.2M");
    expect(html).toContain("669");
    expect(html).toContain("$83.6M");
    expect(html).toContain("only the county's transfers to those offices, not their full payroll");
    expect(html).toContain("budgeted positions, not filled jobs");
    expect(html).toContain("actuals through FY2025");
    expect(html).toContain("Tourism splitting in FY2025");
    expect(html).toContain("https://www.mywaltonfl.gov/260/Budget-Publications");
    expect(html).toContain("https://final2027.budget-waltoncountyfl.com");
    expect(html).toContain('id="staff-fte-title"');
    expect(html).toContain('id="staff-pay-title"');
    expect(html).toContain('id="staff-share-title"');
    expect(html).toContain('id="staff-split-title"');
    expect(html).toContain('id="staff-deptchart-title"');
    expect(html).toContain("class=\"tip-pop\"");
    expect(html).toContain(">Sheriff</span>");
    expect(html).not.toMatch(/\u2014|\u2013/);
    expect(html).not.toContain("Gulf of Mexico");
  });

  it("exposes /staff as a dashboard path and prefixes it on the taxes host", () => {
    expect(PUBLIC_PATHS).toContain("/staff");
    expect(DASHBOARD_PREFIXES).toContain("/staff");
    expect(isDashboardPath("/staff")).toBe(true);
    expect(prefixPath("/staff")).toBe("/walton/staff");
    expect(prefixPath("/staff?sort=name")).toBe("/walton/staff?sort=name");
    expect(prefixHtml(`<a href="/staff">Staff</a>`, "/walton")).toBe(`<a href="/walton/staff">Staff</a>`);
  });

  it("places Staff in the dashboard nav before About", () => {
    const nav = siteHeader({ mode: "dashboard", active: "staff", reportHref: "/report", csrf: "tok" });
    expect(nav).toContain('class="on" href="/staff">Staff</a>');
    expect(nav.indexOf('href="/staff">Staff</a>')).toBeLessThan(nav.indexOf('href="/about">About</a>'));
    expect(nav.indexOf('href="/about">About</a>')).toBeLessThan(nav.indexOf('href="/ask">Ask AI</a>'));
    const pub = siteHeader({ mode: "public", active: "home", reportHref: "/report" });
    expect(pub).not.toContain('href="/staff"');
  });

  it("serves staff without a password and keeps other dashboard routes behind login", async () => {
    const env = envFor(openDb());
    const local = await app.request("http://localhost/staff", {}, env);
    expect(local.status).toBe(200);
    const localHtml = await local.text();
    expect(localHtml).toContain("Staff and payroll");
    expect(localHtml).toContain('href="/"');
    expect(localHtml).toContain('href="/walton"');
    expect(localHtml).toContain(">Home<");
    expect(localHtml).toContain(">Walton County<");
    expect(localHtml).not.toContain("Log out");
    expect(localHtml).not.toContain("Ask AI");
    expect(localHtml).not.toMatch(/\u2014|\u2013/);

    const taxes = await app.request("https://howtheyspendmytaxes.com/walton/staff", {}, env);
    expect(taxes.status).toBe(200);
    const taxesHtml = await taxes.text();
    expect(taxesHtml).toContain("Staff and payroll");
    expect(taxesHtml).toContain('href="/"');
    expect(taxesHtml).toContain('href="/walton">Walton County</a>');
    expect(taxesHtml).not.toContain('href="/walton/staff">Home</a>');
    expect(taxesHtml).not.toContain("Log out");
    expect(taxesHtml).not.toContain("Ask AI");
    expect(taxesHtml).toContain('href="/walton/staff?sort=');

    const sorted = await app.request("https://howtheyspendmytaxes.com/walton/staff?sort=name&dir=asc", {}, env);
    expect(sorted.status).toBe(200);
    expect(await sorted.text()).toContain("Sorted by department name, lowest to highest");

    const overview = await app.request("http://localhost/", {}, env);
    expect(overview.status).toBe(303);
    expect(overview.headers.get("Location")).toContain("/login");
    const about = await app.request("http://localhost/about", {}, env);
    expect(about.status).toBe(303);
    expect(about.headers.get("Location")).toContain("/login");
    const ask = await app.request("http://localhost/ask", {}, env);
    expect(ask.status).toBe(303);
    expect(ask.headers.get("Location")).toContain("/login");
    const funds = await app.request("https://howtheyspendmytaxes.com/walton/funds", {}, env);
    expect(funds.status).toBe(303);
    expect(funds.headers.get("Location")).toContain("/walton/login");
    const vendors = await app.request("https://howtheyspendmytaxes.com/walton/vendors", {}, env);
    expect(vendors.status).toBe(303);
    expect(vendors.headers.get("Location")).toContain("/walton/login");

    const home = await app.request("https://howtheyspendmytaxes.com/", {}, env);
    expect(home.status).toBe(200);
    const homeHtml = await home.text();
    expect(homeHtml).toContain('href="/walton/staff"');
    expect(homeHtml).toContain("View staff and payroll");
    expect(homeHtml).toContain("No site password");
  });

  it("serves the page to a signed-in visitor and prefixes it under /walton", async () => {
    const env = envFor(openDb());
    const headers = { cookie: await cookie() };
    const local = await app.request("http://localhost/staff", { headers }, env);
    expect(local.status).toBe(200);
    const localHtml = await local.text();
    expect(localHtml).toContain("Staff and payroll");
    expect(localHtml).toContain('href="/staff"');

    const taxes = await app.request("https://howtheyspendmytaxes.com/walton/staff", { headers }, env);
    expect(taxes.status).toBe(200);
    const taxesHtml = await taxes.text();
    expect(taxesHtml).toContain("Staff and payroll");
    expect(taxesHtml).toContain('href="/walton/staff"');
    expect(taxesHtml).toContain('href="/walton/about"');
    expect(taxesHtml).not.toContain('href="/staff?');
    expect(taxesHtml).toContain('class="on" href="/walton/staff">Staff</a>');

    const bounce = await app.request("https://howtheyspendmytaxes.com/staff", { headers }, env);
    expect(bounce.status).toBe(301);
    expect(bounce.headers.get("Location")).toBe("/walton/staff");
  });

  it("sorts the department table from the query string", () => {
    expect(parseStaffSort("name")).toBe("name");
    expect(parseStaffSort("nope")).toBe("fte1");
    expect(parseStaffDir("asc")).toBe("asc");
    expect(parseStaffDir("")).toBe("desc");
    const html = renderStaff({ csrf: "tok", isAdmin: false, showNames: true, sort: "name", dir: "asc" });
    expect(html).toContain("Sorted by department name, lowest to highest");
    expect(html).toContain("/staff?sort=name&amp;dir=desc");
  });
});
