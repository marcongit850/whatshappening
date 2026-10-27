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
  "Use only the records and facts in the user message. Do not use outside knowledge or memory of any county.",
  "The first sentence is the takeaway, in plain words a neighbor would understand.",
  "Say budget, money spent so far, and money left. Do not use accounting jargon.",
  "Every dollar figure must come from those records or facts.",
  "Do not quote the raw report totals that still include transfers unless the question asks about transfers.",
  "Cite the account key (fund-department-object-project) and the invoice number when a payment is mentioned.",
  "If the records do not contain the answer, reply with exactly: The imported data does not contain an answer to that question.",
  "If no vendor matches, say that no vendor in this budget matches that name.",
  "Do not invent vendors, amounts, employees, or check numbers.",
  "Keep the answer short.",
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
