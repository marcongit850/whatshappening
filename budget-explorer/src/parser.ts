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
}

export interface ParseResult {
  dataAsOf: string;
  funds: { code: string; reportName: string }[];
  departments: { code: string; fund: string; reportName: string }[];
  accounts: ParsedAccount[];
  payments: ParsedPayment[];
  payrollBatches: ParsedPayrollBatch[];
  printed: { origCents: number; adjCents: number; revCents: number; ytdCents: number; encCents: number; availCents: number } | null;
  afterCutoffCount: number;
  reconMismatches: ParsedAccount[];
}

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

export function parseVendorRest(rest: string): VendorParts | null {
  const match = /^VND\s+(\d+)\s+(?:IN|DOC)\s+([\s\S]*)$/.exec(rest.trim());
  if (!match) return null;
  const vendorNumber = match[1];
  let tail = match[2].trim();
  let checkNumber = "";
  const check = /\s+(\d{6,9})\s*$/.exec(tail);
  if (check) {
    checkNumber = check[1];
    tail = tail.slice(0, check.index).trim();
  }
  let invoice = "";
  let body = tail;
  const split = /^(.*?)(?:\s{2,})([\s\S]+)$/.exec(tail);
  if (split) {
    invoice = split[1].trim();
    body = split[2].trim();
  } else {
    const parts = tail.split(/\s+/, 2);
    invoice = parts[0] || "";
    body = tail.slice(invoice.length).trim();
  }
  if (/^\d{6,9}$/.test(body) && !checkNumber) {
    checkNumber = body;
    body = "";
  }
  let vendorName = body;
  let description = "";
  const named = /^(.*?)(?:\s{2,})([\s\S]+)$/.exec(body);
  if (named && named[2].trim()) {
    vendorName = named[1].trim();
    description = named[2].trim();
  } else if (body.length > 20) {
    vendorName = body.slice(0, 20).trim();
    description = body.slice(20).trim();
  }
  return { vendorNumber, invoice, vendorName, description, checkNumber };
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
          });
        }
        continue;
      }
      const vendor = parseVendorRest(rest);
      const checkNumber = vendor?.checkNumber || "";
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
        vendorName: vendor?.vendorName || "",
        invoice: vendor?.invoice || "",
        checkNumber,
        description: (vendor?.description || rest).slice(0, 120),
        afterCutoff,
        dedupeKey: dedupeKey(account.fund, account.dept, account.objectCode, account.project, checkNumber, amountCents, detail[1]),
      });
    }
  }

  const payrollList = [...payroll.values()];
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
    printed,
    afterCutoffCount: payments.filter((payment) => payment.afterCutoff).length,
    reconMismatches: accountList.filter((account) => account.reconDiffCents !== 0),
  };
}

/** Every stored string from a parse. Used to prove payroll names are dropped. */
export function storedText(result: ParseResult): string {
  return JSON.stringify({
    funds: result.funds,
    departments: result.departments,
    accounts: result.accounts,
    payments: result.payments,
    payrollBatches: result.payrollBatches,
  });
}
