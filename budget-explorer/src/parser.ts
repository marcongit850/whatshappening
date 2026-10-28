import { isoDate } from "./format";

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

/** The vendor column is also 20 characters, then the description. */
function takeVendor(value: string): { field: string; rest: string } {
  if (!value) return { field: "", rest: "" };
  const split = gapSplit(value);
  if (split && split.left.length <= 20) return { field: split.left, rest: split.right };
  if (value.length > 20 && value[20] === " ") return { field: value.slice(0, 20).trim(), rest: value.slice(21).trim() };
  if (value.length > 20) return { field: value.slice(0, 20).trim(), rest: value.slice(20).trim() };
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
