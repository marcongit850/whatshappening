import { TRANSFER_OBJECT } from "./budget";
import { looksLikePersonName } from "./parser";

const STRIP_CHARS = ["'", "’", "`", "´", ",", ".", "-", "&", "#", "/", "(", ")", ":", ";", "\"", "!", "+", "@", "*"];
const APOSTROPHES = ["'", "’", "`", "´"];

const PAYROLL_BATCH_LABEL = "Payroll (batch total)";
const NAME_WITHHELD = "Name withheld";

export function vendorCompact(value: string): string {
  let text = value.toLowerCase();
  for (const char of STRIP_CHARS) text = text.split(char).join("");
  return text.replace(/\s+/g, "");
}

export function vendorCompactSql(column = "vendor_name"): string {
  let expr = `LOWER(${column})`;
  for (const char of STRIP_CHARS) {
    expr = `REPLACE(${expr}, '${char.replace(/'/g, "''")}', '')`;
  }
  return `REPLACE(${expr}, ' ', '')`;
}

export function vendorWords(value: string): string[] {
  let text = value.toLowerCase();
  for (const char of APOSTROPHES) text = text.split(char).join("");
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

export function cleanVendorRaw(name: string): string {
  let text = name.trim().replace(/[\s,.;:]+$/g, "");
  if (name.trim().length >= 20) {
    const parts = text.split(/\s+/);
    if (parts.length > 1 && parts[parts.length - 1].length === 1) parts.pop();
    text = parts.join(" ");
  }
  return text;
}

const ALWAYS_UPPER = new Set(["llc", "inc", "llp", "pllc", "pa"]);
const COMPLETE_SHORT = new Set(["co", "pa", "lp", "pc", "of"]);
const COMPLETE_WORD = new Set([
  "centers", "center", "office", "county", "fund", "company", "services", "service", "group", "bank",
  "supply", "district", "inc", "llc", "llp", "pllc", "pa", "beach", "fire", "school", "city", "state",
  "park", "parks", "water", "waste", "health", "court", "store", "stores", "market", "rentals", "rental",
]);

export function titleCaseVendor(name: string): string {
  const cleaned = cleanVendorRaw(name);
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ALWAYS_UPPER.has(lower)) return lower.toUpperCase();
      return lower.replace(/[a-z0-9]+/gi, (part, offset) => {
        if (part.length === 1 && offset > 0 && APOSTROPHES.includes(lower[offset - 1])) return part.toLowerCase();
        if (part.length === 1) return part.toUpperCase();
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      });
    })
    .join(" ");
}

export interface VendorLabel {
  text: string;
  shortened: boolean;
}

function longerName(raw: string, names: string[]): string | null {
  const short = raw.trim().toUpperCase().replace(/[\s,.;:]+$/g, "");
  if (short.length < 18) return null;
  const parts = short.split(/\s+/);
  const last = parts[parts.length - 1] || "";
  const stem = parts.slice(0, -1).join(" ");
  let best = "";
  for (const name of names) {
    const candidate = name.trim().toUpperCase().replace(/[\s,.;:]+$/g, "");
    if (candidate.length <= short.length || candidate.length > 80) continue;
    const continuesWord = stem.length >= 3 && last.length >= 4 && candidate.startsWith(`${stem} `) && candidate.slice(stem.length).trim().split(/\s+/)[0].startsWith(last);
    if (!candidate.startsWith(short) && !continuesWord) continue;
    if (!best || candidate.length < best.length) best = name.trim();
  }
  return best || null;
}

function trimPartial(raw: string): { text: string; shortened: boolean } {
  const trimmed = raw.trim().replace(/[\s,.;:]+$/g, "");
  if (trimmed.length !== 20) return { text: trimmed, shortened: false };
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1] || "";
  const lastLower = last.toLowerCase();
  if (lastLower === "ll" || lastLower === "l") {
    parts[parts.length - 1] = "LLC";
    return { text: parts.join(" "), shortened: true };
  }
  const dropShort = last.length <= 2 && !COMPLETE_SHORT.has(lastLower);
  const dropLong = last.length >= 5 && !COMPLETE_WORD.has(lastLower) && !ALWAYS_UPPER.has(lastLower);
  if ((dropShort || dropLong) && parts.length > 1) {
    parts.pop();
    return { text: parts.join(" "), shortened: true };
  }
  return { text: trimmed, shortened: false };
}

export function vendorKey(value: string): string {
  return vendorWords(cleanVendorRaw(value)).join(" ");
}

export function buildVendorIndex(names: string[]): (raw: string) => VendorLabel {
  const pool = names.map((name) => name.trim()).filter(Boolean);
  const cache = new Map<string, VendorLabel>();
  return (raw: string) => {
    if (!raw) return { text: "", shortened: false };
    if (raw === PAYROLL_BATCH_LABEL || raw === NAME_WITHHELD) return { text: raw, shortened: false };
    const key = vendorKey(raw);
    const cached = cache.get(key);
    if (cached) return cached;
    const longer = longerName(raw, pool);
    if (longer) {
      const label = { text: titleCaseVendor(longer.replace(/[\s,.;:]+$/g, "")), shortened: false };
      cache.set(key, label);
      return label;
    }
    if (looksLikePersonName(raw) && raw.trim().length !== 20) {
      const label = { text: raw, shortened: false };
      cache.set(key, label);
      return label;
    }
    const chosen = trimPartial(raw);
    const label = { text: titleCaseVendor(chosen.text), shortened: chosen.shortened };
    cache.set(key, label);
    return label;
  };
}

export function withDisplayNames<T extends { vendor_name: string | null }>(rows: T[], display: (raw: string) => VendorLabel): T[] {
  return rows.map((row) => ({ ...row, vendor_name: row.vendor_name ? display(row.vendor_name).text : row.vendor_name }));
}

const VENDOR_STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "which", "how", "much", "did", "does",
  "county", "pay", "paid", "payment", "payments", "show", "tell", "about", "were", "was", "are", "have",
  "has", "its", "into", "over", "under", "than", "then", "them", "they", "their", "budget", "spent",
  "spend", "spending", "year", "total", "totals", "please", "could", "would", "should", "where", "when",
  "who", "so", "far", "vendor", "vendors", "many", "any", "our", "you", "your", "can", "just", "through",
  "date", "much", "get", "got", "on",
]);

/** A payee phrase from a question, or null when the question is not about a vendor payment. */
export function vendorPhrase(question: string): string | null {
  if (/\b(payroll|salary|salaries|wage|wages|employee|employees)\b/i.test(question)) return null;
  if (!/\b(pay|paid|spend|spent|spending|vendor|vendors)\b/i.test(question)) return null;
  const words = question.match(/[A-Za-z0-9][A-Za-z0-9&.'’-]+/g) || [];
  const kept = words.filter((word) => {
    const lower = word.toLowerCase();
    if (VENDOR_STOP.has(lower)) return false;
    if (/^\d+$/.test(lower)) return false;
    return true;
  });
  if (!kept.length) return null;
  return kept.join(" ");
}

export function vendorNameMatches(stored: string, query: string): boolean {
  const storedWords = vendorWords(stored);
  const queryWords = vendorWords(query).filter((word) => word.length >= 2);
  if (!storedWords.length || !queryWords.length) return false;
  if (queryWords.length === 1) {
    const word = queryWords[0];
    if (word.length < 3) return false;
    const first = storedWords[0];
    if (first === word) return true;
    if (word.startsWith(first) && first.length >= 5 && word.length - first.length <= 2) return true;
    return false;
  }
  if (storedWords.length < queryWords.length) return false;
  for (let i = 0; i < queryWords.length; i += 1) {
    const left = storedWords[i];
    const right = queryWords[i];
    if (left === right) continue;
    const last = i === queryWords.length - 1;
    if (last && right.startsWith(left) && left.length >= 4 && right.length - left.length <= 2) continue;
    if (last && left.startsWith(right) && right.length >= 4) continue;
    return false;
  }
  return true;
}

export interface VendorMatchTotals {
  cents: number;
  lines: number;
  checks: number;
  names: string[];
  transferOnly: boolean;
}

export function paymentRef(checkNumber: string | null, journal: string | null, invoice: string | null): string {
  const check = (checkNumber || "").trim();
  if (check) return `check:${check}`;
  const journalId = (journal || "").trim();
  if (journalId) return `journal:${journalId}`;
  const invoiceId = (invoice || "").trim();
  if (invoiceId) return `invoice:${invoiceId}`;
  return "";
}

export function vendorSpendSql(transfersOnly = false): string {
  const objectSql = transfersOnly ? `object_code = '${TRANSFER_OBJECT}'` : `object_code != '${TRANSFER_OBJECT}'`;
  return `
SELECT vendor_name,
  COALESCE(SUM(amount_cents), 0) AS cents,
  COUNT(*) AS lines,
  GROUP_CONCAT(DISTINCT CASE
    WHEN trim(COALESCE(check_number, '')) != '' THEN 'check:' || trim(check_number)
    WHEN trim(COALESCE(journal, '')) != '' THEN 'journal:' || trim(journal)
    WHEN trim(COALESCE(invoice, '')) != '' THEN 'invoice:' || trim(invoice)
    ELSE NULL
  END) AS pay_refs
FROM payments
WHERE import_id = ?
  AND after_cutoff = 0
  AND ${objectSql}
  AND vendor_name != ''
  AND (? = 1 OR is_person_name = 0)
  AND ${vendorCompactSql("vendor_name")} LIKE ?
GROUP BY vendor_name
`;
}

export function sumVendorMatches(
  rows: { vendor_name: string; cents: number; lines: number; pay_refs?: string | null; checks?: number }[],
  phrase: string,
): VendorMatchTotals | null {
  const matched = rows.filter((row) => vendorNameMatches(row.vendor_name, phrase));
  if (!matched.length) return null;
  const refs = new Set<string>();
  for (const row of matched) {
    for (const ref of String(row.pay_refs || "").split(",")) {
      if (ref) refs.add(ref);
    }
  }
  const checks = refs.size || matched.reduce((sum, row) => sum + Number(row.checks || 0), 0);
  return {
    cents: matched.reduce((sum, row) => sum + Number(row.cents), 0),
    lines: matched.reduce((sum, row) => sum + Number(row.lines), 0),
    checks,
    names: matched.map((row) => row.vendor_name),
    transferOnly: false,
  };
}
