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
  "Use only the records in the user message. Do not use outside knowledge or memory of any county.",
  "Every dollar figure must come from those records.",
  "Cite the account key (fund-department-object-project) and the invoice number when a payment is mentioned.",
  "If the records do not contain the answer, reply with exactly: The imported data does not contain an answer to that question.",
  "Do not invent vendors, amounts, employees, or check numbers.",
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
