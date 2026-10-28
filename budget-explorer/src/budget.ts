import type { PaymentRow } from "./db";
import { CONSTITUTIONAL_SQL } from "./overview";

/** Object code for money moved from one county fund to another. */
export const TRANSFER_OBJECT = "591000";

export interface BudgetFacts {
  grossOrig: number;
  grossRev: number;
  grossYtd: number;
  grossEnc: number;
  transferOrig: number;
  transferRev: number;
  transferYtd: number;
  transferEnc: number;
  adopted: number;
  current: number;
  spent: number;
  encumbered: number;
  left: number;
  amendments: number;
  transfer: number;
  /** One-decimal percents from the SQL sums. Adopted is the budget commissioners passed. */
  spentOfCurrentPct: number;
  spentOfAdoptedPct: number;
}

interface FactRow {
  orig_cents: number;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
  transfer_orig_cents: number;
  transfer_rev_cents: number;
  transfer_ytd_cents: number;
  transfer_enc_cents: number;
  spent_of_current_tenths?: number;
  spent_of_adopted_tenths?: number;
}

function percentOf(tenths: number | undefined, part: number, whole: number): number {
  if (tenths != null && Number.isFinite(Number(tenths))) return Number(tenths) / 10;
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function factsFromRow(row: FactRow): BudgetFacts {
  const grossOrig = Number(row.orig_cents) || 0;
  const grossRev = Number(row.rev_cents) || 0;
  const grossYtd = Number(row.ytd_cents) || 0;
  const grossEnc = Number(row.enc_cents) || 0;
  const transferOrig = Number(row.transfer_orig_cents) || 0;
  const transferRev = Number(row.transfer_rev_cents) || 0;
  const transferYtd = Number(row.transfer_ytd_cents) || 0;
  const transferEnc = Number(row.transfer_enc_cents) || 0;
  const adopted = grossOrig - transferOrig;
  const current = grossRev - transferRev;
  const spent = grossYtd - transferYtd;
  const encumbered = grossEnc - transferEnc;
  return {
    grossOrig,
    grossRev,
    grossYtd,
    grossEnc,
    transferOrig,
    transferRev,
    transferYtd,
    transferEnc,
    adopted,
    current,
    spent,
    encumbered,
    left: current - spent - encumbered,
    amendments: current - adopted,
    transfer: transferYtd,
    spentOfCurrentPct: percentOf(row.spent_of_current_tenths, spent, current),
    spentOfAdoptedPct: percentOf(row.spent_of_adopted_tenths, spent, adopted),
  };
}

const transferCase = (column: string) =>
  `COALESCE(SUM(CASE WHEN object_code = '${TRANSFER_OBJECT}' THEN ${column} ELSE 0 END), 0)`;

export const BUDGET_FACTS_SQL = `
SELECT
  COALESCE(SUM(orig_cents), 0) AS orig_cents,
  COALESCE(SUM(rev_cents), 0) AS rev_cents,
  COALESCE(SUM(ytd_cents), 0) AS ytd_cents,
  COALESCE(SUM(enc_cents), 0) AS enc_cents,
  ${transferCase("orig_cents")} AS transfer_orig_cents,
  ${transferCase("rev_cents")} AS transfer_rev_cents,
  ${transferCase("ytd_cents")} AS transfer_ytd_cents,
  ${transferCase("enc_cents")} AS transfer_enc_cents,
  ROUND(CASE
    WHEN (COALESCE(SUM(rev_cents), 0) - ${transferCase("rev_cents")}) = 0 THEN 0
    ELSE ((COALESCE(SUM(ytd_cents), 0) - ${transferCase("ytd_cents")}) * 1000.0)
      / (COALESCE(SUM(rev_cents), 0) - ${transferCase("rev_cents")})
  END) AS spent_of_current_tenths,
  ROUND(CASE
    WHEN (COALESCE(SUM(orig_cents), 0) - ${transferCase("orig_cents")}) = 0 THEN 0
    ELSE ((COALESCE(SUM(ytd_cents), 0) - ${transferCase("ytd_cents")}) * 1000.0)
      / (COALESCE(SUM(orig_cents), 0) - ${transferCase("orig_cents")})
  END) AS spent_of_adopted_tenths
FROM accounts
WHERE import_id = ?
`;

export const FUND_ROLLUP_SQL = `
SELECT a.fund_code AS fund_code,
  COALESCE(MAX(f.report_name), '') AS report_name,
  COALESCE(SUM(a.orig_cents), 0) AS orig_cents,
  COALESCE(SUM(a.rev_cents), 0) AS rev_cents,
  COALESCE(SUM(a.ytd_cents), 0) AS ytd_cents,
  COALESCE(SUM(a.enc_cents), 0) AS enc_cents,
  COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.orig_cents ELSE 0 END), 0) AS transfer_orig_cents,
  COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.rev_cents ELSE 0 END), 0) AS transfer_rev_cents,
  COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.ytd_cents ELSE 0 END), 0) AS transfer_ytd_cents,
  COALESCE(SUM(CASE WHEN a.object_code = '${TRANSFER_OBJECT}' THEN a.enc_cents ELSE 0 END), 0) AS transfer_enc_cents
FROM accounts a
LEFT JOIN funds f ON f.import_id = a.import_id AND f.code = a.fund_code
WHERE a.import_id = ?
GROUP BY a.fund_code
`;

export interface FundRollup extends FactRow {
  fund_code: string;
  report_name: string;
}

export interface CategorySpend {
  prefix: string;
  label: string;
  rev_cents: number;
  ytd_cents: number;
}

export function categoryLabel(prefix: string): string {
  switch (prefix) {
    case "51":
      return "Pay and benefits";
    case "52":
      return "Day to day costs";
    case "53":
      return "Buildings and equipment";
    case "54":
      return "Help to other groups";
    case "55":
      return "Supplies";
    default:
      return "Other costs";
  }
}

export function categorySql(column: "fund_code" | "dept_code"): string {
  return `
SELECT substr(object_code, 1, 2) AS prefix,
  COALESCE(SUM(rev_cents), 0) AS rev_cents,
  COALESCE(SUM(ytd_cents), 0) AS ytd_cents
FROM accounts
WHERE import_id = ? AND ${column} = ? AND object_code != '${TRANSFER_OBJECT}'
GROUP BY prefix
ORDER BY ytd_cents DESC
`;
}

export interface VendorSpendRow {
  vendor_name: string;
  cents: number;
  lines: number;
  checks: number;
}

/**
 * Longest stored name per vendor, via ROW_NUMBER, then one aggregate.
 * A blank trimmed name is not displayed, and it still counts in the totals.
 */
export const TOP_VENDOR_SQL = `
WITH scoped AS MATERIALIZED (
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
  WHERE trim(COALESCE(vendor_name, '')) != ''
)
SELECT
  MAX(ranked.vendor_name) AS vendor_name,
  COALESCE(SUM(scoped.amount_cents), 0) AS cents,
  COUNT(*) AS lines,
  COUNT(DISTINCT CASE WHEN trim(COALESCE(scoped.check_number, '')) != '' THEN scoped.check_number END) AS checks,
  COALESCE(SUM(CASE WHEN scoped.object_code = '561000' THEN scoped.amount_cents ELSE 0 END), 0) AS land_cents
FROM scoped
LEFT JOIN ranked ON ranked.vendor_key = scoped.vendor_key AND ranked.rn = 1
GROUP BY scoped.vendor_key
ORDER BY cents DESC
LIMIT 80
`;

export async function loadBudgetFacts(db: D1Database, importId: number): Promise<BudgetFacts> {
  const row = await db.prepare(BUDGET_FACTS_SQL).bind(importId).first<FactRow>();
  return factsFromRow(
    row || {
      orig_cents: 0,
      rev_cents: 0,
      ytd_cents: 0,
      enc_cents: 0,
      transfer_orig_cents: 0,
      transfer_rev_cents: 0,
      transfer_ytd_cents: 0,
      transfer_enc_cents: 0,
    },
  );
}

export async function loadFundRollups(db: D1Database, importId: number): Promise<FundRollup[]> {
  const rows = await db.prepare(FUND_ROLLUP_SQL).bind(importId).all<FundRollup>();
  return rows.results || [];
}

export async function loadCategorySpend(
  db: D1Database,
  importId: number,
  scope: { fund?: string; dept?: string },
): Promise<CategorySpend[]> {
  const column = scope.dept ? "dept_code" : "fund_code";
  const code = scope.dept || scope.fund || "";
  const rows = await db
    .prepare(categorySql(column))
    .bind(importId, code)
    .all<{ prefix: string; rev_cents: number; ytd_cents: number }>();
  const merged = new Map<string, CategorySpend>();
  for (const row of rows.results || []) {
    const label = categoryLabel(row.prefix);
    const rev = Number(row.rev_cents) || 0;
    const ytd = Number(row.ytd_cents) || 0;
    const existing = merged.get(label);
    if (existing) {
      existing.rev_cents += rev;
      existing.ytd_cents += ytd;
    } else {
      merged.set(label, { prefix: row.prefix, label, rev_cents: rev, ytd_cents: ytd });
    }
  }
  return [...merged.values()].filter((row) => row.rev_cents !== 0 || row.ytd_cents !== 0);
}

export async function loadTopVendors(
  db: D1Database,
  importId: number,
  opts: { showNames: boolean; fund?: string; dept?: string },
): Promise<VendorSpendRow[]> {
  const rows = await db
    .prepare(TOP_VENDOR_SQL)
    .bind(importId, opts.showNames ? 1 : 0, opts.fund || "", opts.fund || "", opts.dept || "", opts.dept || "")
    .all<VendorSpendRow>();
  return (rows.results || []).map((row) => ({
    vendor_name: row.vendor_name,
    cents: Number(row.cents) || 0,
    lines: Number(row.lines) || 0,
    checks: Number(row.checks) || 0,
  }));
}

/**
 * Fund and department payment lists. The person check uses the stored is_person_name
 * column. Combining NOT CONSTITUTIONAL_SQL with sqlIsPersonName in one WHERE exceeds
 * D1's expression depth of 100. Hidden mode still requires is_person_name = 0.
 */
export const PAYMENT_SCOPE_SQL = `
  import_id = ?
  AND after_cutoff = 0
  AND object_code != '${TRANSFER_OBJECT}'
  AND NOT ${CONSTITUTIONAL_SQL}
  AND (? = 1 OR is_person_name = 0)
  AND (? = '' OR fund_code = ?)
  AND (? = '' OR dept_code = ?)
`;

const PAYMENT_COLUMNS = `id, import_id, fund_code, dept_code, object_code, project_code, journal, pay_date, source,
  amount_cents, vendor_number, vendor_name, invoice, check_number, description, after_cutoff, dedupe_key`;

function scopeBinds(importId: number, opts: { showNames: boolean; fund?: string; dept?: string }): (string | number)[] {
  const fund = opts.fund || "";
  const dept = opts.dept || "";
  return [importId, opts.showNames ? 1 : 0, fund, fund, dept, dept];
}

/** Largest outside payments, net of a later reversal for the same vendor and amount. */
export async function loadLargestPayments(
  db: D1Database,
  importId: number,
  opts: { showNames: boolean; fund?: string; dept?: string },
): Promise<PaymentRow[]> {
  const binds = scopeBinds(importId, opts);
  const [positives, negatives, nets] = await Promise.all([
    db
      .prepare(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments
         WHERE ${PAYMENT_SCOPE_SQL} AND amount_cents > 0
         ORDER BY amount_cents DESC
         LIMIT 40`,
      )
      .bind(...binds)
      .all<PaymentRow>(),
    db
      .prepare(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments
         WHERE ${PAYMENT_SCOPE_SQL}
           AND amount_cents < 0
           AND -amount_cents IN (
             SELECT amount_cents FROM payments
             WHERE ${PAYMENT_SCOPE_SQL} AND amount_cents > 0
             ORDER BY amount_cents DESC
             LIMIT 40
           )`,
      )
      .bind(...binds, ...binds)
      .all<PaymentRow>(),
    db
      .prepare(
        `SELECT upper(trim(vendor_name)) AS vendor_name, COALESCE(SUM(amount_cents), 0) AS cents
         FROM payments
         WHERE ${PAYMENT_SCOPE_SQL} AND trim(vendor_name) != ''
         GROUP BY upper(trim(vendor_name))`,
      )
      .bind(...binds)
      .all<{ vendor_name: string; cents: number }>(),
  ]);
  const netByVendor = new Map<string, number>();
  for (const row of nets.results || []) netByVendor.set(row.vendor_name, Number(row.cents) || 0);
  return netPaymentReversals([...(positives.results || []), ...(negatives.results || [])], netByVendor);
}

/** Payments to county offices that are not already counted as object 591000 transfers. */
export async function loadOfficePaymentCents(
  db: D1Database,
  importId: number,
  scope: { fund?: string; dept?: string } = {},
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS cents
       FROM payments
       WHERE import_id = ?
         AND after_cutoff = 0
         AND object_code != '${TRANSFER_OBJECT}'
         AND ${CONSTITUTIONAL_SQL}
         AND (? = '' OR fund_code = ?)
         AND (? = '' OR dept_code = ?)`,
    )
    .bind(importId, scope.fund || "", scope.fund || "", scope.dept || "", scope.dept || "")
    .first<{ cents: number }>();
  return Number(row?.cents || 0);
}

export interface AccountSpend {
  fund_code: string;
  dept_code: string;
  object_code: string;
  project_code: string;
  title: string | null;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
}

export async function loadTopAccounts(
  db: D1Database,
  importId: number,
  scope: { fund?: string; dept?: string },
): Promise<AccountSpend[]> {
  const column = scope.dept ? "dept_code" : "fund_code";
  const code = scope.dept || scope.fund || "";
  const rows = await db
    .prepare(
      `SELECT fund_code, dept_code, object_code, project_code, title, rev_cents, ytd_cents, enc_cents
       FROM accounts
       WHERE import_id = ? AND ${column} = ? AND object_code != '${TRANSFER_OBJECT}'
       ORDER BY ytd_cents DESC
       LIMIT 8`,
    )
    .bind(importId, code)
    .all<AccountSpend>();
  return rows.results || [];
}

export interface CapitalLine {
  object_code: string;
  title: string | null;
  ytd_cents: number;
}

/** Capital accounts (object codes 56xxxx) whose year-to-date total covers spending above the department budget. */
export function capitalLinesCovering(spent: number, budget: number, lines: CapitalLine[]): CapitalLine[] | null {
  if (!(budget > 0) || spent <= budget) return null;
  const over = spent - budget;
  const capital = lines
    .filter((line) => line.object_code.startsWith("56") && line.ytd_cents > 0)
    .map((line) => ({ object_code: line.object_code, title: line.title, ytd_cents: line.ytd_cents }))
    .sort((a, b) => b.ytd_cents - a.ytd_cents);
  const chosen: CapitalLine[] = [];
  let running = 0;
  for (const line of capital) {
    chosen.push(line);
    running += line.ytd_cents;
    if (running >= over) return chosen;
  }
  return null;
}

export async function loadCapitalAccounts(
  db: D1Database,
  importId: number,
  fund: string,
): Promise<Map<string, CapitalLine[]>> {
  const rows = await db
    .prepare(
      `SELECT dept_code, object_code, COALESCE(MAX(title), '') AS title, COALESCE(SUM(ytd_cents), 0) AS ytd_cents
       FROM accounts
       WHERE import_id = ? AND fund_code = ? AND object_code GLOB '56*'
       GROUP BY dept_code, object_code
       HAVING ytd_cents > 0`,
    )
    .bind(importId, fund)
    .all<{ dept_code: string; object_code: string; title: string; ytd_cents: number }>();
  const byDept = new Map<string, CapitalLine[]>();
  for (const row of rows.results || []) {
    const list = byDept.get(row.dept_code) || [];
    list.push({ object_code: row.object_code, title: row.title, ytd_cents: Number(row.ytd_cents) || 0 });
    byDept.set(row.dept_code, list);
  }
  return byDept;
}

interface ReversiblePayment {
  pay_date: string | null;
  amount_cents: number;
  vendor_name: string | null;
  invoice?: string | null;
  check_number: string | null;
  journal: string | null;
}

function vendorPayKey(name: string | null | undefined): string {
  return (name || "").trim().toUpperCase();
}

function sameRef(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = (left || "").trim();
  const b = (right || "").trim();
  return Boolean(a) && a === b;
}

function sharesPaymentRef(a: ReversiblePayment, b: ReversiblePayment): boolean {
  return sameRef(a.invoice, b.invoice) || sameRef(a.check_number, b.check_number) || sameRef(a.journal, b.journal);
}

function daysApart(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 9999;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 9999;
  return Math.abs(left - right) / 86400000;
}

/**
 * Drop a positive line when an offsetting negative line has the same absolute amount.
 * Same vendor matches directly. A blank name matches only when the check, invoice,
 * journal, or a date within 14 days ties the two lines together.
 * What remains for a named vendor cannot add up to more than that vendor's net total.
 */
export function netPaymentReversals<T extends ReversiblePayment>(rows: T[], nets: Map<string, number>): T[] {
  const positives = rows.filter((row) => row.amount_cents > 0);
  const negatives = rows.filter((row) => row.amount_cents < 0);
  const used = new Set<number>();
  for (const neg of negatives) {
    let best = -1;
    let bestScore = 0;
    positives.forEach((pos, index) => {
      if (used.has(index) || pos.amount_cents !== -neg.amount_cents) return;
      const posName = vendorPayKey(pos.vendor_name);
      const negName = vendorPayKey(neg.vendor_name);
      let score = 0;
      if (posName && negName && posName === negName) score = 100;
      else if (!posName && !negName) score = 80;
      else if (!posName || !negName) {
        if (sharesPaymentRef(pos, neg) || daysApart(pos.pay_date, neg.pay_date) <= 14) score = 40;
      }
      if (!score) return;
      if (sharesPaymentRef(pos, neg)) score += 30;
      const days = daysApart(pos.pay_date, neg.pay_date);
      if (days <= 14) score += Math.max(0, 14 - days);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best >= 0) used.add(best);
  }
  let kept = positives.filter((_, index) => !used.has(index));
  kept = kept.filter((row) => {
    if (vendorPayKey(row.vendor_name)) return true;
    return !rows.some((other) => {
      if (other === row || !vendorPayKey(other.vendor_name)) return false;
      if (Math.abs(other.amount_cents) !== row.amount_cents) return false;
      return sharesPaymentRef(row, other) || daysApart(row.pay_date, other.pay_date) <= 14;
    });
  });
  const byVendor = new Map<string, T[]>();
  const blanks: T[] = [];
  for (const row of kept) {
    const name = vendorPayKey(row.vendor_name);
    if (!name) {
      blanks.push(row);
      continue;
    }
    const list = byVendor.get(name) || [];
    list.push(row);
    byVendor.set(name, list);
  }
  const capped: T[] = [];
  for (const [name, list] of byVendor) {
    const net = nets.get(name);
    list.sort((a, b) => b.amount_cents - a.amount_cents);
    if (net == null) {
      capped.push(...list);
      continue;
    }
    if (net <= 0) continue;
    let running = 0;
    for (const row of list) {
      if (row.amount_cents > net || running + row.amount_cents > net) continue;
      running += row.amount_cents;
      capped.push(row);
    }
  }
  capped.push(...blanks);
  capped.sort((a, b) => b.amount_cents - a.amount_cents);
  return capped;
}

/** Height of a SQLite expression tree. D1 rejects a tree deeper than 100. */
export function sqlExpressionDepth(sql: string): number {
  const parser = new SqlDepthParser(sql);
  const depth = parser.parseOr();
  parser.skip();
  if (!parser.done()) {
    throw new Error(`SQL depth parser stopped early: ${parser.rest()}`);
  }
  return depth;
}

class SqlDepthParser {
  i = 0;
  constructor(private readonly sql: string) {}

  done(): boolean {
    return this.i >= this.sql.length;
  }

  rest(): string {
    return this.sql.slice(this.i, this.i + 48);
  }

  skip(): void {
    while (this.i < this.sql.length && /\s/.test(this.sql[this.i])) this.i += 1;
  }

  private peekWord(): string {
    this.skip();
    const match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(this.sql.slice(this.i));
    return match ? match[0].toUpperCase() : "";
  }

  private eatWord(word: string): boolean {
    if (this.peekWord() !== word) return false;
    this.i += word.length;
    return true;
  }

  private startsWith(text: string): boolean {
    this.skip();
    return this.sql.startsWith(text, this.i);
  }

  parseOr(): number {
    let depth = this.parseAnd();
    while (this.eatWord("OR")) depth = 1 + Math.max(depth, this.parseAnd());
    return depth;
  }

  private parseAnd(): number {
    let depth = this.parseNot();
    while (this.eatWord("AND")) depth = 1 + Math.max(depth, this.parseNot());
    return depth;
  }

  private parseNot(): number {
    if (this.eatWord("NOT")) return 1 + this.parseNot();
    return this.parseCmp();
  }

  private parseCmp(): number {
    const left = this.parseConcat();
    this.skip();
    if (this.eatWord("IS")) {
      if (this.eatWord("NOT")) this.eatWord("NULL");
      else this.eatWord("NULL");
      return 1 + Math.max(left, 1);
    }
    if (this.eatWord("NOT")) {
      if (this.eatWord("IN") || this.eatWord("LIKE") || this.eatWord("GLOB")) return 1 + Math.max(left, this.parseInOrPattern());
    }
    if (this.eatWord("IN") || this.eatWord("LIKE") || this.eatWord("GLOB")) return 1 + Math.max(left, this.parseInOrPattern());
    if (this.eatWord("BETWEEN")) {
      const low = this.parseConcat();
      if (!this.eatWord("AND")) throw new Error("BETWEEN without AND");
      const high = this.parseConcat();
      return 1 + Math.max(left, low, high);
    }
    const ops = ["<>", "!=", "<=", ">=", "=", "<", ">"];
    for (const op of ops) {
      if (!this.startsWith(op)) continue;
      this.i += op.length;
      return 1 + Math.max(left, this.parseConcat());
    }
    return left;
  }

  private parseInOrPattern(): number {
    this.skip();
    if (this.sql[this.i] !== "(") return this.parseConcat();
    this.i += 1;
    this.skip();
    if (this.peekWord() === "SELECT") {
      const inner = this.consumeGroup();
      const where = /\bWHERE\b([\s\S]*)$/i.exec(inner);
      if (!where) return 1;
      const clause = where[1].replace(/\b(GROUP|ORDER|LIMIT|UNION)\b[\s\S]*$/i, "");
      return sqlExpressionDepth(clause);
    }
    let max = 1;
    if (this.sql[this.i] !== ")") {
      while (true) {
        max = Math.max(max, this.parseOr());
        this.skip();
        if (this.sql[this.i] === ",") {
          this.i += 1;
          continue;
        }
        break;
      }
    }
    if (this.sql[this.i] !== ")") throw new Error("Unclosed IN list");
    this.i += 1;
    return max;
  }

  private consumeGroup(): string {
    let level = 1;
    const start = this.i;
    while (this.i < this.sql.length && level > 0) {
      const ch = this.sql[this.i];
      if (ch === "'") {
        this.i += 1;
        while (this.i < this.sql.length) {
          if (this.sql[this.i] === "'" && this.sql[this.i + 1] === "'") {
            this.i += 2;
            continue;
          }
          if (this.sql[this.i] === "'") {
            this.i += 1;
            break;
          }
          this.i += 1;
        }
        continue;
      }
      if (ch === "(") level += 1;
      if (ch === ")") level -= 1;
      this.i += 1;
    }
    return this.sql.slice(start, this.i - 1);
  }

  private parseConcat(): number {
    let depth = this.parseAdd();
    while (this.startsWith("||")) {
      this.i += 2;
      depth = 1 + Math.max(depth, this.parseAdd());
    }
    return depth;
  }

  private parseAdd(): number {
    let depth = this.parseMul();
    while (this.startsWith("+") || (this.startsWith("-") && !this.startsWith("->"))) {
      this.i += 1;
      depth = 1 + Math.max(depth, this.parseMul());
    }
    return depth;
  }

  private parseMul(): number {
    let depth = this.parseUnary();
    while (this.startsWith("*") || this.startsWith("/") || this.startsWith("%")) {
      this.i += 1;
      depth = 1 + Math.max(depth, this.parseUnary());
    }
    return depth;
  }

  private parseUnary(): number {
    this.skip();
    if (this.startsWith("-") || this.startsWith("+") || this.startsWith("~")) {
      this.i += 1;
      return 1 + this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skip();
    const ch = this.sql[this.i];
    if (!ch) throw new Error("Unexpected end of SQL expression");
    if (ch === "(") {
      this.i += 1;
      const depth = this.parseOr();
      this.skip();
      if (this.sql[this.i] !== ")") throw new Error("Unclosed parenthesis");
      this.i += 1;
      return depth;
    }
    if (ch === "'" ) {
      this.i += 1;
      while (this.i < this.sql.length) {
        if (this.sql[this.i] === "'" && this.sql[this.i + 1] === "'") {
          this.i += 2;
          continue;
        }
        if (this.sql[this.i] === "'") {
          this.i += 1;
          break;
        }
        this.i += 1;
      }
      return 1;
    }
    if (ch === "?") {
      this.i += 1;
      return 1;
    }
    if (/[0-9.]/.test(ch)) {
      this.i += 1;
      while (this.i < this.sql.length && /[0-9.]/.test(this.sql[this.i])) this.i += 1;
      return 1;
    }
    const word = this.peekWord();
    if (!word) throw new Error(`Unexpected SQL at ${this.rest()}`);
    if (word === "CASE") {
      this.i += word.length;
      let max = 0;
      while (this.eatWord("WHEN")) {
        max = Math.max(max, this.parseOr());
        if (!this.eatWord("THEN")) throw new Error("CASE without THEN");
        max = Math.max(max, this.parseOr());
      }
      if (this.eatWord("ELSE")) max = Math.max(max, this.parseOr());
      if (!this.eatWord("END")) throw new Error("CASE without END");
      return 1 + max;
    }
    if (word === "NULL") {
      this.i += word.length;
      return 1;
    }
    this.i += word.length;
    this.skip();
    if (this.sql[this.i] === "(") {
      const args = this.parseArgList();
      return 1 + args;
    }
    return 1;
  }

  private parseArgList(): number {
    this.i += 1;
    this.skip();
    if (this.sql[this.i] === ")") {
      this.i += 1;
      return 0;
    }
    let max = 0;
    while (true) {
      max = Math.max(max, this.parseOr());
      this.skip();
      if (this.sql[this.i] === ",") {
        this.i += 1;
        continue;
      }
      break;
    }
    if (this.sql[this.i] !== ")") throw new Error("Unclosed function call");
    this.i += 1;
    return max;
  }
}
