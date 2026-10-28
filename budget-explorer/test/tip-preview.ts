import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import app from "../src/app";
import { newSession, signSession } from "../src/auth";
import { buildLedger, ledgerToSql } from "../src/published";

const root = join(import.meta.dirname, "..");

function openRaw(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  const migrations = join(root, "migrations");
  raw.exec(readFileSync(join(migrations, "0001_init.sql"), "utf8"));
  raw.exec(readFileSync(join(migrations, "0002_settings.sql"), "utf8"));
  raw.exec(readFileSync(join(migrations, "0003_revenue_reserves.sql"), "utf8"));
  return raw;
}

/** Same spending rows the dashboard tests use, plus the published income and savings ledger. */
function seed(raw: DatabaseSync): void {
  const platformYtd = 99_900;
  const importYtd = 600_900;
  const importRev = 10_100_000;
  const importEnc = 80_000;
  const importAvail = importRev - importYtd - importEnc;
  raw.exec(`INSERT INTO imports (
    id, created_at, status, published_at, data_as_of, filename,
    fund_count, department_count, account_count, payment_count, payroll_line_count,
    orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents, after_cutoff_count
  ) VALUES (
    1, '2026-09-16T00:00:00Z', 'published', '2026-09-16T00:00:00Z', '2026-09-15', 'sample.txt',
    2, 5, 6, 8, 1,
    ${importRev}, 0, ${importRev}, ${importYtd}, ${importEnc}, ${importAvail}, 1
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
    ["001", "00122000", "534000", "PLATFORM SERVICES", 200_000, platformYtd, 0],
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
    ["001", "00122000", "534000", "2025-11-02", "API", 100, "1004", "PUBLIC, JANE Q", "P1", 0, "p1", 1],
    ["001", "00133000", "534000", "2026-01-20", "API", 100, "0402", "WASTE MANAGEMENT", "W1", 0, "w1", 1],
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
  const readJson = (name: string) => JSON.parse(readFileSync(join(root, "sources", name), "utf8")) as unknown;
  raw.exec(ledgerToSql(buildLedger(readJson("revenue.json"), readJson("reserves.json"), readJson("beach-vending.json"))));
}

function database(raw: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = raw.prepare(sql);
      let bound: unknown[] = [];
      const api = {
        bind(...args: unknown[]) {
          bound = args;
          return api;
        },
        async first<T>() {
          return (stmt.get(...(bound as never[])) as T | undefined) ?? null;
        },
        async all<T>() {
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
}

export async function startTipPreview(): Promise<{ url: string; close: () => Promise<void> }> {
  const raw = openRaw();
  seed(raw);
  const env = {
    DB: database(raw),
    AI: { async run() { return { response: "Quoted from the FACT lines." }; } },
    SITE_PASSWORD: "site-secret",
    SESSION_SECRET: "session-secret",
    ADMIN_PASSWORD: "admin-secret",
    PUBLIC_BASE_URL: "",
  };
  const token = await signSession(env.SESSION_SECRET, newSession(false));
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const existing = headers.get("cookie");
      headers.set("cookie", existing ? `${existing}; be_session=${token}` : `be_session=${token}`);
      const request = new Request(url, { method: req.method, headers });
      const response = await app.fetch(request, env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") return;
        res.setHeader(key, value);
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.stack || error.message : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Preview server did not bind a port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
