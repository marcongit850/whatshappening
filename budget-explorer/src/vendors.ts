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

/** Trim surrounding space and trailing punctuation. Words the report stored are kept. */
export function cleanVendorRaw(name: string): string {
  return name.trim().replace(/[\s,.;:*]+$/g, "").replace(/^[\s,.;:*]+/g, "");
}

/** The county vendor column is 20 characters. A star is the report's own cutoff mark. */
export function nameLooksCut(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/\*$/.test(trimmed)) return true;
  const cleaned = cleanVendorRaw(trimmed);
  return trimmed.length === 20 || cleaned.length === 20;
}

const ALWAYS_UPPER = new Set(["llc", "inc", "llp", "pllc", "pa", "at&t"]);

export function titleCaseVendor(name: string): string {
  const cleaned = cleanVendorRaw(name);
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "at&t") return "AT&T";
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

export function vendorKey(value: string): string {
  return vendorWords(cleanVendorRaw(value)).join(" ");
}

/** All-caps businesses are title case. A person name with a middle initial stays as stored. */
function keepPersonExact(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 20 || trimmed.includes("&")) return false;
  if (!looksLikePersonName(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters && letters !== letters.toUpperCase()) return true;
  return trimmed.split(/\s+/).some((word) => /^[A-Za-z]$/.test(word));
}

/** Title-case the stored name. Do not expand it from another row or drop a word to guess a shorter name. */
export function buildVendorIndex(_names: string[]): (raw: string) => VendorLabel {
  const cache = new Map<string, VendorLabel>();
  return (raw: string) => {
    if (!raw) return { text: "", shortened: false };
    if (raw === PAYROLL_BATCH_LABEL || raw === NAME_WITHHELD) return { text: raw, shortened: false };
    const key = raw.trim().toUpperCase();
    const cached = cache.get(key);
    if (cached) return cached;
    if (keepPersonExact(raw)) {
      const label = { text: raw.trim(), shortened: false };
      cache.set(key, label);
      return label;
    }
    const label = { text: titleCaseVendor(raw), shortened: nameLooksCut(raw) };
    cache.set(key, label);
    return label;
  };
}

/** Add rows that display as the same cleaned name. Different stored names stay separate. */
export function mergeVendorSpend<T extends { vendor_name: string; cents: number }>(rows: T[], display: (raw: string) => VendorLabel): T[] {
  const groups = new Map<string, T>();
  for (const row of rows) {
    const text = display(row.vendor_name || "").text;
    const key = text.toUpperCase();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...row });
      continue;
    }
    const keepName = row.cents > existing.cents ? row.vendor_name : existing.vendor_name;
    const next = { ...existing, vendor_name: keepName, cents: existing.cents + row.cents };
    const bag = next as unknown as Record<string, number>;
    const extra = row as unknown as Record<string, number>;
    for (const field of ["lines", "checks", "payments", "land_cents"]) {
      if (typeof extra[field] === "number") bag[field] = Number(bag[field] || 0) + extra[field];
    }
    groups.set(key, next);
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents);
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
