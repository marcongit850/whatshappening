import { TRANSFER_OBJECT } from "./budget";
import type { ChartNames } from "./csv";
import { CONSTITUTIONAL_SQL, VENDOR_SOURCES } from "./overview";
import { directoryPersonSql, foldedPayrollNote, type ParseResult, type ParsedPayment, type ParsedPayrollLine } from "./parser";
import { creditCardVendorSql } from "./vendors";

export interface ImportRow {
  id: number;
  created_at: string;
  published_at: string | null;
  data_as_of: string | null;
  filename: string | null;
  status: string;
  note: string | null;
  fund_count: number;
  department_count: number;
  account_count: number;
  payment_count: number;
  payroll_batch_count: number;
  payroll_line_count: number;
  after_cutoff_count: number;
  recon_mismatch_count: number;
  orig_cents: number;
  adj_cents: number;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
  avail_cents: number;
  printed_orig_cents: number | null;
  printed_rev_cents: number | null;
  printed_ytd_cents: number | null;
}

export interface DeptRollup {
  code: string;
  fund_code: string;
  report_name: string;
  orig_cents: number;
  adj_cents: number;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
  avail_cents: number;
  accounts: number;
  transfer_orig_cents: number;
  transfer_rev_cents: number;
  transfer_ytd_cents: number;
  transfer_enc_cents: number;
}

export interface AccountRow {
  fund_code: string;
  dept_code: string;
  object_code: string;
  project_code: string;
  title: string | null;
  orig_cents: number;
  adj_cents: number;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
  avail_cents: number;
  payment_sum_cents: number;
  recon_diff_cents: number;
  is_payroll: number;
  line_count: number;
}

export interface PaymentRow {
  id: number;
  import_id: number;
  fund_code: string;
  dept_code: string;
  object_code: string;
  project_code: string;
  journal: string | null;
  pay_date: string | null;
  source: string | null;
  amount_cents: number;
  vendor_number: string | null;
  vendor_name: string | null;
  invoice: string | null;
  check_number: string | null;
  description: string | null;
  after_cutoff: number;
  dedupe_key: string;
}

export interface ImportRowCounts {
  funds: number;
  departments: number;
  accounts: number;
  payments: number;
  payrollBatches: number;
  payrollLines?: number;
}

export function rowCountsMatch(expected: ImportRowCounts, actual: ImportRowCounts): boolean {
  return (
    expected.funds === actual.funds &&
    expected.departments === actual.departments &&
    expected.accounts === actual.accounts &&
    expected.payments === actual.payments &&
    expected.payrollBatches === actual.payrollBatches &&
    (expected.payrollLines === undefined || actual.payrollLines === undefined || expected.payrollLines === actual.payrollLines)
  );
}

export function historyStatuses(adminUnlocked: boolean): string[] {
  if (adminUnlocked) return ["published", "draft"];
  return ["published"];
}

export interface NameMaps {
  fund: Map<string, string>;
  department: Map<string, string>;
  object: Map<string, string>;
}

async function runChunked(db: D1Database, statements: D1PreparedStatement[], size = 25): Promise<void> {
  for (let i = 0; i < statements.length; i += size) {
    const slice = statements.slice(i, i + size);
    if (slice.length) await db.batch(slice);
  }
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

export async function saveImport(db: D1Database, result: ParseResult, filename: string): Promise<number> {
  const createdAt = new Date().toISOString();
  const inserted = await db
    .prepare(
      `INSERT INTO imports (
        created_at, data_as_of, filename, status, fund_count, department_count, account_count,
        payment_count, payroll_batch_count, payroll_line_count, after_cutoff_count, recon_mismatch_count,
        orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents,
        printed_orig_cents, printed_rev_cents, printed_ytd_cents
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createdAt,
      result.dataAsOf || null,
      filename,
      result.funds.length,
      result.departments.length,
      result.accounts.length,
      result.payments.length,
      result.payrollBatches.length,
      result.payrollLines.length,
      result.afterCutoffCount,
      result.reconMismatches.length,
      sum(result.accounts, (row) => row.origCents),
      sum(result.accounts, (row) => row.adjCents),
      sum(result.accounts, (row) => row.revCents),
      sum(result.accounts, (row) => row.ytdCents),
      sum(result.accounts, (row) => row.encCents),
      sum(result.accounts, (row) => row.availCents),
      result.printed?.origCents ?? null,
      result.printed?.revCents ?? null,
      result.printed?.ytdCents ?? null,
    )
    .run();
  const importId = Number(inserted.meta.last_row_id);

  const fundStmts = result.funds.map((fund) =>
    db.prepare("INSERT INTO funds (import_id, code, report_name) VALUES (?, ?, ?)").bind(importId, fund.code, fund.reportName),
  );
  const deptStmts = result.departments.map((dept) =>
    db
      .prepare("INSERT INTO departments (import_id, code, fund_code, report_name) VALUES (?, ?, ?, ?)")
      .bind(importId, dept.code, dept.fund, dept.reportName),
  );
  const accountStmts = result.accounts.map((account) =>
    db
      .prepare(
        `INSERT INTO accounts (
          import_id, fund_code, dept_code, object_code, project_code, title,
          orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents,
          payment_sum_cents, recon_diff_cents, is_payroll, line_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        importId,
        account.fund,
        account.dept,
        account.objectCode,
        account.project,
        account.title,
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
      ),
  );
  try {
  await runChunked(db, fundStmts);
  await runChunked(db, deptStmts);
  await runChunked(db, accountStmts);
  await insertPayments(db, importId, result.payments);
  const payrollStmts = result.payrollBatches.map((batch) =>
    db
      .prepare(
        `INSERT INTO payroll_batches (
          import_id, fund_code, dept_code, object_code, project_code, batch_key, pay_date, amount_cents, line_count, below_minimum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        importId,
        batch.fund,
        batch.dept,
        batch.objectCode,
        batch.project,
        batch.batchKey,
        batch.payDate,
        batch.amountCents,
        batch.lineCount,
        batch.belowMinimum ? 1 : 0,
      ),
  );
  await runChunked(db, payrollStmts);
  await insertPayrollLines(db, importId, result.payrollLines);
  const stored = await getImport(db, importId);
  const actual = await storedCounts(db, importId);
  const expected = countsFromImport(stored);
  if (!stored || !expected || !rowCountsMatch(expected, actual)) {
    await markFailed(db, importId, "Stored rows do not match the parsed file.");
    throw new Error("Stored rows do not match the parsed file.");
  }
  if (result.foldedPayrollBatches > 0) {
    await db.prepare("UPDATE imports SET note = ? WHERE id = ?").bind(foldedPayrollNote(result.foldedPayrollBatches), importId).run();
  }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await markFailed(db, importId, message);
    throw error;
  }
  return importId;
}

export async function insertPayments(db: D1Database, importId: number, payments: ParsedPayment[]): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  const width = 4;
  for (let i = 0; i < payments.length; i += width) {
    const slice = payments.slice(i, i + width);
    const placeholders = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const binds: (string | number | null)[] = [];
    for (const row of slice) {
      binds.push(
        importId,
        row.fund,
        row.dept,
        row.objectCode,
        row.project,
        row.journal,
        row.payDate,
        row.source,
        row.amountCents,
        row.vendorNumber,
        row.vendorName,
        row.invoice,
        row.checkNumber,
        row.description,
        row.afterCutoff ? 1 : 0,
        row.dedupeKey,
        row.isPersonName ? 1 : 0,
      );
    }
    statements.push(db.prepare(`INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key, is_person_name
    ) VALUES ${placeholders}`).bind(...binds));
  }
  await runChunked(db, statements, 20);
}

export async function insertPayrollLines(db: D1Database, importId: number, lines: ParsedPayrollLine[]): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  const width = 4;
  for (let i = 0; i < lines.length; i += width) {
    const slice = lines.slice(i, i + width);
    const placeholders = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const binds: (string | number | null)[] = [];
    for (const row of slice) {
      binds.push(
        importId,
        row.fund,
        row.dept,
        row.objectCode,
        row.project,
        row.journal,
        row.payDate,
        row.source,
        row.amountCents,
        row.employeeName,
        row.batchKey,
        row.afterCutoff ? 1 : 0,
        row.dedupeKey,
        row.description,
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO payroll_lines (
            import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
            amount_cents, employee_name, batch_key, after_cutoff, dedupe_key, description
          ) VALUES ${placeholders}`,
        )
        .bind(...binds),
    );
  }
  await runChunked(db, statements, 20);
}

export async function publishImport(db: D1Database, importId: number): Promise<void> {
  const stored = await getImport(db, importId);
  const expected = countsFromImport(stored);
  if (!stored || stored.status === "failed" || !expected) throw new Error("That import cannot be published.");
  const actual = await storedCounts(db, importId);
  if (!rowCountsMatch(expected, actual)) {
    await markFailed(db, importId, "Stored rows do not match the parsed file.");
    throw new Error("Stored rows do not match the parsed file.");
  }
  const stamp = new Date().toISOString();
  await db.prepare("UPDATE imports SET status = 'published', published_at = ? WHERE id = ? AND status != 'failed'").bind(stamp, importId).run();
}

function countsFromImport(row: ImportRow | null): ImportRowCounts | null {
  if (!row) return null;
  return {
    funds: row.fund_count,
    departments: row.department_count,
    accounts: row.account_count,
    payments: row.payment_count,
    payrollBatches: row.payroll_batch_count,
    payrollLines: row.payroll_line_count,
  };
}

async function storedCounts(db: D1Database, importId: number): Promise<ImportRowCounts> {
  const count = async (sql: string) => Number((await db.prepare(sql).bind(importId).first<{ n: number }>())?.n || 0);
  return {
    funds: await count("SELECT COUNT(*) AS n FROM funds WHERE import_id = ?"),
    departments: await count("SELECT COUNT(*) AS n FROM departments WHERE import_id = ?"),
    accounts: await count("SELECT COUNT(*) AS n FROM accounts WHERE import_id = ?"),
    payments: await count("SELECT COUNT(*) AS n FROM payments WHERE import_id = ?"),
    payrollBatches: await count("SELECT COUNT(*) AS n FROM payroll_batches WHERE import_id = ?"),
    payrollLines: await count("SELECT COUNT(*) AS n FROM payroll_lines WHERE import_id = ?"),
  };
}

export async function markFailed(db: D1Database, importId: number, note: string): Promise<void> {
  await db.prepare("UPDATE imports SET status = 'failed', note = ? WHERE id = ?").bind(note.slice(0, 300), importId).run();
}

export async function getImport(db: D1Database, id: number): Promise<ImportRow | null> {
  return db.prepare("SELECT * FROM imports WHERE id = ?").bind(id).first<ImportRow>();
}

export async function latestPublished(db: D1Database): Promise<ImportRow | null> {
  return db
    .prepare("SELECT * FROM imports WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT 1")
    .first<ImportRow>();
}

export async function listImports(db: D1Database): Promise<ImportRow[]> {
  const rows = await db.prepare("SELECT * FROM imports ORDER BY id DESC").all<ImportRow>();
  return rows.results || [];
}

export async function loadNames(db: D1Database): Promise<NameMaps> {
  const rows = await db.prepare("SELECT kind, code, name FROM chart_names").all<{ kind: string; code: string; name: string }>();
  const maps: NameMaps = { fund: new Map(), department: new Map(), object: new Map() };
  for (const row of rows.results || []) {
    if (row.kind === "fund") maps.fund.set(row.code, row.name);
    if (row.kind === "department") maps.department.set(row.code, row.name);
    if (row.kind === "object") maps.object.set(row.code, row.name);
  }
  return maps;
}

export async function saveChart(db: D1Database, chart: ChartNames): Promise<number> {
  const statements: D1PreparedStatement[] = [];
  const push = (kind: string, rows: { code: string; name: string }[]) => {
    for (const row of rows) {
      statements.push(
        db
          .prepare(
            `INSERT INTO chart_names (kind, code, name) VALUES (?, ?, ?)
             ON CONFLICT(kind, code) DO UPDATE SET name = excluded.name`,
          )
          .bind(kind, row.code, row.name),
      );
    }
  };
  push("fund", chart.funds);
  push("department", chart.departments);
  push("object", chart.objects);
  await runChunked(db, statements, 30);
  return statements.length;
}

export async function departmentRollups(db: D1Database, importId: number): Promise<DeptRollup[]> {
  const rows = await db
    .prepare(
      `SELECT d.code AS code, d.fund_code AS fund_code, d.report_name AS report_name,
              COALESCE(SUM(a.orig_cents), 0) AS orig_cents,
              COALESCE(SUM(a.adj_cents), 0) AS adj_cents,
              COALESCE(SUM(a.rev_cents), 0) AS rev_cents,
              COALESCE(SUM(a.ytd_cents), 0) AS ytd_cents,
              COALESCE(SUM(a.enc_cents), 0) AS enc_cents,
              COALESCE(SUM(a.avail_cents), 0) AS avail_cents,
              COUNT(a.dept_code) AS accounts,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.orig_cents ELSE 0 END), 0) AS transfer_orig_cents,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.rev_cents ELSE 0 END), 0) AS transfer_rev_cents,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.ytd_cents ELSE 0 END), 0) AS transfer_ytd_cents,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.enc_cents ELSE 0 END), 0) AS transfer_enc_cents
       FROM departments d
       LEFT JOIN accounts a ON a.import_id = d.import_id AND a.dept_code = d.code
       WHERE d.import_id = ?
       GROUP BY d.code
       ORDER BY rev_cents DESC`,
    )
    .bind(importId)
    .all<DeptRollup>();
  return rows.results || [];
}

export async function fundNameMap(db: D1Database, importId: number): Promise<Map<string, string>> {
  const rows = await db.prepare("SELECT code, report_name FROM funds WHERE import_id = ?").bind(importId).all<{ code: string; report_name: string }>();
  return new Map((rows.results || []).map((row) => [row.code, row.report_name || ""]));
}

export async function fundRollups(db: D1Database, importId: number): Promise<FundRollup[]> {
  const rows = await db
    .prepare(
      `SELECT f.code AS code, f.report_name AS report_name,
              COALESCE(SUM(a.orig_cents), 0) AS orig_cents,
              COALESCE(SUM(a.adj_cents), 0) AS adj_cents,
              COALESCE(SUM(a.rev_cents), 0) AS rev_cents,
              COALESCE(SUM(a.ytd_cents), 0) AS ytd_cents,
              COALESCE(SUM(a.enc_cents), 0) AS enc_cents,
              COALESCE(SUM(a.avail_cents), 0) AS avail_cents,
              COUNT(a.object_code) AS accounts,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.orig_cents ELSE 0 END), 0) AS transfer_orig_cents,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.rev_cents ELSE 0 END), 0) AS transfer_rev_cents,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.ytd_cents ELSE 0 END), 0) AS transfer_ytd_cents,
              COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.enc_cents ELSE 0 END), 0) AS transfer_enc_cents
       FROM funds f
       LEFT JOIN accounts a ON a.import_id = f.import_id AND a.fund_code = f.code
       WHERE f.import_id = ?
       GROUP BY f.code
       ORDER BY ytd_cents DESC`,
    )
    .bind(importId)
    .all<FundRollup>();
  return rows.results || [];
}

function cutoffDate(asOf: string): string {
  return asOf || "9999-12-31";
}

/** Payments and payroll through the as-of date, split by kind. Does not select names. */
export async function monthlyParts(db: D1Database, importId: number, asOf: string, fund = ""): Promise<MonthParts[]> {
  const fundSql = fund ? "AND fund_code = ?" : "";
  const binds: (string | number)[] = [importId, cutoffDate(asOf)];
  if (fund) binds.push(fund);
  const payments = await db
    .prepare(
      `SELECT substr(pay_date, 1, 7) AS ym,
              SUM(CASE WHEN source IN ('API','APM','GRV') THEN amount_cents ELSE 0 END) AS vendor_cents,
              SUM(CASE WHEN source IN ('GEN','GCR') THEN amount_cents ELSE 0 END) AS journal_cents,
              SUM(CASE WHEN source NOT IN ('API','APM','GRV','GEN','GCR','PRJ') THEN amount_cents ELSE 0 END) AS other_cents
       FROM payments
       WHERE import_id = ? AND after_cutoff = 0 AND pay_date <= ? ${fundSql}
       GROUP BY ym`,
    )
    .bind(...binds)
    .all<{ ym: string; vendor_cents: number; journal_cents: number; other_cents: number }>();
  const payroll = await db
    .prepare(
      `SELECT substr(pay_date, 1, 7) AS ym, SUM(amount_cents) AS cents
       FROM payroll_lines
       WHERE import_id = ? AND after_cutoff = 0 AND pay_date <= ? ${fundSql}
       GROUP BY ym`,
    )
    .bind(...binds)
    .all<{ ym: string; cents: number }>();
  const map = new Map<string, MonthParts>();
  const slot = (ym: string) => {
    const existing = map.get(ym);
    if (existing) return existing;
    const created = { ym, vendor_cents: 0, payroll_cents: 0, other_cents: 0, journal_cents: 0 };
    map.set(ym, created);
    return created;
  };
  for (const row of payments.results || []) {
    if (!row.ym) continue;
    const item = slot(row.ym);
    item.vendor_cents += Number(row.vendor_cents);
    item.journal_cents += Number(row.journal_cents);
    item.other_cents += Number(row.other_cents);
  }
  for (const row of payroll.results || []) {
    if (!row.ym) continue;
    slot(row.ym).payroll_cents += Number(row.cents);
  }
  return [...map.values()];
}

/**
 * Vendors other than county offices, fund transfers, and the credit-card catch-alls.
 * The stored is_person_name flag is not used. A business name cut off at 20 characters stays.
 * While names are shown, Last, First vendors are listed. While hidden, those names are left out.
 * The shown form omits the person expression so this WHERE stays under D1's expression depth.
 */
export function vendorDirectoryWhereSql(showNames: boolean): string {
  const sources = VENDOR_SOURCES.map((source) => `'${source}'`).join(", ");
  return `import_id = ?
           AND after_cutoff = 0
           AND pay_date <= ?
           AND source IN (${sources})
           AND vendor_name IS NOT NULL
           AND trim(vendor_name) != ''
           AND object_code != '${TRANSFER_OBJECT}'
           AND ${creditCardVendorSql("vendor_number")}
           ${directoryPersonSql(showNames, "vendor_name")}
           AND NOT ${CONSTITUTIONAL_SQL}`;
}

/** Longest stored name per vendor, via ROW_NUMBER, then one aggregate. Same rows as the previous per-group sort. */
export async function organizationVendors(db: D1Database, importId: number, asOf: string, showNames: boolean, limit = 10): Promise<OrgVendor[]> {
  const rows = await db
    .prepare(
      `WITH scoped AS MATERIALIZED (
         SELECT
           CASE WHEN trim(COALESCE(vendor_number, '')) = '' THEN vendor_name ELSE vendor_number END AS vendor_key,
           vendor_number,
           vendor_name,
           amount_cents,
           object_code
         FROM payments
         WHERE ${vendorDirectoryWhereSql(showNames)}
       ),
       ranked AS (
         SELECT
           vendor_key,
           vendor_name,
           ROW_NUMBER() OVER (
             PARTITION BY vendor_key
             ORDER BY length(trim(vendor_name)) DESC, vendor_name DESC
           ) AS rn
         FROM scoped
       )
       SELECT MAX(scoped.vendor_number) AS vendor_number,
              MAX(ranked.vendor_name) AS vendor_name,
              SUM(scoped.amount_cents) AS cents,
              COUNT(*) AS payments,
              SUM(CASE WHEN scoped.object_code = '561000' THEN scoped.amount_cents ELSE 0 END) AS land_cents
       FROM scoped
       LEFT JOIN ranked ON ranked.vendor_key = scoped.vendor_key AND ranked.rn = 1
       GROUP BY scoped.vendor_key
       ORDER BY cents DESC
       LIMIT ?`,
    )
    .bind(importId, cutoffDate(asOf), limit)
    .all<OrgVendor>();
  return (rows.results || []).map((row) => ({
    vendor_number: row.vendor_number || "",
    vendor_name: (row.vendor_name || "").trim(),
    cents: Number(row.cents),
    payments: Number(row.payments),
    land_cents: Number(row.land_cents),
  }));
}

export async function constitutionalTransferCents(db: D1Database, importId: number, asOf: string): Promise<number> {
  const sources = VENDOR_SOURCES.map((source) => `'${source}'`).join(", ");
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS cents
       FROM payments
       WHERE import_id = ?
         AND after_cutoff = 0
         AND pay_date <= ?
         AND source IN (${sources})
         AND object_code != '${TRANSFER_OBJECT}'
         AND ${CONSTITUTIONAL_SQL}`,
    )
    .bind(importId, cutoffDate(asOf))
    .first<{ cents: number }>();
  return Number(row?.cents || 0);
}

export async function landSpendByMonth(db: D1Database, importId: number, asOf: string): Promise<{ ym: string; cents: number }[]> {
  const rows = await db
    .prepare(
      `SELECT substr(pay_date, 1, 7) AS ym, SUM(amount_cents) AS cents
       FROM payments
       WHERE import_id = ? AND after_cutoff = 0 AND pay_date <= ?
         AND object_code = '561000'
       GROUP BY ym`,
    )
    .bind(importId, cutoffDate(asOf))
    .all<{ ym: string; cents: number }>();
  return (rows.results || []).filter((row) => row.ym).map((row) => ({ ym: row.ym, cents: Number(row.cents) }));
}

/** Account year-to-date for Land (561000), including journal lines. Matches the department page and the county report. */
export async function landSpendByDept(db: D1Database, importId: number, _asOf: string): Promise<Map<string, number>> {
  const rows = await db
    .prepare(
      `SELECT dept_code, SUM(ytd_cents) AS cents
       FROM accounts
       WHERE import_id = ? AND object_code = '561000'
       GROUP BY dept_code`,
    )
    .bind(importId)
    .all<{ dept_code: string; cents: number }>();
  return new Map((rows.results || []).map((row) => [row.dept_code, Number(row.cents)]));
}

/** Board budget releases to the Sheriff, vendor 000400, including descriptions such as OCT25 BUDGET R. */
export async function sheriffReleaseByMonth(db: D1Database, importId: number, asOf: string): Promise<{ ym: string; cents: number }[]> {
  const rows = await db
    .prepare(
      `SELECT substr(pay_date, 1, 7) AS ym, SUM(amount_cents) AS cents
       FROM payments
       WHERE import_id = ? AND after_cutoff = 0 AND pay_date <= ?
         AND (
           vendor_number = '000400'
           OR vendor_number = '400'
           OR (
             fund_code = '107'
             AND upper(COALESCE(description, '')) LIKE '%BUDGET R%'
           )
         )
       GROUP BY ym`,
    )
    .bind(importId, cutoffDate(asOf))
    .all<{ ym: string; cents: number }>();
  return (rows.results || []).filter((row) => row.ym).map((row) => ({ ym: row.ym, cents: Number(row.cents) }));
}

export async function afterCutoffCents(db: D1Database, importId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM payments WHERE import_id = ? AND after_cutoff = 1")
    .bind(importId)
    .first<{ cents: number }>();
  return Number(row?.cents || 0);
}

export async function monthlyCents(db: D1Database, importId: number): Promise<{ ym: string; cents: number }[]> {
  const payments = await db
    .prepare(
      `SELECT substr(pay_date, 1, 7) AS ym, SUM(amount_cents) AS cents
       FROM payments
       WHERE import_id = ? AND after_cutoff = 0 AND object_code != '${TRANSFER_OBJECT}'
       GROUP BY ym`,
    )
    .bind(importId)
    .all<{ ym: string; cents: number }>();
  const payroll = await db
    .prepare("SELECT substr(pay_date, 1, 7) AS ym, SUM(amount_cents) AS cents FROM payroll_batches WHERE import_id = ? GROUP BY ym")
    .bind(importId)
    .all<{ ym: string; cents: number }>();
  const map = new Map<string, number>();
  for (const row of [...(payments.results || []), ...(payroll.results || [])]) {
    if (!row.ym) continue;
    map.set(row.ym, (map.get(row.ym) || 0) + Number(row.cents));
  }
  return [...map.entries()].map(([ym, cents]) => ({ ym, cents }));
}

export async function accountsForDept(db: D1Database, importId: number, dept: string): Promise<AccountRow[]> {
  const rows = await db
    .prepare("SELECT * FROM accounts WHERE import_id = ? AND dept_code = ? ORDER BY rev_cents DESC, object_code, project_code")
    .bind(importId, dept)
    .all<AccountRow>();
  return rows.results || [];
}

export async function oneAccount(
  db: D1Database,
  importId: number,
  dept: string,
  objectCode: string,
  project: string,
): Promise<AccountRow | null> {
  return db
    .prepare("SELECT * FROM accounts WHERE import_id = ? AND dept_code = ? AND object_code = ? AND project_code = ?")
    .bind(importId, dept, objectCode, project)
    .first<AccountRow>();
}

export interface SearchFilters {
  q: string;
  vendor: string;
  dept: string;
  fund: string;
  minCents: number;
  /** 0 means no upper bound. */
  maxCents: number;
  from: string;
  to: string;
  excludeTransfer?: boolean;
}

export interface FundRollup {
  code: string;
  report_name: string;
  orig_cents: number;
  adj_cents: number;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
  avail_cents: number;
  accounts: number;
  transfer_orig_cents?: number;
  transfer_rev_cents?: number;
  transfer_ytd_cents?: number;
  transfer_enc_cents?: number;
}

export interface MonthParts {
  ym: string;
  vendor_cents: number;
  payroll_cents: number;
  other_cents: number;
  journal_cents: number;
}

export interface OrgVendor {
  vendor_number: string;
  vendor_name: string;
  cents: number;
  payments: number;
  land_cents: number;
}

export interface VendorSummary {
  vendor_number: string;
  vendor_name: string;
  cents: number;
  payments: number;
  first_date: string;
  last_date: string;
}

export interface VendorDetail extends VendorSummary {
  paid_cents: number;
  credit_cents: number;
}

export interface VendorWhyRow {
  fund_code: string;
  dept_code: string;
  object_code: string;
  title: string;
  cents: number;
  payments: number;
}

export interface VendorDescription {
  description: string;
  cents: number;
  payments: number;
}

export interface VendorSlice {
  code: string;
  cents: number;
  payments: number;
}

export type VendorListSort = "paid_desc" | "paid_asc" | "name_asc" | "name_desc";

export function readVendorSort(value: string | undefined): VendorListSort {
  if (value === "paid_asc" || value === "name_asc" || value === "name_desc" || value === "paid_desc") return value;
  return "paid_desc";
}

export function readPageSize(value: string | undefined): 25 | 50 {
  return value === "50" ? 50 : 25;
}

function vendorLike(value: string): string {
  const cleaned = value.replace(/[%_]/g, " ").trim().slice(0, 80);
  return `%${cleaned.toUpperCase()}%`;
}

function numberedVendorCte(showNames: boolean): string {
  return `WITH scoped AS (
    SELECT
      trim(vendor_number) AS vendor_key,
      vendor_name,
      amount_cents,
      pay_date
    FROM payments
    WHERE ${vendorDirectoryWhereSql(showNames)}
      AND trim(COALESCE(vendor_number, '')) != ''
  ),
  ranked AS (
    SELECT
      vendor_key,
      vendor_name,
      SUM(amount_cents) OVER (PARTITION BY vendor_key) AS cents,
      COUNT(*) OVER (PARTITION BY vendor_key) AS payments,
      MIN(pay_date) OVER (PARTITION BY vendor_key) AS first_date,
      MAX(pay_date) OVER (PARTITION BY vendor_key) AS last_date,
      ROW_NUMBER() OVER (
        PARTITION BY vendor_key
        ORDER BY length(trim(vendor_name)) DESC, vendor_name DESC
      ) AS rn
    FROM scoped
  )`;
}

const VENDOR_MATCH = `(? = 1 OR upper(vendor_key) LIKE ? OR upper(vendor_name) LIKE ? OR vendor_key IN (
  SELECT s3.vendor_key FROM scoped s3 WHERE upper(s3.vendor_name) LIKE ?
))`;

function vendorMatchBinds(query: string): (string | number)[] {
  const pattern = vendorLike(query);
  return [query.trim() ? 0 : 1, pattern, pattern, pattern];
}

function vendorOrder(sort: VendorListSort): string {
  if (sort === "paid_asc") return "cents ASC, vendor_name COLLATE NOCASE ASC";
  if (sort === "name_asc") return "vendor_name COLLATE NOCASE ASC, cents DESC";
  if (sort === "name_desc") return "vendor_name COLLATE NOCASE DESC, cents DESC";
  return "cents DESC, vendor_name COLLATE NOCASE ASC";
}

/** Vendors with a number, grouped by that number. Longest stored name is shown. */
export async function listVendors(
  db: D1Database,
  importId: number,
  asOf: string,
  showNames: boolean,
  query: string,
  sort: VendorListSort,
  limit: number,
  offset: number,
): Promise<{ rows: VendorSummary[]; total: number }> {
  const match = vendorMatchBinds(query);
  const bounds = [importId, cutoffDate(asOf), ...match];
  const totals = await db
    .prepare(
      `${numberedVendorCte(showNames)}
       SELECT COUNT(*) AS n
       FROM ranked
       WHERE rn = 1 AND ${VENDOR_MATCH}`,
    )
    .bind(...bounds)
    .first<{ n: number }>();
  const rows = await db
    .prepare(
      `${numberedVendorCte(showNames)}
       SELECT vendor_key AS vendor_number, vendor_name, cents, payments, first_date, last_date
       FROM ranked
       WHERE rn = 1 AND ${VENDOR_MATCH}
       ORDER BY ${vendorOrder(sort)}
       LIMIT ? OFFSET ?`,
    )
    .bind(...bounds, limit, offset)
    .all<VendorSummary>();
  return {
    total: Number(totals?.n || 0),
    rows: (rows.results || []).map((row) => ({
      vendor_number: row.vendor_number || "",
      vendor_name: (row.vendor_name || "").trim(),
      cents: Number(row.cents),
      payments: Number(row.payments),
      first_date: row.first_date || "",
      last_date: row.last_date || "",
    })),
  };
}

export async function oneVendor(db: D1Database, importId: number, asOf: string, showNames: boolean, vendorNumber: string): Promise<VendorDetail | null> {
  const row = await db
    .prepare(
      `WITH scoped AS (
         SELECT vendor_name, amount_cents, pay_date
         FROM payments
         WHERE ${vendorDirectoryWhereSql(showNames)}
           AND trim(COALESCE(vendor_number, '')) = ?
       ),
       ranked AS (
         SELECT
           vendor_name,
           SUM(amount_cents) OVER () AS cents,
           SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) OVER () AS paid_cents,
           SUM(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END) OVER () AS credit_cents,
           COUNT(*) OVER () AS payments,
           MIN(pay_date) OVER () AS first_date,
           MAX(pay_date) OVER () AS last_date,
           ROW_NUMBER() OVER (ORDER BY length(trim(vendor_name)) DESC, vendor_name DESC) AS rn
         FROM scoped
       )
       SELECT vendor_name, cents, paid_cents, credit_cents, payments, first_date, last_date
       FROM ranked
       WHERE rn = 1`,
    )
    .bind(importId, cutoffDate(asOf), vendorNumber)
    .first<VendorDetail>();
  if (!row || !Number(row.payments)) return null;
  return {
    vendor_number: vendorNumber,
    vendor_name: (row.vendor_name || "").trim(),
    cents: Number(row.cents),
    paid_cents: Number(row.paid_cents),
    credit_cents: Number(row.credit_cents),
    payments: Number(row.payments),
    first_date: row.first_date || "",
    last_date: row.last_date || "",
  };
}

export async function vendorSlices(
  db: D1Database,
  importId: number,
  asOf: string,
  showNames: boolean,
  vendorNumber: string,
  column: "fund_code" | "dept_code",
): Promise<VendorSlice[]> {
  const rows = await db
    .prepare(
      `SELECT ${column} AS code, SUM(amount_cents) AS cents, COUNT(*) AS payments
       FROM payments
       WHERE ${vendorDirectoryWhereSql(showNames)}
         AND trim(COALESCE(vendor_number, '')) = ?
       GROUP BY ${column}
       ORDER BY cents DESC, code`,
    )
    .bind(importId, cutoffDate(asOf), vendorNumber)
    .all<VendorSlice>();
  return (rows.results || []).map((row) => ({
    code: row.code || "",
    cents: Number(row.cents),
    payments: Number(row.payments),
  }));
}

export async function vendorWhy(
  db: D1Database,
  importId: number,
  asOf: string,
  showNames: boolean,
  vendorNumber: string,
): Promise<{ rows: VendorWhyRow[]; descriptions: VendorDescription[] }> {
  const where = `${vendorDirectoryWhereSql(showNames)} AND trim(COALESCE(vendor_number, '')) = ?`;
  const bounds = [importId, cutoffDate(asOf), vendorNumber];
  const rows = await db
    .prepare(
      `SELECT g.fund_code AS fund_code,
              g.dept_code AS dept_code,
              g.object_code AS object_code,
              SUM(g.amount_cents) AS cents,
              COUNT(*) AS payments,
              COALESCE((
                SELECT a.title FROM accounts a
                WHERE a.import_id = g.import_id AND a.object_code = g.object_code
                  AND trim(COALESCE(a.title, '')) != ''
                ORDER BY a.ytd_cents DESC
                LIMIT 1
              ), '') AS title
       FROM (
         SELECT import_id, fund_code, dept_code, object_code, amount_cents
         FROM payments
         WHERE ${where}
       ) g
       GROUP BY g.import_id, g.fund_code, g.dept_code, g.object_code
       ORDER BY cents DESC, g.fund_code, g.dept_code, g.object_code`,
    )
    .bind(...bounds)
    .all<VendorWhyRow>();
  const descriptions = await db
    .prepare(
      `SELECT max(trim(description)) AS description, COUNT(*) AS payments, SUM(amount_cents) AS cents
       FROM payments
       WHERE ${where} AND trim(COALESCE(description, '')) != ''
       GROUP BY upper(trim(description))
       ORDER BY payments DESC, cents DESC
       LIMIT 8`,
    )
    .bind(...bounds)
    .all<VendorDescription>();
  return {
    rows: (rows.results || []).map((row) => ({
      fund_code: row.fund_code || "",
      dept_code: row.dept_code || "",
      object_code: row.object_code || "",
      title: (row.title || "").trim(),
      cents: Number(row.cents),
      payments: Number(row.payments),
    })),
    descriptions: (descriptions.results || []).map((row) => ({
      description: (row.description || "").trim(),
      cents: Number(row.cents),
      payments: Number(row.payments),
    })),
  };
}

export async function vendorPaymentRows(
  db: D1Database,
  importId: number,
  asOf: string,
  showNames: boolean,
  vendorNumber: string,
  limit: number,
  offset: number,
): Promise<{ rows: PaymentRow[]; total: number }> {
  const where = `${vendorDirectoryWhereSql(showNames)} AND trim(COALESCE(vendor_number, '')) = ?`;
  const bounds = [importId, cutoffDate(asOf), vendorNumber];
  const totals = await db.prepare(`SELECT COUNT(*) AS n FROM payments WHERE ${where}`).bind(...bounds).first<{ n: number }>();
  const rows = await db
    .prepare(
      `SELECT id, import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
              amount_cents, vendor_number, vendor_name, invoice, description, check_number, after_cutoff, dedupe_key
       FROM payments
       WHERE ${where}
       ORDER BY pay_date DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bounds, limit, offset)
    .all<PaymentRow>();
  return {
    total: Number(totals?.n || 0),
    rows: (rows.results || []).map((row) => ({
      ...row,
      id: Number(row.id),
      import_id: Number(row.import_id),
      amount_cents: Number(row.amount_cents),
      after_cutoff: Number(row.after_cutoff),
    })),
  };
}

export async function reconAccounts(db: D1Database, importId: number): Promise<AccountRow[]> {
  const rows = await db
    .prepare("SELECT * FROM accounts WHERE import_id = ? AND recon_diff_cents != 0 ORDER BY ABS(recon_diff_cents) DESC")
    .bind(importId)
    .all<AccountRow>();
  return rows.results || [];
}

export async function unmatchedCodes(
  db: D1Database,
  importId: number,
): Promise<{ departments: { code: string; report_name: string }[]; objects: { code: string; title: string }[] }> {
  const departments = await db
    .prepare(
      `SELECT d.code AS code, d.report_name AS report_name
       FROM departments d
       LEFT JOIN chart_names c ON c.kind = 'department' AND c.code = d.code
       WHERE d.import_id = ? AND c.code IS NULL
       ORDER BY d.code`,
    )
    .bind(importId)
    .all<{ code: string; report_name: string }>();
  const objects = await db
    .prepare(
      `SELECT DISTINCT a.object_code AS code, a.title AS title
       FROM accounts a
       LEFT JOIN chart_names c ON c.kind = 'object' AND c.code = a.object_code
       WHERE a.import_id = ? AND c.code IS NULL
       ORDER BY a.object_code`,
    )
    .bind(importId)
    .all<{ code: string; title: string }>();
  return { departments: departments.results || [], objects: objects.results || [] };
}

export interface PlatSnapshot {
  id: number;
  created_at: string;
  published_at: string | null;
  data_as_of: string | null;
  status: string;
  filename: string | null;
  orig_cents: number;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
  avail_cents: number;
  accounts: number;
}

export async function platHistory(db: D1Database, fund: string, dept: string, adminUnlocked: boolean): Promise<PlatSnapshot[]> {
  const statuses = historyStatuses(adminUnlocked);
  const marks = statuses.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT i.id, i.created_at, i.published_at, i.data_as_of, i.status, i.filename,
              COALESCE(SUM(a.orig_cents), 0) AS orig_cents,
              COALESCE(SUM(a.rev_cents), 0) AS rev_cents,
              COALESCE(SUM(a.ytd_cents), 0) AS ytd_cents,
              COALESCE(SUM(a.enc_cents), 0) AS enc_cents,
              COALESCE(SUM(a.avail_cents), 0) AS avail_cents,
              COUNT(a.dept_code) AS accounts
       FROM imports i
       LEFT JOIN accounts a ON a.import_id = i.id AND a.fund_code = ? AND a.dept_code = ?
       WHERE i.status IN (${marks})
       GROUP BY i.id
       ORDER BY i.id`,
    )
    .bind(fund, dept, ...statuses)
    .all<PlatSnapshot>();
  return rows.results || [];
}

export async function overlapCount(db: D1Database, importId: number, priorId: number): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM payments p
       WHERE p.import_id = ?
         AND p.check_number != ''
         AND EXISTS (
           SELECT 1 FROM payments earlier
           WHERE earlier.import_id = ? AND earlier.dedupe_key = p.dedupe_key
         )`,
    )
    .bind(importId, priorId)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

export async function recordLoginAttempt(db: D1Database, ipHash: string, windowStart: number): Promise<number> {
  await db
    .prepare(
      `INSERT INTO login_attempts (ip_hash, window_start, attempts) VALUES (?, ?, 1)
       ON CONFLICT(ip_hash, window_start) DO UPDATE SET attempts = attempts + 1`,
    )
    .bind(ipHash, windowStart)
    .run();
  const row = await db
    .prepare("SELECT attempts FROM login_attempts WHERE ip_hash = ? AND window_start = ?")
    .bind(ipHash, windowStart)
    .first<{ attempts: number }>();
  return Number(row?.attempts || 1);
}

export async function loginAttempts(db: D1Database, ipHash: string, windowStart: number): Promise<number> {
  const row = await db
    .prepare("SELECT attempts FROM login_attempts WHERE ip_hash = ? AND window_start = ?")
    .bind(ipHash, windowStart)
    .first<{ attempts: number }>();
  return Number(row?.attempts || 0);
}

export async function qaHits(db: D1Database, sessionId: string, bucket: string): Promise<number> {
  const row = await db.prepare("SELECT hits FROM qa_usage WHERE session_id = ? AND bucket = ?").bind(sessionId, bucket).first<{ hits: number }>();
  return Number(row?.hits || 0);
}

export async function bumpQa(db: D1Database, sessionId: string, bucket: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO qa_usage (session_id, bucket, hits) VALUES (?, ?, 1)
       ON CONFLICT(session_id, bucket) DO UPDATE SET hits = hits + 1`,
    )
    .bind(sessionId, bucket)
    .run();
}
