import { TRANSFER_OBJECT } from "./budget";
import type { PaymentRow, SearchFilters } from "./db";
import { accountKey, moneyExact } from "./format";
import { QA_MAX_CHARS } from "./auth";
import { QA_SYSTEM, type QaPack, type QaRecord } from "./qa";
import { vendorCompact, vendorCompactSql } from "./vendors";

/**
 * Default for "Show person names and individual pay" when settings has no row.
 * This is the only default. The migration does not insert a row.
 */
export const SHOW_PERSON_NAMES_DEFAULT = true;

export const SHOW_PERSON_NAMES_KEY = "show_person_names";
export const PAYROLL_BATCH_LABEL = "Payroll (batch total)";
export const NAME_WITHHELD = "Name withheld";

type Bind = string | number;

interface SqlPart {
  sql: string;
  binds: Bind[];
}

interface RawLine extends PaymentRow {
  person_hidden: number;
}

export async function showPersonNames(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(SHOW_PERSON_NAMES_KEY).first<{ value: string }>();
  if (!row) return SHOW_PERSON_NAMES_DEFAULT;
  return row.value === "1";
}

export async function personNamesUpdatedAt(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT updated_at FROM settings WHERE key = ?").bind(SHOW_PERSON_NAMES_KEY).first<{ updated_at: string }>();
  return row?.updated_at || null;
}

export async function setShowPersonNames(db: D1Database, shown: boolean, at = new Date().toISOString()): Promise<{ shown: boolean; changedAt: string }> {
  const value = shown ? "1" : "0";
  await db.batch([
    db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(SHOW_PERSON_NAMES_KEY, value, at),
    db.prepare("INSERT INTO settings_log (key, value, changed_at) VALUES (?, ?, ?)").bind(SHOW_PERSON_NAMES_KEY, value, at),
  ]);
  return { shown, changedAt: at };
}

export function showPersonNamesFromForm(value: unknown): boolean {
  const list = Array.isArray(value) ? value : [value];
  return list.some((item) => String(item ?? "") === "1");
}

function like(value: string): string {
  const cleaned = value.replace(/[%_]/g, " ").trim().slice(0, 40);
  return `%${cleaned}%`;
}

/** Shown payroll reads include the employee name. Hidden reads never select it. */
export function payrollReadSql(showNames: boolean): string {
  if (showNames) {
    return `SELECT id, import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
      amount_cents, '' AS vendor_number, employee_name AS vendor_name, '' AS invoice, '' AS description,
      '' AS check_number, after_cutoff, dedupe_key, 0 AS person_hidden
      FROM payroll_lines`;
  }
  return `SELECT MIN(id) AS id, import_id, fund_code, dept_code, object_code, project_code,
      NULL AS journal, MIN(pay_date) AS pay_date, 'PRJ' AS source,
      SUM(amount_cents) AS amount_cents, '' AS vendor_number, '${PAYROLL_BATCH_LABEL}' AS vendor_name,
      '' AS invoice, '' AS description, '' AS check_number, 0 AS after_cutoff, MIN(batch_key) AS dedupe_key,
      0 AS person_hidden
      FROM payroll_lines`;
}

function paymentReadSql(showNames: boolean): string {
  const vendor = showNames ? "vendor_name" : "CASE WHEN is_person_name = 1 THEN '' ELSE vendor_name END";
  const description = showNames ? "description" : "CASE WHEN is_person_name = 1 THEN '' ELSE description END";
  const hidden = showNames ? "0" : "is_person_name";
  return `SELECT id, import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
    amount_cents, vendor_number, ${vendor} AS vendor_name, invoice, ${description} AS description,
    check_number, after_cutoff, dedupe_key, ${hidden} AS person_hidden
    FROM payments`;
}

interface Scope {
  fund?: string;
  dept?: string;
  objectCode?: string;
  project?: string;
}

function pushScope(where: string[], binds: Bind[], scope: Scope | undefined): void {
  if (!scope) return;
  if (scope.fund) {
    where.push("fund_code = ?");
    binds.push(scope.fund);
  }
  if (scope.dept) {
    where.push("dept_code = ?");
    binds.push(scope.dept);
  }
  if (scope.objectCode !== undefined) {
    where.push("object_code = ?");
    binds.push(scope.objectCode);
  }
  if (scope.project !== undefined) {
    where.push("project_code = ?");
    binds.push(scope.project);
  }
}

function paymentBranch(importId: number, filters: SearchFilters | null, showNames: boolean, scope?: Scope): SqlPart {
  const where = ["import_id = ?", "after_cutoff = 0"];
  const binds: Bind[] = [importId];
  pushScope(where, binds, scope);
  if (filters?.dept) {
    where.push("dept_code = ?");
    binds.push(filters.dept);
  }
  if (filters && filters.minCents > 0) {
    where.push("amount_cents >= ?");
    binds.push(filters.minCents);
  }
  if (filters?.from) {
    where.push("pay_date >= ?");
    binds.push(filters.from);
  }
  if (filters?.to) {
    where.push("pay_date <= ?");
    binds.push(filters.to);
  }
  if (filters?.fund) {
    where.push("fund_code = ?");
    binds.push(filters.fund);
  }
  if (filters?.excludeTransfer) where.push(`object_code != '${TRANSFER_OBJECT}'`);
  if (filters?.vendor.trim()) {
    const pattern = like(filters.vendor);
    const compact = vendorCompact(filters.vendor);
    const extra = compact.length >= 3 ? ` OR ${vendorCompactSql("vendor_name")} LIKE ?` : "";
    if (showNames) {
      where.push(`(vendor_name LIKE ?${extra})`);
      binds.push(pattern);
    } else {
      where.push(`(is_person_name = 0 AND (vendor_name LIKE ?${extra}))`);
      binds.push(pattern);
    }
    if (compact.length >= 3) binds.push(`${compact}%`);
  }
  if (filters?.q.trim()) {
    const pattern = like(filters.q);
    if (showNames) {
      where.push("(vendor_name LIKE ? OR invoice LIKE ? OR description LIKE ? OR check_number LIKE ? OR vendor_number LIKE ?)");
      binds.push(pattern, pattern, pattern, pattern, pattern);
    } else {
      where.push("(invoice LIKE ? OR check_number LIKE ? OR vendor_number LIKE ? OR (is_person_name = 0 AND (vendor_name LIKE ? OR description LIKE ?)))");
      binds.push(pattern, pattern, pattern, pattern, pattern);
    }
  }
  return { sql: `${paymentReadSql(showNames)} WHERE ${where.join(" AND ")}`, binds };
}

function payrollBranch(importId: number, filters: SearchFilters | null, showNames: boolean, scope?: Scope): SqlPart {
  const where = ["import_id = ?", "after_cutoff = 0"];
  const binds: Bind[] = [importId];
  pushScope(where, binds, scope);
  if (filters?.fund) {
    where.push("fund_code = ?");
    binds.push(filters.fund);
  }
  if (filters?.dept) {
    where.push("dept_code = ?");
    binds.push(filters.dept);
  }
  if (filters?.from) {
    where.push("pay_date >= ?");
    binds.push(filters.from);
  }
  if (filters?.to) {
    where.push("pay_date <= ?");
    binds.push(filters.to);
  }
  if (showNames) {
    if (filters && filters.minCents > 0) {
      where.push("amount_cents >= ?");
      binds.push(filters.minCents);
    }
    if (filters?.vendor.trim()) {
      where.push("employee_name LIKE ?");
      binds.push(like(filters.vendor));
    }
    if (filters?.q.trim()) {
      where.push("employee_name LIKE ?");
      binds.push(like(filters.q));
    }
    return { sql: `${payrollReadSql(true)} WHERE ${where.join(" AND ")}`, binds };
  }
  if (filters && (filters.q.trim() || filters.vendor.trim())) {
    where.push("0");
  }
  const having = filters && filters.minCents > 0 ? " HAVING SUM(amount_cents) >= ?" : "";
  if (filters && filters.minCents > 0) binds.push(filters.minCents);
  const group = " GROUP BY import_id, fund_code, dept_code, object_code, project_code, batch_key, substr(pay_date, 1, 7)";
  return { sql: `${payrollReadSql(false)} WHERE ${where.join(" AND ")}${group}${having}`, binds };
}

function unionParts(left: SqlPart, right: SqlPart): SqlPart {
  return { sql: `${left.sql} UNION ALL ${right.sql}`, binds: [...left.binds, ...right.binds] };
}

const LINE_COLUMNS = `id, import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
  amount_cents, vendor_number, vendor_name, invoice, description, check_number, after_cutoff, dedupe_key, person_hidden`;

async function readLines(
  db: D1Database,
  part: SqlPart,
  order: string,
  limit: number,
  offset: number,
): Promise<{ rows: RawLine[]; total: number; totalCents: number }> {
  const totals = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM (${part.sql})`)
    .bind(...part.binds)
    .first<{ n: number; cents: number }>();
  const rows = await db
    .prepare(`SELECT ${LINE_COLUMNS} FROM (${part.sql}) ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...part.binds, limit, offset)
    .all<RawLine>();
  return {
    rows: rows.results || [],
    total: Number(totals?.n || 0),
    totalCents: Number(totals?.cents || 0),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function filterAnswer(answer: string, names: string[], amounts: string[]): string {
  let text = answer;
  const sorted = [...names].filter((name) => name.trim().length >= 4).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    text = text.replace(new RegExp(escapeRegExp(name), "gi"), "a withheld name");
  }
  const sortedAmounts = [...amounts].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const amount of sortedAmounts) {
    // Match a whole amount. "50.00" must not rewrite the tail of "150.00" or "$1,500.00".
    // A following period is a sentence end, so the lookahead only rejects another digit.
    const pattern = new RegExp(`(?<![\\d.,])${escapeRegExp(amount)}(?!\\d)`, "g");
    text = text.replace(pattern, "a withheld amount");
  }
  return text;
}

async function blockedTerms(db: D1Database, importId: number): Promise<{ names: string[]; amounts: string[] }> {
  const nameRows = await db
    .prepare(
      `SELECT employee_name AS name FROM payroll_lines WHERE import_id = ? AND employee_name != ''
       UNION
       SELECT vendor_name AS name FROM payments WHERE import_id = ? AND is_person_name = 1 AND vendor_name != ''`,
    )
    .bind(importId, importId)
    .all<{ name: string }>();
  const lineAmounts = await db
    .prepare("SELECT amount_cents AS cents FROM payroll_lines WHERE import_id = ? AND after_cutoff = 0")
    .bind(importId)
    .all<{ cents: number }>();
  const batchAmounts = await db
    .prepare(
      `SELECT SUM(amount_cents) AS cents FROM payroll_lines
       WHERE import_id = ? AND after_cutoff = 0
       GROUP BY fund_code, dept_code, object_code, project_code, batch_key, substr(pay_date, 1, 7)`,
    )
    .bind(importId)
    .all<{ cents: number }>();
  const batchSet = new Set((batchAmounts.results || []).map((row) => Number(row.cents)));
  const amounts: string[] = [];
  for (const row of lineAmounts.results || []) {
    const cents = Number(row.cents);
    if (batchSet.has(cents)) continue;
    amounts.push(moneyExact(cents), (cents / 100).toFixed(2));
  }
  return {
    names: (nameRows.results || []).map((row) => row.name).filter((name) => name.trim().length >= 4),
    amounts,
  };
}

function scrubText(value: string | null, names: string[]): string {
  let text = value || "";
  for (const name of names) {
    if (name.trim().length < 4) continue;
    text = text.replace(new RegExp(escapeRegExp(name), "gi"), "");
  }
  return text.replace(/\s+/g, " ").trim();
}

async function present(db: D1Database, importId: number, rows: RawLine[], showNames: boolean): Promise<PaymentRow[]> {
  const names = showNames ? [] : (await blockedTerms(db, importId)).names;
  return rows.map((row) => {
    const vendor = showNames ? row.vendor_name || "" : row.person_hidden ? NAME_WITHHELD : scrubText(row.vendor_name, names);
    const description = showNames ? row.description || "" : row.person_hidden ? "" : scrubText(row.description, names);
    return {
      id: Number(row.id),
      import_id: Number(row.import_id),
      fund_code: row.fund_code,
      dept_code: row.dept_code,
      object_code: row.object_code,
      project_code: row.project_code,
      journal: row.journal,
      pay_date: row.pay_date,
      source: row.source,
      amount_cents: Number(row.amount_cents),
      vendor_number: row.vendor_number,
      vendor_name: vendor,
      invoice: row.invoice,
      check_number: row.check_number,
      description,
      after_cutoff: Number(row.after_cutoff),
      dedupe_key: row.dedupe_key,
    };
  });
}

export async function searchLines(
  db: D1Database,
  importId: number,
  filters: SearchFilters,
  page: number,
  pageSize: number,
  showNames: boolean,
): Promise<{ rows: PaymentRow[]; total: number; totalCents: number }> {
  const part = unionParts(paymentBranch(importId, filters, showNames), payrollBranch(importId, filters, showNames));
  const found = await readLines(db, part, "amount_cents DESC, pay_date DESC", pageSize, page * pageSize);
  return { rows: await present(db, importId, found.rows, showNames), total: found.total, totalCents: found.totalCents };
}

export async function accountLines(
  db: D1Database,
  importId: number,
  dept: string,
  objectCode: string,
  project: string,
  page: number,
  pageSize: number,
  showNames: boolean,
): Promise<{ rows: PaymentRow[]; total: number }> {
  const scope = { dept, objectCode, project };
  const part = unionParts(paymentBranch(importId, null, showNames, scope), payrollBranch(importId, null, showNames, scope));
  const found = await readLines(db, part, "pay_date DESC, id DESC", pageSize, page * pageSize);
  return { rows: await present(db, importId, found.rows, showNames), total: found.total };
}

export async function platLines(db: D1Database, importId: number, fund: string, dept: string, showNames: boolean): Promise<PaymentRow[]> {
  const part = unionParts(
    paymentBranch(importId, null, showNames, { fund, dept }),
    payrollBranch(importId, null, showNames, { fund, dept }),
  );
  const found = await readLines(db, part, "pay_date DESC, id DESC", 50, 0);
  return present(db, importId, found.rows, showNames);
}

function lineText(row: PaymentRow): string {
  const account = accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code);
  if (row.vendor_name === PAYROLL_BATCH_LABEL) {
    return `${PAYROLL_BATCH_LABEL} ${row.pay_date || ""} amount ${moneyExact(row.amount_cents)} account ${account}`;
  }
  return `Payment ${row.pay_date || ""} vendor ${row.vendor_name || "unmatched"} invoice ${row.invoice || "none"} check ${row.check_number || "none"} amount ${moneyExact(row.amount_cents)} account ${account} description ${row.description || ""}`;
}

function tokens(question: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "from", "that", "this", "what", "which", "how", "much", "did", "does",
    "county", "pay", "paid", "payment", "payments", "show", "tell", "about", "were", "was", "are", "have",
    "has", "its", "into", "over", "under", "than", "then", "them", "they", "their", "budget", "spent",
    "spend", "year", "total", "totals", "please", "could", "would", "should", "where", "when", "who",
  ]);
  const words = question.toLowerCase().match(/[a-z0-9][a-z0-9&.'-]{2,}/g) || [];
  const unique: string[] = [];
  for (const word of words) {
    if (stop.has(word) || unique.includes(word)) continue;
    unique.push(word);
  }
  return unique.slice(0, 6);
}

export function qaSystem(showNames: boolean): string {
  const payroll = showNames
    ? "Employee names and individual pay in the records may be stated. Do not invent a name or amount that is not in the records."
    : "Person names and individual pay are omitted. Payroll appears only as a batch total. Do not guess employee names or individual wages.";
  return `${QA_SYSTEM} ${payroll}`;
}

export async function buildQuestionContext(
  db: D1Database,
  importId: number,
  question: string,
  showNames: boolean,
  factText = "",
): Promise<QaPack> {
  const records: QaRecord[] = [];
  const codes = question.match(/\b\d{3,8}\b/g) || [];
  const words = tokens(question);
  if (codes.length) {
    const code = codes.find((item) => item.length === 8) || codes[0];
    const accounts = await db
      .prepare(
        `SELECT fund_code, dept_code, object_code, project_code, title, rev_cents, ytd_cents, enc_cents
         FROM accounts
         WHERE import_id = ? AND (dept_code = ? OR object_code = ? OR fund_code = ? OR project_code = ?)
         ORDER BY rev_cents DESC LIMIT 20`,
      )
      .bind(importId, code, code, code, code)
      .all<{ fund_code: string; dept_code: string; object_code: string; project_code: string; title: string; rev_cents: number; ytd_cents: number; enc_cents: number }>();
    for (const row of accounts.results || []) {
      records.push({
        kind: "account",
        text: `Account ${accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code)} ${row.title || "unmatched"} revised ${moneyExact(row.rev_cents)} spent ${moneyExact(row.ytd_cents)} encumbered ${moneyExact(row.enc_cents)}`,
      });
    }
  }
  for (const word of words.slice(0, 4)) {
    const accounts = await db
      .prepare(
        `SELECT fund_code, dept_code, object_code, project_code, title, rev_cents, ytd_cents, enc_cents
         FROM accounts WHERE import_id = ? AND title LIKE ? ORDER BY ABS(ytd_cents) DESC LIMIT 8`,
      )
      .bind(importId, like(word))
      .all<{ fund_code: string; dept_code: string; object_code: string; project_code: string; title: string; rev_cents: number; ytd_cents: number; enc_cents: number }>();
    for (const row of accounts.results || []) {
      records.push({
        kind: "account",
        text: `Account ${accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code)} ${row.title || "unmatched"} revised ${moneyExact(row.rev_cents)} spent ${moneyExact(row.ytd_cents)} encumbered ${moneyExact(row.enc_cents)}`,
      });
    }
    const found = await searchLines(db, importId, { q: word, vendor: "", dept: "", minCents: 0, from: "", to: "" }, 0, 12, showNames);
    for (const row of found.rows) {
      records.push({ kind: row.vendor_name === PAYROLL_BATCH_LABEL ? "total" : "payment", text: lineText(row) });
    }
  }
  if (!showNames && /\b(payroll|salary|salaries|wage|wages)\b/i.test(question)) {
    const batches = await searchLines(db, importId, { q: "", vendor: "", dept: "", minCents: 0, from: "", to: "" }, 0, 12, false);
    for (const row of batches.rows) {
      if (row.vendor_name !== PAYROLL_BATCH_LABEL) continue;
      records.push({ kind: "total", text: lineText(row) });
    }
  }
  if (showNames && /\b(how much|total|sum|spent)\b/i.test(question) && words.length) {
    const found = await searchLines(db, importId, { q: words[0], vendor: "", dept: "", minCents: 0, from: "", to: "" }, 0, 24, true);
    if (found.total > 0) {
      records.push({
        kind: "total",
        text: `Aggregate for "${words[0]}" across visible lines: ${found.total} lines, sum ${moneyExact(found.totalCents)}.`,
      });
    }
  }
  const seen = new Set<string>();
  const unique = records.filter((record) => {
    if (seen.has(record.text)) return false;
    seen.add(record.text);
    return true;
  }).slice(0, 40);
  const body = unique.map((record, index) => `[${index + 1}] ${record.text}`).join("\n");
  const facts = factText ? `Facts calculated in SQL. Use these for countywide totals.\n${factText}\n\n` : "";
  const prompt = `Question: ${question.slice(0, QA_MAX_CHARS)}\n\n${facts}Records from the imported budget file:\n${body || "(none)"}`;
  return { records: unique, prompt };
}

export async function finalizeAnswer(
  db: D1Database,
  importId: number,
  answer: string,
  records: QaRecord[],
  showNames: boolean,
): Promise<{ answer: string; records: QaRecord[] }> {
  if (showNames) return { answer, records };
  const terms = await blockedTerms(db, importId);
  return {
    answer: filterAnswer(answer, terms.names, terms.amounts),
    records: records.map((record) => ({ ...record, text: filterAnswer(record.text, terms.names, terms.amounts) })),
  };
}
