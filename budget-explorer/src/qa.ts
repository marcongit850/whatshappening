export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface QaRecord {
  kind: "account" | "payment" | "total";
  text: string;
}

export interface QaPack {
  records: QaRecord[];
  prompt: string;
}

export const QA_SYSTEM = [
  "You answer questions about one imported county budget file.",
  "Use only the FACT lines and records in the user message. Do not use outside knowledge or memory of any county.",
  "The first sentence is the takeaway, in plain words a neighbor would understand.",
  "Say budget, money spent so far, and money left. Do not use accounting jargon.",
  "Every dollar figure in the answer must be copied from a FACT line. Do not add, subtract, multiply, divide, or round.",
  "Do not quote raw report totals that still include transfers unless the question asks about transfers.",
  "Cite the account count and the account keys written in that FACT.",
  "If a payment is mentioned, also cite its invoice number when one is given.",
  "If no FACT answers the question, reply with exactly: The imported data does not contain an answer to that question.",
  "If FACT lines name a fund, department, or account, answer from those totals even when no vendor matches.",
  "Say that no vendor in this budget matches that name only when the question asks who was paid and no FACT names that payee.",
  "Do not invent vendors, amounts, employees, or check numbers.",
  "Keep the answer short.",
].join(" ");

const NAME_STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "which", "how", "much", "did", "does",
  "county", "pay", "paid", "payment", "payments", "show", "tell", "about", "were", "was", "are", "have",
  "has", "its", "into", "over", "under", "than", "then", "them", "they", "their", "budget", "spent",
  "spend", "year", "total", "totals", "please", "could", "would", "should", "where", "when", "who",
  "fund", "funds", "dept", "department", "departments", "revised", "available", "encumbered",
]);

const VENDOR_STOP = new Set([...NAME_STOP, "payroll", "salary", "salaries", "wage", "wages", "question", "fees", "fee"]);

export function stemToken(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length > 4 && lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
  if (lower.length > 4 && lower.endsWith("es") && !lower.endsWith("ses")) return lower.slice(0, -2);
  if (lower.length > 3 && lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  return lower;
}

function wordsOf(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function nameStems(name: string): string[] {
  const stems: string[] = [];
  for (const word of wordsOf(name)) {
    if (NAME_STOP.has(word)) continue;
    const stem = stemToken(word);
    if (stem.length < 4 || NAME_STOP.has(stem) || stems.includes(stem)) continue;
    stems.push(stem);
  }
  return stems;
}

export function questionStems(question: string): Set<string> {
  const stems = new Set<string>();
  for (const word of wordsOf(question)) {
    if (NAME_STOP.has(word)) continue;
    const stem = stemToken(word);
    if (stem.length < 4 || NAME_STOP.has(stem)) continue;
    stems.add(stem);
  }
  return stems;
}

/**
 * Whole-word match. "plat" does not match "platform".
 * A name with one or two significant words must match all of them. Longer names need two.
 */
export function nameMatchesQuestion(name: string, question: string): boolean {
  const neededTokens = nameStems(name);
  if (!neededTokens.length) return false;
  const have = questionStems(question);
  const matched = neededTokens.filter((token) => have.has(token)).length;
  const needed = neededTokens.length <= 2 ? neededTokens.length : 2;
  return matched >= needed;
}

export function mentionedCodes(question: string): { funds: string[]; depts: string[]; objects: string[] } {
  const unique = (values: string[]) => [...new Set(values)];
  return {
    funds: unique([...question.matchAll(/\bfunds?\s+#?(\d{3})\b/gi)].map((match) => match[1])),
    depts: unique([...question.matchAll(/\b(\d{8})\b/g)].map((match) => match[1])),
    objects: unique([...question.matchAll(/\b(?:object|account)\s+#?(\d{6})\b/gi)].map((match) => match[1])),
  };
}

/** Vendor and title lookup tokens. Not stemmed, so a short piece of a longer word is not used. */
export function vendorTokens(question: string): string[] {
  const tokens: string[] = [];
  for (const word of wordsOf(question)) {
    if (word.length < 4 || VENDOR_STOP.has(word)) continue;
    const token = word.toUpperCase();
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens.slice(0, 4);
}

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
