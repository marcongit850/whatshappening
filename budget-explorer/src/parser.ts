import { gulfName, isoDate } from "./format";
import { stripC0Controls } from "./text";

const AMT = String.raw`-?[\d,]+\.\d\d`;
const accountHeader = new RegExp(String.raw`^(\d{8})\s+(\d{6})(?:\s+(\d{5}))?\s{2,}(\S.*?)\s*$`);
const deptHeader = /^(\d{8})\s+([A-Z][A-Z0-9 /&.,'()#-]{2,})$/;
const fundHeader = /^ACCOUNTS FOR:\s+(\d{3})\s+(.*)$/;
const amountLine = new RegExp(
  String.raw`^\s+(${AMT})\s+(${AMT})\s+(${AMT})\s+(${AMT})\s+(${AMT})\s+(${AMT})\s*(?:(-?[\d.]+%|\*+))?\s*$`,
);
const detailLine = new RegExp(
  String.raw`^\s+(20\d\d/\d\d/\d{6})\s+(\d\d/\d\d/\d{4})\s+(\w{3})\s+(${AMT})\s+(.*)$`,
);

export interface ParsedAccount {
  fund: string;
  dept: string;
  objectCode: string;
  project: string;
  title: string;
  origCents: number;
  adjCents: number;
  revCents: number;
  ytdCents: number;
  encCents: number;
  availCents: number;
  paymentSumCents: number;
  reconDiffCents: number;
  isPayroll: boolean;
  lineCount: number;
}

export interface ParsedPayment {
  fund: string;
  dept: string;
  objectCode: string;
  project: string;
  journal: string;
  payDate: string;
  source: string;
  amountCents: number;
  vendorNumber: string;
  vendorName: string;
  invoice: string;
  checkNumber: string;
  description: string;
  afterCutoff: boolean;
  dedupeKey: string;
  isPersonName: boolean;
}

export interface ParsedPayrollBatch {
  fund: string;
  dept: string;
  objectCode: string;
  project: string;
  batchKey: string;
  payDate: string;
  amountCents: number;
  lineCount: number;
  /** True when a folded batch still has fewer than MIN_PAYROLL_BATCH_LINES lines. */
  belowMinimum: boolean;
}

export interface ParsedPayrollLine {
  fund: string;
  dept: string;
  objectCode: string;
  project: string;
  journal: string;
  payDate: string;
  source: string;
  amountCents: number;
  employeeName: string;
  batchKey: string;
  description: string;
  afterCutoff: boolean;
  dedupeKey: string;
}

export interface ParseResult {
  dataAsOf: string;
  funds: { code: string; reportName: string }[];
  departments: { code: string; fund: string; reportName: string }[];
  accounts: ParsedAccount[];
  payments: ParsedPayment[];
  payrollBatches: ParsedPayrollBatch[];
  payrollLines: ParsedPayrollLine[];
  printed: { origCents: number; adjCents: number; revCents: number; ytdCents: number; encCents: number; availCents: number } | null;
  afterCutoffCount: number;
  reconMismatches: ParsedAccount[];
  foldedPayrollBatches: number;
  /** Amount cells that were not plain dollar amounts and were stored as zero. */
  rejectedCellCount: number;
}

export const MAX_REPORT_LINE = 4000;
export const MIN_PAYROLL_BATCH_LINES = 3;

export function isPayrollObject(code: string): boolean {
  return /^(51[1-5]\d{3}|52[1-5]\d{3})$/.test(code);
}

export function isPayrollLine(source: string, objectCode: string, rest: string): boolean {
  if (source === "PRJ") return true;
  if (/\bWARRANT=/.test(rest) || /\bDIRECT\s+DEP/.test(rest) || /\bPAYROLL\b/.test(rest) || /\bRUN=\d+/.test(rest)) {
    return true;
  }
  return isPayrollObject(objectCode);
}

export function toCents(raw: string): number {
  return Math.round(Number(raw.replace(/,/g, "")) * 100);
}

export function dedupeKey(fund: string, dept: string, objectCode: string, project: string, checkNumber: string, amountCents: number, journal = ""): string {
  const check = checkNumber || `journal:${journal}`;
  return [fund, dept, objectCode, project, check, String(amountCents)].join("|");
}

export function dedupePayments<T extends { dedupeKey: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    if (seen.has(row.dedupeKey)) continue;
    seen.add(row.dedupeKey);
    kept.push(row);
  }
  return kept;
}

interface VendorParts {
  vendorNumber: string;
  invoice: string;
  vendorName: string;
  description: string;
  checkNumber: string;
}

function gapSplit(value: string): { left: string; right: string } | null {
  let index = -1;
  for (let i = 0; i < value.length - 1; i += 1) {
    const char = value[i];
    if ((char === " " || char === "\t") && (value[i + 1] === " " || value[i + 1] === "\t")) {
      index = i;
      break;
    }
  }
  if (index <= 0) return null;
  const left = value.slice(0, index).trim();
  const right = value.slice(index).trim();
  if (!left || !right) return null;
  return { left, right };
}

function trailingCheck(value: string): { check: string; rest: string } | null {
  let end = value.length;
  while (end > 0 && value[end - 1] === " ") end -= 1;
  let start = end;
  while (start > 0 && value[start - 1] >= "0" && value[start - 1] <= "9") start -= 1;
  const length = end - start;
  if (length < 6 || length > 9) return null;
  if (start > 0 && value[start - 1] !== " " && value[start - 1] !== "\t") return null;
  return { check: value.slice(start, end), rest: value.slice(0, start).trim() };
}

export function parseVendorRest(rest: string): VendorParts | null {
  const trimmed = rest.trim();
  if (!trimmed || trimmed.length > 1000) return null;
  const match = /^VND\s+(\d+)\s+(?:IN|DOC)\s+(\S[\s\S]*)$/.exec(trimmed);
  if (!match) return null;
  const vendorNumber = match[1];
  let tail = match[2].trim();
  let checkNumber = "";
  const check = trailingCheck(tail);
  if (check) {
    checkNumber = check.check;
    tail = check.rest;
  }
  const invoicePart = takeInvoice(tail);
  let invoice = invoicePart.field;
  let body = invoicePart.rest;
  if (/^\d{6,9}$/.test(body) && !checkNumber) {
    checkNumber = body;
    body = "";
  }
  const named = takeVendor(body);
  return { vendorNumber, invoice, vendorName: named.field, description: named.rest, checkNumber };
}

/**
 * The invoice column is 20 characters. A shorter invoice is padded, so a double space
 * ends the field. An invoice that fills all 20 characters has one space, then the vendor.
 */
function takeInvoice(value: string): { field: string; rest: string } {
  if (!value) return { field: "", rest: "" };
  const split = gapSplit(value);
  if (split && split.left.length <= 20) return { field: split.left, rest: split.right };
  if (value.length > 20 && value[20] === " ") return { field: value.slice(0, 20).trim(), rest: value.slice(21).trim() };
  const space = value.indexOf(" ");
  if (space > 0) return { field: value.slice(0, space), rest: value.slice(space).trim() };
  return { field: value.trim(), rest: "" };
}

/**
 * A padded vendor column ends at a wide gap or at column 20 when that column ends on a space.
 * A longer name with no gap is kept whole. Do not cut it mid-word at 20 characters.
 */
function takeVendor(value: string): { field: string; rest: string } {
  if (!value) return { field: "", rest: "" };
  const split = gapSplit(value);
  if (split && split.left.length <= 20) return { field: split.left, rest: split.right };
  if (value.length > 20 && value[20] === " ") return { field: value.slice(0, 20).trim(), rest: value.slice(21).trim() };
  return { field: value.trim(), rest: "" };
}

/**
 * A vendor is a person unless one of these words marks an organization.
 * Matched on whole words after the name is normalized, in any letter case.
 * All-caps multi-word business names are organizations when they contain one of these.
 */
export const ORG_NAME_TOKENS = [
  "LLC", "LLP", "PLLC", "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY",
  "LTD", "LIMITED", "PC", "PA", "LP", "PLC", "NA", "FSB", "COUNTY", "CITY", "FLORIDA",
  "STATE", "BANK", "DEPT", "DEPARTMENT", "OFFICE", "SUPPLY", "SERVICE", "SERVICES",
  "ASSOC", "ASSOCIATION", "ASSN", "GROUP", "FUND", "AUTHORITY", "DISTRICT", "SCHOOL",
  "HOSPITAL", "CLINIC", "RENTALS", "CENTER", "CENTERS", "UNIVERSITY", "UNIV",
  "FOUNDATION", "CHURCH", "TRUST", "BOARD", "COMMISSION", "AGENCY", "BUREAU",
  "GOVERNMENT", "GOVT", "UTILITY", "UTILITIES", "ELECTRIC", "INSURANCE", "SYSTEMS",
  "ENTERPRISE", "ENTERPRISES", "INDUSTRIES", "PARTNERS", "PARTNERSHIP", "HOLDINGS",
  "HOLDING", "CONSTRUCTION", "CONTRACTORS", "MANAGEMENT", "SOLUTIONS", "INTERNATIONAL",
  "NATIONAL", "FEDERAL", "MUNICIPAL", "TOWN", "COUNCIL", "SOCIETY", "UNION", "HOUSING",
  "DEVELOPMENT", "ADMINISTRATION", "DIVISION", "PROGRAM", "PROPERTIES", "REALTY",
] as const;

const ORG_NAME_TOKEN_SET = new Set<string>(ORG_NAME_TOKENS);
const INVOICE_PREFIX = /^(INV|INVOICE|PO|VOUCHER|CHK|CHECK|BILL|ACCT|ACCOUNT|ORDER)\b/;

/** Uppercase, drop periods, and turn punctuation into spaces so "L.L.C." and "Co." match. */
export function normalizePartyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/&/g, " ")
    .replace(/[,/#'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digitLetterCounts(normalized: string): { digits: number; letters: number } {
  let digits = 0;
  let letters = 0;
  for (const char of normalized) {
    if (char >= "0" && char <= "9") digits += 1;
    else if (char >= "A" && char <= "Z") letters += 1;
  }
  return { digits, letters };
}

/** Invoice numbers and other digit-heavy labels are not person names. */
export function isDigitsHeavyName(digits: number, letters: number): boolean {
  if (digits >= 6 && letters <= 4) return true;
  if (digits >= 4 && digits > letters) return true;
  return false;
}

function hasOrgToken(normalized: string): boolean {
  for (const word of normalized.split(" ")) {
    if (ORG_NAME_TOKEN_SET.has(word)) return true;
  }
  return false;
}

/**
 * Person unless the string is clearly an organization, an invoice-like label, or too short to be a name.
 * Mixed case, four-word names, JR/SR/II/III, ampersands, and a few digits still count as people.
 * The stored is_person_name flag is not the authority for hidden reads.
 */
export function looksLikePersonName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  const normalized = normalizePartyName(trimmed);
  if (normalized.length < 3) return false;
  const { digits, letters } = digitLetterCounts(normalized);
  if (isDigitsHeavyName(digits, letters)) return false;
  if (letters < 2) return false;
  if (INVOICE_PREFIX.test(normalized) && digits >= 3) return false;
  if (hasOrgToken(normalized)) return false;
  return true;
}

/**
 * Vendor-directory person check. A person is a Last, First name: a comma, letters on both
 * sides, and no business word. A business whose county report name was cut at 20 characters
 * has no comma and is not a person, even when the stored is_person_name flag says otherwise.
 * Payroll and payment search still use looksLikePersonName.
 */
export function isCommaPersonName(name: string): boolean {
  const trimmed = name.trim();
  const comma = trimmed.indexOf(",");
  if (comma <= 0) return false;
  const left = trimmed.slice(0, comma).trim();
  const right = trimmed.slice(comma + 1).trim();
  if (left.length < 2 || right.length < 2) return false;
  if (!/[A-Za-z].*[A-Za-z]/.test(left) || !/[A-Za-z].*[A-Za-z]/.test(right)) return false;
  const normalized = normalizePartyName(trimmed);
  const { digits, letters } = digitLetterCounts(normalized);
  if (isDigitsHeavyName(digits, letters)) return false;
  if (letters < 4) return false;
  if (hasOrgToken(normalized)) return false;
  return true;
}

/** Hidden vendor lists use this. Shown lists omit it so businesses and people both stay. */
export function directoryPersonSql(showNames: boolean, column = "vendor_name"): string {
  if (showNames) return "";
  return `AND NOT ${commaPersonSql(column)}`;
}

/** SQLite form of isCommaPersonName. The column name is not user input. */
export function commaPersonSql(column: string): string {
  const left = `trim(substr(${column}, 1, instr(${column}, ',') - 1))`;
  const right = `trim(substr(${column}, instr(${column}, ',') + 1))`;
  let padded = `upper(trim(${column}))`;
  padded = sqlReplace(padded, ",", " ");
  padded = sqlReplace(padded, ".", " ");
  padded = sqlReplace(padded, "-", " ");
  padded = `replace(${padded}, char(39), ' ')`;
  const bag = `(' ' || ${padded} || ' ')`;
  const org = ORG_NAME_TOKENS.map((token) => `${bag} LIKE '% ${token} %'`).join(" OR ");
  return `(instr(${column}, ',') > 0 AND length(${left}) >= 2 AND length(${right}) >= 2 AND upper(${left}) GLOB '*[A-Z]*[A-Z]*' AND upper(${right}) GLOB '*[A-Z]*[A-Z]*' AND NOT (${org}))`;
}

function sqlReplace(expr: string, from: string, to: string): string {
  return `replace(${expr}, '${from}', '${to}')`;
}

/** Same normalization as normalizePartyName, as a SQLite expression. The column name is not user input. */
function sqlNormalizedParty(column: string): string {
  let expr = `upper(trim(${column}))`;
  expr = sqlReplace(expr, ".", "");
  expr = sqlReplace(expr, "&", " ");
  expr = sqlReplace(expr, ",", " ");
  expr = sqlReplace(expr, "/", " ");
  expr = sqlReplace(expr, "#", " ");
  expr = sqlReplace(expr, "-", " ");
  expr = `replace(${expr}, char(39), ' ')`;
  return expr;
}

function sqlStripChars(expr: string, chars: string): string {
  let out = expr;
  for (const char of chars) out = `replace(${out}, '${char}', '')`;
  return out;
}

function sqlCountChars(expr: string, chars: string): string {
  return `(length(${expr}) - length(${sqlStripChars(expr, chars)}))`;
}

/**
 * SQLite expression, 1 when the column is a person under looksLikePersonName.
 * Hidden reads use this instead of the stored is_person_name flag.
 */
export function sqlIsPersonName(column: string): string {
  const norm = sqlNormalizedParty(column);
  const padded = `(' ' || ${norm} || ' ')`;
  const digits = sqlCountChars(norm, "0123456789");
  const letters = sqlCountChars(norm, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const org = ORG_NAME_TOKENS.map((token) => `${padded} LIKE '% ${token} %'`).join(" OR ");
  const invoice = ["INV", "INVOICE", "PO", "VOUCHER", "CHK", "CHECK", "BILL", "ACCT", "ACCOUNT", "ORDER"]
    .map((token) => `(${norm} = '${token}' OR ${norm} LIKE '${token} %')`)
    .join(" OR ");
  return `CASE
    WHEN ${column} IS NULL OR length(trim(${column})) < 3 THEN 0
    WHEN ${digits} >= 6 AND ${letters} <= 4 THEN 0
    WHEN ${digits} >= 4 AND ${digits} > ${letters} THEN 0
    WHEN ${letters} < 2 THEN 0
    WHEN (${invoice}) AND ${digits} >= 3 THEN 0
    WHEN ${org} THEN 0
    ELSE 1
  END`;
}

export function foldedPayrollNote(count: number): string {
  return `Folded ${count} payroll batches with fewer than 3 lines into a combined monthly total.`;
}

export function rejectedAmountNote(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `Rejected amount cells: ${n}.`;
}

/** Note stored on an import so the preview can show folded payroll and rejected amounts. */
export function importNote(foldedPayrollBatches: number, rejectedCellCount: number): string {
  const parts: string[] = [];
  if (foldedPayrollBatches > 0) parts.push(foldedPayrollNote(foldedPayrollBatches));
  parts.push(rejectedAmountNote(rejectedCellCount));
  return parts.join(" ");
}

export function rejectedCellsInNote(note: string | null | undefined): number | null {
  const match = /Rejected amount cells: (\d+)\./.exec(note || "");
  if (!match) return null;
  return Number(match[1]);
}

export function foldedNoteText(note: string | null | undefined): string {
  if (!note || !note.startsWith("Folded ")) return "";
  return note.replace(/\s*Rejected amount cells: \d+\.$/, "").trim();
}

export function batchIdentity(batch: { fund: string; dept: string; objectCode: string; project: string; batchKey: string; payDate: string }): string {
  return [batch.fund, batch.dept, batch.objectCode, batch.project, batch.batchKey, batch.payDate].join("|");
}

const PAY_TYPE = /^(REGULAR|SALARY|HOURLY|OVERTIME|BENEFIT|WAGES|WAGE|SUPPLEMENT)\s+/i;

/** Employee name from a payroll detail line. Control tokens are not kept. */
export function payrollEmployeeName(rest: string): string {
  const text = rest
    .replace(/\bWARRANT=[A-Za-z0-9]+/gi, " ")
    .replace(/\bRUN=\d+/gi, " ")
    .replace(/\bREF\s+\S+/gi, " ")
    .replace(/\bDIRECT\s+DEP(?:OSIT)?\b/gi, " ")
    .replace(/\bPAYROLL\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(PAY_TYPE, "")
    .trim();
  if (/^(REGULAR|SALARY|HOURLY|OVERTIME|BENEFIT|WAGES|WAGE|SUPPLEMENT)$/i.test(text)) return "";
  return text.slice(0, 80);
}

export interface FoldedPayroll {
  batches: ParsedPayrollBatch[];
  foldedCount: number;
  /** Original batch identity to the stored batch key. Line dollars stay on payroll lines. */
  redirect: Map<string, { batchKey: string; payDate: string }>;
}

/**
 * Batches under the minimum are folded into a monthly total.
 * A folded batch that is still under the minimum is flagged belowMinimum and kept,
 * so its dollars are stored on a row the reader returns instead of a silent gap.
 */
export function foldPayrollBatches(batches: ParsedPayrollBatch[]): FoldedPayroll {
  const redirect = new Map<string, { batchKey: string; payDate: string }>();
  const kept: ParsedPayrollBatch[] = [];
  const folded = new Map<string, ParsedPayrollBatch & { members: string[] }>();
  let foldedCount = 0;
  for (const batch of batches) {
    const id = batchIdentity(batch);
    if (batch.lineCount >= MIN_PAYROLL_BATCH_LINES) {
      kept.push({ ...batch, belowMinimum: false });
      redirect.set(id, { batchKey: batch.batchKey, payDate: batch.payDate });
      continue;
    }
    foldedCount += 1;
    const month = batch.payDate.slice(0, 7);
    const payDate = month.length === 7 ? `${month}-01` : batch.payDate;
    const key = [batch.fund, batch.dept, batch.objectCode, batch.project, payDate].join("|");
    const existing = folded.get(key);
    if (existing) {
      existing.amountCents += batch.amountCents;
      existing.lineCount += batch.lineCount;
      existing.members.push(id);
    } else {
      folded.set(key, {
        fund: batch.fund,
        dept: batch.dept,
        objectCode: batch.objectCode,
        project: batch.project,
        batchKey: "combined",
        payDate,
        amountCents: batch.amountCents,
        lineCount: batch.lineCount,
        belowMinimum: true,
        members: [id],
      });
    }
  }
  const ready = [...kept];
  for (const batch of folded.values()) {
    const belowMinimum = batch.lineCount < MIN_PAYROLL_BATCH_LINES;
    const stored: ParsedPayrollBatch = {
      fund: batch.fund,
      dept: batch.dept,
      objectCode: batch.objectCode,
      project: batch.project,
      batchKey: "combined",
      payDate: batch.payDate,
      amountCents: batch.amountCents,
      lineCount: batch.lineCount,
      belowMinimum,
    };
    ready.push(stored);
    for (const member of batch.members) redirect.set(member, { batchKey: stored.batchKey, payDate: stored.payDate });
  }
  return { batches: ready, foldedCount, redirect };
}

function batchKeyFrom(rest: string, journal: string): string {
  const warrant = /\bWARRANT=([A-Za-z0-9]+)/.exec(rest);
  if (warrant) return warrant[1];
  const ref = /\bREF\s+([A-Za-z0-9-]+)/.exec(rest);
  if (ref && !/^(TO|NOT|FOR)$/i.test(ref[1])) return ref[1];
  return journal || "batch";
}

export function parseReport(text: string): ParseResult {
  const cleaned = text.replace(/\f/g, "");
  const lines = cleaned.split(/\r?\n/);
  const asOfMatch = /Report generated:\s+(\d{2}\/\d{2}\/\d{4})/.exec(cleaned);
  const dataAsOf = isoDate(asOfMatch?.[1] || "") || "";
  const cutoff = dataAsOf || "9999-12-31";

  const accounts = new Map<string, ParsedAccount>();
  const order: string[] = [];
  const funds = new Map<string, string>();
  const departments = new Map<string, { fund: string; reportName: string }>();
  const payments: ParsedPayment[] = [];
  const payroll = new Map<string, ParsedPayrollBatch>();
  const payrollLines: ParsedPayrollLine[] = [];

  let fund = "";
  let current: string | null = null;
  let pending = false;
  let expectGrand = false;
  let printed: ParseResult["printed"] = null;
  const budgetSet = new Set<string>();

  const rememberDept = (code: string, name: string) => {
    if (!departments.has(code)) departments.set(code, { fund, reportName: name });
  };

  for (const raw of lines) {
    if (raw.length > MAX_REPORT_LINE) continue;
    const line = raw.replace(/\f/g, "");
    if (!line.trim()) continue;
    const trimmed = line.trim();
    if (
      trimmed.startsWith("Report generated") ||
      trimmed.startsWith("User:") ||
      trimmed.startsWith("Program ID") ||
      trimmed.startsWith("** END")
    ) {
      continue;
    }

    const fundMatch = fundHeader.exec(trimmed);
    if (fundMatch) {
      fund = fundMatch[1];
      if (!funds.has(fund)) funds.set(fund, fundMatch[2].trim());
      continue;
    }

    if (trimmed.includes("GRAND TOTAL")) {
      pending = false;
      expectGrand = true;
      current = null;
      continue;
    }
    if (/^\s*TOTAL\b/.test(trimmed) || trimmed.startsWith("TOTAL ")) {
      pending = false;
      continue;
    }

    const header = accountHeader.exec(trimmed);
    if (header) {
      const key = `${header[1]}|${header[2]}|${header[3] || ""}`;
      if (!accounts.has(key)) {
        accounts.set(key, {
          fund,
          dept: header[1],
          objectCode: header[2],
          project: header[3] || "",
          title: header[4].trim(),
          origCents: 0,
          adjCents: 0,
          revCents: 0,
          ytdCents: 0,
          encCents: 0,
          availCents: 0,
          paymentSumCents: 0,
          reconDiffCents: 0,
          isPayroll: isPayrollObject(header[2]),
          lineCount: 0,
        });
        order.push(key);
      }
      current = key;
      pending = !budgetSet.has(key);
      continue;
    }

    const dept = deptHeader.exec(trimmed);
    if (dept) {
      rememberDept(dept[1], dept[2].trim());
      continue;
    }

    const amounts = amountLine.exec(line);
    if (amounts && expectGrand) {
      printed = {
        origCents: toCents(amounts[1]),
        adjCents: toCents(amounts[2]),
        revCents: toCents(amounts[3]),
        ytdCents: toCents(amounts[4]),
        encCents: toCents(amounts[5]),
        availCents: toCents(amounts[6]),
      };
      expectGrand = false;
      continue;
    }
    if (amounts && pending && current) {
      const account = accounts.get(current)!;
      account.origCents = toCents(amounts[1]);
      account.adjCents = toCents(amounts[2]);
      account.revCents = toCents(amounts[3]);
      account.ytdCents = toCents(amounts[4]);
      account.encCents = toCents(amounts[5]);
      account.availCents = toCents(amounts[6]);
      budgetSet.add(current);
      pending = false;
      continue;
    }

    const detail = detailLine.exec(line);
    if (detail && current) {
      pending = false;
      const account = accounts.get(current)!;
      const rest = detail[5];
      const source = detail[3];
      const payDate = isoDate(detail[2]);
      const amountCents = toCents(detail[4]);
      const afterCutoff = Boolean(dataAsOf) && payDate > cutoff;
      account.lineCount += 1;
      if (isPayrollLine(source, account.objectCode, rest)) {
        account.isPayroll = true;
        const batchKey = batchKeyFrom(rest, detail[1]);
        const employeeName = payrollEmployeeName(rest);
        const pkey = [account.fund, account.dept, account.objectCode, account.project, batchKey, payDate].join("|");
        const existing = payroll.get(pkey);
        if (existing) {
          existing.amountCents += amountCents;
          existing.lineCount += 1;
        } else {
          payroll.set(pkey, {
            fund: account.fund,
            dept: account.dept,
            objectCode: account.objectCode,
            project: account.project,
            batchKey,
            payDate,
            amountCents,
            lineCount: 1,
            belowMinimum: false,
          });
        }
        payrollLines.push({
          fund: account.fund,
          dept: account.dept,
          objectCode: account.objectCode,
          project: account.project,
          journal: detail[1],
          payDate,
          source,
          amountCents,
          employeeName,
          batchKey,
          description: "",
          afterCutoff,
          dedupeKey: dedupeKey(account.fund, account.dept, account.objectCode, account.project, "", amountCents, detail[1]),
        });
        continue;
      }
      const vendor = parseVendorRest(rest);
      const checkNumber = vendor?.checkNumber || "";
      const vendorName = vendor?.vendorName || "";
      payments.push({
        fund: account.fund,
        dept: account.dept,
        objectCode: account.objectCode,
        project: account.project,
        journal: detail[1],
        payDate,
        source,
        amountCents,
        vendorNumber: vendor?.vendorNumber || "",
        vendorName,
        invoice: vendor?.invoice || "",
        checkNumber,
        description: vendor ? vendor.description.slice(0, 120) : "",
        afterCutoff,
        dedupeKey: dedupeKey(account.fund, account.dept, account.objectCode, account.project, checkNumber, amountCents, detail[1]),
        isPersonName: looksLikePersonName(vendorName),
      });
    }
  }

  const folded = foldPayrollBatches([...payroll.values()]);
  const payrollList = folded.batches;
  for (const line of payrollLines) {
    const target = folded.redirect.get(batchIdentity(line));
    if (target) line.batchKey = target.batchKey;
  }
  const sums = new Map<string, number>();
  for (const payment of payments) {
    const key = `${payment.dept}|${payment.objectCode}|${payment.project}`;
    sums.set(key, (sums.get(key) || 0) + payment.amountCents);
  }
  for (const batch of payrollList) {
    const key = `${batch.dept}|${batch.objectCode}|${batch.project}`;
    sums.set(key, (sums.get(key) || 0) + batch.amountCents);
  }

  const accountList = order.map((key) => {
    const account = accounts.get(key)!;
    const sumKey = `${account.dept}|${account.objectCode}|${account.project}`;
    account.paymentSumCents = sums.get(sumKey) || 0;
    account.reconDiffCents = account.paymentSumCents - account.ytdCents;
    if (!departments.has(account.dept)) departments.set(account.dept, { fund: account.fund, reportName: "" });
    return account;
  });

  return {
    dataAsOf,
    funds: [...funds.entries()].map(([code, reportName]) => ({ code, reportName })),
    departments: [...departments.entries()].map(([code, value]) => ({ code, fund: value.fund, reportName: value.reportName })),
    accounts: accountList,
    payments,
    payrollBatches: payrollList,
    payrollLines,
    printed,
    afterCutoffCount: payments.filter((payment) => payment.afterCutoff).length,
    reconMismatches: accountList.filter((account) => account.reconDiffCents !== 0),
    foldedPayrollBatches: folded.foldedCount,
    rejectedCellCount: 0,
  };
}

/** Sources stored as vendor payments. Same set as VENDOR_SOURCES in overview.ts. */
const ACCOUNT_DETAIL_PAYMENT_SOURCES = new Set(["API", "APM", "GRV"]);

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function columnIndex(headers: string[], names: string[]): number {
  const normalized = headers.map(normHeader);
  for (const name of names) {
    const want = normHeader(name);
    const exact = normalized.indexOf(want);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const want = normHeader(name);
    const partial = normalized.findIndex((header) => header.includes(want));
    if (partial >= 0) return partial;
  }
  return -1;
}

/** Text dates, or an Excel serial date from a later monthly export. */
function detailDate(raw: string): string {
  const iso = isoDate(raw);
  if (iso) return iso;
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) return "";
  const serial = Number(raw);
  if (serial <= 20000 || serial >= 80000) return "";
  const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const date = new Date(utc);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** $10 billion. A larger absolute amount is rejected. */
export const MAX_DETAIL_CENTS = 1_000_000_000_000;
/** Excel residue such as 292.52999999999997 is still the cent it rounds to. A real third digit is not. */
const CENT_DUST = 1e-8;
const PLAIN_AMOUNT = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/;

/**
 * Parentheses are negative. Accept a plain decimal with an optional sign, thousands commas,
 * and at most two decimal places. Longer fractions are accepted only when they are binary
 * dust around a cent. Scientific notation and anything over $10 billion are rejected.
 */
export function parseDetailCents(raw: string | undefined): { cents: number; ok: boolean } {
  const cleaned = (raw || "").trim();
  if (!cleaned) return { cents: 0, ok: true };
  let negative = false;
  let body = cleaned;
  if (body.startsWith("(") && body.endsWith(")") && body.length > 2) {
    negative = true;
    body = body.slice(1, -1).trim();
  } else if (body.startsWith("+") && body.length > 1) {
    body = body.slice(1).trim();
  } else if (body.startsWith("-") && body.length > 1) {
    negative = true;
    body = body.slice(1).trim();
  }
  if (!body || /[+\-(]/.test(body[0])) return { cents: 0, ok: false };
  const match = PLAIN_AMOUNT.exec(body);
  if (!match) return { cents: 0, ok: false };
  const fraction = match[1] || "";
  const plain = body.replace(/,/g, "");
  let cents: number;
  if (fraction.length <= 2) {
    const whole = plain.split(".")[0];
    const wholeCents = Number(whole) * 100;
    if (!Number.isSafeInteger(wholeCents)) return { cents: 0, ok: false };
    const fracCents = fraction.length === 0 ? 0 : fraction.length === 1 ? Number(fraction) * 10 : Number(fraction);
    cents = wholeCents + fracCents;
  } else {
    const value = Number(plain);
    if (!Number.isFinite(value)) return { cents: 0, ok: false };
    const signed = negative ? -value : value;
    cents = Math.round(signed * 100);
    if (!Number.isSafeInteger(cents)) return { cents: 0, ok: false };
    if (Math.abs(signed - cents / 100) > CENT_DUST) return { cents: 0, ok: false };
    if (cents < 0) cents = -cents;
  }
  if (!Number.isSafeInteger(cents) || cents > MAX_DETAIL_CENTS) return { cents: 0, ok: false };
  if (negative) cents = -cents;
  if (cents === 0) cents = 0;
  return { cents, ok: true };
}

function isTotalDescription(description: string): boolean {
  const text = description.trim().toLowerCase();
  return text === "revenue total" || text === "expense total" || text === "grand total" || text.startsWith("total ");
}

function totalLabel(description: string, code: string): string {
  const stripped = description.trim().replace(/^total\s+/i, "").trim();
  if (code && stripped.toUpperCase().startsWith(code.toUpperCase())) return stripped.slice(code.length).trim();
  return stripped;
}

/** True when the first worksheet is the Clerk's ACCOUNT DETAIL export. */
export function isAccountDetail(rows: string[][]): boolean {
  const header = rows.find((row) => row.some((cell) => cell.trim()));
  if (!header) return false;
  const normalized = header.map(normHeader);
  return normalized.includes("fund") && normalized.includes("org") && normalized.includes("obj") && normalized.some((cell) => cell.includes("original"));
}

/** Calendar date of a run, as YYYY-MM-DD in UTC. */
export function importerRunDate(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Clerk ACCOUNT DETAIL workbook. One account row, then transaction lines.
 * Total rows, and revenue accounts (object codes starting with 3), are not added into the expense budget.
 * The as of date is the latest transaction date on or before the day the importer runs.
 * Later dates stay in the county's year to date and encumbrance columns, and they do not set the as of date.
 */
export function parseAccountDetail(rows: string[][], opts: { today?: string } = {}): ParseResult {
  if (!isAccountDetail(rows)) throw new Error("This workbook is not an account detail report.");
  const today = isoDate(opts.today || "") || importerRunDate();
  const headerAt = rows.findIndex((row) => row.some((cell) => normHeader(cell) === "fund"));
  const header = rows[headerAt] || [];
  const col = {
    fund: columnIndex(header, ["fund"]),
    org: columnIndex(header, ["org"]),
    obj: columnIndex(header, ["obj"]),
    project: columnIndex(header, ["project"]),
    description: columnIndex(header, ["account description", "description"]),
    orig: columnIndex(header, ["original approp", "original"]),
    adj: columnIndex(header, ["tranfrs/adjsmts", "adjustments"]),
    rev: columnIndex(header, ["revised budget", "revised"]),
    ytd: columnIndex(header, ["ytd actual", "ytd"]),
    enc: columnIndex(header, ["encumbrances"]),
    avail: columnIndex(header, ["available budget", "available"]),
    journal: columnIndex(header, ["yr/per/jnl", "journal"]),
    date: columnIndex(header, ["eff date", "date"]),
    source: columnIndex(header, ["src", "source"]),
    amount: columnIndex(header, ["amount"]),
    vendorNumber: columnIndex(header, ["vendor/ref 1", "vendor"]),
    invoice: columnIndex(header, ["invoice #", "invoice"]),
    check: columnIndex(header, ["check #", "check"]),
    vendorName: columnIndex(header, ["vendor name"]),
    comment: columnIndex(header, ["comment"]),
    item: columnIndex(header, ["item description"]),
  };
  const cell = (row: string[], index: number) => (index >= 0 ? stripC0Controls(row[index] || "").trim() : "");
  const rejected = { count: 0 };
  const money = (raw: string | undefined) => {
    const parsed = parseDetailCents(raw);
    if (!parsed.ok) {
      rejected.count += 1;
      return 0;
    }
    return parsed.cents;
  };

  const accounts: ParsedAccount[] = [];
  const funds = new Map<string, string>();
  const departments = new Map<string, { fund: string; reportName: string }>();
  const payments: ParsedPayment[] = [];
  const payroll = new Map<string, ParsedPayrollBatch>();
  const payrollLines: ParsedPayrollLine[] = [];
  let printed: ParseResult["printed"] = null;
  let current: ParsedAccount | null = null;
  let skipping = false;
  let asOf = "";

  const noteDate = (raw: string) => {
    const iso = detailDate(raw);
    if (iso && iso <= today && iso > asOf) asOf = iso;
  };

  const rememberDept = (code: string, fundCode: string, name: string) => {
    if (!code) return;
    const existing = departments.get(code);
    const reportName = gulfName(name || existing?.reportName || "");
    departments.set(code, { fund: fundCode || existing?.fund || code.slice(0, 3), reportName });
  };

  const addTransaction = (row: string[], account: ParsedAccount) => {
    const journal = cell(row, col.journal);
    const payDate = detailDate(cell(row, col.date));
    const source = cell(row, col.source).toUpperCase();
    const amountRaw = cell(row, col.amount);
    if (!journal && !payDate && !source && !amountRaw) return;
    if (payDate) noteDate(cell(row, col.date));
    const amountCents = money(amountRaw);
    const comment = cell(row, col.comment);
    account.lineCount += 1;
    const payrollLine = source === "PRJ" || /\bWARRANT=/.test(comment);
    if (payrollLine) {
      account.isPayroll = true;
      const batchKey = batchKeyFrom(comment, journal);
      const employeeName = payrollEmployeeName(comment);
      const pkey = [account.fund, account.dept, account.objectCode, account.project, batchKey, payDate].join("|");
      const existing = payroll.get(pkey);
      if (existing) {
        existing.amountCents += amountCents;
        existing.lineCount += 1;
      } else {
        payroll.set(pkey, {
          fund: account.fund,
          dept: account.dept,
          objectCode: account.objectCode,
          project: account.project,
          batchKey,
          payDate,
          amountCents,
          lineCount: 1,
          belowMinimum: false,
        });
      }
      payrollLines.push({
        fund: account.fund,
        dept: account.dept,
        objectCode: account.objectCode,
        project: account.project,
        journal,
        payDate,
        source,
        amountCents,
        employeeName,
        batchKey,
        description: "",
        afterCutoff: false,
        dedupeKey: [account.fund, account.dept, account.objectCode, account.project, journal, payDate, String(amountCents)].join("|"),
      });
      return;
    }
    if (!ACCOUNT_DETAIL_PAYMENT_SOURCES.has(source)) return;
    const vendorName = cell(row, col.vendorName);
    const vendorNumber = /^\d+$/.test(cell(row, col.vendorNumber)) ? cell(row, col.vendorNumber) : "";
    const checkRaw = cell(row, col.check);
    const checkNumber = /^0+$/.test(checkRaw) ? "" : checkRaw;
    const description = (comment || cell(row, col.item)).slice(0, 120);
    payments.push({
      fund: account.fund,
      dept: account.dept,
      objectCode: account.objectCode,
      project: account.project,
      journal,
      payDate,
      source,
      amountCents,
      vendorNumber,
      vendorName,
      invoice: cell(row, col.invoice).slice(0, 40),
      checkNumber,
      description,
      afterCutoff: false,
      dedupeKey: [account.fund, account.dept, account.objectCode, account.project, journal, payDate, String(amountCents), vendorNumber, checkNumber].join("|"),
      isPersonName: looksLikePersonName(vendorName),
    });
  };

  for (const row of rows.slice(headerAt + 1)) {
    const fundCode = cell(row, col.fund);
    const org = cell(row, col.org);
    const objectCode = cell(row, col.obj);
    const description = cell(row, col.description);
    const dated = cell(row, col.date);
    if (dated) noteDate(dated);

    if (isTotalDescription(description) && !objectCode) {
      const kind = description.trim().toLowerCase();
      if (kind === "expense total") {
        printed = {
          origCents: money(cell(row, col.orig)),
          adjCents: money(cell(row, col.adj)),
          revCents: money(cell(row, col.rev)),
          ytdCents: money(cell(row, col.ytd)),
          encCents: money(cell(row, col.enc)),
          availCents: money(cell(row, col.avail)),
        };
      } else if (fundCode && !org) {
        const name = totalLabel(description, fundCode);
        if (!funds.has(fundCode) || name) funds.set(fundCode, gulfName(name));
      } else if (org) {
        rememberDept(org, fundCode, totalLabel(description, org));
      }
      current = null;
      skipping = true;
      continue;
    }

    if (objectCode) {
      const fund = fundCode || org.slice(0, 3);
      if (fund && !funds.has(fund)) funds.set(fund, "");
      if (objectCode.startsWith("3")) {
        current = null;
        skipping = true;
        continue;
      }
      const account: ParsedAccount = {
        fund,
        dept: org,
        objectCode,
        project: cell(row, col.project),
        title: gulfName(description),
        origCents: money(cell(row, col.orig)),
        adjCents: money(cell(row, col.adj)),
        revCents: money(cell(row, col.rev)),
        ytdCents: money(cell(row, col.ytd)),
        encCents: money(cell(row, col.enc)),
        availCents: money(cell(row, col.avail)),
        paymentSumCents: 0,
        reconDiffCents: 0,
        isPayroll: isPayrollObject(objectCode),
        lineCount: 0,
      };
      accounts.push(account);
      rememberDept(org, fund, "");
      current = account;
      skipping = false;
      addTransaction(row, account);
      continue;
    }

    if (!skipping && current) addTransaction(row, current);
  }

  const cutoff = asOf || today;
  for (const payment of payments) payment.afterCutoff = Boolean(payment.payDate) && payment.payDate > cutoff;
  for (const line of payrollLines) line.afterCutoff = Boolean(line.payDate) && line.payDate > cutoff;

  const folded = foldPayrollBatches([...payroll.values()]);
  for (const line of payrollLines) {
    const target = folded.redirect.get(batchIdentity(line));
    if (target) line.batchKey = target.batchKey;
  }
  const keptPayments = dedupePayments(payments);
  const sums = new Map<string, number>();
  for (const payment of keptPayments) {
    if (payment.afterCutoff) continue;
    const key = `${payment.dept}|${payment.objectCode}|${payment.project}`;
    sums.set(key, (sums.get(key) || 0) + payment.amountCents);
  }
  for (const batch of folded.batches) {
    const key = `${batch.dept}|${batch.objectCode}|${batch.project}`;
    sums.set(key, (sums.get(key) || 0) + batch.amountCents);
  }
  for (const account of accounts) {
    const sumKey = `${account.dept}|${account.objectCode}|${account.project}`;
    account.paymentSumCents = sums.get(sumKey) || 0;
    account.reconDiffCents = account.paymentSumCents - account.ytdCents;
  }

  return {
    dataAsOf: asOf,
    funds: [...funds.entries()].map(([code, reportName]) => ({ code, reportName })),
    departments: [...departments.entries()].map(([code, value]) => ({ code, fund: value.fund, reportName: value.reportName })),
    accounts,
    payments: keptPayments,
    payrollBatches: folded.batches,
    payrollLines,
    printed,
    afterCutoffCount: keptPayments.filter((payment) => payment.afterCutoff).length,
    reconMismatches: accounts.filter((account) => account.reconDiffCents !== 0),
    foldedPayrollBatches: folded.foldedCount,
    rejectedCellCount: rejected.count,
  };
}

/** Every stored string from a parse, including payroll names and amounts. */
export function storedText(result: ParseResult): string {
  return JSON.stringify({
    funds: result.funds,
    departments: result.departments,
    accounts: result.accounts,
    payments: result.payments,
    payrollBatches: result.payrollBatches,
    payrollLines: result.payrollLines,
  });
}
