import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { BUDGET_FACTS_SQL, TOP_VENDOR_SQL, factsFromRow } from "../src/budget";
import { publishImport, saveImport } from "../src/db";
import { parseReport } from "../src/parser";
import {
  buildVendorIndex,
  sumVendorMatches,
  titleCaseVendor,
  vendorNameMatches,
  vendorPhrase,
  vendorSpendSql,
} from "../src/vendors";

const REPORT = `Walton County
YEAR-TO-DATE BUDGET REPORT
Report generated: 09/15/2026 13:23

ACCOUNTS FOR: 111 TOURIST DEVELOPMENT

11101000 TOURIST OFFICE

11101000 552000                    OPERATING SUPPLIES
                    1,000.00                    0.00           1,500.00            800.00              0.00           700.00           53.3%

  2026/02/000100 11/03/2025 API                     300.00 VND 000111 IN INV-1        LOWE'S HOME CENTERS,       PAINT             500000111
  2026/02/000101 11/04/2025 API                     500.00 VND 000111 IN INV-2        LOWE'S HOME CENTERS,       LUMBER            500000222

ACCOUNTS FOR: 001 GENERAL FUND

00101000 SAMPLE DEPARTMENT

00101000 552000                    OPERATING SUPPLIES
                    2,000.00                    0.00           2,200.00            400.00              0.00         1,800.00           18.2%

  2026/03/000300 12/01/2025 API                     400.00 VND 000333 IN INV-9        ACME SUPPLY CO       PARTS             500000333

00101000 591000                    INTERFUND TRANSFER
                    3,333.00                    0.00           3,333.00          3,333.00              0.00             0.00          100.0%

  2026/01/000001 10/02/2025 API                   3,333.00 VND 000001 IN TR-1 WALTON COUNTY SHERIFF TRANSFER 500000001

ACCOUNTS FOR: 104 ZERO BUDGET

10401000 ZERO OFFICE

10401000 534000                    CONTRACTUAL SERVICES
                         0.00                    0.00               0.00            250.00              0.00          -250.00            0.0%

  2026/04/000401 12/03/2025 API                     250.00 VND 000444 IN INV-Z        OTHER SUPPLY CO      WORK              500000444
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
        throw new Error("model should not run");
      },
    },
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
}

async function readerCookie(): Promise<{ header: string; csrf: string }> {
  const session = newSession(false);
  const token = await signSession("session-secret", session);
  return { header: `be_session=${token}`, csrf: session.csrf };
}

describe("vendor names", () => {
  it("title-cases a store name and keeps a letter after an apostrophe lower", () => {
    expect(titleCaseVendor("LOWE'S HOME CENTERS,")).toBe("Lowe's Home Centers");
    expect(titleCaseVendor("ACME BUILDING SUPPLY X")).toBe("Acme Building Supply");
  });

  it("expands a cut-off name when a longer stored name starts the same way", () => {
    const display = buildVendorIndex(["WALTON COUNTY SHERIFF OFFICE"]);
    expect(display("WALTON COUNTY SHERIF")).toBe("Walton County Sheriff Office");
    expect(display("JANE Q PUBLIC")).toBe("JANE Q PUBLIC");
    expect(display("Payroll (batch total)")).toBe("Payroll (batch total)");
  });

  it("matches Lowe's and a cut-off sheriff, and does not match a different word", () => {
    expect(vendorNameMatches("LOWE'S HOME CENTERS,", "Lowe's")).toBe(true);
    expect(vendorNameMatches("LOWE'S HOME CENTERS,", "Lowes")).toBe(true);
    expect(vendorNameMatches("LOWEST PRICE CO", "lowes")).toBe(false);
    expect(vendorNameMatches("SHERIF", "sheriff")).toBe(true);
    expect(vendorPhrase("How much did the county pay Lowe's this year?")).toBe("Lowe's");
    expect(vendorPhrase("JANE Q PUBLIC payroll")).toBeNull();
    expect(vendorPhrase("What payroll wages were paid")).toBeNull();
    const totals = sumVendorMatches(
      [
        { vendor_name: "LOWE'S HOME CENTERS,", cents: 80000, lines: 2, checks: 2 },
        { vendor_name: "LOWEST PRICE CO", cents: 1000, lines: 1, checks: 1 },
      ],
      "Lowes",
    );
    expect(totals?.cents).toBe(80000);
    expect(totals?.names).toEqual(["LOWE'S HOME CENTERS,"]);
  });
});

describe("net of transfers SQL", () => {
  it("subtracts object 591000 and keeps that vendor out of the outside-payment list", () => {
    const { raw } = openDb();
    raw.exec(`
      INSERT INTO accounts (import_id, fund_code, dept_code, object_code, project_code, orig_cents, rev_cents, ytd_cents, enc_cents)
      VALUES
        (1, '001', '00101000', '552000', '', 200000, 220000, 40000, 0),
        (1, '001', '00101000', '591000', '', 333300, 333300, 333300, 0),
        (1, '111', '11101000', '552000', '', 100000, 150000, 80000, 0),
        (1, '104', '10401000', '534000', '', 0, 0, 25000, 0);
      INSERT INTO payments (import_id, fund_code, dept_code, object_code, project_code, amount_cents, vendor_name, check_number, after_cutoff, is_person_name, dedupe_key)
      VALUES
        (1, '111', '11101000', '552000', '', 30000, 'LOWE''S HOME CENTERS,', '500000111', 0, 0, 'a'),
        (1, '111', '11101000', '552000', '', 50000, 'LOWE''S HOME CENTERS,', '500000222', 0, 0, 'b'),
        (1, '111', '11101000', '552000', '', 99999, 'LOWE''S HOME CENTERS,', '500000999', 1, 0, 'c'),
        (1, '001', '00101000', '591000', '', 333300, 'WALTON COUNTY SHERIF', '500000001', 0, 0, 'd'),
        (1, '001', '00101000', '552000', '', 1000, 'LOWEST PRICE CO', '500000010', 0, 0, 'e');
    `);
    const row = raw.prepare(BUDGET_FACTS_SQL).get(1) as {
      orig_cents: number;
      rev_cents: number;
      ytd_cents: number;
      enc_cents: number;
      transfer_orig_cents: number;
      transfer_rev_cents: number;
      transfer_ytd_cents: number;
      transfer_enc_cents: number;
    };
    const facts = factsFromRow(row);
    expect(facts.grossRev).toBe(703300);
    expect(facts.adopted).toBe(300000);
    expect(facts.current).toBe(370000);
    expect(facts.spent).toBe(145000);
    expect(facts.transfer).toBe(333300);
    expect(facts.left).toBe(225000);

    const vendors = raw.prepare(TOP_VENDOR_SQL).all(1, 1, "", "", "", "") as { vendor_name: string; cents: number }[];
    const names = vendors.map((vendor) => vendor.vendor_name);
    expect(names).toContain("LOWE'S HOME CENTERS,");
    expect(names).toContain("LOWEST PRICE CO");
    expect(names.join(" ")).not.toContain("SHERIF");
    const lowes = vendors.find((vendor) => vendor.vendor_name.includes("LOWE"));
    expect(lowes?.cents).toBe(80000);

    const matched = raw.prepare(vendorSpendSql(false)).all(1, 1, "lowes%") as {
      vendor_name: string;
      cents: number;
      lines: number;
      checks: number;
    }[];
    expect(matched.map((item) => item.vendor_name).sort()).toEqual(["LOWE'S HOME CENTERS,", "LOWEST PRICE CO"]);
    expect(sumVendorMatches(matched, "Lowes")?.cents).toBe(80000);
    expect(sumVendorMatches(matched, "lowes")?.names).not.toContain("LOWEST PRICE CO");
  });
});

describe("budget pages", () => {
  it("links every fund and department and answers from the net figures", async () => {
    const { db } = openDb();
    const parsed = parseReport(REPORT);
    expect(parsed.accounts.map((account) => account.objectCode).sort()).toEqual(["534000", "552000", "552000", "591000"]);
    expect(parsed.payments.some((row) => row.vendorName.includes("SHERIF"))).toBe(true);
    const lowes = parsed.payments.filter((row) => row.vendorName.includes("LOWE"));
    expect(lowes.reduce((sum, row) => sum + row.amountCents, 0)).toBe(80000);
    const id = await saveImport(db, parsed, "sample.txt");
    await publishImport(db, id);
    const env = envFor(db);
    const reader = await readerCookie();
    const headers = { cookie: reader.header };

    const overviewRes = await app.request("http://localhost/", { headers }, env);
    const overview = await overviewRes.text();
    expect(overviewRes.headers.get("Content-Security-Policy")).toContain("https://static.cloudflareinsights.com");
    expect(overviewRes.headers.get("Content-Security-Policy")).toContain("https://cloudflareinsights.com");
    expect(overview).toContain("How we count the budget");
    expect(overview).toContain("Budget passed by commissioners");
    expect(overview).toContain("$3,000");
    expect(overview).toContain("$3,700");
    expect(overview).toContain("$1,450");
    expect(overview).toContain("$3,333");
    expect(overview).not.toContain("$7,033");
    expect(overview).not.toContain("$6,333");
    expect(overview).not.toContain("$4,783");
    expect(overview).toContain('href="/funds/111"');
    expect(overview).toContain('href="/departments/11101000"');
    expect(overview).toContain('href="/funds/104"');
    expect(overview).toContain('href="/funds/001"');
    expect(overview).not.toContain("SHERIF");
    expect(overview).toContain("Lowe&#39;s Home Centers");
    expect(overview).toContain("nav-scroller");

    const funds = await (await app.request("http://localhost/funds", { headers }, env)).text();
    expect(funds).toContain('href="/funds/111"');
    expect(funds).toContain("Tourist Development");

    const fund = await (await app.request("http://localhost/funds/111", { headers }, env)).text();
    expect(fund.indexOf("Budgeted")).toBeLessThan(fund.indexOf("Where the money went"));
    expect(fund).toContain("Money spent so far");
    expect(fund).toContain("Money left");
    expect(fund).toContain("$1,500");
    expect(fund).toContain("$800");
    expect(fund).toContain('href="/departments/11101000"');
    expect(fund).toContain("/search?fund=111&amp;vendor=");
    expect(fund).toContain("Lowe&#39;s Home Centers");
    expect(fund).not.toContain("SHERIF");

    const dept = await (await app.request("http://localhost/departments/11101000", { headers }, env)).text();
    expect(dept.indexOf("Budgeted")).toBeLessThan(dept.indexOf("Where the money went"));
    expect(dept.indexOf("Where the money went")).toBeLessThan(dept.indexOf("Accounts in this department"));
    expect(dept).toContain("/search?dept=11101000&amp;vendor=");
    expect(dept).toContain('href="/departments/11101000/552000/_"');

    const zero = await (await app.request("http://localhost/funds/104", { headers }, env)).text();
    expect(zero).toContain(">n/a<");
    expect(zero).not.toContain(">0.0%<");

    const ask = async (question: string) => {
      const response = await app.request(
        "http://localhost/ask",
        {
          method: "POST",
          headers: { cookie: reader.header, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ csrf: reader.csrf, question }),
        },
        env,
      );
      return response.text();
    };

    const lowesAnswer = await ask("How much did the county pay Lowe's this year?");
    expect(lowesAnswer).toContain("Lowe&#39;s Home Centers");
    expect(lowesAnswer).toContain("$800.00");
    expect(lowesAnswer).not.toContain("could not be answered");
    const lowesAgain = await ask("How much did the county pay Lowes this year?");
    expect(lowesAgain).toContain("$800.00");
    const missing = await ask("How much did the county pay Zzznotavendor this year?");
    expect(missing).toContain("No vendor in this budget matches that name.");
    const budget = await ask("What is the county budget?");
    expect(budget).toContain("$3,000");
    expect(budget).not.toContain("$7,033");
    expect(budget).not.toContain("$6,333");
    const transfers = await ask("How much was transferred between funds?");
    expect(transfers).toContain("$3,333");
    expect(transfers).toContain("$7,033");
    const tourist = await ask("What is the Tourist Development budget?");
    expect(tourist).toContain("$1,500");
    expect(tourist).toContain("$800");
  });
});
