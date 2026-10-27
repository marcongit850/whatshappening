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
