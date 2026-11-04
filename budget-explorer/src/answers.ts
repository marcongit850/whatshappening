import { TRANSFER_OBJECT, factsFromRow, type BudgetFacts, type FundRollup } from "./budget";
import { fiscalPosition, leftLabel, money, moneyCompact, moneyExact, moneyWords, spentTerm } from "./format";
import { directoryPersonSql } from "./parser";
import { CONSTITUTIONAL_SQL, SHERIFF_FUND_CAPTION, SHERIFF_FUND_LABEL, VENDOR_SOURCES, isSheriffRelease } from "./overview";
import type { QaRecord } from "./qa";
import {
  buildVendorIndex,
  sumVendorMatches,
  titleCaseVendor,
  vendorCompact,
  creditCardVendorSql,
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
  if (/\bsheriff\b/i.test(question) && /\bfund\b/i.test(question)) {
    const sheriff = funds.find((fund) => fund.code === "107" || /sheriff|forfeiture/i.test(fund.name));
    if (sheriff) return sheriff;
  }
  return null;
}

export function publicFundName(code: string, reportName: string): string {
  if (isSheriffRelease(reportName, code)) return SHERIFF_FUND_LABEL;
  return titleCaseVendor(reportName || `Fund ${code}`);
}

function availableFact(facts: BudgetFacts): string {
  if (facts.current <= 0) return "No budget is set in the county report.";
  if (facts.left < 0) return `Over the mid-year limit by ${moneyExact(-facts.left)} after open orders.`;
  return `Not yet spent or promised: ${moneyExact(facts.left)}.`;
}

/** September 28, 2026 final budget resolution. The posted copy leaves the resolution number blank. */
export const FY2027_ADOPTED_CENTS = 34_522_350_800;
export const FY2027_MOSQUITO_CENTS = 142_993_700;
export const FY2027_ADOPTED_URL = "https://walton.civicweb.net/document/538081/";

export function fy2027CountNote(facts: BudgetFacts): string {
  const gap = FY2027_ADOPTED_CENTS - facts.adopted;
  const parts = [
    `Commissioners adopted ${moneyExact(FY2027_ADOPTED_CENTS)} for FY2027 on September 28, 2026, including ${moneyExact(FY2027_MOSQUITO_CENTS)} for the North Walton Mosquito Control District.`,
    `The Clerk's account detail lists ${moneyExact(facts.grossOrig)} as the expense original appropriation.`,
    `Of that, ${moneyExact(facts.transferOrig)} is interfund transfers (object 591000) and is left out of the charts.`,
  ];
  if (facts.reserveOrig) parts.push(`${moneyExact(facts.reserveOrig)} is contingency and reserves (other object codes starting with 59).`);
  if (facts.debtOrig) parts.push(`${moneyExact(facts.debtOrig)} is debt service (object codes starting with 57).`);
  if (facts.aidOrig) {
    parts.push(`Aid to other governments and organizations (object codes 581, 582, and 583) is ${moneyExact(facts.aidOrig)} and stays in the budget. Object 581 is not a transfer between county funds in this chart.`);
  }
  if (gap === 0) {
    parts.push("That matches the original appropriation in the account detail after leaving out interfund transfers.");
  } else {
    const direction = gap > 0 ? "under" : "over";
    parts.push(`Expense original minus those transfers is ${moneyExact(facts.adopted)}, which is ${moneyExact(Math.abs(gap))} ${direction} the adopted resolution. The resolution does not itemize that difference.`);
  }
  return parts.join(" ");
}

/** Round a small gap to the nearest thousand dollars for the plain count sentence. */
export function aboutDollars(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `about ${moneyCompact(cents)}`;
  if (dollars >= 1000) {
    const rounded = Math.round(dollars / 1000) * 1000;
    return `about $${rounded.toLocaleString("en-US")}`;
  }
  return money(cents);
}

/** Plain overview sentence. Exact object codes and dollar figures stay in the details. */
export function howWeCountLead(facts: BudgetFacts, asOf: string | null | undefined): string {
  const fiscal = fiscalPosition(asOf);
  const left = leftLabel(facts.current, facts.spent, facts.encumbered);
  const leftSentence = left.over
    ? `${spentTerm(asOf)} is over the mid-year limit by ${left.value} after open orders.`
    : left.unbudgeted
      ? "No budget is set in the county report."
      : `${moneyCompact(Math.max(facts.current - facts.spent - Math.max(facts.encumbered, 0), 0))} is not yet spent or promised.`;
  if (fiscal.fyLabel !== "2027") {
    return `Commissioners adopted ${money(facts.adopted)}. The books show ${money(facts.spent)} spent. The budget limit after mid-year changes is ${money(facts.current)}. ${leftSentence}`;
  }
  const gap = Math.abs(FY2027_ADOPTED_CENTS - facts.adopted);
  const match =
    gap === 0
      ? `That brings the books to ${moneyCompact(facts.adopted)}, matching the adopted budget.`
      : `That brings the books to ${moneyCompact(facts.adopted)}, matching the adopted budget within ${aboutDollars(gap)}.`;
  return [
    `Commissioners adopted ${moneyCompact(FY2027_ADOPTED_CENTS)} for FY2027 on September 28, 2026.`,
    `The Clerk's books list ${moneyCompact(facts.grossOrig)}, but ${moneyCompact(facts.transferOrig)} of that is money moved from one county fund to another.`,
    "That money gets spent by the fund that receives it, so we count it once and leave the transfer out of the charts.",
    match,
    `So far, ${moneyCompact(facts.spent)} has been spent and ${leftSentence}`,
  ].join(" ");
}

export function publicFactText(facts: BudgetFacts, asOfLabel: string): string {
  const fy = fiscalPosition(asOfLabel).fyLabel;
  const adopted = fy === "2027"
    ? `Adopted budget passed by commissioners: ${moneyExact(FY2027_ADOPTED_CENTS)}. Source: the September 28, 2026 final budget resolution, ${FY2027_ADOPTED_URL}. ${fy2027CountNote(facts)}`
    : `Adopted budget passed by commissioners: ${moneyExact(facts.adopted)}.`;
  return [
    adopted,
    `Budget limit after mid-year changes: ${moneyExact(facts.current)}. That limit is a ceiling, not a spending plan.`,
    `${spentTerm(asOfLabel)}: ${moneyExact(facts.spent)}.`,
    `Share of the mid-year limit: ${facts.spentOfCurrentPct.toFixed(1)}%.`,
    availableFact(facts),
    `Open orders: ${moneyExact(facts.encumbered)}.`,
    `Transfers between county funds left out of those totals: ${moneyExact(facts.transfer)}.`,
  ].join(" ");
}

export function countyBudgetAnswer(facts: BudgetFacts, asOfLabel: string): string {
  if (fiscalPosition(asOfLabel).fyLabel === "2027") {
    return `Commissioners adopted a ${moneyWords(FY2027_ADOPTED_CENTS)} budget for FY2027. ${fy2027CountNote(facts)} Through ${asOfLabel} the county's books show ${moneyWords(facts.spent)} spent.`;
  }
  const takeaway = `Commissioners adopted a ${moneyWords(facts.adopted)} budget. Through ${asOfLabel} the county's books show ${moneyWords(facts.spent)} spent.`;
  const raised =
    facts.current > facts.adopted
      ? ` Budget limits in this file are ${moneyWords(facts.current)}. That figure is a ceiling, not a spending plan.`
      : "";
  const rest = ` About ${moneyWords(facts.transfer)} moved between county funds and is not counted again.`;
  return `${takeaway}${raised}${rest}`;
}

export function transferAnswer(facts: BudgetFacts): string {
  const takeaway = `About ${moneyWords(facts.transfer)} moved between county funds.`;
  const rest = `The report lists the transfer out of one fund. The fund that receives it then spends or releases the money, so adding both would count the same dollars twice. Because you asked about transfers, the raw report's revised total is ${moneyWords(facts.grossRev)}, its original total is ${moneyWords(facts.grossOrig)}, and its spent total is ${moneyWords(facts.grossYtd)}. The budget limit after mid-year changes on this site is ${moneyWords(facts.current)}.`;
  return `${takeaway} ${rest}`;
}

export function fundBudgetAnswer(name: string, facts: BudgetFacts, asOfLabel: string): string {
  const release = isSheriffRelease(name);
  const verb = release ? "released" : "spent";
  const takeaway = `The adopted budget for ${name} is ${moneyWords(facts.adopted)}.`;
  const current =
    facts.current > facts.adopted ? ` The budget limit after mid-year changes is ${moneyWords(facts.current)}.` : "";
  const rest = `${current} The books show ${moneyWords(facts.spent)} ${verb} through ${asOfLabel}.`;
  const caption = release ? ` ${SHERIFF_FUND_CAPTION}` : "";
  return `${takeaway}${rest}${caption}`;
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
  const display = buildVendorIndex();
  const longest = [...names].sort((a, b) => b.length - a.length)[0] || "";
  return display(longest).text || titleCaseVendor(longest);
}

export function asksWhoIsPaidMost(question: string): boolean {
  return /\b(who|which|what)\b/i.test(question) && /\b(most|largest|biggest|highest)\b/i.test(question) && /\b(paid|pay|vendor|vendors)\b/i.test(question);
}

async function topOutsideVendor(
  db: D1Database,
  importId: number,
  showNames: boolean,
): Promise<{ name: string; cents: number; lines: number; landCents: number } | null> {
  const sources = VENDOR_SOURCES.map((source) => `'${source}'`).join(", ");
  const row = await db
    .prepare(
      `WITH scoped AS (
         SELECT
           CASE WHEN trim(COALESCE(vendor_number, '')) = '' THEN vendor_name ELSE vendor_number END AS vendor_key,
           vendor_name,
           amount_cents,
           object_code
         FROM payments
         WHERE import_id = ?
           AND after_cutoff = 0
           AND source IN (${sources})
           AND object_code != '${TRANSFER_OBJECT}'
           AND trim(COALESCE(vendor_name, '')) != ''
           AND ${creditCardVendorSql("vendor_number")}
           ${directoryPersonSql(showNames, "vendor_name")}
           AND NOT ${CONSTITUTIONAL_SQL}
       )
       SELECT
         (
           SELECT s2.vendor_name FROM scoped s2
           WHERE s2.vendor_key = s.vendor_key
           ORDER BY length(trim(s2.vendor_name)) DESC, s2.vendor_name DESC
           LIMIT 1
         ) AS vendor_name,
         COALESCE(SUM(s.amount_cents), 0) AS cents,
         COUNT(*) AS lines,
         COALESCE(SUM(CASE WHEN s.object_code = '561000' THEN s.amount_cents ELSE 0 END), 0) AS land_cents
       FROM scoped s
       GROUP BY s.vendor_key
       ORDER BY cents DESC
       LIMIT 1`,
    )
    .bind(importId)
    .first<{ vendor_name: string; cents: number; lines: number; land_cents: number }>();
  if (!row) return null;
  return {
    name: displayMatchName([row.vendor_name]),
    cents: Number(row.cents),
    lines: Number(row.lines),
    landCents: Number(row.land_cents) || 0,
  };
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
    .prepare(vendorSpendSql(transfersOnly, showNames))
    .bind(importId, `${compact}%`)
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
      const land = top.landCents > 0 && top.landCents * 2 >= top.cents ? " That is mostly land purchases." : "";
      return {
        answer: `${top.name} was paid the most, ${moneyExact(top.cents)} across ${top.lines.toLocaleString("en-US")} payment lines.${land} That leaves out money moved between county funds and payments to other county offices.`,
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
        answer: fundBudgetAnswer(publicFundName(fund.code, fund.name || ""), fundFacts, asOfLabel),
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
