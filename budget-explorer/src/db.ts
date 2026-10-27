import type { ChartNames } from "./csv";
import { foldedPayrollNote, type ParseResult, type ParsedPayment } from "./parser";

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
}

export function rowCountsMatch(expected: ImportRowCounts, actual: ImportRowCounts): boolean {
  return (
    expected.funds === actual.funds &&
    expected.departments === actual.departments &&
    expected.accounts === actual.accounts &&
    expected.payments === actual.payments &&
    expected.payrollBatches === actual.payrollBatches
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
        payment_count, payroll_batch_count, after_cutoff_count, recon_mismatch_count,
        orig_cents, adj_cents, rev_cents, ytd_cents, enc_cents, avail_cents,
        printed_orig_cents, printed_rev_cents, printed_ytd_cents
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          import_id, fund_code, dept_code, object_code, project_code, batch_key, pay_date, amount_cents, line_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(importId, batch.fund, batch.dept, batch.objectCode, batch.project, batch.batchKey, batch.payDate, batch.amountCents, batch.lineCount),
  );
  await runChunked(db, payrollStmts);
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
    const placeholders = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
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
      );
    }
    statements.push(db.prepare(`INSERT INTO payments (
      import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key
    ) VALUES ${placeholders}`).bind(...binds));
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
              COUNT(a.dept_code) AS accounts
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

export async function monthlyCents(db: D1Database, importId: number): Promise<{ ym: string; cents: number }[]> {
  const payments = await db
    .prepare("SELECT substr(pay_date, 1, 7) AS ym, SUM(amount_cents) AS cents FROM payments WHERE import_id = ? GROUP BY ym")
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

export async function paymentPage(
  db: D1Database,
  importId: number,
  dept: string,
  objectCode: string,
  project: string,
  page: number,
  pageSize: number,
): Promise<{ rows: PaymentRow[]; total: number }> {
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM payments
       WHERE import_id = ? AND dept_code = ? AND object_code = ? AND project_code = ? AND after_cutoff = 0`,
    )
    .bind(importId, dept, objectCode, project)
    .first<{ n: number }>();
  const rows = await db
    .prepare(
      `SELECT * FROM payments
       WHERE import_id = ? AND dept_code = ? AND object_code = ? AND project_code = ? AND after_cutoff = 0
       ORDER BY pay_date DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(importId, dept, objectCode, project, pageSize, page * pageSize)
    .all<PaymentRow>();
  return { rows: rows.results || [], total: Number(totalRow?.n || 0) };
}

export interface SearchFilters {
  q: string;
  vendor: string;
  dept: string;
  minCents: number;
  from: string;
  to: string;
}

function like(value: string): string {
  const cleaned = value.replace(/[%_]/g, " ").trim().slice(0, 40);
  return `%${cleaned}%`;
}

export async function searchPayments(
  db: D1Database,
  importId: number,
  filters: SearchFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: PaymentRow[]; total: number; totalCents: number }> {
  const where = ["import_id = ?", "after_cutoff = 0"];
  const binds: (string | number)[] = [importId];
  if (filters.dept) {
    where.push("dept_code = ?");
    binds.push(filters.dept);
  }
  if (filters.minCents > 0) {
    where.push("amount_cents >= ?");
    binds.push(filters.minCents);
  }
  if (filters.from) {
    where.push("pay_date >= ?");
    binds.push(filters.from);
  }
  if (filters.to) {
    where.push("pay_date <= ?");
    binds.push(filters.to);
  }
  if (filters.vendor.trim()) {
    where.push("vendor_name LIKE ?");
    binds.push(like(filters.vendor));
  }
  if (filters.q.trim()) {
    const pattern = like(filters.q);
    where.push("(vendor_name LIKE ? OR invoice LIKE ? OR description LIKE ? OR check_number LIKE ? OR vendor_number LIKE ?)");
    binds.push(pattern, pattern, pattern, pattern, pattern);
  }
  const clause = where.join(" AND ");
  const totals = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM payments WHERE ${clause}`)
    .bind(...binds)
    .first<{ n: number; cents: number }>();
  const rows = await db
    .prepare(`SELECT * FROM payments WHERE ${clause} ORDER BY amount_cents DESC, pay_date DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, page * pageSize)
    .all<PaymentRow>();
  return { rows: rows.results || [], total: Number(totals?.n || 0), totalCents: Number(totals?.cents || 0) };
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

export async function vendorNamesForImport(db: D1Database, importId: number): Promise<string[]> {
  const rows = await db
    .prepare("SELECT DISTINCT vendor_name AS name FROM payments WHERE import_id = ? AND vendor_name != '' ORDER BY vendor_name")
    .bind(importId)
    .all<{ name: string }>();
  return (rows.results || []).map((row) => row.name);
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
