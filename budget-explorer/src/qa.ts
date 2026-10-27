import { accountKey, moneyExact } from "./format";
import { QA_MAX_CHARS } from "./auth";

export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "which", "how", "much", "did", "does",
  "county", "pay", "paid", "payment", "payments", "show", "tell", "about", "were", "was", "are", "have",
  "has", "its", "into", "over", "under", "than", "then", "them", "they", "their", "budget", "spent",
  "spend", "year", "total", "totals", "please", "could", "would", "should", "where", "when", "who",
]);

export interface QaRecord {
  kind: "account" | "payment" | "total";
  text: string;
}

export interface QaPack {
  records: QaRecord[];
  prompt: string;
}

function tokens(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9][a-z0-9&.'-]{2,}/g) || [];
  const unique: string[] = [];
  for (const word of words) {
    if (STOP.has(word) || unique.includes(word)) continue;
    unique.push(word);
  }
  return unique.slice(0, 6);
}

function like(value: string): string {
  return `%${value.replace(/[%_]/g, " ").trim().slice(0, 40)}%`;
}

export async function retrieveContext(db: D1Database, importId: number, question: string): Promise<QaPack> {
  const records: QaRecord[] = [];
  const codes = question.match(/\b\d{3,8}\b/g) || [];
  const words = tokens(question);

  if (codes.length) {
    const code = codes.find((item) => item.length === 8) || codes[0];
    const accounts = await db
      .prepare(
        `SELECT fund_code, dept_code, object_code, project_code, title, rev_cents, ytd_cents, enc_cents
         FROM accounts
         WHERE import_id = ? AND (dept_code = ? OR object_code = ? OR fund_code = ? OR project_code = ?)
         ORDER BY rev_cents DESC LIMIT 20`,
      )
      .bind(importId, code, code, code, code)
      .all<{ fund_code: string; dept_code: string; object_code: string; project_code: string; title: string; rev_cents: number; ytd_cents: number; enc_cents: number }>();
    for (const row of accounts.results || []) {
      records.push({
        kind: "account",
        text: `Account ${accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code)} ${row.title || "unmatched"} revised ${moneyExact(row.rev_cents)} spent ${moneyExact(row.ytd_cents)} encumbered ${moneyExact(row.enc_cents)}`,
      });
    }
  }

  for (const word of words.slice(0, 4)) {
    const pattern = like(word);
    const accounts = await db
      .prepare(
        `SELECT fund_code, dept_code, object_code, project_code, title, rev_cents, ytd_cents, enc_cents
         FROM accounts
         WHERE import_id = ? AND title LIKE ?
         ORDER BY ABS(ytd_cents) DESC LIMIT 8`,
      )
      .bind(importId, pattern)
      .all<{ fund_code: string; dept_code: string; object_code: string; project_code: string; title: string; rev_cents: number; ytd_cents: number; enc_cents: number }>();
    for (const row of accounts.results || []) {
      records.push({
        kind: "account",
        text: `Account ${accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code)} ${row.title || "unmatched"} revised ${moneyExact(row.rev_cents)} spent ${moneyExact(row.ytd_cents)} encumbered ${moneyExact(row.enc_cents)}`,
      });
    }
    const payments = await db
      .prepare(
        `SELECT pay_date, vendor_name, invoice, check_number, amount_cents, fund_code, dept_code, object_code, project_code, description
         FROM payments
         WHERE import_id = ? AND after_cutoff = 0
           AND (vendor_name LIKE ? OR invoice LIKE ? OR description LIKE ? OR check_number = ? OR vendor_number = ?)
         ORDER BY ABS(amount_cents) DESC LIMIT 12`,
      )
      .bind(importId, pattern, pattern, pattern, word, word)
      .all<{ pay_date: string; vendor_name: string; invoice: string; check_number: string; amount_cents: number; fund_code: string; dept_code: string; object_code: string; project_code: string; description: string }>();
    for (const row of payments.results || []) {
      records.push({
        kind: "payment",
        text: `Payment ${row.pay_date} vendor ${row.vendor_name || "unmatched"} invoice ${row.invoice || "none"} check ${row.check_number || "none"} amount ${moneyExact(row.amount_cents)} account ${accountKey(row.fund_code, row.dept_code, row.object_code, row.project_code)} description ${row.description || ""}`,
      });
    }
  }

  if (/\b(how much|total|sum|spent)\b/i.test(question) && words.length) {
    const pattern = like(words[0]);
    const total = await db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents
         FROM payments
         WHERE import_id = ? AND after_cutoff = 0 AND (vendor_name LIKE ? OR description LIKE ? OR invoice LIKE ?)`,
      )
      .bind(importId, pattern, pattern, pattern)
      .first<{ n: number; cents: number }>();
    if (total && Number(total.n) > 0) {
      records.push({
        kind: "total",
        text: `Aggregate for "${words[0]}" across visible payment lines: ${Number(total.n)} lines, sum ${moneyExact(Number(total.cents))}. Payroll batches are not included.`,
      });
    }
  }

  const seen = new Set<string>();
  const unique = records.filter((record) => {
    if (seen.has(record.text)) return false;
    seen.add(record.text);
    return true;
  }).slice(0, 40);

  const body = unique.map((record, index) => `[${index + 1}] ${record.text}`).join("\n");
  const prompt = `Question: ${question.slice(0, QA_MAX_CHARS)}\n\nRecords from the imported budget file:\n${body || "(none)"}`;
  return { records: unique, prompt };
}

export const QA_SYSTEM = [
  "You answer questions about one imported county budget file.",
  "Use only the records in the user message. Do not use outside knowledge or memory of any county.",
  "Every dollar figure must come from those records.",
  "Cite the account key (fund-department-object-project) and the invoice number when a payment is mentioned.",
  "If the records do not contain the answer, reply with exactly: The imported data does not contain an answer to that question.",
  "Do not invent vendors, amounts, employees, or check numbers.",
  "Payroll is not present as individual pay. Do not guess employee names or wages.",
  "Keep the answer short and plain.",
].join(" ");

export function modelText(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const record = result as { response?: unknown; result?: unknown };
    if (typeof record.response === "string") return record.response;
    if (typeof record.result === "string") return record.result;
  }
  return "";
}
