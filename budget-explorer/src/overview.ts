import { pace, type Pace } from "./format";

/** Departments that move money between funds. Left out of the pace chart. */
export function isTransferDepartment(reportName: string, chartName = ""): boolean {
  const blob = `${reportName} ${chartName}`.toUpperCase();
  if (blob.includes("INTERFUND") || blob.includes("GROUP TRAN")) return true;
  return blob.includes("SOLID WASTE") && blob.includes("TRANSFER");
}

/** Fund 107 and the Sheriff department. The report shows Board releases, not Sheriff spending. */
export function isSheriffRelease(name: string, fundCode = ""): boolean {
  if (fundCode === "107") return true;
  const blob = name.toUpperCase();
  return blob.includes("SHERIFF") || blob.includes("FINE & FORFEITURE") || blob.includes("FINE AND FORFEITURE");
}

/** Clerk of Court and Tax Collector are paid on a schedule. */
export function isScheduledOffice(name: string): boolean {
  const blob = name.toUpperCase();
  return blob.includes("CLERK OF COURT") || blob.includes("CLERK OF THE COURT") || blob.includes("TAX COLLECTOR");
}

export const SHERIFF_FUND_LABEL = "Fine and Forfeiture fund (pays the Sheriff)";
export const SHERIFF_FUND_CAPTION =
  "The county report shows the Board's monthly budget releases to the Sheriff. It does not show the Sheriff's own spending.";

/**
 * Sheriff, Clerk, Property Appraiser, and Supervisor of Elections.
 * Payments to those offices are budget transfers, not vendor spending.
 */
/** A payee that is Walton County itself or another county office, including names cut off at 20 characters. */
export function isCountyOfficeVendor(name: string): boolean {
  const normalized = name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (normalized.includes("SHERIFF") || normalized.includes("PROPERTY APPRAIS") || normalized.includes("SUPERVISOR OF ELECT") || normalized.includes("TAX COLLECTOR")) {
    return true;
  }
  if (!normalized.startsWith("WALTON COUNTY")) return false;
  const rest = normalized.slice("WALTON COUNTY".length).trim();
  if (!rest) return true;
  return /^(SHERIF|PROPER|PROPERTY|APPRAIS|TAX|CLERK|SUPERV|ELECTION|BOARD|COMMISSION|BCC)/.test(rest);
}

export function isConstitutionalOffice(name: string): boolean {
  return isCountyOfficeVendor(name);
}

export const CONSTITUTIONAL_SQL = `(
  upper(vendor_name) LIKE '%SHERIFF%'
  OR upper(vendor_name) LIKE '%PROPERTY APPRAIS%'
  OR upper(vendor_name) LIKE '%SUPERVISOR OF ELECT%'
  OR upper(vendor_name) LIKE '%TAX COLLECTOR%'
  OR replace(replace(replace(upper(trim(vendor_name)), '.', ''), ',', ''), '  ', ' ') = 'WALTON COUNTY'
  OR (
    upper(trim(vendor_name)) LIKE 'WALTON COUNTY %'
    AND (
      upper(vendor_name) LIKE 'WALTON COUNTY SHERIF%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY PROPER%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY PROPERTY%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY APPRAIS%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY TAX%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY CLERK%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY SUPERV%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY ELECTION%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY BOARD%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY COMMISSION%'
      OR upper(vendor_name) LIKE 'WALTON COUNTY BCC%'
    )
  )
)`;

export const VENDOR_SOURCES = ["API", "APM", "GRV"] as const;
export const JOURNAL_SOURCES = ["GEN", "GCR"] as const;

export interface SpendRow {
  code: string;
  fund_code: string;
  report_name: string;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
}

export function paceDepartments(rows: SpendRow[], chartNames: Map<string, string>): SpendRow[] {
  return rows
    .filter((row) => row.rev_cents > 0 && !isTransferDepartment(row.report_name, chartNames.get(row.code) || ""))
    .sort((a, b) => b.rev_cents - a.rev_cents)
    .slice(0, 20);
}

export interface FundSlice {
  code: string;
  name: string;
  href: string;
  rev: number;
  ytd: number;
  enc: number;
  funds: number;
}

export function fundSlices(
  funds: SpendRow[],
  nameOf: (row: SpendRow) => string,
): FundSlice[] {
  const ordered = [...funds].sort((a, b) => b.ytd_cents - a.ytd_cents);
  const top = ordered.slice(0, 20);
  const rest = ordered.slice(20);
  const slices: FundSlice[] = top.map((row) => ({
    code: row.code,
    name: nameOf(row),
    href: `/funds/${row.code}`,
    rev: row.rev_cents,
    ytd: row.ytd_cents,
    enc: row.enc_cents,
    funds: 1,
  }));
  if (rest.length) {
    slices.push({
      code: "",
      name: `${rest.length} smaller funds`,
      href: "/funds",
      rev: rest.reduce((sum, row) => sum + row.rev_cents, 0),
      ytd: rest.reduce((sum, row) => sum + row.ytd_cents, 0),
      enc: rest.reduce((sum, row) => sum + row.enc_cents, 0),
      funds: rest.length,
    });
  }
  return slices;
}

export interface LookPick {
  kind: "over" | "committed";
  href: string;
  title: string;
  spent: number;
  budget: number;
  enc: number;
  land: number;
  encShare: number;
}

export function lookPicks(
  departments: SpendRow[],
  funds: SpendRow[],
  deptName: (row: SpendRow) => string,
  fundName: (row: SpendRow) => string,
  landByDept: Map<string, number>,
  elapsedPct: number,
  chartNames: Map<string, string> = new Map(),
): LookPick[] {
  const over = departments
    .filter((row) => !isTransferDepartment(row.report_name, chartNames.get(row.code) || "") && pace(row.rev_cents, row.ytd_cents, row.enc_cents, elapsedPct) === "red")
    .sort((a, b) => b.ytd_cents + b.enc_cents - b.rev_cents - (a.ytd_cents + a.enc_cents - a.rev_cents))
    .slice(0, 2)
    .map((row) => ({
      kind: "over" as const,
      href: `/departments/${row.code}`,
      title: deptName(row),
      spent: row.ytd_cents,
      budget: row.rev_cents,
      enc: row.enc_cents,
      land: landByDept.get(row.code) || 0,
      encShare: 0,
    }));
  const countyEnc = funds.reduce((sum, row) => sum + row.enc_cents, 0);
  const committed = [...funds].filter((row) => row.enc_cents > 0).sort((a, b) => b.enc_cents - a.enc_cents)[0];
  const picks: LookPick[] = [...over];
  if (committed) {
    picks.push({
      kind: "committed",
      href: `/funds/${committed.code}`,
      title: fundName(committed),
      spent: committed.ytd_cents,
      budget: committed.rev_cents,
      enc: committed.enc_cents,
      land: 0,
      encShare: countyEnc ? (committed.enc_cents / countyEnc) * 100 : 0,
    });
  }
  return picks;
}

export function paceStatus(rev: number, ytd: number, enc: number, elapsedPct: number): Pace {
  return pace(rev, ytd, enc, elapsedPct);
}

export const PACE_AXIS = 140;

export function axisPercent(value: number): number {
  return (Math.max(0, Math.min(value, PACE_AXIS)) / PACE_AXIS) * 100;
}
