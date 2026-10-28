import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOP_VENDOR_SQL, TRANSFER_OBJECT } from "../src/budget";
import { organizationVendors, vendorDirectoryWhereSql, type OrgVendor } from "../src/db";
import { CONSTITUTIONAL_SQL } from "../src/overview";

/** The previous per-vendor sort, with the current directory filters. The rewrite has to return these rows. */
const LEGACY_ORG_SQL = `
WITH scoped AS (
  SELECT
    CASE WHEN trim(COALESCE(vendor_number, '')) = '' THEN vendor_name ELSE vendor_number END AS vendor_key,
    vendor_number,
    vendor_name,
    amount_cents,
    object_code
  FROM payments
  WHERE ${vendorDirectoryWhereSql(true)}
)
SELECT s.vendor_key AS vendor_key,
       MAX(s.vendor_number) AS vendor_number,
       (
         SELECT s2.vendor_name FROM scoped s2
         WHERE s2.vendor_key = s.vendor_key AND trim(COALESCE(s2.vendor_name, '')) != ''
         ORDER BY length(trim(s2.vendor_name)) DESC, s2.vendor_name DESC
         LIMIT 1
       ) AS vendor_name,
       SUM(s.amount_cents) AS cents,
       COUNT(*) AS payments,
       SUM(CASE WHEN s.object_code = '561000' THEN s.amount_cents ELSE 0 END) AS land_cents
FROM scoped s
GROUP BY s.vendor_key
ORDER BY cents DESC
LIMIT ?
`;

const LEGACY_TOP_SQL = `
WITH scoped AS (
  SELECT
    CASE WHEN trim(COALESCE(vendor_number, '')) = '' THEN vendor_name ELSE vendor_number END AS vendor_key,
    vendor_name,
    amount_cents,
    check_number,
    object_code
  FROM payments
  WHERE import_id = ?
    AND after_cutoff = 0
    AND object_code != '${TRANSFER_OBJECT}'
    AND vendor_name != ''
    AND NOT ${CONSTITUTIONAL_SQL}
    AND (? = 1 OR is_person_name = 0)
    AND (? = '' OR fund_code = ?)
    AND (? = '' OR dept_code = ?)
)
SELECT
  (
    SELECT s2.vendor_name FROM scoped s2
    WHERE s2.vendor_key = s.vendor_key AND trim(COALESCE(s2.vendor_name, '')) != ''
    ORDER BY length(trim(s2.vendor_name)) DESC, s2.vendor_name DESC
    LIMIT 1
  ) AS vendor_name,
  COALESCE(SUM(s.amount_cents), 0) AS cents,
  COUNT(*) AS lines,
  COUNT(DISTINCT CASE WHEN trim(COALESCE(s.check_number, '')) != '' THEN s.check_number END) AS checks,
  COALESCE(SUM(CASE WHEN s.object_code = '561000' THEN s.amount_cents ELSE 0 END), 0) AS land_cents
FROM scoped s
GROUP BY s.vendor_key
ORDER BY cents DESC
LIMIT 80
`;

interface TopRow {
  vendor_name: string | null;
  cents: number;
  lines: number;
  checks: number;
  land_cents: number;
}

interface LegacyOrg {
  vendor_number: string | null;
  vendor_name: string | null;
  cents: number;
  payments: number;
  land_cents: number;
}

function openRaw(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  const root = join(import.meta.dirname, "..", "migrations");
  raw.exec(readFileSync(join(root, "0001_init.sql"), "utf8"));
  raw.exec(readFileSync(join(root, "0002_settings.sql"), "utf8"));
  return raw;
}

function asD1(raw: DatabaseSync, capture?: string[]): D1Database {
  return {
    prepare(sql: string) {
      capture?.push(sql);
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
  } as unknown as D1Database;
}

function seed(raw: DatabaseSync): void {
  const insert = raw.prepare(`
    INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, pay_date, source,
      amount_cents, vendor_number, vendor_name, check_number, after_cutoff, is_person_name, dedupe_key
    ) VALUES (1, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows: [string, string, string, string, string, number, string | null, string, string, number, number, string][] = [
    ["001", "00101000", "552000", "2026-01-01", "API", 100, "000111", "ACME", "C1", 0, 0, "1"],
    ["001", "00101000", "561000", "2026-01-02", "API", 50, "000111", "ACME SUPPLY CO", "C1", 0, 0, "2"],
    ["111", "11101000", "552000", "2026-02-01", "APM", 25, "000111", "ACME SUPPLY", "C2", 0, 0, "3"],
    ["001", "00101000", "552000", "2026-01-19", "API", 1, "000111", "ACME SUPPLY CO   ", "C17", 0, 0, "4"],
    ["001", "00101000", "552000", "2026-03-20", "API", 3, "000111", "ACME SUPPLY COMPANY", "", 0, 0, "5"],
    ["001", "00101000", "552000", "2026-03-01", "API", 999, "000111", "ACME SUPPLY COMPANY", "C10", 1, 0, "6"],
    ["001", "00101000", "591000", "2026-01-11", "API", 999, "000111", "ACME SUPPLY CO", "C9", 0, 0, "7"],
    ["001", "00101000", "552000", "2026-01-03", "API", 10, "000222", "AAAA", "C3", 0, 0, "8"],
    ["001", "00101000", "552000", "2026-01-04", "API", 10, "000222", "MMMM", "C4", 0, 0, "9"],
    ["001", "00101000", "552000", "2026-01-05", "GRV", 5, "000222", "ZZ", "", 0, 0, "10"],
    ["001", "00101000", "552000", "2026-01-06", "API", 7, "", "SOLO NAME", "C5", 0, 0, "11"],
    ["001", "00101000", "552000", "2026-01-07", "API", 8, "   ", "SOLO NAME", "C5", 0, 0, "12"],
    ["001", "00101000", "552000", "2026-01-08", "API", 9, null, "SOLO NAME LONG", "C6", 0, 0, "13"],
    ["001", "00101000", "552000", "2026-01-09", "API", 40, "000333", "JANE Q", "C7", 0, 1, "14"],
    ["001", "00101000", "552000", "2026-01-09", "API", 15, "000333", "JANE Q PUBLIC", "C18", 0, 1, "15"],
    ["001", "00101000", "552000", "2026-01-10", "API", 999, "000400", "WALTON COUNTY SHERIFF", "C8", 0, 0, "16"],
    ["001", "00102000", "552000", "2026-01-12", "GEN", 11, "000444", "JOURNAL VENDOR", "C11", 0, 0, "17"],
    ["001", "00101000", "552000", "2026-01-13", "API", 4, "000555", "   ", "C12", 0, 0, "18"],
    ["001", "00101000", "552000", "2026-01-14", "API", 6, "000555", "REAL CO", "C13", 0, 0, "19"],
    ["111", "11101000", "552000", "2026-01-15", "API", 2, "000666", " ", "", 0, 0, "20"],
    ["001", "00101000", "534000", "2026-01-16", "API", 20, "000777", "TIE ALPHA", "C14", 0, 0, "21"],
    ["001", "00101000", "534000", "2026-01-17", "API", 20, "000888", "TIE BETA", "C15", 0, 0, "22"],
    ["222", "22201000", "552000", "2026-01-18", "API", 30, "000999", "FUND ONLY CO", "C16", 0, 0, "23"],
    ["001", "00101000", "552000", "2026-01-20", "API", 100, "000123", "ACME SHORT", "C19", 0, 0, "24"],
    ["001", "00101000", "552000", "2026-01-21", "API", 50, "000123", "ACME SHORT PERSON NAME LONGER", "C20", 0, 1, "25"],
    ["001", "00101000", "552000", "2026-01-22", "API", 12, " 000111", "OTHER KEY", "C21", 0, 0, "26"],
  ];
  for (const row of rows) insert.run(...row);
}

function mapOrg(row: LegacyOrg): OrgVendor {
  return {
    vendor_number: row.vendor_number || "",
    vendor_name: (row.vendor_name || "").trim(),
    cents: Number(row.cents),
    payments: Number(row.payments),
    land_cents: Number(row.land_cents),
  };
}

function sortOrg(rows: OrgVendor[]): OrgVendor[] {
  return [...rows].sort((a, b) => b.cents - a.cents || b.vendor_name.localeCompare(a.vendor_name) || a.vendor_number.localeCompare(b.vendor_number));
}

function mapTop(row: TopRow): TopRow {
  return {
    vendor_name: row.vendor_name,
    cents: Number(row.cents),
    lines: Number(row.lines),
    checks: Number(row.checks),
    land_cents: Number(row.land_cents),
  };
}

function sortTop(rows: TopRow[]): TopRow[] {
  return [...rows].sort((a, b) => b.cents - a.cents || String(b.vendor_name).localeCompare(String(a.vendor_name)) || b.lines - a.lines);
}

function planText(raw: DatabaseSync, sql: string, binds: (string | number)[]): string {
  const rows = raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds) as Record<string, unknown>[];
  return rows.map((row) => Object.values(row).join(" ")).join("\n");
}

describe("vendor name queries match the previous results", () => {
  it("picks the same overview vendors, names, totals, and ties", async () => {
    const raw = openRaw();
    seed(raw);
    const captured: string[] = [];
    const db = asD1(raw, captured);
    const asOf = "2026-02-15";
    const legacy = (limit: number) => raw.prepare(LEGACY_ORG_SQL).all(1, asOf, limit) as LegacyOrg[];
    const current = await organizationVendors(db, 1, asOf, true, 40);
    const previous = legacy(40).map(mapOrg);
    expect(sortOrg(current)).toEqual(sortOrg(previous));
    expect(current).toEqual(previous);
    expect(current.map((row) => row.cents)).toEqual([...current.map((row) => row.cents)].sort((a, b) => b - a));

    const acme = current.find((row) => row.vendor_number === "000111");
    expect(acme).toEqual({ vendor_number: "000111", vendor_name: "ACME SUPPLY CO", cents: 176, payments: 4, land_cents: 50 });
    expect(current.find((row) => row.vendor_number === "000222")).toMatchObject({ vendor_name: "MMMM", cents: 25, payments: 3 });
    expect(current.find((row) => row.vendor_name === "SOLO NAME")).toMatchObject({ cents: 15, payments: 2, vendor_number: "   " });
    expect(current.find((row) => row.vendor_name === "SOLO NAME LONG")?.cents).toBe(9);
    expect(current.map((row) => row.vendor_name).join(" ")).not.toMatch(/SHERIFF|JOURNAL|COMPANY/);
    expect(current.find((row) => row.vendor_number === "000333")).toEqual({
      vendor_number: "000333",
      vendor_name: "JANE Q PUBLIC",
      cents: 55,
      payments: 2,
      land_cents: 0,
    });
    expect(current.find((row) => row.vendor_number === "000555")).toEqual({
      vendor_number: "000555",
      vendor_name: "REAL CO",
      cents: 6,
      payments: 1,
      land_cents: 0,
    });
    expect(current.find((row) => row.vendor_number === "000666")).toBeUndefined();
    expect(current.find((row) => row.vendor_number === "000123")).toMatchObject({
      vendor_name: "ACME SHORT PERSON NAME LONGER",
      cents: 150,
      payments: 2,
    });
    expect(current.find((row) => row.vendor_number === " 000111")?.vendor_name).toBe("OTHER KEY");

    const limited = await organizationVendors(db, 1, asOf, true, 2);
    expect(limited).toEqual(legacy(2).map(mapOrg));

    const sql = captured[0] || "";
    expect(sql).toContain("ROW_NUMBER() OVER");
    expect(sql).toContain("PARTITION BY vendor_key");
    expect(sql).not.toContain("SELECT s2.vendor_name");
    expect(planText(raw, sql, [1, asOf, 40]).toUpperCase()).not.toContain("CORRELATED");
  });

  it("picks the same fund and department vendors, including checks and name ties", () => {
    const raw = openRaw();
    seed(raw);
    const run = (showNames: number, fund = "", dept = "") => {
      const binds = [1, showNames, fund, fund, dept, dept] as (string | number)[];
      const legacy = raw.prepare(LEGACY_TOP_SQL).all(...binds) as TopRow[];
      const current = raw.prepare(TOP_VENDOR_SQL).all(...binds) as TopRow[];
      return { legacy: legacy.map(mapTop), current: current.map(mapTop) };
    };

    const shown = run(1);
    expect(sortTop(shown.current)).toEqual(sortTop(shown.legacy));
    expect(shown.current).toEqual(shown.legacy);
    const acme = shown.current.find((row) => row.vendor_name === "ACME SUPPLY COMPANY");
    expect(acme).toMatchObject({ cents: 179, lines: 5, checks: 3, land_cents: 50 });
    expect(shown.current.find((row) => row.vendor_name === "MMMM")).toMatchObject({ cents: 25, lines: 3, checks: 2, land_cents: 0 });
    expect(shown.current.find((row) => row.vendor_name === "JANE Q PUBLIC")).toMatchObject({ cents: 55, lines: 2, checks: 2 });
    expect(shown.current.find((row) => row.vendor_name === "REAL CO")).toMatchObject({ cents: 10, lines: 2, checks: 2 });
    expect(shown.current.find((row) => row.vendor_name === "ACME SHORT PERSON NAME LONGER")).toMatchObject({ cents: 150, lines: 2 });
    expect(shown.current.some((row) => row.vendor_name === null && row.cents === 2)).toBe(true);
    expect(shown.current.map((row) => row.vendor_name || "").join(" ")).not.toContain("SHERIFF");
    expect(shown.current.find((row) => row.vendor_name === "JOURNAL VENDOR")?.cents).toBe(11);

    const hidden = run(0);
    expect(hidden.current).toEqual(hidden.legacy);
    expect(hidden.current.map((row) => row.vendor_name || "").join(" ")).not.toMatch(/JANE|PERSON NAME/);
    expect(hidden.current.find((row) => row.vendor_name === "ACME SHORT")).toMatchObject({ cents: 100, lines: 1 });

    const fund = run(1, "222");
    expect(fund.current).toEqual(fund.legacy);
    expect(fund.current).toEqual([{ vendor_name: "FUND ONLY CO", cents: 30, lines: 1, checks: 1, land_cents: 0 }]);

    const dept = run(0, "", "00102000");
    expect(dept.current).toEqual(dept.legacy);
    expect(dept.current).toEqual([{ vendor_name: "JOURNAL VENDOR", cents: 11, lines: 1, checks: 1, land_cents: 0 }]);

    const plan = planText(raw, TOP_VENDOR_SQL, [1, 1, "", "", "", ""]);
    expect(plan.toUpperCase()).not.toContain("CORRELATED");
    expect(TOP_VENDOR_SQL).toContain("ROW_NUMBER() OVER");
    expect(TOP_VENDOR_SQL).not.toContain("SELECT s2.vendor_name");
  });
});
