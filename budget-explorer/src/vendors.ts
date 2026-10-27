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

const ALWAYS_UPPER = new Set(["llc", "inc", "llp", "pllc"]);

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
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      });
    })
    .join(" ");
}

export function vendorKey(value: string): string {
  return vendorWords(cleanVendorRaw(value)).join(" ");
}

export function buildVendorIndex(names: string[]): (raw: string) => string {
  const entries = names
    .map((name) => ({ name: cleanVendorRaw(name), key: vendorKey(name) }))
    .filter((entry) => entry.key)
    .sort((a, b) => b.key.length - a.key.length);
  const cache = new Map<string, string>();
  return (raw: string) => {
    if (!raw) return "";
    if (raw === PAYROLL_BATCH_LABEL || raw === NAME_WITHHELD) return raw;
    if (looksLikePersonName(raw)) return raw;
    const key = vendorKey(raw);
    const cached = cache.get(key);
    if (cached) return cached;
    let chosen = cleanVendorRaw(raw);
    if (raw.trim().length >= 18 && key.length >= 12) {
      const fuller = entries.find((entry) => entry.key.length > key.length && entry.key.startsWith(key));
      if (fuller) chosen = fuller.name;
    }
    const titled = titleCaseVendor(chosen);
    cache.set(key, titled);
    return titled;
  };
}

export function withDisplayNames<T extends { vendor_name: string | null }>(rows: T[], display: (raw: string) => string): T[] {
  return rows.map((row) => ({ ...row, vendor_name: row.vendor_name ? display(row.vendor_name) : row.vendor_name }));
}

const VENDOR_STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "which", "how", "much", "did", "does",
  "county", "pay", "paid", "payment", "payments", "show", "tell", "about", "were", "was", "are", "have",
  "has", "its", "into", "over", "under", "than", "then", "them", "they", "their", "budget", "spent",
  "spend", "spending", "year", "total", "totals", "please", "could", "would", "should", "where", "when",
  "who", "so", "far", "vendor", "vendors", "many", "any", "our", "you", "your", "can", "just", "through",
  "date", "much", "get", "got",
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

export function vendorSpendSql(transfersOnly = false): string {
  const objectSql = transfersOnly ? `object_code = '${TRANSFER_OBJECT}'` : `object_code != '${TRANSFER_OBJECT}'`;
  return `
SELECT vendor_name,
  COALESCE(SUM(amount_cents), 0) AS cents,
  COUNT(*) AS lines,
  COUNT(DISTINCT CASE WHEN check_number != '' THEN check_number END) AS checks
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
  rows: { vendor_name: string; cents: number; lines: number; checks: number }[],
  phrase: string,
): VendorMatchTotals | null {
  const matched = rows.filter((row) => vendorNameMatches(row.vendor_name, phrase));
  if (!matched.length) return null;
  return {
    cents: matched.reduce((sum, row) => sum + Number(row.cents), 0),
    lines: matched.reduce((sum, row) => sum + Number(row.lines), 0),
    checks: matched.reduce((sum, row) => sum + Number(row.checks), 0),
    names: matched.map((row) => row.vendor_name),
    transferOnly: false,
  };
}
