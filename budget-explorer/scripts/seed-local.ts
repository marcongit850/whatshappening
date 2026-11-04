import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chartFromCsv, chartFromGlText, type ChartNames } from "../src/csv.ts";
import { importNote, parseAccountDetail, parseReport, type ParseResult } from "../src/parser.ts";
import { xlsxToRows } from "../src/xlsx.ts";

/** Quote a SQL literal. A NUL would end the statement under sqlite3 .read, so refuse it. */
export function q(value: string): string {
  if (value.includes("\0")) throw new Error("Refusing to seed a value that contains a NUL character.");
  return `'${value.replace(/'/g, "''")}'`;
}

function text(value: string): string {
  q(value);
  return value;
}

async function main(): Promise<void> {
const reportPath = process.argv[2];
const chartPath = process.argv[3];
if (!reportPath) {
  console.error("Usage: tsx scripts/seed-local.ts /path/to/account-detail.xlsx [/path/to/chart.pdf]");
  process.exit(1);
}

const parsed = await loadReport(reportPath);
const orig = sum(parsed.accounts.map((row) => row.origCents));
const rev = sum(parsed.accounts.map((row) => row.revCents));
const ytd = sum(parsed.accounts.map((row) => row.ytdCents));
console.log(`funds ${parsed.funds.length}`);
console.log(`accounts ${parsed.accounts.length}`);
console.log(`payments ${parsed.payments.length}`);
console.log(`payroll batches ${parsed.payrollBatches.length}`);
console.log(`payroll lines ${parsed.payrollLines.length}`);
console.log(`after report date ${parsed.afterCutoffCount}`);
console.log(`recon mismatches ${parsed.reconMismatches.length}`);
console.log(`original ${(orig / 100).toFixed(2)}`);
console.log(`revised ${(rev / 100).toFixed(2)}`);
console.log(`spent ${(ytd / 100).toFixed(2)}`);
if (parsed.printed) {
  const enc = sum(parsed.accounts.map((row) => row.encCents));
  if (parsed.printed.origCents !== orig || parsed.printed.revCents !== rev || parsed.printed.ytdCents !== ytd || parsed.printed.encCents !== enc) {
    console.error("Parsed totals do not match the printed expense total.");
    process.exit(1);
  }
}
console.log(`data as of ${parsed.dataAsOf}`);
console.log(`rejected amount cells ${parsed.rejectedCellCount}`);

const chart = mergeCharts(chartFromParsed(parsed), await loadChart(chartPath));
if (chart) {
  console.log(`chart funds ${chart.funds.length} departments ${chart.departments.length} objects ${chart.objects.length}`);
} else {
  console.log("chart of accounts was not reachable. Names will show as unmatched.");
}

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const dbFile = findLocalDb(projectRoot);
const writes = seedDatabase(dbFile, parsed, chart, orig, rev, ytd);
const checkDb = new DatabaseSync(dbFile, { readOnly: true });
try {
  const check = checkDb
    .prepare("SELECT fund_count, account_count, payment_count, printf('%.2f', ytd_cents/100.0) AS spent FROM imports WHERE status='published' ORDER BY id DESC LIMIT 1")
    .get() as { fund_count: number; account_count: number; payment_count: number; spent: string };
  console.log(`published local import from ${writes} statements`);
  console.log(`${check.fund_count}|${check.account_count}|${check.payment_count}|${check.spent}`);
} finally {
  checkDb.close();
}
}

const invoked = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked) await main();

function findLocalDb(projectRoot: string): string {
  const dir = join(projectRoot, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  if (files.length !== 1) {
    throw new Error("Expected one local D1 database after migrations. Run scripts/seed-local.sh so wrangler can create it.");
  }
  return join(dir, files[0]);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function seedDatabase(dbFile: string, parsed: ParseResult, chart: ChartNames | null, orig: number, rev: number, ytd: number): number {
  const db = new DatabaseSync(dbFile);
  let writes = 0;
  try {
    db.exec("BEGIN");
    db.exec(`DELETE FROM payments;
DELETE FROM payroll_lines;
DELETE FROM payroll_batches;
DELETE FROM accounts;
DELETE FROM departments;
DELETE FROM funds;
DELETE FROM imports;`);
    const createdAt = new Date().toISOString();
    const inserted = db
      .prepare(
        `INSERT INTO imports (
          created_at, data_as_of, filename, status, note, fund_count, department_count, account_count,
          payment_count, payroll_batch_count, payroll_line_count, after_cutoff_count, recon_mismatch_count,
          orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents,
          printed_orig_cents, printed_rev_cents, printed_ytd_cents, published_at
        ) VALUES (?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        text(createdAt),
        text(parsed.dataAsOf),
        text("local-report.txt"),
        text(importNote(parsed.foldedPayrollBatches, parsed.rejectedCellCount)),
        parsed.funds.length,
        parsed.departments.length,
        parsed.accounts.length,
        parsed.payments.length,
        parsed.payrollBatches.length,
        parsed.payrollLines.length,
        parsed.afterCutoffCount,
        parsed.reconMismatches.length,
        orig,
        sum(parsed.accounts.map((row) => row.adjCents)),
        rev,
        ytd,
        sum(parsed.accounts.map((row) => row.encCents)),
        sum(parsed.accounts.map((row) => row.availCents)),
        parsed.printed ? parsed.printed.origCents : null,
        parsed.printed ? parsed.printed.revCents : null,
        parsed.printed ? parsed.printed.ytdCents : null,
        text(createdAt),
      );
    writes += 1;
    const importId = Number(inserted.lastInsertRowid);
    const fundStmt = db.prepare("INSERT INTO funds (import_id, code, report_name) VALUES (?, ?, ?)");
    for (const fund of parsed.funds) {
      fundStmt.run(importId, text(fund.code), text(fund.reportName));
      writes += 1;
    }
    const deptStmt = db.prepare("INSERT INTO departments (import_id, code, fund_code, report_name) VALUES (?, ?, ?, ?)");
    for (const dept of parsed.departments) {
      deptStmt.run(importId, text(dept.code), text(dept.fund), text(dept.reportName));
      writes += 1;
    }
    const accountStmt = db.prepare(`INSERT INTO accounts (
      import_id, fund_code, dept_code, object_code, project_code, title,
      orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents,
      payment_sum_cents, recon_diff_cents, is_payroll, line_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const account of parsed.accounts) {
      accountStmt.run(
        importId,
        text(account.fund),
        text(account.dept),
        text(account.objectCode),
        text(account.project),
        text(account.title),
        account.origCents,
        account.adjCents,
        account.revCents,
        account.ytdCents,
        account.encCents,
        account.availCents,
        account.paymentSumCents,
        account.reconDiffCents,
        account.isPayroll ? 1 : 0,
        account.lineCount,
      );
      writes += 1;
    }
    const paymentStmt = db.prepare(`INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key, is_person_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of parsed.payments) {
      paymentStmt.run(
        importId,
        text(row.fund),
        text(row.dept),
        text(row.objectCode),
        text(row.project),
        text(row.journal),
        text(row.payDate),
        text(row.source),
        row.amountCents,
        text(row.vendorNumber),
        text(row.vendorName),
        text(row.invoice),
        text(row.checkNumber),
        text(row.description),
        row.afterCutoff ? 1 : 0,
        text(row.dedupeKey),
        row.isPersonName ? 1 : 0,
      );
      writes += 1;
    }
    const batchStmt = db.prepare(`INSERT INTO payroll_batches (
      import_id, fund_code, dept_code, object_code, project_code, batch_key, pay_date, amount_cents, line_count, below_minimum
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const batch of parsed.payrollBatches) {
      batchStmt.run(
        importId,
        text(batch.fund),
        text(batch.dept),
        text(batch.objectCode),
        text(batch.project),
        text(batch.batchKey),
        text(batch.payDate),
        batch.amountCents,
        batch.lineCount,
        batch.belowMinimum ? 1 : 0,
      );
      writes += 1;
    }
    const lineStmt = db.prepare(`INSERT INTO payroll_lines (
      import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, employee_name, batch_key, after_cutoff, dedupe_key, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const line of parsed.payrollLines) {
      lineStmt.run(
        importId,
        text(line.fund),
        text(line.dept),
        text(line.objectCode),
        text(line.project),
        text(line.journal),
        text(line.payDate),
        text(line.source),
        line.amountCents,
        text(line.employeeName),
        text(line.batchKey),
        line.afterCutoff ? 1 : 0,
        text(line.dedupeKey),
        text(line.description),
      );
      writes += 1;
    }
    if (chart) {
      const chartStmt = db.prepare("INSERT INTO chart_names (kind, code, name) VALUES (?, ?, ?) ON CONFLICT(kind, code) DO UPDATE SET name = excluded.name");
      for (const row of chart.funds) {
        chartStmt.run(text("fund"), text(row.code), text(row.name));
        writes += 1;
      }
      for (const row of chart.departments) {
        chartStmt.run(text("department"), text(row.code), text(row.name));
        writes += 1;
      }
      for (const row of chart.objects) {
        chartStmt.run(text("object"), text(row.code), text(row.name));
        writes += 1;
      }
    }
    db.exec("COMMIT");
    return writes;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* The transaction may already be closed. */
    }
    throw error;
  } finally {
    db.close();
  }
}

async function loadReport(path: string) {
  if (path.toLowerCase().endsWith(".xlsx")) {
    const bytes = new Uint8Array(readFileSync(path));
    return parseAccountDetail(xlsxToRows(bytes));
  }
  const { readFile } = await import("node:fs/promises");
  return parseReport(await readFile(path, "utf8"));
}

function chartFromParsed(result: ReturnType<typeof parseReport>): ChartNames {
  const objects = new Map<string, Map<string, number>>();
  for (const account of result.accounts) {
    const name = account.title.trim();
    if (!name) continue;
    if (!objects.has(account.objectCode)) objects.set(account.objectCode, new Map());
    const names = objects.get(account.objectCode)!;
    names.set(name, (names.get(name) || 0) + 1);
  }
  const objectRows: { code: string; name: string }[] = [];
  for (const [code, names] of objects) {
    let best = "";
    let bestCount = -1;
    for (const [name, count] of names) {
      if (count > bestCount) {
        best = name;
        bestCount = count;
      }
    }
    if (best) objectRows.push({ code, name: best });
  }
  return {
    funds: result.funds.filter((row) => row.reportName).map((row) => ({ code: row.code, name: row.reportName })),
    departments: result.departments.filter((row) => row.reportName).map((row) => ({ code: row.code, name: row.reportName })),
    objects: objectRows,
  };
}

function mergeCharts(base: ChartNames, extra: ChartNames | null): ChartNames {
  if (!extra) return base;
  const pick = (kind: "funds" | "departments" | "objects") => {
    const map = new Map<string, string>();
    for (const row of base[kind]) if (row.name) map.set(row.code, row.name);
    for (const row of extra[kind]) if (row.name) map.set(row.code, row.name);
    return [...map.entries()].map(([code, name]) => ({ code, name }));
  };
  return { funds: pick("funds"), departments: pick("departments"), objects: pick("objects") };
}

function pdfText(path: string): string {
  const script = `
import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
print("\\n".join((page.extract_text() or "") for page in reader.pages))
`;
  return execFileSync("python3", ["-c", script, path], { encoding: "utf8", maxBuffer: 20_000_000 });
}

async function loadChart(path?: string): Promise<ChartNames | null> {
  const collected: ChartNames = { funds: [], departments: [], objects: [] };
  if (path) {
    if (path.toLowerCase().endsWith(".pdf")) {
      try {
        const chart = chartFromGlText(pdfText(path));
        collected.departments.push(...chart.departments);
        console.log(`chart pdf departments ${chart.departments.length}`);
      } catch (error) {
        console.error(`Chart PDF was not read (${error instanceof Error ? error.message : "unknown"}). Names from the workbook are still used. Install pypdf if you want the PDF: python3 -m pip install pypdf`);
      }
    } else {
      const { readFile } = await import("node:fs/promises");
      const chart = chartFromGlText(await readFile(path, "utf8"));
      collected.departments.push(...chart.departments);
    }
  }
  try {
    const funds = await fetchText("https://budget-waltoncountyfl.com/assets/data/funds.csv");
    const expenses = await fetchText("https://budget-waltoncountyfl.com/assets/data/expenditures.csv");
    const fundChart = chartFromCsv(funds);
    const expenseChart = chartFromCsv(expenses);
    collected.funds.push(...(fundChart?.funds || []));
    collected.departments.push(...(expenseChart?.departments || []));
    collected.objects.push(...(expenseChart?.objects || []));
  } catch {
    console.log("online chart was not reachable");
  }
  if (!collected.funds.length && !collected.departments.length && !collected.objects.length) return null;
  return collected;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  return response.text();
}
