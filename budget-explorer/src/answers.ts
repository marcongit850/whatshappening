import { factsFromRow, type BudgetFacts, type FundRollup } from "./budget";
import { moneyExact, moneyWords } from "./format";
import type { QaRecord } from "./qa";
import {
  buildVendorIndex,
  sumVendorMatches,
  titleCaseVendor,
  vendorCompact,
  vendorPhrase,
  vendorSpendSql,
  vendorWords,
  type VendorMatchTotals,
} from "./vendors";

export function asksAboutTransfers(question: string): boolean {
  return /\b(transfer|transfers|transferred|between funds|counted twice|double[- ]?count|raw report|gross)\b/i.test(question);
}

export function asksAboutCountyBudget(question: string): boolean {
  if (vendorPhrase(question)) return false;
  if (/\b(payroll|salary|salaries|wage|wages|employee|employees|department)\b/i.test(question)) return false;
  return (
    /\b(county budget|the budget|total budget|whole budget|adopted budget|current budget)\b/i.test(question) ||
    /what(?:'s| is) the (?:county )?budget/i.test(question) ||
    /how (?:big|large|much) is the (?:county )?budget/i.test(question)
  );
}

export function matchFundQuestion(question: string, funds: { code: string; name: string }[]): { code: string; name: string } | null {
  const q = question.toLowerCase();
  const named = funds
    .map((fund) => ({ ...fund, name: fund.name.trim() }))
    .filter((fund) => fund.name.length >= 6)
    .sort((a, b) => b.name.length - a.name.length);
  for (const fund of named) {
    if (q.includes(fund.name.toLowerCase())) return fund;
  }
  const explicit = /\bfund\s+(\d{3})\b/i.exec(question);
  if (explicit) return funds.find((fund) => fund.code === explicit[1]) || null;
  return null;
}

export function publicFactText(facts: BudgetFacts, asOfLabel: string): string {
  return [
    `Budget passed by commissioners: ${moneyExact(facts.adopted)}.`,
    `Current budget: ${moneyExact(facts.current)}.`,
    `Money spent so far through ${asOfLabel}: ${moneyExact(facts.spent)}.`,
    `Money left: ${moneyExact(facts.left)}.`,
    `Transfers between county funds left out of those totals: ${moneyExact(facts.transfer)}.`,
  ].join(" ");
}

export function countyBudgetAnswer(facts: BudgetFacts, asOfLabel: string): string {
  const takeaway = `The budget the commissioners passed is ${moneyWords(facts.adopted)}.`;
  const rest = `The current budget is ${moneyWords(facts.current)}. That adds money carried over from last year and other changes, mostly grants. ${moneyWords(facts.spent)} has been spent through ${asOfLabel}. That leaves ${moneyWords(facts.left)}. About ${moneyWords(facts.transfer)} moved between county funds and is not counted again.`;
  return `${takeaway} ${rest}`;
}

export function transferAnswer(facts: BudgetFacts): string {
  const takeaway = `About ${moneyWords(facts.transfer)} moved between county funds.`;
  const rest = `A transfer moves money from one county fund to another, like moving cash between checking accounts. The raw report counts that move as spending twice. We count it once. Because you asked about transfers, the raw report's revised total is ${moneyWords(facts.grossRev)}, its original total is ${moneyWords(facts.grossOrig)}, and its spent total is ${moneyWords(facts.grossYtd)}. The current budget on this site is ${moneyWords(facts.current)}.`;
  return `${takeaway} ${rest}`;
}

export function fundBudgetAnswer(name: string, facts: BudgetFacts, asOfLabel: string): string {
  const takeaway = `${name} has a current budget of ${moneyWords(facts.current)}.`;
  const rest = `${moneyWords(facts.spent)} has been spent through ${asOfLabel}. That leaves ${moneyWords(facts.left)}.`;
  return `${takeaway} ${rest}`;
}

export function vendorSpendAnswer(name: string, totals: VendorMatchTotals): string {
  const takeaway = `The county paid ${name} ${moneyExact(totals.cents)} so far this year.`;
  const checks = totals.checks === 1 ? "1 check" : `${totals.checks.toLocaleString("en-US")} checks`;
  const lines = totals.lines === 1 ? "1 payment line" : `${totals.lines.toLocaleString("en-US")} payment lines`;
  return `${takeaway} That is ${lines} and ${checks}.`;
}

export function transferVendorAnswer(name: string, totals: VendorMatchTotals): string {
  const takeaway = `${name} is money moved between county funds, not a bill from an outside business.`;
  return `${takeaway} That move is ${moneyExact(totals.cents)} across ${totals.lines.toLocaleString("en-US")} lines. It is not counted again in the budget totals.`;
}

export function noVendorAnswer(): string {
  return "No vendor in this budget matches that name.";
}

function displayMatchName(names: string[]): string {
  const display = buildVendorIndex(names);
  const longest = [...names].sort((a, b) => b.length - a.length)[0] || "";
  return display(longest) || titleCaseVendor(longest);
}

export async function lookupVendorSpend(
  db: D1Database,
  importId: number,
  phrase: string,
  showNames: boolean,
  transfersOnly: boolean,
): Promise<VendorMatchTotals | null> {
  const first = vendorWords(phrase).find((word) => word.length >= 3);
  if (!first) return null;
  const compact = vendorCompact(first);
  if (compact.length < 3) return null;
  const rows = await db
    .prepare(vendorSpendSql(transfersOnly))
    .bind(importId, showNames ? 1 : 0, `${compact}%`)
    .all<{ vendor_name: string; cents: number; lines: number; checks: number }>();
  const totals = sumVendorMatches(rows.results || [], phrase);
  if (!totals) return null;
  return { ...totals, transferOnly: transfersOnly };
}

export async function directAnswer(
  db: D1Database,
  importId: number,
  question: string,
  facts: BudgetFacts,
  funds: FundRollup[],
  showNames: boolean,
  asOfLabel: string,
): Promise<{ answer: string; records: QaRecord[] } | null> {
  const phrase = vendorPhrase(question);
  if (phrase) {
    const paid = await lookupVendorSpend(db, importId, phrase, showNames, false);
    if (paid) {
      const name = displayMatchName(paid.names);
      return {
        answer: vendorSpendAnswer(name, paid),
        records: [{ kind: "total", text: `${name}: ${moneyExact(paid.cents)}, ${paid.lines} lines, ${paid.checks} checks.` }],
      };
    }
    const moved = await lookupVendorSpend(db, importId, phrase, showNames, true);
    if (moved) {
      const name = displayMatchName(moved.names);
      return {
        answer: transferVendorAnswer(name, moved),
        records: [{ kind: "total", text: `${name} is a transfer between county funds: ${moneyExact(moved.cents)}.` }],
      };
    }
    return { answer: noVendorAnswer(), records: [] };
  }
  if (asksAboutTransfers(question)) {
    return {
      answer: transferAnswer(facts),
      records: [
        {
          kind: "total",
          text: `Transfers between funds ${moneyExact(facts.transfer)}. Raw report revised ${moneyExact(facts.grossRev)}. Current budget ${moneyExact(facts.current)}.`,
        },
      ],
    };
  }
  const namedFunds = funds.map((fund) => ({ code: fund.fund_code, name: fund.report_name || "" }));
  const fund = matchFundQuestion(question, namedFunds);
  if (fund) {
    const row = funds.find((item) => item.fund_code === fund.code);
    if (row) {
      const fundFacts = factsFromRow(row);
      return {
        answer: fundBudgetAnswer(titleCaseVendor(fund.name || `Fund ${fund.code}`), fundFacts, asOfLabel),
        records: [{ kind: "total", text: publicFactText(fundFacts, asOfLabel) }],
      };
    }
  }
  if (asksAboutCountyBudget(question)) {
    return {
      answer: countyBudgetAnswer(facts, asOfLabel),
      records: [{ kind: "total", text: publicFactText(facts, asOfLabel) }],
    };
  }
  return null;
}
