import { TRANSFER_OBJECT, factsFromRow, type BudgetFacts, type FundRollup } from "./budget";
import { moneyExact, moneyWords } from "./format";
import { CONSTITUTIONAL_SQL, VENDOR_SOURCES } from "./overview";
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
    `Adopted budget passed by commissioners: ${moneyExact(facts.adopted)}.`,
    `Budget limit after mid-year changes: ${moneyExact(facts.current)}. That limit is a ceiling, not a spending plan.`,
    `Paid out through ${asOfLabel}: ${moneyExact(facts.spent)}.`,
    `Share of the mid-year limit: ${facts.spentOfCurrentPct.toFixed(1)}%.`,
    `Room under the mid-year limit: ${moneyExact(facts.left)}.`,
    `Transfers between county funds left out of those totals: ${moneyExact(facts.transfer)}.`,
  ].join(" ");
}

export function countyBudgetAnswer(facts: BudgetFacts, asOfLabel: string): string {
  const takeaway = `Commissioners adopted a ${moneyWords(facts.adopted)} budget. Through ${asOfLabel} the county's books show ${moneyWords(facts.spent)} paid out.`;
  const raised =
    facts.current > facts.adopted
      ? ` Budget limits were raised to ${moneyWords(facts.current)} during the year after commissioners re-approved about $192M of unfinished projects, grants and last-year commitments (Resolution 2025-82). The higher limit is a ceiling, not a spending plan.`
      : "";
  const rest = ` About ${moneyWords(facts.transfer)} moved between county funds and is not counted again.`;
  return `${takeaway}${raised}${rest}`;
}

export function transferAnswer(facts: BudgetFacts): string {
  const takeaway = `About ${moneyWords(facts.transfer)} moved between county funds.`;
  const rest = `A transfer moves money from one county fund to another, like moving cash between checking accounts. The raw report counts that move as spending twice. We count it once. Because you asked about transfers, the raw report's revised total is ${moneyWords(facts.grossRev)}, its original total is ${moneyWords(facts.grossOrig)}, and its spent total is ${moneyWords(facts.grossYtd)}. The budget limit after mid-year changes on this site is ${moneyWords(facts.current)}.`;
  return `${takeaway} ${rest}`;
}

export function fundBudgetAnswer(name: string, facts: BudgetFacts, asOfLabel: string): string {
  const takeaway = `The adopted budget for ${name} is ${moneyWords(facts.adopted)}.`;
  const current =
    facts.current > facts.adopted ? ` The budget limit after mid-year changes is ${moneyWords(facts.current)}.` : "";
  const rest = `${current} The books show ${moneyWords(facts.spent)} paid out through ${asOfLabel}.`;
  return `${takeaway}${rest}`;
}

export function vendorSpendAnswer(name: string, totals: VendorMatchTotals): string {
  const takeaway = `The county paid ${name} ${moneyExact(totals.cents)} so far this year.`;
  const payments = totals.checks === 1 ? "1 payment" : `${totals.checks.toLocaleString("en-US")} payments`;
  if (totals.lines === totals.checks) return `${takeaway} That is ${payments}.`;
  const lines = totals.lines === 1 ? "1 payment line" : `${totals.lines.toLocaleString("en-US")} payment lines`;
  return `${takeaway} That is ${payments}, listed as ${lines} in search.`;
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
  return display(longest).text || titleCaseVendor(longest);
}

export function asksWhoIsPaidMost(question: string): boolean {
  return /\b(who|which|what)\b/i.test(question) && /\b(most|largest|biggest|highest)\b/i.test(question) && /\b(paid|pay|vendor|vendors)\b/i.test(question);
}

async function topOutsideVendor(db: D1Database, importId: number, showNames: boolean): Promise<{ name: string; cents: number; lines: number } | null> {
  const sources = VENDOR_SOURCES.map((source) => `'${source}'`).join(", ");
  const row = await db
    .prepare(
      `SELECT vendor_name, COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS lines
       FROM payments
       WHERE import_id = ?
         AND after_cutoff = 0
         AND source IN (${sources})
         AND object_code != '${TRANSFER_OBJECT}'
         AND trim(COALESCE(vendor_name, '')) != ''
         AND (? = 1 OR is_person_name = 0)
         AND NOT ${CONSTITUTIONAL_SQL}
       GROUP BY vendor_name
       ORDER BY cents DESC
       LIMIT 1`,
    )
    .bind(importId, showNames ? 1 : 0)
    .first<{ vendor_name: string; cents: number; lines: number }>();
  if (!row) return null;
  return { name: displayMatchName([row.vendor_name]), cents: Number(row.cents), lines: Number(row.lines) };
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
    .all<{ vendor_name: string; cents: number; lines: number; pay_refs: string | null }>();
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
  if (phrase && !asksWhoIsPaidMost(question)) {
    const paid = await lookupVendorSpend(db, importId, phrase, showNames, false);
    if (paid) {
      const name = displayMatchName(paid.names);
      return {
        answer: vendorSpendAnswer(name, paid),
        records: [{ kind: "total", text: `${name}: ${moneyExact(paid.cents)}, ${paid.lines} payment lines, ${paid.checks} payments.` }],
      };
    }
    const moved = await lookupVendorSpend(db, importId, phrase, showNames, true);
    if (moved && /\b(pay|paid|vendor|vendors)\b/i.test(question)) {
      const name = displayMatchName(moved.names);
      return {
        answer: transferVendorAnswer(name, moved),
        records: [{ kind: "total", text: `${name} is a transfer between county funds: ${moneyExact(moved.cents)}.` }],
      };
    }
  }
  if (asksWhoIsPaidMost(question)) {
    const top = await topOutsideVendor(db, importId, showNames);
    if (top) {
      return {
        answer: `${top.name} was paid the most, ${moneyExact(top.cents)} across ${top.lines.toLocaleString("en-US")} payment lines. That leaves out money moved between county funds and payments to other county offices.`,
        records: [{ kind: "total", text: `${top.name}: ${moneyExact(top.cents)}, ${top.lines} lines.` }],
      };
    }
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
