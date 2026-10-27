import { TRANSFER_OBJECT } from "./budget";
import { departmentRollups, fundRollups, type PaymentRow, type SearchFilters } from "./db";
import { accountKey, moneyExact, pace } from "./format";
import { QA_MAX_CHARS } from "./auth";
import { QA_SYSTEM, mentionedCodes, nameMatchesQuestion, vendorTokens, type QaPack, type QaRecord } from "./qa";
import { isTransferDepartment } from "./overview";
import { ORG_NAME_TOKENS, looksLikePersonName, sqlIsPersonName } from "./parser";
import { vendorCompact, vendorCompactSql } from "./vendors";

/**
 * Default for "Show person names and individual pay" when settings has no row.
 * This is the only default. The migration does not insert a row.
 */
export const SHOW_PERSON_NAMES_DEFAULT = true;

export const SHOW_PERSON_NAMES_KEY = "show_person_names";
export const PAYROLL_BATCH_LABEL = "Payroll (batch total)";
export const OTHER_PAYROLL_LABEL = "Other payroll";
export const NAME_WITHHELD = "Name withheld";
/** Hidden payroll groups below this line count are not shown on their own. */
export const MIN_HIDDEN_PAYROLL_LINES = 3;
/**
 * Hidden payroll groups below this total ($1,000) are not shown on their own.
 * A smaller sum is close enough to one paycheck to withhold.
 */
export const MIN_HIDDEN_PAYROLL_CENTS = 100_000;

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

/**
 * Shown payroll reads include the employee name.
 * The hidden string is only the name-free column list. The read that actually
 * runs adds the line-count and total gates in hiddenPayrollSql.
 */
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
  const person = sqlIsPersonName("vendor_name");
  const vendor = showNames ? "vendor_name" : `CASE WHEN ${person} = 1 THEN '' ELSE vendor_name END`;
  const description = showNames ? "description" : `CASE WHEN ${person} = 1 THEN '' ELSE description END`;
  const hidden = showNames ? "0" : person;
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
  if (filters?.fund) {
    where.push("fund_code = ?");
    binds.push(filters.fund);
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
      where.push(`(${sqlIsPersonName("vendor_name")} = 0 AND (vendor_name LIKE ?${extra}))`);
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
      where.push(`(invoice LIKE ? OR check_number LIKE ? OR vendor_number LIKE ? OR (${sqlIsPersonName("vendor_name")} = 0 AND (vendor_name LIKE ? OR description LIKE ?)))`);
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
  if (filters?.fund) {
    where.push("fund_code = ?");
    binds.push(filters.fund);
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
  const floor = Math.max(MIN_HIDDEN_PAYROLL_CENTS, filters && filters.minCents > 0 ? filters.minCents : 0);
  return { sql: hiddenPayrollSql(where.join(" AND ")), binds: [...binds, floor, floor, floor] };
}

/**
 * Groups of at least MIN_HIDDEN_PAYROLL_LINES lines and MIN_HIDDEN_PAYROLL_CENTS
 * stay labeled as a batch total. Smaller groups are rolled into Other payroll
 * for the same account, and that rollup is returned only when it clears the
 * same line count and total. Otherwise those lines are omitted.
 */
function hiddenPayrollSql(whereSql: string): string {
  const lines = MIN_HIDDEN_PAYROLL_LINES;
  return `SELECT id, import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
    amount_cents, vendor_number, vendor_name, invoice, description, check_number, after_cutoff, dedupe_key, person_hidden
    FROM (
      WITH grouped AS (
        SELECT MIN(id) AS id, import_id, fund_code, dept_code, object_code, project_code,
          MIN(pay_date) AS pay_date, SUM(amount_cents) AS amount_cents, COUNT(*) AS line_count,
          MIN(batch_key) AS batch_key
        FROM payroll_lines
        WHERE ${whereSql}
        GROUP BY import_id, fund_code, dept_code, object_code, project_code, batch_key, substr(pay_date, 1, 7)
      )
      SELECT id, import_id, fund_code, dept_code, object_code, project_code,
        NULL AS journal, pay_date, 'PRJ' AS source,
        amount_cents, '' AS vendor_number, '${PAYROLL_BATCH_LABEL}' AS vendor_name,
        '' AS invoice, '' AS description, '' AS check_number, 0 AS after_cutoff,
        batch_key AS dedupe_key, 0 AS person_hidden
      FROM grouped
      WHERE line_count >= ${lines} AND amount_cents >= ?
      UNION ALL
      SELECT MIN(id) AS id, import_id, fund_code, dept_code, object_code, project_code,
        NULL AS journal, MIN(pay_date) AS pay_date, 'PRJ' AS source,
        SUM(amount_cents) AS amount_cents, '' AS vendor_number, '${OTHER_PAYROLL_LABEL}' AS vendor_name,
        '' AS invoice, '' AS description, '' AS check_number, 0 AS after_cutoff,
        'other-payroll' AS dedupe_key, 0 AS person_hidden
      FROM grouped
      WHERE NOT (line_count >= ${lines} AND amount_cents >= ?)
      GROUP BY import_id, fund_code, dept_code, object_code, project_code
      HAVING SUM(line_count) >= ${lines} AND SUM(amount_cents) >= ?
    )`;
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

const NAME_SUFFIX = /^(JR|SR|II|III|IV)$/i;
const LAST_FIRST_PART = String.raw`[A-Za-z][A-Za-z''-]{1,29}`;
const LAST_FIRST_PATTERN = new RegExp(
  String.raw`\b(${LAST_FIRST_PART}),\s+(${LAST_FIRST_PART})(?:\s+[A-Za-z]\.?)?(?:\s+(?:JR|SR|II|III|IV)\.?)?(?!\w)`,
  "gi",
);

/** Words that show up in descriptions and are not person-name parts. */
const DESCRIPTION_STOP = new Set([
  "SERVICES", "SERVICE", "SUPPLIES", "SUPPLY", "PAYMENT", "PAYMENTS", "RENT", "RENTAL",
  "GENERAL", "TOTAL", "MISC", "MISCELLANEOUS", "FEE", "FEES", "CONTRACT", "CONTRACTUAL",
  "MAINTENANCE", "MONTHLY", "ANNUAL", "DEPOSIT", "REFUND", "REIMBURSEMENT", "INVOICE",
  "ACCOUNT", "TAX", "TAXES", "WATER", "SEWER", "AND", "THE", "FOR", "FROM", "WITH",
  "OTHER", "REPAIR", "REPAIRS", "BUILDING", "EQUIPMENT", "PROFESSIONAL", "LEGAL",
  "MEDICAL", "HEALTH", "PUBLIC", "SAFETY", "JANUARY", "FEBRUARY", "MARCH", "APRIL",
  "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  "NORTH", "SOUTH", "EAST", "WEST", "STREET", "AVENUE", "ROAD", "DRIVE", "LANE",
  "UNIT", "APT", "APARTMENT", "CHECK", "VENDOR", "NOTE", "NOTES", "MEMO", "VARIOUS",
  "GOODS", "ITEM", "ITEMS", "ASSISTANCE", "TENANT", "LANDLORD", "OWNER", "PAID",
  "PAY", "TO", "OF", "A", "URBAN",
  ...ORG_NAME_TOKENS,
]);

function spanIsDescribedPerson(span: string): boolean {
  const cleaned = span.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const comma = cleaned.indexOf(",");
  if (comma <= 0) return false;
  const lastWords = cleaned.slice(0, comma).trim().split(" ").filter(Boolean);
  const rightWords = cleaned
    .slice(comma + 1)
    .trim()
    .split(" ")
    .filter((word) => word && !NAME_SUFFIX.test(word));
  if (lastWords.length !== 1 || rightWords.length < 1 || rightWords.length > 2) return false;
  const last = lastWords[0].toUpperCase();
  const first = rightWords[0].toUpperCase();
  if (last.length < 2 || first.length < 2) return false;
  if (DESCRIPTION_STOP.has(last) || DESCRIPTION_STOP.has(first)) return false;
  if (!looksLikePersonName(span)) return false;
  if (rightWords[1]) {
    const middle = rightWords[1].toUpperCase();
    if (middle.length > 1 && DESCRIPTION_STOP.has(middle)) return false;
  }
  return true;
}

/** Remove Last, First person names from a description or an answer. Non-name phrases stay. */
export function scrubLastFirstPersons(value: string): string {
  if (!value || !value.includes(",")) return value;
  LAST_FIRST_PATTERN.lastIndex = 0;
  const scrubbed = value.replace(LAST_FIRST_PATTERN, (span) => (spanIsDescribedPerson(span) ? "" : span));
  return scrubbed.replace(/[ ]{2,}/g, " ").replace(/\s+,/g, ",").trim();
}

export function describedPersonNames(value: string): string[] {
  if (!value || !value.includes(",")) return [];
  LAST_FIRST_PATTERN.lastIndex = 0;
  const found: string[] = [];
  for (const match of value.matchAll(LAST_FIRST_PATTERN)) {
    if (spanIsDescribedPerson(match[0])) found.push(match[0]);
  }
  return found;
}

export function buildNameMatcher(names: string[]): RegExp | null {
  const unique = [...new Set(names.map((name) => name.trim()).filter((name) => name.length >= 4))];
  unique.sort((a, b) => b.length - a.length);
  if (!unique.length) return null;
  return new RegExp(unique.map(escapeRegExp).join("|"), "gi");
}

function applyMatcher(text: string, matcher: RegExp | null, replacement: string): string {
  if (!matcher || !text) return text;
  matcher.lastIndex = 0;
  if (!matcher.test(text)) return text;
  matcher.lastIndex = 0;
  return text.replace(matcher, replacement);
}

export function filterAnswer(answer: string, names: string[], amounts: string[], matcher?: RegExp | null): string {
  let text = answer;
  const nameMatcher = matcher === undefined ? buildNameMatcher(names) : matcher;
  text = applyMatcher(text, nameMatcher, "a withheld name");
  const sortedAmounts = [...amounts].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const amount of sortedAmounts) {
    // Match a whole amount. "50.00" must not rewrite the tail of "150.00" or "$1,500.00".
    // A following period is a sentence end, so the lookahead only rejects another digit.
    const pattern = new RegExp(`(?<![\\d.,])${escapeRegExp(amount)}(?!\\d)`, "g");
    text = text.replace(pattern, "a withheld amount");
  }
  return scrubLastFirstPersons(text);
}

interface HiddenTerms {
  names: string[];
  matcher: RegExp | null;
  amounts: string[];
}

const hiddenTermCache = new WeakMap<D1Database, Map<number, Promise<HiddenTerms>>>();

async function loadHiddenTerms(db: D1Database, importId: number): Promise<HiddenTerms> {
  const nameRows = await db
    .prepare(
      `SELECT employee_name AS name, 'payroll' AS kind FROM payroll_lines
       WHERE import_id = ? AND length(employee_name) >= 4
       UNION ALL
       SELECT vendor_name AS name, 'vendor' AS kind FROM payments
       WHERE import_id = ? AND vendor_name IS NOT NULL AND length(trim(vendor_name)) >= 3
       UNION ALL
       SELECT description AS name, 'description' AS kind FROM payments
       WHERE import_id = ? AND description LIKE '%,%'`,
    )
    .bind(importId, importId, importId)
    .all<{ name: string; kind: string }>();
  const names: string[] = [];
  for (const row of nameRows.results || []) {
    const value = row.name || "";
    if (row.kind === "vendor") {
      if (looksLikePersonName(value)) names.push(value);
      continue;
    }
    if (row.kind === "description") {
      names.push(...describedPersonNames(value));
      continue;
    }
    if (value.trim().length >= 4) names.push(value);
  }
  const lineAmounts = await db
    .prepare("SELECT amount_cents AS cents FROM payroll_lines WHERE import_id = ? AND after_cutoff = 0")
    .bind(importId)
    .all<{ cents: number }>();
  const published = await db
    .prepare(
      `WITH grouped AS (
         SELECT fund_code, dept_code, object_code, project_code,
           SUM(amount_cents) AS cents, COUNT(*) AS n
         FROM payroll_lines
         WHERE import_id = ? AND after_cutoff = 0
         GROUP BY fund_code, dept_code, object_code, project_code, batch_key, substr(pay_date, 1, 7)
       )
       SELECT cents AS cents FROM grouped WHERE n >= ? AND cents >= ?
       UNION ALL
       SELECT SUM(cents) AS cents FROM grouped
       WHERE NOT (n >= ? AND cents >= ?)
       GROUP BY fund_code, dept_code, object_code, project_code
       HAVING SUM(n) >= ? AND SUM(cents) >= ?`,
    )
    .bind(
      importId,
      MIN_HIDDEN_PAYROLL_LINES,
      MIN_HIDDEN_PAYROLL_CENTS,
      MIN_HIDDEN_PAYROLL_LINES,
      MIN_HIDDEN_PAYROLL_CENTS,
      MIN_HIDDEN_PAYROLL_LINES,
      MIN_HIDDEN_PAYROLL_CENTS,
    )
    .all<{ cents: number }>();
  const batchSet = new Set((published.results || []).map((row) => Number(row.cents)));
  const amounts: string[] = [];
  for (const row of lineAmounts.results || []) {
    const cents = Number(row.cents);
    if (batchSet.has(cents)) continue;
    amounts.push(moneyExact(cents), (cents / 100).toFixed(2));
  }
  return { names, matcher: buildNameMatcher(names), amounts };
}

function hiddenTerms(db: D1Database, importId: number): Promise<HiddenTerms> {
  let bucket = hiddenTermCache.get(db);
  if (!bucket) {
    bucket = new Map();
    hiddenTermCache.set(db, bucket);
  }
  const cached = bucket.get(importId);
  if (cached) return cached;
  const pending = loadHiddenTerms(db, importId).catch((error: unknown) => {
    bucket!.delete(importId);
    throw error;
  });
  bucket.set(importId, pending);
  return pending;
}

function scrubText(value: string | null, matcher: RegExp | null): string {
  const text = value || "";
  if (!text) return "";
  const hasComma = text.includes(",");
  const scrubbed = applyMatcher(text, matcher, "");
  if (scrubbed === text && !hasComma) return text;
  const named = hasComma ? scrubLastFirstPersons(scrubbed) : scrubbed;
  return named.replace(/\s+/g, " ").trim();
}

async function present(db: D1Database, importId: number, rows: RawLine[], showNames: boolean): Promise<PaymentRow[]> {
  const terms = showNames ? null : await hiddenTerms(db, importId);
  return rows.map((row) => {
    let vendor = row.vendor_name || "";
    let description = row.description || "";
    if (!showNames && !isPayrollTotal(vendor)) {
      if (row.person_hidden || looksLikePersonName(vendor)) {
        vendor = NAME_WITHHELD;
        description = "";
      } else {
        vendor = scrubText(vendor, terms?.matcher || null);
        description = scrubText(description, terms?.matcher || null);
      }
    }
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

function isPayrollTotal(name: string | null): boolean {
  return name === PAYROLL_BATCH_LABEL || name === OTHER_PAYROLL_LABEL;
}

function lineText(row: PaymentRow): string {
  const account = accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code);
  if (isPayrollTotal(row.vendor_name)) {
    return `${row.vendor_name} ${row.pay_date || ""} amount ${moneyExact(row.amount_cents)} account ${account}`;
  }
  return `Payment ${row.pay_date || ""} vendor ${row.vendor_name || "unmatched"} invoice ${row.invoice || "none"} check ${row.check_number || "none"} amount ${moneyExact(row.amount_cents)} account ${account} description ${row.description || ""}`;
}

function blankFilters(): SearchFilters {
  return { q: "", vendor: "", dept: "", fund: "", minCents: 0, from: "", to: "" };
}

export function qaSystem(showNames: boolean): string {
  const payroll = showNames
    ? "Employee names and individual pay in the records may be stated. Do not invent a name or amount that is not in the records."
    : "Person names and individual pay are omitted. Payroll appears only as a batch total. Do not guess employee names or individual wages.";
  return `${QA_SYSTEM} ${payroll}`;
}

interface AccountSum {
  rev: number;
  ytd: number;
  enc: number;
  avail: number;
  n: number;
  keys: string[];
}

interface NamedHit {
  code: string;
  fund: string;
  label: string;
}

async function sumAccounts(db: D1Database, importId: number, whereSql: string, binds: (string | number)[]): Promise<AccountSum | null> {
  const totals = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN object_code != '${TRANSFER_OBJECT}' THEN rev_cents ELSE 0 END), 0) AS rev,
              COALESCE(SUM(CASE WHEN object_code != '${TRANSFER_OBJECT}' THEN ytd_cents ELSE 0 END), 0) AS ytd,
              COALESCE(SUM(CASE WHEN object_code != '${TRANSFER_OBJECT}' THEN enc_cents ELSE 0 END), 0) AS enc,
              COALESCE(SUM(CASE WHEN object_code != '${TRANSFER_OBJECT}' THEN avail_cents ELSE 0 END), 0) AS avail,
              COALESCE(SUM(CASE WHEN object_code != '${TRANSFER_OBJECT}' THEN 1 ELSE 0 END), 0) AS n
       FROM accounts WHERE import_id = ? AND ${whereSql}`,
    )
    .bind(importId, ...binds)
    .first<{ rev: number; ytd: number; enc: number; avail: number; n: number }>();
  if (!totals || Number(totals.n) === 0) return null;
  const keyRows = await db
    .prepare(
      `SELECT fund_code, dept_code, object_code, project_code
       FROM accounts WHERE import_id = ? AND ${whereSql} AND object_code != '${TRANSFER_OBJECT}'
       ORDER BY ytd_cents DESC`,
    )
    .bind(importId, ...binds)
    .all<{ fund_code: string; dept_code: string; object_code: string; project_code: string }>();
  return {
    rev: Number(totals.rev),
    ytd: Number(totals.ytd),
    enc: Number(totals.enc),
    avail: Number(totals.avail),
    n: Number(totals.n),
    keys: (keyRows.results || []).map((row) => accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code)),
  };
}

function factRecord(label: string, totals: AccountSum): QaRecord {
  const shown = totals.keys.slice(0, 8);
  const more = totals.keys.length > shown.length ? `, and ${totals.keys.length - shown.length} more` : "";
  return {
    kind: "total",
    text: `FACT: ${label} spent ${moneyExact(totals.ytd)}. Revised budget ${moneyExact(totals.rev)}. Encumbered ${moneyExact(totals.enc)}. Available ${moneyExact(totals.avail)}. Account count ${totals.n}. Account keys: ${shown.join(", ")}${more}.`,
  };
}

async function loadQuestionNames(db: D1Database, importId: number): Promise<{ funds: NamedHit[]; depts: NamedHit[] }> {
  const [fundRows, deptRows, chartRows] = await Promise.all([
    db.prepare("SELECT code, report_name FROM funds WHERE import_id = ?").bind(importId).all<{ code: string; report_name: string }>(),
    db.prepare("SELECT code, fund_code, report_name FROM departments WHERE import_id = ?").bind(importId).all<{ code: string; fund_code: string; report_name: string }>(),
    db.prepare("SELECT kind, code, name FROM chart_names").all<{ kind: string; code: string; name: string }>(),
  ]);
  const chart = new Map<string, string>();
  for (const row of chartRows.results || []) chart.set(`${row.kind}:${row.code}`, row.name);
  const funds = (fundRows.results || []).map((row) => ({
    code: row.code,
    fund: row.code,
    label: chart.get(`fund:${row.code}`) || row.report_name || row.code,
  }));
  const depts = (deptRows.results || []).map((row) => ({
    code: row.code,
    fund: row.fund_code,
    label: chart.get(`department:${row.code}`) || row.report_name || row.code,
  }));
  return { funds, depts };
}

function hitsFor(question: string, rows: NamedHit[], codes: string[]): NamedHit[] {
  return rows.filter((row) => codes.includes(row.code) || nameMatchesQuestion(row.label, question));
}

function paddedPartySql(column: string): string {
  return `(' ' || replace(replace(replace(replace(upper(${column}), ',', ' '), '.', ' '), '-', ' '), '&', ' ') || ' ')`;
}

/** Whole-word hits. One token must match. Two or more tokens need two hits, so extra question words do not hide a name. */
function tokenScoreSql(column: string, tokens: string[]): { sql: string; binds: string[]; needed: number } {
  const padded = paddedPartySql(column);
  const safe = tokens.map((token) => token.replace(/[^A-Z0-9]/g, "")).filter((token) => token.length >= 4);
  const sql = safe.map(() => `(CASE WHEN ${padded} LIKE ? THEN 1 ELSE 0 END)`).join(" + ");
  return {
    sql: sql || "0",
    binds: safe.map((token) => `% ${token} %`),
    needed: safe.length <= 1 ? safe.length : 2,
  };
}

async function vendorFacts(db: D1Database, importId: number, question: string, showNames: boolean): Promise<QaRecord[]> {
  const tokens = vendorTokens(question);
  if (!tokens.length) return [];
  const personSql = showNames ? "1 = 1" : `${sqlIsPersonName("vendor_name")} = 0`;
  const score = tokenScoreSql("vendor_name", tokens);
  if (!score.needed) return [];
  const groups = await db
    .prepare(
      `SELECT MAX(vendor_name) AS vendor_name, SUM(amount_cents) AS cents, COUNT(*) AS n
       FROM payments
       WHERE import_id = ? AND after_cutoff = 0 AND vendor_name != '' AND ${personSql} AND (${score.sql}) >= ?
       GROUP BY CASE WHEN vendor_number = '' THEN vendor_name ELSE vendor_number END
       ORDER BY cents DESC
       LIMIT 3`,
    )
    .bind(importId, ...score.binds, score.needed)
    .all<{ vendor_name: string; cents: number; n: number }>();
  const facts: QaRecord[] = [];
  for (const group of groups.results || []) {
    const name = (group.vendor_name || "").trim();
    if (!name || (!showNames && looksLikePersonName(name))) continue;
    const keys = await db
      .prepare(
        `SELECT DISTINCT fund_code, dept_code, object_code, project_code
         FROM payments
         WHERE import_id = ? AND after_cutoff = 0 AND vendor_name = ? AND ${personSql}`,
      )
      .bind(importId, name)
      .all<{ fund_code: string; dept_code: string; object_code: string; project_code: string }>();
    const keyList = (keys.results || []).map((row) => accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code));
    const shown = keyList.slice(0, 8);
    const more = keyList.length > shown.length ? `, and ${keyList.length - shown.length} more` : "";
    facts.push({
      kind: "total",
      text: `FACT: Vendor ${name} paid ${moneyExact(Number(group.cents))} across ${Number(group.n)} payments. Account count ${keyList.length}. Account keys: ${shown.join(", ")}${more}.`,
    });
  }
  return facts;
}

async function titleFact(db: D1Database, importId: number, question: string): Promise<QaRecord | null> {
  const tokens = vendorTokens(question).filter((token) => token.length >= 6);
  if (tokens.length < 1) return null;
  const score = tokenScoreSql("title", tokens);
  if (!score.needed) return null;
  const totals = await sumAccounts(db, importId, `(${score.sql}) >= ?`, [...score.binds, score.needed]);
  if (!totals) return null;
  return factRecord(`Accounts whose title matches ${tokens.join(", ")}`, totals);
}

export async function buildQuestionContext(
  db: D1Database,
  importId: number,
  question: string,
  showNames: boolean,
  factText = "",
): Promise<QaPack> {
  const records: QaRecord[] = [];
  const codes = mentionedCodes(question);
  const catalog = await loadQuestionNames(db, importId);
  const fundHits = hitsFor(question, catalog.funds, codes.funds);
  const deptHits = hitsFor(question, catalog.depts, codes.depts);
  const asksDepartment = /\bdepartments?\b/i.test(question) || codes.depts.length > 0;
  let structured = false;

  if (asksDepartment && deptHits.length) {
    structured = true;
    for (const hit of deptHits.slice(0, 3)) {
      const totals = await sumAccounts(db, importId, "dept_code = ?", [hit.code]);
      if (totals) records.push(factRecord(`Department ${hit.code} (${hit.label})`, totals));
    }
  } else if (fundHits.length) {
    structured = true;
    for (const hit of fundHits.slice(0, 3)) {
      const totals = await sumAccounts(db, importId, "fund_code = ?", [hit.code]);
      if (totals) records.push(factRecord(`Fund ${hit.code} (${hit.label})`, totals));
    }
  } else if (deptHits.length) {
    structured = true;
    for (const hit of deptHits.slice(0, 3)) {
      const totals = await sumAccounts(db, importId, "dept_code = ?", [hit.code]);
      if (totals) records.push(factRecord(`Department ${hit.code} (${hit.label})`, totals));
    }
  } else if (codes.objects.length) {
    structured = true;
    for (const code of codes.objects.slice(0, 3)) {
      const totals = await sumAccounts(db, importId, "object_code = ?", [code]);
      if (totals) records.push(factRecord(`Object ${code}`, totals));
    }
  } else if (/\bover\b/i.test(question) && /\bbudget\b/i.test(question)) {
    const departments = await departmentRollups(db, importId);
    const over = departments
      .filter((row) => !isTransferDepartment(row.report_name) && pace(row.rev_cents, row.ytd_cents, row.enc_cents, 100) !== "green")
      .filter((row) => row.ytd_cents + row.enc_cents > row.rev_cents)
      .sort((a, b) => b.ytd_cents + b.enc_cents - b.rev_cents - (a.ytd_cents + a.enc_cents - a.rev_cents))
      .slice(0, 5);
    for (const row of over) {
      const totals = await sumAccounts(db, importId, "dept_code = ?", [row.code]);
      if (totals) records.push(factRecord(`Over revised budget: department ${row.code} (${row.report_name || row.code})`, totals));
    }
    structured = records.length > 0;
  } else if (/\b(which|what)\s+fund\b/i.test(question) && /\b(most|largest|highest|biggest)\b/i.test(question)) {
    const funds = await fundRollups(db, importId);
    const top = [...funds].sort((a, b) => b.ytd_cents - a.ytd_cents)[0];
    if (top) {
      const totals = await sumAccounts(db, importId, "fund_code = ?", [top.code]);
      if (totals) {
        records.push(factRecord(`Largest fund by amount spent: fund ${top.code} (${top.report_name || top.code})`, totals));
        structured = true;
      }
    }
  }

  if (!structured) {
    const vendors = await vendorFacts(db, importId, question, showNames);
    records.push(...vendors);
    if (!vendors.length) {
      const titled = await titleFact(db, importId, question);
      if (titled) records.push(titled);
    }
  }

  if (!showNames && /\b(payroll|salary|salaries|wage|wages)\b/i.test(question)) {
    const batches = await searchLines(db, importId, blankFilters(), 0, 12, false);
    for (const row of batches.rows) {
      if (!isPayrollTotal(row.vendor_name)) continue;
      records.push({ kind: "total", text: lineText(row) });
    }
  }
  const seen = new Set<string>();
  const unique = records.filter((record) => {
    if (seen.has(record.text)) return false;
    seen.add(record.text);
    return true;
  }).slice(0, 40);
  const body = unique.map((record, index) => `[${index + 1}] ${record.text}`).join("\n");
  const prompt = [
    `Question: ${question.slice(0, QA_MAX_CHARS)}`,
    "",
    factText ? `Countywide facts, already net of money moved between funds. ${factText}` : "",
    "FACTS computed in SQL. Copy dollar figures from FACT lines only. Do not add, subtract, multiply, divide, or round. Cite the account count and account keys from the FACT you use.",
    body || "(no computed total)",
  ].filter((line) => line !== "").join("\n");
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
  const terms = await hiddenTerms(db, importId);
  return {
    answer: filterAnswer(answer, terms.names, terms.amounts, terms.matcher),
    records: records.map((record) => ({ ...record, text: filterAnswer(record.text, terms.names, terms.amounts, terms.matcher) })),
  };
}
