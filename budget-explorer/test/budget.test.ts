import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { BUDGET_FACTS_SQL, PAYMENT_SCOPE_SQL, TOP_VENDOR_SQL, capitalLinesCovering, factsFromRow, loadCategorySpend, loadLargestPayments, netPaymentReversals, sqlExpressionDepth } from "../src/budget";
import { publishImport, saveImport } from "../src/db";
import { leftLabel } from "../src/format";
import { CONSTITUTIONAL_SQL, isCountyOfficeVendor } from "../src/overview";
import { parseReport, sqlIsPersonName } from "../src/parser";
import { collapsePayments, disambiguatedDepartmentNames, paymentWho, renderFund, renderOverview } from "../src/view";
import { vendorSpendAnswer } from "../src/answers";
import {
  buildVendorIndex,
  mergeVendorSpend,
  nameLooksCut,
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
    expect(titleCaseVendor("ACME BUILDING SUPPLY X")).toBe("Acme Building Supply X");
  });

  it("shows the report's name and marks a 20 character cutoff", () => {
    const display = buildVendorIndex(["WALTON COUNTY SHERIFF OFFICE", "ZEHNDER COMMUNICATIONS INC", "FLORIDA DEPARTMENT OF REVENUE"]);
    expect(display("WALTON COUNTY SHERIF").text).toBe("Walton County Sherif");
    expect(display("ZEHNDER COMMUNICATIO").text).toBe("Zehnder Communicatio");
    expect(display("ZEHNDER COMMUNICATIO").shortened).toBe(true);
    expect(display("JANE Q PUBLIC").text).toBe("JANE Q PUBLIC");
    expect(display("Payroll (batch total)").text).toBe("Payroll (batch total)");
    const alone = buildVendorIndex([]);
    expect(alone("ZEHNDER COMMUNICATIO")).toEqual({ text: "Zehnder Communicatio", shortened: true });
    expect(alone("Adkinson Law Firm Ll")).toEqual({ text: "Adkinson Law Firm Ll", shortened: true });
    expect(alone("C&A Landscape Mainte").text).toBe("C&A Landscape Mainte");
    expect(alone("South Walton Fire Di").text).toBe("South Walton Fire Di");
    expect(alone("JM PHELPS CONSTRUCTI").text).toBe("Jm Phelps Constructi");
    expect(alone("TOPSAIL PRESERVE STA").text).toBe("Topsail Preserve Sta");
    expect(alone("HEFFLEY &").text).toBe("Heffley &");
    expect(alone("VINTAGE SIGN &").text).toBe("Vintage Sign &");
    expect(alone("REFLECTION CITY OF").text).toBe("Reflection City Of");
    expect(alone("HARPER LANDSCAPING").text).toBe("Harper Landscaping");
    expect(alone("SOUTH WALTON TURTLE").text).toBe("South Walton Turtle");
    expect(alone("AT&T MOBILITY").text).toBe("AT&T Mobility");
    expect(alone("FLORIDA DEPARTMENT O")).toEqual({ text: "Florida Department O", shortened: true });
    expect(alone("DISTRICT ONE CONSTRU")).toEqual({ text: "District One Constru", shortened: true });
    expect(alone("HABITAT FOR HUMANI").text).toBe("Habitat For Humani");
    expect(alone("SHI INTER*")).toEqual({ text: "Shi Inter", shortened: true });
    expect(alone("WALTON COUNTY ECONOM FY 26").text).toBe("Walton County Econom Fy 26");
    expect(nameLooksCut("SHI INTER*")).toBe(true);
    expect(nameLooksCut("HARPER LANDSCAPING")).toBe(false);
    const merged = mergeVendorSpend(
      [
        { vendor_name: "FLORIDA DEPARTMENT O", cents: 100 },
        { vendor_name: "FLORIDA DEPARTMENT OF", cents: 40 },
        { vendor_name: "LOWE'S HOME CENTERS,", cents: 10 },
        { vendor_name: "lowe's home centers", cents: 5 },
      ],
      alone,
    );
    expect(merged.map((row) => row.vendor_name).sort()).toEqual(["FLORIDA DEPARTMENT O", "FLORIDA DEPARTMENT OF", "LOWE'S HOME CENTERS,"]);
    const lowes = merged.find((row) => row.vendor_name.includes("LOWE"));
    expect(lowes?.cents).toBe(15);
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
        (1, '001', '00101000', '552000', '', 1000, 'LOWEST PRICE CO', '500000010', 0, 0, 'e'),
        (1, '001', '00101000', '552000', '', 5000, 'WALTON COUNTY PROPER', '500000011', 0, 0, 'f'),
        (1, '001', '00101000', '552000', '', 7000, 'WALTON COUNTY SHERIF', '500000012', 0, 0, 'g'),
        (1, '001', '00101000', '552000', '', 8000, 'ACME SUPPLY CO', '500000013', 0, 0, 'h');
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
    expect(facts.spentOfCurrentPct).toBe(39.2);
    expect(facts.spentOfAdoptedPct).toBe(48.3);

    const vendors = raw.prepare(TOP_VENDOR_SQL).all(1, 1, "", "", "", "") as { vendor_name: string; cents: number }[];
    const names = vendors.map((vendor) => vendor.vendor_name);
    expect(names).toContain("LOWE'S HOME CENTERS,");
    expect(names).toContain("LOWEST PRICE CO");
    expect(names).toContain("ACME SUPPLY CO");
    expect(names.join(" ")).not.toContain("SHERIF");
    expect(names.join(" ")).not.toContain("PROPER");
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
    expect(sumVendorMatches(matched, "Lowes")?.checks).toBe(2);
    expect(sumVendorMatches(matched, "lowes")?.names).not.toContain("LOWEST PRICE CO");
    const checks = sumVendorMatches(
      [
        { vendor_name: "LOWE'S HOME CENTERS,", cents: 100, lines: 2, pay_refs: "check:111,journal:J-blank" },
        { vendor_name: "LOWE'S HOME CENTER", cents: 50, lines: 1, pay_refs: "check:111" },
      ],
      "Lowes",
    );
    expect(checks?.checks).toBe(2);
    expect(checks?.lines).toBe(3);
  });
});

describe("county offices, categories, and payment lines", () => {
  it("keeps outside vendors and collapses a repeated journal", () => {
    expect(isCountyOfficeVendor("WALTON COUNTY SHERIF")).toBe(true);
    expect(isCountyOfficeVendor("WALTON COUNTY PROPER")).toBe(true);
    expect(isCountyOfficeVendor("WALTON COUNTY PROPERTY APPRAISER")).toBe(true);
    expect(isCountyOfficeVendor("WALTON COUNTY")).toBe(true);
    expect(isCountyOfficeVendor("WALTON COUNTY TIMES")).toBe(false);
    expect(isCountyOfficeVendor("ACME SUPPLY CO")).toBe(false);
    expect(isCountyOfficeVendor("SHERIF'S MARKET")).toBe(false);
    expect(leftLabel(100_000, 150_000)).toEqual({ title: "Over budget by", value: "$500", over: true, unbudgeted: false });
    expect(leftLabel(0, 25_000).value).toBe("No budget set in the county report");
    expect(paymentWho("", () => ({ text: "ignored", shortened: false })).text).toBe("Not listed in the county report");
    const collapsed = collapsePayments([
      { pay_date: "2026-04-03", amount_cents: 100, vendor_name: "", check_number: "", journal: "J1", object_code: "534000" },
      { pay_date: "2026-04-03", amount_cents: 1_248_750_000, vendor_name: "ADKINSON LAW FIRM", check_number: "1", journal: "J2", object_code: "534000" },
      { pay_date: "2026-04-03", amount_cents: 1_248_750_000, vendor_name: "ADKINSON LAW FIRM", check_number: "1", journal: "J2", object_code: "552000" },
      { pay_date: "2026-04-03", amount_cents: 1_248_750_000, vendor_name: "ADKINSON LAW FIRM", check_number: "1", journal: "J2", object_code: "553000" },
      { pay_date: "2026-04-03", amount_cents: 50, vendor_name: "WALTON COUNTY SHERIF", check_number: "2", journal: "J3", object_code: "534000" },
      { pay_date: "2026-04-03", amount_cents: 50, vendor_name: "TRANSFER", check_number: "3", journal: "J4", object_code: "591000" },
    ]);
    expect(collapsed.map((item) => item.lines)).toEqual([1, 3]);
    expect(collapsed[1].row.vendor_name).toBe("ADKINSON LAW FIRM");
    const shared = collapsePayments([
      { pay_date: "2026-04-03", amount_cents: 100, vendor_name: "", check_number: "9", journal: "", object_code: "534000" },
      { pay_date: "2026-04-03", amount_cents: 100, vendor_name: "ADKINSON LAW FIRM", check_number: "9", journal: "", object_code: "552000" },
    ]);
    expect(shared).toHaveLength(1);
    expect(shared[0].lines).toBe(2);
    expect(shared[0].row.vendor_name).toBe("ADKINSON LAW FIRM");
    expect(vendorSpendAnswer("Lowe's Home Centers", { cents: 80000, lines: 99, checks: 99, names: [], transferOnly: false })).toBe(
      "The county paid Lowe's Home Centers $800.00 so far this year. That is 99 payments.",
    );
    expect(vendorSpendAnswer("Lowe's Home Centers", { cents: 80000, lines: 99, checks: 99, names: [], transferOnly: false })).not.toContain("check");
    const labels = disambiguatedDepartmentNames(
      [
        { code: "11101000", fund_code: "111", report_name: "Marketing" },
        { code: "00122000", fund_code: "001", report_name: "Marketing" },
      ],
      { fund: new Map([["111", "Tourist Development"], ["001", "General Fund"]]), department: new Map(), object: new Map() },
      new Map([
        ["111", "Tourist Development"],
        ["001", "General Fund"],
      ]),
    );
    expect(labels.get("11101000")).toBe("Marketing (Tourist Development)");
    expect(labels.get("00122000")).toBe("Marketing (General Fund)");
    const housing = disambiguatedDepartmentNames(
      [
        { code: "11040000", fund_code: "110", report_name: "Housing & Urban Development" },
        { code: "00140000", fund_code: "001", report_name: "Housing & Urban Development" },
      ],
      { fund: new Map([["110", "Housing & Urban Development Fund"], ["001", "General Fund"]]), department: new Map(), object: new Map() },
      new Map([
        ["110", "Housing & Urban Development Fund"],
        ["001", "General Fund"],
      ]),
    );
    expect(housing.get("11040000")).toBe("Housing & Urban Development (11040000)");
    expect(housing.get("00140000")).toBe("Housing & Urban Development (General Fund)");
    expect(housing.get("11040000")).not.toContain("Housing & Urban Development Fund");
  });

  it("merges categories that share a label and drops a zero row", async () => {
    const { raw, db } = openDb();
    raw.exec(`INSERT INTO accounts (import_id, fund_code, dept_code, object_code, project_code, rev_cents, ytd_cents)
       VALUES (1, '111', '11101000', '561000', '', 100, 50),
              (1, '111', '11101000', '571000', '', 40, 10),
              (1, '111', '11101000', '581000', '', 0, 0)`);
    const rows = await loadCategorySpend(db, 1, { fund: "111" });
    const other = rows.filter((row) => row.label === "Other costs");
    expect(other).toHaveLength(1);
    expect(other[0].rev_cents).toBe(140);
    expect(other[0].ytd_cents).toBe(60);
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
    expect(overview).toContain("Commissioners adopted a $3,000 budget for FY2026");
    expect(overview).toContain("the county's books show");
    expect(overview).toContain("paid out");
    expect(overview).toContain("about $192M");
    expect(overview).toContain("Resolution 2025-82");
    expect(overview).toContain("budget limit after mid-year changes");
    expect(overview).toContain("Share of the mid-year limit: 39.2%");
    expect(overview).toContain("Paid out is 39.2% of the mid-year limit, and 96% of the year is gone.");
    expect(overview).not.toContain("under the year's progress");
    expect(overview).not.toContain("ahead of the year's progress");
    expect(overview).not.toContain("of its $3,700");
    expect(overview).not.toContain("current budget");
    expect(overview).not.toContain("$200M");
    expect(overview).not.toContain("$151M");
    expect(overview).not.toContain("carryforward");
    expect(overview).not.toContain("carry-over");
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
    expect(fund.indexOf("Adopted budget")).toBeLessThan(fund.indexOf("Where the money went"));
    expect(fund).toContain("Paid out");
    expect(fund).not.toContain("$800</b><span>$800");
    expect(fund).toContain("Lowe&#39;s Home Centers");
    expect(fund).toContain("$500.00");
    expect(fund).toContain("Money left");
    expect(fund).toContain("$1,500");
    expect(fund).toContain("$800");
    expect(fund).toContain('href="/departments/11101000"');
    expect(fund).toContain("/search?fund=111&amp;vendor=");
    expect(fund).toContain("Lowe&#39;s Home Centers");
    expect(fund).not.toContain("SHERIF");

    const dept = await (await app.request("http://localhost/departments/11101000", { headers }, env)).text();
    expect(dept.indexOf("Adopted budget")).toBeLessThan(dept.indexOf("Where the money went"));
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
    expect(lowesAnswer).toContain("That is 2 payments.");
    expect(lowesAnswer).not.toMatch(/\d+ checks/);
    expect(lowesAnswer).not.toContain("could not be answered");
    const lowesAgain = await ask("How much did the county pay Lowes this year?");
    expect(lowesAgain).toContain("$800.00");
    const missing = await ask("How much did the county pay Zzznotavendor this year?");
    expect(missing).not.toContain("No vendor in this budget matches that name.");
    expect(missing).toContain("The imported data does not contain an answer to that question.");
    const most = await ask("Who is paid the most?");
    expect(most).toContain("Lowe&#39;s Home Centers");
    expect(most).toContain("$800.00");
    expect(most).not.toContain("SHERIF");
    const budget = await ask("What is the county budget?");
    expect(budget).toContain("Commissioners adopted a $3,000 budget");
    expect(budget).toContain("about $192M");
    expect(budget).not.toContain("current budget");
    expect(budget).not.toContain("$200M");
    expect(budget).not.toContain("$151M");
    expect(budget).not.toContain("$7,033");

    const search = await (await app.request("http://localhost/search", { headers }, env)).text();
    expect(search).toContain("$1,450.00");
    expect(search).not.toContain("$4,783.00");
    expect(search).toContain("Money moved between county funds is not included.");
    expect(search).toContain("year-to-date column on the account report");
    expect(search).toContain("Lines dated after the report date are left out of this search.");
    const withTransfers = await (await app.request("http://localhost/search?transfers=1", { headers }, env)).text();
    expect(withTransfers).toContain("$4,783.00");
    expect(budget).not.toContain("$6,333");
    const transfers = await ask("How much was transferred between funds?");
    expect(transfers).toContain("$3,333");
    expect(transfers).toContain("$7,033");
    const tourist = await ask("What is the Tourist Development budget?");
    expect(tourist).toContain("$1,500");
    expect(tourist).toContain("$800");
  });
});

describe("expression depth, reversals, land, and the money left card", () => {
  it("guards D1 expression depth and still filters hidden names", async () => {
    expect(sqlExpressionDepth("a")).toBe(1);
    expect(sqlExpressionDepth("replace(replace(replace(x,'a',''),'b',''),'c','')")).toBe(4);
    let chain = "a";
    for (let i = 0; i < 99; i++) chain += " OR a";
    expect(sqlExpressionDepth(chain)).toBe(100);
    expect(PAYMENT_SCOPE_SQL).toContain("is_person_name = 0");
    expect(PAYMENT_SCOPE_SQL).not.toContain("LIKE '% LLC %'");
    const scopeDepth = sqlExpressionDepth(PAYMENT_SCOPE_SQL);
    expect(scopeDepth).toBeLessThanOrEqual(100);
    const crowded = `import_id = ?
         AND after_cutoff = 0
         AND object_code != '591000'
         AND NOT ${CONSTITUTIONAL_SQL}
         AND (? = 1 OR ${sqlIsPersonName("vendor_name")} = 0)
         AND (? = '' OR fund_code = ?)
         AND (? = '' OR dept_code = ?)`;
    expect(sqlExpressionDepth(crowded)).toBeGreaterThan(100);

    const { db } = openDb();
    const insert = db.prepare(
      `INSERT INTO payments (import_id, fund_code, dept_code, object_code, project_code, pay_date, amount_cents, vendor_name, check_number, after_cutoff, is_person_name, dedupe_key)
       VALUES (1, '111', '11141090', '534000', '', ?, ?, ?, ?, 0, ?, ?)`,
    );
    const add = async (date: string, cents: number, vendor: string, check: string, person: number, key: string) => {
      await insert.bind(date, cents, vendor, check, person, key).run();
    };
    await add("2025-12-22", 1_248_750_000, "ADKINSON LAW FIRM", "A1", 0, "p1");
    await add("2026-04-02", 1_248_750_000, "ADKINSON LAW FIRM", "A2", 0, "p2");
    await add("2026-04-03", 1_248_750_000, "", "A3", 0, "p3");
    await add("2026-04-04", -1_248_750_000, "ADKINSON LAW FIRM", "A4", 0, "p4");
    await add("2026-05-01", 7_728_500, "ADKINSON LAW FIRM", "A5", 0, "p5");
    await add("2026-01-01", 24_750_000, "DISTRICT ONE", "D1", 0, "d1");
    await add("2026-02-01", 24_750_000, "DISTRICT ONE", "D2", 0, "d2");
    await add("2026-03-01", 24_750_000, "DISTRICT ONE", "D3", 0, "d3");
    await add("2026-03-02", -24_750_000, "DISTRICT ONE", "D4", 0, "d4");
    await add("2026-03-03", -24_750_000, "DISTRICT ONE", "D5", 0, "d5");
    await add("2026-06-01", 9_000, "JANE Q PUBLIC", "J1", 1, "j1");
    await add("2026-06-02", 5_000, "ACME SUPPLY CO", "C1", 0, "c1");

    const hidden = await loadLargestPayments(db, 1, { showNames: false, fund: "111" });
    expect(hidden.some((row) => (row.vendor_name || "").includes("JANE"))).toBe(false);
    expect(hidden.some((row) => row.vendor_name === "ACME SUPPLY CO")).toBe(true);
    const shown = await loadLargestPayments(db, 1, { showNames: true, fund: "111" });
    expect(shown.some((row) => row.vendor_name === "JANE Q PUBLIC")).toBe(true);
    const adkinson = shown.filter((row) => row.vendor_name === "ADKINSON LAW FIRM");
    expect(adkinson.map((row) => row.amount_cents).sort((a, b) => b - a)).toEqual([1_248_750_000, 7_728_500]);
    expect(shown.some((row) => !(row.vendor_name || "").trim() && row.amount_cents === 1_248_750_000)).toBe(false);
    const district = shown.filter((row) => row.vendor_name === "DISTRICT ONE");
    expect(district).toHaveLength(1);
    expect(district[0].amount_cents).toBe(24_750_000);
    const netTotal = adkinson.reduce((sum, row) => sum + row.amount_cents, 0);
    expect(netTotal).toBeLessThanOrEqual(1_248_750_000 + 7_728_500);
  });

  it("nets a posted reversal and drops the blank twin", () => {
    const rows = [
      { pay_date: "2025-12-22", amount_cents: 100, vendor_name: "ADKINSON LAW FIRM", check_number: "1", journal: "", invoice: "" },
      { pay_date: "2026-04-02", amount_cents: 100, vendor_name: "ADKINSON LAW FIRM", check_number: "2", journal: "", invoice: "" },
      { pay_date: "2026-04-03", amount_cents: 100, vendor_name: "", check_number: "3", journal: "", invoice: "" },
      { pay_date: "2026-04-04", amount_cents: -100, vendor_name: "ADKINSON LAW FIRM", check_number: "4", journal: "", invoice: "" },
    ];
    const nets = new Map([["ADKINSON LAW FIRM", 100]]);
    const kept = netPaymentReversals(rows, nets);
    expect(kept).toHaveLength(1);
    expect(kept[0].vendor_name).toBe("ADKINSON LAW FIRM");
    expect(kept[0].amount_cents).toBe(100);
  });

  it("labels land that covers a department overage and shortens the money left card", () => {
    const land = 1_517_870_800;
    const budget = 459_519_000;
    const covered = capitalLinesCovering(land, budget, [{ object_code: "561000", title: "LAND", ytd_cents: land }]);
    expect(covered).toHaveLength(1);
    expect(capitalLinesCovering(100, 80, [{ object_code: "552000", title: "SUPPLIES", ytd_cents: 100 }])).toBeNull();

    const row = {
      id: 1,
      created_at: "",
      published_at: null,
      data_as_of: "2026-09-15",
      filename: null,
      status: "published",
      note: null,
      fund_count: 1,
      department_count: 1,
      account_count: 1,
      payment_count: 0,
      payroll_batch_count: 0,
      payroll_line_count: 0,
      after_cutoff_count: 0,
      recon_mismatch_count: 0,
      orig_cents: budget,
      adj_cents: 0,
      rev_cents: budget,
      ytd_cents: land,
      enc_cents: 0,
      avail_cents: 0,
      printed_orig_cents: null,
      printed_rev_cents: null,
      printed_ytd_cents: null,
    };
    const dept = {
      code: "11141090",
      fund_code: "111",
      report_name: "Beach Tram",
      orig_cents: budget,
      adj_cents: 0,
      rev_cents: budget,
      ytd_cents: land,
      enc_cents: 0,
      avail_cents: 0,
      accounts: 1,
      transfer_orig_cents: 0,
      transfer_rev_cents: 0,
      transfer_ytd_cents: 0,
      transfer_enc_cents: 0,
    };
    const fundHtml = renderFund({
      row,
      fund: {
        code: "111",
        report_name: "Tourist Development",
        orig_cents: 20_000_000_00,
        adj_cents: 0,
        rev_cents: 20_000_000_00,
        ytd_cents: 16_000_000_00,
        enc_cents: 0,
        avail_cents: 0,
        accounts: 1,
        transfer_orig_cents: 0,
        transfer_rev_cents: 0,
        transfer_ytd_cents: 0,
        transfer_enc_cents: 0,
      },
      departments: [dept],
      categories: [],
      accounts: [],
      vendors: [],
      payments: [],
      officeCents: 0,
      names: { fund: new Map([["111", "Tourist Development"]]), department: new Map([["11141090", "Beach Tram"]]), object: new Map() },
      displayName: () => ({ text: "", shortened: false }),
      capitalByDept: new Map([["11141090", [{ object_code: "561000", title: "LAND", ytd_cents: land }]]]),
      csrf: "t",
      isAdmin: false,
      showNames: true,
    });
    expect(fundHtml).toContain("Includes $15,178,708 coded to Land (account 561000).");
    expect(fundHtml).not.toContain("Over budget by");
    expect(fundHtml).not.toContain("may reflect an amendment");
    expect(fundHtml).not.toContain("\u2014");
    expect(fundHtml).not.toContain("\u2013");

    const left = 16_911_787_800;
    const spent = 1_000_000_000;
    const current = spent + left;
    const overviewHtml = renderOverview({
      row,
      departments: [],
      funds: [],
      fundReports: new Map(),
      names: { fund: new Map(), department: new Map(), object: new Map() },
      months: [],
      vendors: [],
      officeCents: 0,
      landByMonth: [],
      landByDept: new Map(),
      platMonths: [],
      facts: {
        grossOrig: spent,
        grossRev: current,
        grossYtd: spent,
        grossEnc: 0,
        transferOrig: 0,
        transferRev: 0,
        transferYtd: 0,
        transferEnc: 0,
        adopted: spent,
        current,
        spent,
        encumbered: 0,
        left,
        amendments: current - spent,
        transfer: 0,
        spentOfCurrentPct: 5.6,
        spentOfAdoptedPct: 100,
      },
      displayName: () => ({ text: "", shortened: false }),
      csrf: "t",
      isAdmin: false,
      showNames: true,
    });
    const card = overviewHtml.slice(overviewHtml.indexOf("kpi k4"), overviewHtml.indexOf("kpi k4") + 400);
    expect(card).toContain("$169.1M");
    expect(card).not.toContain("169,117,878");
    expect(overviewHtml).toContain("Paid out is 5.6% of the mid-year limit");
    expect(overviewHtml).not.toContain("under the year's progress");
    expect(overviewHtml).not.toContain("$663.8M");
    expect(overviewHtml).not.toContain("$468.3M");
    expect(overviewHtml).not.toContain("$494.7M");
  });
});
