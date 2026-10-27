import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHOW_PERSON_NAMES_DEFAULT,
  filterAnswer,
  payrollReadSql,
  showPersonNames,
  showPersonNamesFromForm,
} from "../src/access";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { publishImport, saveImport } from "../src/db";
import { parseReport } from "../src/parser";

const REPORT = `Walton County
YEAR-TO-DATE BUDGET REPORT
Report generated: 09/15/2026 13:23

ACCOUNTS FOR: 001 GENERAL FUND

00101000 SAMPLE DEPARTMENT

00101000 512000                    REGULAR SALARIES & WAGES
                      500.00                    0.00             500.00            150.00              0.00           350.00           30.0%

  2026/01/000441 10/10/2025 PRJ                      100.00 REF 251010 WARRANT=251010      RUN=1 REGULAR JANE Q PUBLIC
  2026/01/000442 10/10/2025 PRJ                       50.00 REF 251010 WARRANT=251010      RUN=1 REGULAR JOHN Q SMITH
  2026/12/000999 09/20/2026 PRJ                       75.00 REF 999 WARRANT=999      RUN=1 REGULAR LATE Q PERSON

00101000 531000                    CONTRACTUAL SERVICES
                       20.00                    0.00              20.00             20.00              0.00             0.00          100.0%

  2026/04/000401 12/03/2025 API                       20.00 VND 000777 IN INV-P        JANE Q PUBLIC        NOTE              500000777
`;

function openDb(): { raw: DatabaseSync; db: D1Database } {
  const raw = new DatabaseSync(":memory:");
  const root = join(import.meta.dirname, "..", "migrations");
  raw.exec(readFileSync(join(root, "0001_init.sql"), "utf8"));
  raw.exec(readFileSync(join(root, "0002_settings.sql"), "utf8"));
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

function envFor(db: D1Database) {
  return {
    DB: db,
    AI: {
      async run() {
        return { response: "JANE Q PUBLIC was paid $100.00 and JOHN Q SMITH was paid $50.00." };
      },
    },
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
}

async function cookie(admin: boolean, secret = "session-secret"): Promise<{ header: string; csrf: string }> {
  const session = newSession(admin);
  const token = await signSession(secret, session);
  return { header: `be_session=${token}`, csrf: session.csrf };
}

describe("person names switch", () => {
  it("defaults to shown from one constant when settings has no row", async () => {
    expect(SHOW_PERSON_NAMES_DEFAULT).toBe(true);
    const { db } = openDb();
    expect(await showPersonNames(db)).toBe(SHOW_PERSON_NAMES_DEFAULT);
    expect(payrollReadSql(false).includes("employee_name")).toBe(false);
    expect(payrollReadSql(true).includes("employee_name")).toBe(true);
    expect(showPersonNamesFromForm(["0", "1"])).toBe(true);
    expect(showPersonNamesFromForm("0")).toBe(false);
    expect(filterAnswer("JANE Q PUBLIC was paid $100.00", ["JANE Q PUBLIC"], ["$100.00", "100.00"])).not.toContain("JANE");
    expect(filterAnswer("JANE Q PUBLIC was paid $100.00", ["JANE Q PUBLIC"], ["$100.00", "100.00"])).not.toContain("100.00");
    const kept = filterAnswer("batch $150.00 and line $50.00.", [], ["$50.00", "50.00"]);
    expect(kept).toContain("$150.00");
    expect(kept).not.toContain("$50.00");
  });

  it("requires an unlocked admin and CSRF, and hidden mode strips names and individual pay", async () => {
    const { raw, db } = openDb();
    const parsed = parseReport(REPORT);
    expect(parsed.payrollLines.map((line) => line.employeeName)).toEqual(["JANE Q PUBLIC", "JOHN Q SMITH", "LATE Q PERSON"]);
    const id = await saveImport(db, parsed, "sample.txt");
    await publishImport(db, id);
    const storedNames = raw.prepare("SELECT employee_name FROM payroll_lines ORDER BY id").all() as { employee_name: string }[];
    expect(storedNames.map((row) => row.employee_name)).toContain("JANE Q PUBLIC");

    const env = envFor(db);
    const reader = await cookie(false);
    const admin = await cookie(true);
    const headers = (cookieHeader: string) => ({ cookie: cookieHeader });

    const shownSearch = await app.request("http://localhost/search?q=JANE", { headers: headers(reader.header) }, env);
    const shownHtml = await shownSearch.text();
    expect(shownHtml).toContain("JANE Q PUBLIC");
    expect(shownHtml).toContain("$100.00");

    const shownDrill = await app.request("http://localhost/departments/00101000/512000/_", { headers: headers(reader.header) }, env);
    const shownDrillHtml = await shownDrill.text();
    expect(shownDrillHtml).toContain("unmatched");
    expect(shownDrillHtml).toContain("JANE Q PUBLIC");
    expect(shownDrillHtml).toContain("JOHN Q SMITH");
    expect(shownDrillHtml).toContain("$100.00");
    expect(shownDrillHtml).toContain("$50.00");
    expect(shownDrillHtml).not.toContain("LATE Q PERSON");

    const shownCsv = await app.request("http://localhost/search.csv?q=JANE", { headers: headers(reader.header) }, env);
    const shownCsvText = await shownCsv.text();
    expect(shownCsvText).toContain("JANE Q PUBLIC");
    expect(shownCsvText).toContain("100.00");
    expect(shownCsvText).not.toContain("'-100.00");

    const shownAsk = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: reader.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: reader.csrf, question: "JANE Q PUBLIC payroll" }),
    }, env);
    const shownAnswer = await shownAsk.text();
    expect(shownAnswer).toContain("JANE Q PUBLIC");
    expect(shownAnswer).toContain("$100.00");

    const stranger = await cookie(false);
    const denied = await app.request("http://localhost/admin/settings", {
      method: "POST",
      headers: { cookie: stranger.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: stranger.csrf, show_person_names: "0" }),
    }, env);
    expect(denied.status).not.toBe(303);
    expect(await showPersonNames(db)).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM settings_log").get()).toEqual({ n: 0 });

    const badCsrf = await app.request("http://localhost/admin/settings", {
      method: "POST",
      headers: { cookie: admin.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: "not-the-token", show_person_names: "0" }),
    }, env);
    expect(badCsrf.status).toBe(403);
    expect(await showPersonNames(db)).toBe(true);

    const adminPage = await app.request("http://localhost/admin", { headers: headers(admin.header) }, env);
    const adminHtml = await adminPage.text();
    expect(adminHtml).toContain("Show person names and individual pay");
    expect(adminHtml).toContain("Current state: on");

    const saved = await app.request("http://localhost/admin/settings", {
      method: "POST",
      headers: { cookie: admin.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: admin.csrf, show_person_names: "0" }),
    }, env);
    expect(saved.status).toBe(303);
    expect(await showPersonNames(db)).toBe(false);
    const log = raw.prepare("SELECT value, changed_at FROM settings_log").get() as { value: string; changed_at: string };
    expect(log.value).toBe("0");
    expect(log.changed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const after = await app.request("http://localhost/admin", { headers: headers(admin.header) }, env);
    expect(await after.text()).toContain("Current state: off");
    expect((raw.prepare("SELECT employee_name FROM payroll_lines WHERE employee_name = 'JANE Q PUBLIC'").get() as { employee_name: string }).employee_name).toBe("JANE Q PUBLIC");

    const hiddenSearch = await app.request("http://localhost/search?q=JANE", { headers: headers(reader.header) }, env);
    const hiddenSearchHtml = await hiddenSearch.text();
    expect(hiddenSearchHtml).toContain("0 payments found");
    expect(hiddenSearchHtml).not.toContain("JANE Q PUBLIC");
    expect(hiddenSearchHtml).not.toContain("JOHN");
    expect(hiddenSearchHtml).not.toContain("$100.00");
    expect(hiddenSearchHtml).not.toContain("$50.00");

    const hiddenDrill = await app.request("http://localhost/departments/00101000/512000/_", { headers: headers(reader.header) }, env);
    const hiddenDrillHtml = await hiddenDrill.text();
    expect(hiddenDrillHtml).toContain("Payroll (batch total)");
    expect(hiddenDrillHtml).toContain("$150.00");
    expect(hiddenDrillHtml).not.toContain("JANE");
    expect(hiddenDrillHtml).not.toContain("JOHN");
    expect(hiddenDrillHtml).not.toContain("LATE");
    expect(hiddenDrillHtml).not.toContain("$100.00");
    expect(hiddenDrillHtml).not.toContain("$50.00");
    expect(hiddenDrillHtml).not.toContain("$75.00");

    const hiddenCsv = await app.request("http://localhost/search.csv", { headers: headers(reader.header) }, env);
    const hiddenCsvText = await hiddenCsv.text();
    expect(hiddenCsvText).toContain("Payroll (batch total)");
    expect(hiddenCsvText).toContain("150.00");
    expect(hiddenCsvText).not.toContain("JANE");
    expect(hiddenCsvText).not.toContain("JOHN");
    expect(hiddenCsvText).not.toMatch(/(^|,)100\.00(?:,|\r|\n|$)/);
    expect(hiddenCsvText).not.toMatch(/(^|,)50\.00(?:,|\r|\n|$)/);
    expect(hiddenCsvText).not.toMatch(/(^|,)75\.00(?:,|\r|\n|$)/);
    expect(hiddenCsvText).toContain("Name withheld");

    const asker = await cookie(false);
    const hiddenAsk = await app.request("http://localhost/ask", {
      method: "POST",
      headers: { cookie: asker.header, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf: asker.csrf, question: "What payroll wages were paid" }),
    }, env);
    const hiddenAnswer = await hiddenAsk.text();
    expect(hiddenAnswer).not.toContain("JANE");
    expect(hiddenAnswer).not.toContain("JOHN");
    expect(hiddenAnswer).not.toContain("$100.00");
    expect(hiddenAnswer).not.toContain("$50.00");
    expect(hiddenAnswer).toContain("Payroll (batch total)");
    expect(hiddenAnswer).not.toContain("LATE");
  });
});
