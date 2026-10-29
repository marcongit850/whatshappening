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
  "You answer questions about one imported county budget file and the published revenue records.",
  "Use only the FACT lines and records in the user message. Do not use outside knowledge or memory of any county.",
  "The first sentence is one sentence that summarizes the answer in plain words and cites the source and the year.",
  "Say budget, money spent so far, and money left. Do not use accounting jargon.",
  "The adopted budget is the amount commissioners passed. Say that first. Call the higher revised total the budget limit after mid-year changes, never the budget. That limit is a ceiling, not a spending plan. Do not say spending passed the adopted budget because projects were added. If you give a percent, call it the share of the mid-year limit.",
  "Say payments, not checks, unless a FACT line gives a check number.",
  "Every dollar figure in the answer must be copied from a FACT line. Do not add, subtract, multiply, divide, or round.",
  "Do not quote raw report totals that still include transfers unless the question asks about transfers.",
  "Cite the account count and the account keys written in that FACT.",
  "If a payment is mentioned, also cite its invoice number when one is given.",
  "Questions about income, revenue, money earned, interest earned, investment earnings, or taxes collected are answered from published revenue FACT lines. Say whether the figure is an audited actual or a budget, and name the fiscal year.",
  "Interest in an expense account title is interest paid, which is debt service. Never call that amount interest earned, income, or investment earnings.",
  "A budget amount is not money already earned. An amount spent is not money earned.",
  "If the FACT lines do not match the question's meaning, say what they show and what cannot be answered. Do not force a claim the records do not support.",
  "If no FACT answers the question, reply with exactly: The imported data does not contain an answer to that question.",
  "If FACT lines name a fund, department, or account, answer from those totals even when no vendor matches.",
  "Say that no vendor in this budget matches that name only when the question asks who was paid and no FACT names that payee.",
  "Do not invent vendors, amounts, employees, or check numbers.",
  "Keep the answer short.",
].join(" ");

export type MoneyIntent = "earned" | "spent" | "budgeted" | "other";

function asksBudgetFigure(question: string): boolean {
  if (/\bbudgeted\b/i.test(question)) return true;
  if (/\bbudget for\b/i.test(question)) return true;
  if (/\bin the budget\b/i.test(question)) return true;
  return /\b(how much|what)\b/i.test(question) && /\bbudget\b/i.test(question);
}

/** Whether the question is about money earned, money spent, or a budget figure. */
export function questionMoneyIntent(question: string): MoneyIntent {
  const earned =
    /\b(earn(?:ed|ing|ings)?|income|revenues?|collect(?:ed|ion|ions)?)\b/i.test(question) ||
    /\binvestment earnings\b/i.test(question);
  const spent = /\b(spent|spending|spend|paid|pay|payments?)\b/i.test(question);
  const budgeted = asksBudgetFigure(question);
  if (spent && !earned && !budgeted) return "spent";
  if (budgeted && !earned) return "budgeted";
  if (budgeted && earned) {
    if (/\bbudgeted\b/i.test(question) || /\bbudget for\b/i.test(question) || /\bin the budget\b/i.test(question)) return "budgeted";
    return "earned";
  }
  if (earned) return "earned";
  if (spent) return "spent";
  if (/\b(interest|investment earnings|property tax(?:es)?|sales tax(?:es)?|bed tax|gas tax(?:es)?|tourist tax)\b/i.test(question)) return "earned";
  return "other";
}

/** Debt service interest. Object 572 is interest expense on the Florida chart. */
export function isInterestPaidAccount(title: string | null, objectCode: string): boolean {
  if (objectCode.startsWith("572")) return true;
  return /\binterest\b/i.test(title || "");
}

export function dollarsIn(text: string): string[] {
  return text.match(/\$\d{1,3}(?:,\d{3})*\.\d{2}/g) || [];
}

function factBody(record: QaRecord): string {
  return record.text.replace(/^FACT:\s*/, "").trim();
}

function claimsMoneyEarned(answer: string): boolean {
  const stripped = answer.replace(/\bnot interest earned\b/gi, "").replace(/\bnot money already earned\b/gi, "");
  return /\b(earn(?:ed|ing|ings)?)\b/i.test(stripped);
}

function accountKeys(record: QaRecord): string {
  return /Account keys: ([^.]+)/.exec(record.text)?.[1]?.trim() || "";
}

function paidSpentSummary(record: QaRecord): string {
  const amount = dollarsIn(record.text)[0] || "the amount in the record";
  const keys = accountKeys(record);
  const account = keys ? ` on account ${keys}` : "";
  return `The county paid ${amount} of interest (debt service)${account}, according to the spending report. This is interest paid, not interest earned.`;
}

function paidMismatchSummary(record: QaRecord): string {
  const amount = dollarsIn(record.text)[0] || "the amount in the record";
  const keys = accountKeys(record);
  const account = keys ? ` on account ${keys}` : "";
  return `The spending report shows ${amount} of interest paid (debt service)${account}. These records do not show how much interest the county earned.`;
}

function spendingMismatchSummary(record: QaRecord): string {
  const amount = dollarsIn(record.text)[0] || "the amount in the record";
  const keys = accountKeys(record);
  const account = keys ? ` on account ${keys}` : "";
  return `The spending report shows ${amount} spent${account}. That is spending, not income, so these records cannot answer how much the county earned.`;
}

/**
 * Keep a model answer that already states the matching figure.
 * Replace an answer that calls interest paid "earned", or that cites a figure the records do not contain.
 */
export function alignAnswer(question: string, answer: string, records: QaRecord[]): string {
  const intent = questionMoneyIntent(question);
  if (!answer.trim() || intent === "other") return answer;
  const factDollars = new Set(records.flatMap((record) => dollarsIn(record.text)));
  const paidDollars = new Set(
    records.filter((record) => /interest paid/i.test(record.text)).flatMap((record) => dollarsIn(record.text)),
  );
  const answerDollars = dollarsIn(answer);
  const usesUnknown = answerDollars.some((amount) => !factDollars.has(amount));
  const usesPaid = answerDollars.some((amount) => paidDollars.has(amount));

  if (intent === "earned") {
    const lead = records.find((record) => /the county earned/i.test(record.text));
    if (lead) {
      const leadAmount = dollarsIn(lead.text)[0];
      const safe = Boolean(leadAmount && answer.includes(leadAmount) && !usesUnknown && !usesPaid);
      if (!safe) return factBody(lead);
    } else if (claimsMoneyEarned(answer) || usesUnknown || usesPaid) {
      const paid = records.find((record) => /interest paid/i.test(record.text));
      if (paid) return paidMismatchSummary(paid);
      const spending = records.find((record) => / spent \$/.test(record.text));
      if (spending) return spendingMismatchSummary(spending);
    }
  }

  if (intent === "budgeted") {
    const lead = records.find((record) => /The FY\d+ adopted budget for/i.test(record.text));
    if (lead) {
      const leadAmount = dollarsIn(lead.text)[0];
      const safe = Boolean(leadAmount && answer.includes(leadAmount) && /\bbudget/i.test(answer) && !usesUnknown && !usesPaid);
      if (!safe) return factBody(lead);
    }
  }

  if (intent === "spent") {
    const paid = records.find((record) => /interest paid \(debt service\)/i.test(record.text));
    if (paid) {
      const amount = dollarsIn(paid.text)[0];
      const safe = Boolean(amount && answer.includes(amount) && /interest paid/i.test(answer) && !claimsMoneyEarned(answer));
      if (!safe) return paidSpentSummary(paid);
    }
  }

  return answer;
}

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
