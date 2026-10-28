import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { PUBLIC_PATHS } from "../src/view";
import {
  buildLedger,
  classifyRevenueCode,
  ledgerFromRows,
  ledgerToSql,
  parseBudgetCsv,
  percentTenths,
  ReconciliationError,
  rollupBudget,
  type PublishedRow,
} from "../src/published";

const root = join(import.meta.dirname, "..");

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(root, "sources", name), "utf8")) as unknown;
}

function openDb(): { raw: DatabaseSync; db: D1Database } {
  const raw = new DatabaseSync(":memory:");
  const migrations = join(root, "migrations");
  raw.exec(readFileSync(join(migrations, "0001_init.sql"), "utf8"));
  raw.exec(readFileSync(join(migrations, "0002_settings.sql"), "utf8"));
  raw.exec(readFileSync(join(migrations, "0003_revenue_reserves.sql"), "utf8"));
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

function seedSpending(raw: DatabaseSync): void {
  raw.exec(`INSERT INTO imports (
    id, created_at, status, published_at, data_as_of, filename,
    fund_count, department_count, account_count, payment_count, payroll_line_count,
    orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents, after_cutoff_count
  ) VALUES (
    1, '2026-09-16T00:00:00Z', 'published', '2026-09-16T00:00:00Z', '2026-09-15', 'sample.txt',
    2, 2, 2, 0, 0,
    100000, 0, 100000, 40000, 0, 60000, 0
  )`);
  raw.exec(`INSERT INTO funds (import_id, code, report_name) VALUES
    (1, '001', 'GENERAL'),
    (1, '111', 'TOURIST DEVELOPMENT')`);
  raw.exec(`INSERT INTO departments (import_id, code, fund_code, report_name) VALUES
    (1, '00122000', '001', 'PLATFORM SERVICES'),
    (1, '11101000', '111', 'TOURIST ADMIN')`);
  raw.exec(`INSERT INTO chart_names (kind, code, name) VALUES
    ('fund', '001', 'General Fund'),
    ('fund', '111', 'Tourist Development'),
    ('department', '00122000', 'Platform Services'),
    ('department', '11101000', 'Tourist Development')`);
  raw.exec(`INSERT INTO accounts (
    import_id, fund_code, dept_code, object_code, project_code, title,
    orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents
  ) VALUES
    (1, '001', '00122000', '534000', '', 'SERVICES', 60000, 0, 60000, 20000, 0, 40000),
    (1, '111', '11101000', '534000', '', 'TOURIST', 40000, 0, 40000, 20000, 0, 20000)`);
}

function envFor(db: D1Database) {
  return {
    DB: db,
    AI: {
      async run() {
        return { response: "Quoted from the FACT lines." };
      },
    },
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

function rowsFrom(raw: DatabaseSync): PublishedRow[] {
  const stored = raw
    .prepare(
      `SELECT section, item_key, parent_key, label, amount_cents, sort_order, basis, fiscal_year, fund_code, status, source_url, source_pages, detail
       FROM published_amounts ORDER BY sort_order, item_key`,
    )
    .all() as Record<string, string | number>[];
  return stored.map((row) => ({
    section: String(row.section),
    itemKey: String(row.item_key),
    parentKey: String(row.parent_key),
    label: String(row.label),
    amountCents: Number(row.amount_cents),
    sortOrder: Number(row.sort_order),
    basis: String(row.basis),
    fiscalYear: Number(row.fiscal_year),
    fundCode: String(row.fund_code),
    status: String(row.status),
    sourceUrl: String(row.source_url),
    sourcePages: String(row.source_pages),
    detail: String(row.detail),
  }));
}

describe("published import", () => {
  const revenue = readJson("revenue.json");
  const reserves = readJson("reserves.json");
  const beach = readJson("beach-vending.json");

  it("reconciles income shares and pie percents to 100", () => {
    const ledger = buildLedger(revenue, reserves, beach);
    const cents = ledger.income.reduce((sum, item) => sum + item.cents, 0);
    expect(cents).toBe(35_459_086_300);
    expect(cents).toBe(ledger.incomeTotalCents);
    const percents = percentTenths(ledger.income.map((item) => item.cents));
    expect(Math.round(percents.reduce((sum, value) => sum + value, 0) * 10)).toBe(1000);
    const classes = percentTenths(ledger.reserves.classes.map((item) => item.cents));
    expect(Math.round(classes.reduce((sum, value) => sum + value, 0) * 10)).toBe(1000);
    expect(ledger.beach.reduce((sum, item) => sum + item.cents, 0)).toBe(188_000_000);
    expect(ledger.reserves.totalCents).toBe(43_883_432_900);
  });

  it("fails when published source shares do not add to the total", () => {
    const copy = structuredClone(revenue) as { fy2025_plain_language_by_source: { items: { amount: number }[] } };
    copy.fy2025_plain_language_by_source.items[0].amount += 1;
    expect(() => buildLedger(copy, reserves, beach)).toThrow(ReconciliationError);
    expect(() => buildLedger(copy, reserves, beach)).toThrow(/add to|does not match|not in the published/);
  });

  it("rejects a budget line with no category rule and a total that does not reconcile", () => {
    expect(() => classifyRevenueCode("999000", "Mystery")).toThrow(/No category rule/);
    const bad = parseBudgetCsv("fund,code,name,amount\n001,311000,Ad valorem,100.00\n001,312100,Bed tax,50.00\n");
    expect(() => rollupBudget(bad, { adoptedTotalCents: 20_000 })).toThrow(/not the adopted total/);
    const good = rollupBudget(bad, { adoptedTotalCents: 15_000 });
    expect(good.keptCents).toBe(15_000);
    const unknown = "fund,code,name,amount\n001,999000,Mystery,10\n";
    expect(() => rollupBudget(parseBudgetCsv(unknown))).toThrow(/No category rule/);
  });

  it("round-trips the ledger through SQL", () => {
    const ledger = buildLedger(revenue, reserves, beach);
    const sql = ledgerToSql(ledger);
    expect(sql).not.toMatch(/\bBEGIN\b/);
    expect(sql).not.toMatch(/\bCOMMIT\b/);
    const { raw } = openDb();
    raw.exec(sql);
    const loaded = ledgerFromRows("2025-09-30", rowsFrom(raw));
    expect(loaded.incomeTotalCents).toBe(ledger.incomeTotalCents);
    expect(loaded.reserves.totalCents).toBe(ledger.reserves.totalCents);
    expect(loaded.beach.map((item) => item.cents)).toEqual(ledger.beach.map((item) => item.cents));
    expect(loaded.budgets.map((year) => year.adoptedCents)).toEqual(ledger.budgets.map((year) => year.adoptedCents));
  });

  it("writes a validated SQL file from the official source files", () => {
    const output = execFileSync(join(root, "node_modules", ".bin", "tsx"), ["scripts/import-published.ts"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(output).toContain("income_cents 35459086300");
    expect(output).toContain("income_pct 100.0");
    expect(output).toContain("reserve_cents 43883432900");
  });
});

describe("revenue and reserves pages", () => {
  it("sends a signed-out visitor to the login page", async () => {
    const { db } = openDb();
    const response = await app.request("http://localhost/revenue", {}, envFor(db));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("renders income, savings, and the overview pie from the published totals", async () => {
    const { raw, db } = openDb();
    seedSpending(raw);
    raw.exec(ledgerToSql(buildLedger(readJson("revenue.json"), readJson("reserves.json"), readJson("beach-vending.json"))));
    const env = envFor(db);
    const header = await cookie();
    const headers = { cookie: header };
    const revenue = await (await app.request("http://localhost/revenue", { headers }, env)).text();
    const reserves = await (await app.request("http://localhost/reserves", { headers }, env)).text();
    const overview = await (await app.request("http://localhost/", { headers }, env)).text();
    const fund = await (await app.request("http://localhost/funds/111", { headers }, env)).text();

    for (const html of [revenue, reserves, overview]) {
      expect(html).toContain("Built from public records.");
      expect(html).toContain("Data as of");
      expect(html).not.toContain("Unofficial");
      expect(html).not.toContain("Not a county website");
      expect(html).toContain('content="noindex"');
      expect(html).not.toContain("\u2013");
      expect(html).not.toContain("\u2014");
      expect(html).not.toContain("523.4");
      expect(html).not.toContain("523,400,000");
      expect(html.toLowerCase()).not.toContain("sheriff reserves");
    }
    expect(revenue).toContain("Audited actual");
    expect(revenue).toContain("Budget");
    expect(revenue).toContain("Paid by Coastal Parasail, Inc.");
    expect(revenue).not.toContain("Inc..");
    expect(revenue).toContain("The county budget file does not explain this line.");
    expect(revenue).not.toContain("not explained in the county budget file");
    expect(revenue.match(/General Fund account 329004\./g)?.length).toBe(3);
    expect(reserves).not.toContain("The commissioners voted to use this for a stated purpose. The commissioners voted");
    expect(revenue).toContain("How much is in savings");
    expect(revenue).toContain("<svg");
    expect(reserves).toContain("Audited year-end balance, not a live balance");
    expect(reserves).toContain('href="/funds/111"');
    expect(reserves).toContain("Resolution 2012-59");
    expect(overview).toContain("See all income sources");
    expect(overview).toContain("How much is in savings");
    expect(overview).toContain('href="/revenue"');
    expect(overview).toContain("<svg");
    const goesAt = overview.indexOf("Where the money goes");
    const comesAt = overview.indexOf("Where the money comes from");
    const paceAt = overview.indexOf("Are departments spending on pace?");
    expect(goesAt).toBeGreaterThan(-1);
    expect(comesAt).toBeGreaterThan(goesAt);
    expect(paceAt).toBeGreaterThan(comesAt);
    const spendCard = overview.slice(overview.lastIndexOf('<div class="card pie-card">', goesAt), comesAt);
    const incomeCard = overview.slice(overview.lastIndexOf('<div class="card income-card pie-card">', comesAt), paceAt);
    expect(spendCard.startsWith('<div class="card pie-card">')).toBe(true);
    expect(spendCard).toContain('class="dn2">spent</text>');
    expect(spendCard).toContain('stroke-width="26"');
    expect(spendCard).toContain('r="72"');
    expect(spendCard).toContain('class="lgs"');
    expect(incomeCard.startsWith('<div class="card income-card pie-card">')).toBe(true);
    expect(incomeCard).toContain('class="dn2">income</text>');
    expect(incomeCard).toContain('stroke-width="26"');
    expect(incomeCard).toContain('r="72"');
    expect(incomeCard).toContain('class="lgs"');
    expect(overview).not.toContain("spent in total");
    expect(overview).not.toContain("private concept prototype");
    for (const html of [overview, revenue, reserves, fund]) {
      expect(html).not.toContain("<summary>What is this?</summary>");
      expect(html).toContain('aria-label="What is this?"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('class="tip-btn"');
      expect(html).toContain(">?</button>");
      expect(html).not.toMatch(/\u2014|\u2013/);
    }
    expect(overview).toContain("These totals leave out money moved between county funds.");
    expect(revenue).toContain("A transfer moves money from one county fund to another.");
    expect(reserves).toContain("Restricted means a law or an outside rule says what the money is for.");
    expect(reserves).toContain("Fund balance is the savings left in a fund at the end of the year.");
    const tips = (html: string) => html.match(/class="tip-btn"/g)?.length ?? 0;
    expect(tips(overview)).toBeGreaterThan(8);
    expect(tips(revenue)).toBeGreaterThan(8);
    expect(tips(reserves)).toBeGreaterThan(8);
    expect(tips(fund)).toBeGreaterThan(4);
    const duplicateTipIds = (html: string) => {
      const ids = [...html.matchAll(/id="(tip-[^"]+)"/g)].map((match) => match[1]);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    };
    expect(duplicateTipIds(overview)).toEqual([]);
    expect(duplicateTipIds(revenue)).toEqual([]);
    expect(duplicateTipIds(reserves)).toEqual([]);
    expect(duplicateTipIds(fund)).toEqual([]);
    expect(fund).toContain("Savings in this fund");
    expect(fund).toContain("not a live balance");
  });

  it("lists revenue and reserves for a signed-in crawl", async () => {
    expect(PUBLIC_PATHS).toContain("/revenue");
    expect(PUBLIC_PATHS).toContain("/reserves");
    const { raw, db } = openDb();
    seedSpending(raw);
    raw.exec(ledgerToSql(buildLedger(readJson("revenue.json"), readJson("reserves.json"), readJson("beach-vending.json"))));
    const env = envFor(db);
    const headers = { cookie: await cookie() };
    for (const path of PUBLIC_PATHS) {
      const response = await app.request(`http://localhost${path}`, { headers }, env);
      expect(response.status, path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain("noindex");
    }
  });
});
