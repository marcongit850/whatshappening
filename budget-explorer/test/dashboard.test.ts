import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildQuestionContext, setShowPersonNames } from "../src/access";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { fiscalPosition, moneyCompact, moneyExact } from "../src/format";
import { mentionedCodes, nameMatchesQuestion } from "../src/qa";

function openDb(): { raw: DatabaseSync; db: D1Database } {
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
  return { raw, db: db as unknown as D1Database };
}

const FUND_YTD = 350_000;
const DEPT_YTD = 250_000;
const PLATFORM_YTD = 99_900;
const IMPORT_YTD = 600_900;
const IMPORT_REV = 10_100_000;
const IMPORT_ENC = 80_000;
const IMPORT_AVAIL = IMPORT_REV - IMPORT_YTD - IMPORT_ENC;

function seed(raw: DatabaseSync): void {
  raw.exec(`INSERT INTO imports (
    id, created_at, status, published_at, data_as_of, filename,
    fund_count, department_count, account_count, payment_count, payroll_line_count,
    orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents, after_cutoff_count
  ) VALUES (
    1, '2026-09-16T00:00:00Z', 'published', '2026-09-16T00:00:00Z', '2026-09-15', 'sample.txt',
    2, 5, 6, 8, 1,
    ${IMPORT_REV}, 0, ${IMPORT_REV}, ${IMPORT_YTD}, ${IMPORT_ENC}, ${IMPORT_AVAIL}, 1
  )`);
  raw.exec(`INSERT INTO funds (import_id, code, report_name) VALUES
    (1, '114', 'PARK IMPACT'),
    (1, '001', 'GENERAL')`);
  raw.exec(`INSERT INTO departments (import_id, code, fund_code, report_name) VALUES
    (1, '11444000', '114', 'PARKS ADMIN'),
    (1, '11445000', '114', 'OTHER PARKS'),
    (1, '00122000', '001', 'PLATFORM SERVICES'),
    (1, '00133000', '001', 'ROADS DIVISION'),
    (1, '00199000', '001', 'INTERFUND TRANSFERS')`);
  raw.exec(`INSERT INTO chart_names (kind, code, name) VALUES
    ('fund', '114', 'Recreation Plat Fee'),
    ('fund', '001', 'General Fund'),
    ('department', '11444000', 'Parks Maintenance'),
    ('department', '11445000', 'Recreation Plat Fee'),
    ('department', '00122000', 'Platform Services'),
    ('department', '00133000', 'Roads Division'),
    ('department', '00199000', 'Interfund Transfers')`);
  const account = raw.prepare(`INSERT INTO accounts (
    import_id, fund_code, dept_code, object_code, project_code, title,
    orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents
  ) VALUES (1, ?, ?, ?, '', ?, ?, 0, ?, ?, ?, ?)`);
  const rows: [string, string, string, string, number, number, number][] = [
    ["114", "11444000", "534000", "OPERATING", 400_000, 200_000, 80_000],
    ["114", "11444000", "561000", "LAND", 200_000, 50_000, 0],
    ["114", "11445000", "534000", "OPERATING", 200_000, 100_000, 0],
    ["001", "00122000", "534000", "PLATFORM SERVICES", 200_000, PLATFORM_YTD, 0],
    ["001", "00133000", "534000", "ROADS", 100_000, 150_000, 0],
    ["001", "00199000", "591000", "TRANSFERS", 9_000_000, 1_000, 0],
  ];
  for (const [fund, dept, objectCode, title, rev, ytd, enc] of rows) {
    account.run(fund, dept, objectCode, title, rev, rev, ytd, enc, rev - ytd - enc);
  }
  const pay = raw.prepare(`INSERT INTO payments (
    import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
    amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key, is_person_name
  ) VALUES (1, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, '1', '', ?, ?, ?)`);
  const payments: [string, string, string, string, string, number, string, string, string, number, string, number][] = [
    ["114", "11444000", "534000", "2025-10-15", "API", 15_000_000, "1001", "NORTH BUILDERS LLC", "N1", 0, "n1", 0],
    ["114", "11444000", "561000", "2025-10-20", "API", 2_000_000, "1001", "NORTH BUILDERS LLC", "N2", 0, "n2", 0],
    ["001", "00133000", "534000", "2025-12-02", "API", 8_000_000, "1002", "ACME WIDGET CO", "A1", 0, "a1", 0],
    ["001", "00133000", "534000", "2025-11-01", "API", 123_456, "1003", "SAMPLE COUNTY SHERIFF", "S1", 0, "s1", 0],
    ["001", "00122000", "534000", "2025-11-02", "API", 100, "1004", "JANE Q PUBLIC", "P1", 0, "p1", 1],
    ["114", "11444000", "534000", "2026-09-20", "API", 99_999_900, "1005", "LATE VENDOR CO", "L1", 1, "l1", 0],
    ["001", "00133000", "534000", "2025-12-01", "GEN", 4_000_000, "1006", "INTERNAL JOURNAL CO", "J1", 0, "j1", 0],
    ["001", "00133000", "534000", "2026-01-15", "API", 6_000_000, "1007", "PLAT SUPPLY CO", "PS1", 0, "ps1", 0],
    ["001", "00122000", "534000", "2026-01-16", "API", 7_000_000, "1008", "PLATFORM SERVICES INC", "PF1", 0, "pf1", 0],
  ];
  for (const row of payments) pay.run(...row);
  raw.exec(`INSERT INTO payroll_lines (
    import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
    amount_cents, employee_name, batch_key, description, after_cutoff, dedupe_key
  ) VALUES (1, '001', '00122000', '512000', '', 'PR', '2025-10-10', 'PRJ', 10000, 'JANE Q PUBLIC', 'b1', '', 0, 'pay1')`);
}

async function signed(): Promise<{ header: string; csrf: string }> {
  const session = newSession(false);
  const token = await signSession("session-secret", session);
  return { header: `be_session=${token}`, csrf: session.csrf };
}

function envFor(db: D1Database, prompts: { system: string; user: string }[]) {
  return {
    DB: db,
    AI: {
      async run(_model: string, input: { messages: { role: string; content: string }[] }) {
        prompts.push({
          system: input.messages[0]?.content || "",
          user: input.messages[1]?.content || "",
        });
        return { response: "Quoted from the FACT lines." };
      },
    },
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
}

describe("name matching", () => {
  const plat = "What has the county spent on Recreation Plat Fees?";

  it("matches a fund name on whole words and ignores a longer word", () => {
    expect(nameMatchesQuestion("Recreation Plat Fee", plat)).toBe(true);
    expect(nameMatchesQuestion("Platform Services", plat)).toBe(false);
    expect(nameMatchesQuestion("Platform Services", "plat")).toBe(false);
    expect(mentionedCodes("How much has department 11444000 spent?").depts).toEqual(["11444000"]);
    expect(mentionedCodes("spent on fund 114").funds).toEqual(["114"]);
    expect(mentionedCodes("department 11444000").funds).toEqual([]);
  });
});

describe("overview dashboard", () => {
  it("renders computed charts, drill-down links, and the question box without person names", async () => {
    const { raw, db } = openDb();
    seed(raw);
    const env = envFor(db, []);
    const session = await signed();
    const fiscal = fiscalPosition("2026-09-15");
    const html = await (await app.request("http://localhost/", { headers: { cookie: session.header } }, env)).text();

    expect(html).toContain("Unofficial. Built from public records");
    expect(html).toContain("Data as of 09/15/2026");
    expect(html).toContain("Fraunces");
    expect(html).toContain("IBM+Plex+Sans");
    const netYtd = IMPORT_YTD - 1_000;
    const netRev = IMPORT_REV - 9_000_000;
    expect(html).toContain(moneyCompact(netYtd));
    expect(html).toContain(`${((netYtd / netRev) * 100).toFixed(1)}%`);
    expect(html).toContain("How we count the budget");
    expect(html).toContain("Money moved between county funds");
    expect(html).toContain("Payments to other county offices");
    expect(html).not.toContain("funds$");
    expect(html).toContain(`${fiscal.elapsedPct.toFixed(1)}%`);
    expect(html).toContain("Ask a question about the budget");
    expect(html).toContain('action="/ask"');
    expect(html).toContain(`name="csrf" value="${session.csrf}"`);
    expect(html).toContain("What has the county spent on Recreation Plat Fees?");
    expect(html).toContain("How much has department 11444000 spent?");
    expect(html).toContain('href="/departments"');
    expect(html).toContain("Search any vendor or payment");
    expect(html).toContain("Who was paid the most money");
    expect(html).not.toContain("Who received the most money");
    expect(html).not.toContain("Total received");
    expect(html.indexOf("Search any vendor or payment")).toBeLessThan(html.indexOf("Who was paid the most money"));
    expect(html.indexOf("Who was paid the most money")).toBeLessThan(html.indexOf("Where the money goes"));
    expect(html).toContain('href="/vendors/1001"');
    expect(html).toContain('href="/vendors"');
    expect(html).toContain("https://budget-waltoncountyfl.com");
    expect(html).toContain("Planned budget (county&#39;s budget book)");
    expect(html).toContain("The county&#39;s own FY2027 tentative budget book");
    const who = html.slice(html.indexOf("Who was paid the most money"), html.indexOf("Commissioners adopted"));
    expect(who).toContain("Total paid");
    expect(who).not.toContain("Total received");
    expect(who).toContain("North Builders LLC");
    expect(who).not.toContain("Jane");
    expect(who).not.toContain("Sheriff");
    expect(who).not.toContain("Late Vendor");
    expect(who).not.toContain("Internal Journal");
    expect(html).toContain('href="/search"');
    expect(html).toContain('href="/departments?sort=enc"');
    expect(html).toContain('href="/departments?sort=avail"');
    expect(html).toContain('href="/funds/114"');
    expect(html).toContain('href="/departments/11444000"');
    expect(html).toContain('href="/departments/00133000"');
    expect(html).not.toContain("/departments/00199000");
    expect(html).toContain("/search?from=2025-10-01&amp;to=2025-10-31");
    expect(html).toContain("/search?from=2026-09-01&amp;to=2026-09-15");
    expect(html).toContain("/search?vendor=NORTH%20BUILDERS%20LLC");
    expect(html).toContain("/search?fund=114");
    expect(html).toContain("<svg");
    const goesAt = html.indexOf("Where the money goes");
    const comesAt = html.indexOf("Where the money comes from");
    expect(goesAt).toBeGreaterThan(-1);
    expect(comesAt).toBeGreaterThan(goesAt);
    const spendCard = html.slice(html.lastIndexOf('<div class="card pie-card">', goesAt), comesAt);
    expect(spendCard).toContain('class="donut"');
    expect(spendCard).toContain('viewBox="0 0 200 200"');
    expect(spendCard).toContain('stroke-width="26"');
    expect(spendCard).toContain('r="72"');
    expect(spendCard).toContain('aria-label="Share of spending by fund"');
    expect(spendCard).toContain('class="dn1">');
    expect(spendCard).toContain('class="dn2">spent</text>');
    expect(spendCard).toContain('class="lgs"');
    expect(spendCard).toContain('href="/funds/114"');
    expect(spendCard).toContain('href="/funds/001"');
    expect(spendCard).toContain("Recreation Plat Fee");
    expect(spendCard).toContain("General Fund");
    expect(spendCard).toContain("Each fund's share of the");
    expect(spendCard).toContain("Money moved between funds is not in this chart.");
    expect(spendCard).toMatch(/\d+\.\d%/);
    expect(spendCard).not.toContain("spent in total");
    expect(spendCard).not.toContain("donut-labels");
    expect(html).toContain('class="card income-card pie-card"');
    expect(html).toContain(">Over budget<");
    expect(html).not.toContain("may reflect an amendment");
    expect(html).toContain("Recreation Plat Fee");
    expect(html).toContain("Roads Division");
    expect(html).toContain(moneyCompact(123_456));
    expect(html).not.toContain("JANE");
    expect(html).not.toContain("SAMPLE COUNTY SHERIFF");
    expect(html).not.toContain("LATE VENDOR CO");
    expect(html).not.toContain("INTERNAL JOURNAL CO");
    expect(html).toContain("1 payment line dated after");
    expect(html).not.toContain("1 payment lines");
    expect(html).not.toContain("\u2014");
    expect(html).not.toContain("\u2013");

    await setShowPersonNames(db, false);
    const hidden = await (await app.request("http://localhost/", { headers: { cookie: session.header } }, env)).text();
    expect(hidden).not.toContain("JANE");
    expect(hidden).toContain("North Builders LLC");
    expect(hidden).not.toContain("SAMPLE COUNTY SHERIFF");
  });

  it("drops the prototype sentence from about the data", async () => {
    const { raw, db } = openDb();
    seed(raw);
    const env = envFor(db, []);
    const session = await signed();
    const html = await (await app.request("http://localhost/about", { headers: { cookie: session.header } }, env)).text();
    expect(html).toContain("<h1>About the data</h1>");
    expect(html).toContain("<h2>Source</h2>");
    expect(html).toContain("Figures come from a year to date budget report");
    expect(html).toContain('class="panel about-source"');
    expect(html).not.toContain("private concept prototype");
    expect(html).not.toContain("It is not a Walton County website and it does not use the county seal.");
    expect(html).not.toContain("<summary>What is this?</summary>");
    expect(html).not.toContain("\u2014");
    expect(html).not.toContain("\u2013");
  });

  it("puts a question-mark info control on overview, funds, and departments", async () => {
    const { raw, db } = openDb();
    seed(raw);
    const env = envFor(db, []);
    const session = await signed();
    const headers = { cookie: session.header };
    const pages = ["/", "/funds", "/departments", "/funds/001", "/departments/00133000"];
    for (const path of pages) {
      const html = await (await app.request(`http://localhost${path}`, { headers }, env)).text();
      expect(html, path).toContain('aria-label="What is this?"');
      expect(html, path).toContain('aria-expanded="false"');
      expect(html, path).toContain(">?</button>");
      expect(html, path).not.toContain("<summary>What is this?</summary>");
      expect(html, path).not.toMatch(/\u2014|\u2013/);
    }
    const overview = await (await app.request("http://localhost/", { headers }, env)).text();
    expect(overview).toContain("Spending against each fund's revised budget.");
    expect(overview).toContain('aria-describedby="tip-where-goes"');
    expect(overview).toContain('aria-controls="tip-where-goes"');
    expect(overview).not.toContain('aria-expanded="true"');
    const funds = await (await app.request("http://localhost/funds", { headers }, env)).text();
    expect(funds).toContain("Each fund in the published import.");
    const departments = await (await app.request("http://localhost/departments", { headers }, env)).text();
    expect(departments).toContain("Names come from the chart of accounts.");
    expect(departments).toContain('aria-describedby="tip-dept-00199000"');
    expect(departments).toContain('aria-controls="tip-dept-00199000"');
    const css = await (await app.request("http://localhost/assets/app.css", {}, env)).text();
    const js = await (await app.request("http://localhost/assets/app.js", {}, env)).text();
    expect(css).toContain("#c9a24b");
    expect(css).toContain("var(--navy-deep)");
    const buttonCss = css.match(/\.tip-btn \{[^}]+\}/)?.[0] ?? "";
    expect(buttonCss).toContain("width: 20px");
    expect(buttonCss).toContain("height: 20px");
    expect(buttonCss).not.toContain("44px");
    const hitCss = css.match(/\.tip-btn::after \{[^}]+\}/)?.[0] ?? "";
    expect(hitCss).toContain("width: 44px");
    expect(hitCss).toContain("height: 44px");
    expect(hitCss).toContain("position: absolute");
    expect(css).toMatch(/\.tip-pop \{[^}]*z-index: 80/);
    expect(js).toContain("Escape");
    expect(js).toContain("aria-expanded");
    expect(js).toContain('addEventListener("scroll"');
    expect(js).not.toContain("activeElement");
  });

  it("opens a fund and filters payments by fund and month", async () => {
    const { raw, db } = openDb();
    seed(raw);
    const env = envFor(db, []);
    const session = await signed();
    const headers = { cookie: session.header };
    const fund = await (await app.request("http://localhost/funds/114", { headers }, env)).text();
    expect(fund).toContain("Recreation Plat Fee");
    expect(fund).toContain("11444000");
    expect(fund).toContain("Parks Maintenance");
    expect(fund).not.toContain("Roads Division");
    expect(fund).not.toContain("JANE");

    const inFund = await (await app.request("http://localhost/search?fund=114", { headers }, env)).text();
    expect(inFund).toContain("North Builders LLC");
    expect(inFund).not.toContain("ACME WIDGET CO");
    expect(inFund).not.toContain("JANE");
    expect(inFund).not.toContain("LATE VENDOR CO");

    const october = await (await app.request("http://localhost/search?from=2025-10-01&to=2025-10-31", { headers }, env)).text();
    expect(october).toContain("North Builders LLC");
    expect(october).not.toContain("ACME WIDGET CO");
    expect(october).not.toContain("LATE VENDOR CO");

    const payments = await (await app.request("http://localhost/search", { headers }, env)).text();
    expect(payments).toContain("Maximum amount");
    expect(payments).toContain("at most 2,000 lines");
    expect(payments).toContain("Download results (CSV)");
    const capped = await (await app.request("http://localhost/search?min=70000&max=90000", { headers }, env)).text();
    expect(capped).toContain("2 payments found, totaling $150,000.00");
    expect(capped).toContain("$80,000.00");
    expect(capped).toContain("$70,000.00");
    expect(capped).not.toContain("North Builders");
    expect(capped).not.toContain("$60,000.00");
    expect(capped).not.toContain("$20,000.00");
  });
});

describe("vendors who were paid", () => {
  it("lists vendors and opens one vendor without people, offices, or lines after the cutoff", async () => {
    const { raw, db } = openDb();
    seed(raw);
    raw.exec(`INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key, is_person_name
    ) VALUES
      (1, '001', '00122000', '534000', '', '', '2026-02-01', 'API', 1, '1008', 'PLATFORM SERVICES INC', 'PF2', '2', '', 0, 'pf2', 0),
      (1, '001', '00122000', '534000', '', '', '2026-02-02', 'API', 1, '1008', 'PLATFORM SERVICES INC', 'PF3', '3', '', 0, 'pf3', 0),
      (1, '001', '00122000', '534000', '', '', '2026-02-03', 'API', 1, '1008', 'PLATFORM SVCS', 'PF4', '4', '', 0, 'pf4', 0)`);
    raw.exec(`UPDATE payments SET description = 'SMITH, MARY rent' WHERE dedupe_key = 'n1'`);
    const env = envFor(db, []);
    const session = await signed();
    const headers = { cookie: session.header };

    const locked = await app.request("http://localhost/vendors", {}, env);
    expect(locked.status).toBe(303);
    expect(locked.headers.get("Location")).toBe("/login?next=%2Fvendors");

    const list = await (await app.request("http://localhost/vendors", { headers }, env)).text();
    expect(list).toContain("North Builders LLC");
    expect(list).toContain('href="/vendors/1001"');
    expect(list).toContain("Total paid");
    expect(list).toContain("Sorted by total paid.");
    expect(list).not.toContain("Total received");
    expect(list).not.toContain("total received");
    expect(list).toContain("Number of payments");
    expect(list).toContain("Reversals and re-posts are listed as separate lines.");
    expect(list).not.toContain("Jane");
    expect(list).not.toContain("Sample County Sheriff");
    expect(list).not.toContain("Late Vendor");
    expect(list).not.toContain("Internal Journal");
    expect(list).not.toMatch(/\u2014|\u2013/);
    expect(list.indexOf("/vendors/1001")).toBeLessThan(list.indexOf("/vendors/1008"));

    const byCount = await (await app.request("http://localhost/vendors?sort=count", { headers }, env)).text();
    expect(byCount.indexOf("/vendors/1008")).toBeLessThan(byCount.indexOf("/vendors/1001"));
    expect(byCount).toContain("Platform Services INC");

    const found = await (await app.request("http://localhost/vendors?q=1002", { headers }, env)).text();
    expect(found).toContain("Acme Widget Co");
    expect(found).not.toContain("North Builders LLC");
    const shortName = await (await app.request("http://localhost/vendors?q=svcs", { headers }, env)).text();
    expect(shortName).toContain("Platform Services INC");
    expect(shortName).toContain('href="/vendors/1008"');

    const detail = await (await app.request("http://localhost/vendors/1001", { headers }, env)).text();
    expect(detail).toContain("$170,000.00");
    expect(detail).toContain("Total paid");
    expect(detail).not.toContain("Total received");
    expect(detail).not.toContain("total received");
    expect(detail).toContain("Number of payments");
    expect(detail).toContain(">2<");
    expect(detail).toContain("10/15/2025");
    expect(detail).toContain("10/20/2025");
    expect(detail).toContain("Recreation Plat Fee");
    expect(detail).toContain("Parks Maintenance");
    expect(detail).toContain("534000");
    expect(detail).toContain("561000");
    expect(detail).toContain("SMITH, MARY rent");
    expect(detail).toContain("Reversals and re-posts are listed as separate lines.");
    expect(detail).not.toContain("LATE VENDOR");
    expect(detail).not.toMatch(/\u2014|\u2013/);

    await setShowPersonNames(db, false);
    const hidden = await (await app.request("http://localhost/vendors/1001", { headers }, env)).text();
    expect(hidden).toContain("North Builders LLC");
    expect(hidden).not.toContain("SMITH");
    expect(hidden).not.toContain("MARY");
    expect(hidden).not.toContain("Jane");

    for (const path of ["/vendors/1003", "/vendors/1004", "/vendors/1005", "/vendors/nope"]) {
      const missing = await app.request(`http://localhost${path}`, { headers }, env);
      expect(missing.status, path).toBe(404);
    }
  });
});

describe("question facts", () => {
  it("quotes the fund 114 total for plat fees and the department total for 11444000", async () => {
    const { raw, db } = openDb();
    seed(raw);
    const prompts: { system: string; user: string }[] = [];
    const env = envFor(db, prompts);
    const session = await signed();

    const platPack = await buildQuestionContext(db, 1, "What has the county spent on Recreation Plat Fees?", true);
    expect(platPack.prompt).toContain(`spent ${moneyExact(FUND_YTD)}`);
    expect(platPack.prompt).toContain("Fund 114");
    expect(platPack.prompt).toContain("Recreation Plat Fee");
    expect(platPack.prompt).toContain("Account count 3");
    expect(platPack.prompt).toContain("114-11444000-534000-");
    expect(platPack.prompt).toContain("114-11445000-534000-");
    expect(platPack.prompt).not.toContain(moneyExact(DEPT_YTD));
    expect(platPack.prompt).not.toContain(moneyExact(PLATFORM_YTD));
    expect(platPack.prompt).not.toContain("Platform");

    const deptPack = await buildQuestionContext(db, 1, "How much has department 11444000 spent?", true);
    expect(deptPack.prompt).toContain(`spent ${moneyExact(DEPT_YTD)}`);
    expect(deptPack.prompt).toContain("Department 11444000");
    expect(deptPack.prompt).toContain("Account count 2");
    expect(deptPack.prompt).toContain("114-11444000-534000-");
    expect(deptPack.prompt).toContain("114-11444000-561000-");
    expect(deptPack.prompt).not.toContain(moneyExact(FUND_YTD));
    expect(deptPack.prompt).not.toContain(moneyExact(PLATFORM_YTD));
    expect(deptPack.prompt).not.toContain("114-11445000");

    const vendorPack = await buildQuestionContext(db, 1, "plat supply invoices", true);
    expect(vendorPack.prompt).toContain("PLAT SUPPLY CO");
    expect(vendorPack.prompt).not.toContain("PLATFORM");

    const asked = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: session.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: session.csrf, question: "What has the county spent on Recreation Plat Fees?" }),
    }, env);
    const answer = await asked.text();
    expect(asked.status).toBe(200);
    expect(prompts[0].system).toContain("Do not add, subtract");
    expect(prompts[0].user).toContain(moneyExact(FUND_YTD));
    expect(prompts[0].user).toContain("Account count 3");
    expect(answer).toContain(moneyExact(FUND_YTD));
    expect(answer).toContain("114-11444000-534000-");
    expect(answer).not.toContain(moneyExact(PLATFORM_YTD));
    expect(answer).not.toContain("JANE");

    const denied = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: session.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: "nope", question: "How much has department 11444000 spent?" }),
    }, env);
    expect(denied.status).toBe(403);

    const fundQuestion = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: session.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: session.csrf, question: "How much has the Recreation Plat Fee Fund spent?" }),
    }, env);
    const fundAnswer = await fundQuestion.text();
    expect(fundAnswer).not.toContain("No vendor in this budget matches that name.");
    expect(fundAnswer).toContain(moneyExact(FUND_YTD));

    const most = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: session.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: session.csrf, question: "Who is paid the most?" }),
    }, env);
    const mostAnswer = await most.text();
    expect(mostAnswer).toContain("North Builders LLC");
    expect(mostAnswer).toContain(moneyExact(17_000_000));
    expect(mostAnswer).not.toContain("SAMPLE COUNTY SHERIFF");
    expect(mostAnswer).not.toContain("JANE");
  });
});
