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
    left: current - spent,
    amendments: current - adopted,
    transfer: transferYtd,
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
  ${transferCase("enc_cents")} AS transfer_enc_cents
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

export const TOP_VENDOR_SQL = `
SELECT vendor_name,
  COALESCE(SUM(amount_cents), 0) AS cents,
  COUNT(*) AS lines,
  COUNT(DISTINCT CASE WHEN check_number != '' THEN check_number END) AS checks
FROM payments
WHERE import_id = ?
  AND after_cutoff = 0
  AND object_code != '${TRANSFER_OBJECT}'
  AND vendor_name != ''
  AND (? = 1 OR is_person_name = 0)
  AND (? = '' OR fund_code = ?)
  AND (? = '' OR dept_code = ?)
GROUP BY vendor_name
ORDER BY cents DESC
LIMIT 80
`;

export const VENDOR_NAME_SQL = `
SELECT vendor_name
FROM payments
WHERE import_id = ? AND is_person_name = 0 AND vendor_name != '' AND length(vendor_name) >= 18
GROUP BY vendor_name
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
  return (rows.results || []).map((row) => ({
    prefix: row.prefix,
    label: categoryLabel(row.prefix),
    rev_cents: Number(row.rev_cents) || 0,
    ytd_cents: Number(row.ytd_cents) || 0,
  }));
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

export async function loadVendorNames(db: D1Database, importId: number): Promise<string[]> {
  const rows = await db.prepare(VENDOR_NAME_SQL).bind(importId).all<{ vendor_name: string }>();
  return (rows.results || []).map((row) => row.vendor_name);
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
