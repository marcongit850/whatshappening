export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** First sentence of text that is already on the page. */
export function firstSentence(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const end = clean.search(/[.!?](?=\s|$)/);
  return end === -1 ? clean : clean.slice(0, end + 1);
}

/** Gold question-mark control. The sentence must already exist on the page. */
export function infoTip(id: string, sentence: string): string {
  const text = firstSentence(sentence);
  if (!text || text.toLowerCase() === "n/a") return "";
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tip";
  return `<span class="tip"><button type="button" class="tip-btn" aria-label="What is this?" aria-expanded="false" aria-controls="tip-${esc(slug)}" aria-describedby="tip-${esc(slug)}">?</button><span class="tip-pop" id="tip-${esc(slug)}" role="tooltip" hidden>${esc(text)}</span></span>`;
}

/** Display name for the body of water, when that phrase appears. */
export function gulfName(value: string): string {
  return value.replace(/gulf of mexico/gi, "Gulf of America");
}

export function nameFor(chart: string | undefined, report: string | undefined, code: string): { primary: string; unmatched: boolean } {
  const chartName = (chart || "").trim();
  const reportName = (report || "").trim();
  if (chartName) return { primary: gulfName(chartName), unmatched: false };
  if (reportName) return { primary: gulfName(reportName), unmatched: true };
  return { primary: code, unmatched: true };
}

export function money(cents: number, digits = 0): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const amount = digits === 0 ? Math.round(abs / 100) : abs / 100;
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${sign}$${formatted}`;
}

export function moneyExact(cents: number): string {
  return money(cents, 2);
}

/** CSV text cell that cannot be read as a spreadsheet formula. Name cells use this. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV amount. A real negative stays a number. Do not pass amounts through csvCell. */
export function csvAmount(cents: number): string {
  if (!Number.isFinite(cents)) return "";
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** Headline amount in everyday words, such as $12.5 million. */
export function moneyWords(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) {
    const millions = dollars / 1_000_000;
    const digits = millions >= 10 ? 1 : 2;
    return `${sign}$${millions.toFixed(digits)} million`;
  }
  if (dollars >= 100) return `${sign}$${Math.round(dollars).toLocaleString("en-US")}`;
  return moneyExact(cents);
}

/** Headline and chart label. Full cents stay in tables and in question facts. */
export function moneyCompact(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) {
    const millions = dollars / 1_000_000;
    const digits = millions >= 10 ? 1 : 2;
    return `${sign}$${millions.toFixed(digits)}M`;
  }
  if (dollars >= 100_000) return `${sign}$${Math.round(dollars / 1_000)}K`;
  if (dollars >= 10_000) return `${sign}$${(dollars / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(dollars).toLocaleString("en-US")}`;
}

/** Compact axis label. Full figures stay on the cards and in the tables. */
export function moneyShort(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000_000) return `${sign}$${(dollars / 1_000_000_000).toFixed(1)}B`;
  if (dollars >= 1_000_000) return `${sign}$${Math.round(dollars / 1_000_000)}M`;
  if (dollars >= 10_000) return `${sign}$${Math.round(dollars / 1_000)}K`;
  return `${sign}$${Math.round(dollars).toLocaleString("en-US")}`;
}

export function pct(part: number, whole: number, digits = 1): string {
  if (!whole) return "n/a";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

export function isoDate(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(trimmed);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return "";
}

export function displayDate(iso: string | null | undefined): string {
  const normalized = isoDate(iso || "");
  if (!normalized) return "";
  const [y, m, d] = normalized.split("-");
  return `${m}/${d}/${y}`;
}

/** Month, day, and year with no leading zeros. One format for ranges and captions. */
export function shortDate(iso: string | null | undefined): string {
  const shown = displayDate(iso);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(shown);
  if (!match) return shown;
  return `${Number(match[1])}/${Number(match[2])}/${match[3]}`;
}

/** Fiscal start through the report date. Both dates include the year. */
export function vendorPaidRange(fyStart: string, asOf: string): string {
  return `Vendors paid from ${shortDate(fyStart)} through ${shortDate(asOf)}.`;
}

export function accountKey(fund: string, dept: string, objectCode: string, project: string): string {
  return `${fund}-${dept}-${objectCode}-${project}`;
}

export type Pace = "green" | "yellow" | "red" | "gray" | "none" | "under";

/**
 * Compare money spent with the year percent shown on the page (rounded to a whole number).
 * Promised but unpaid amounts are not part of the comparison.
 * In line means within 1 percentage point of that year percent.
 */
export function pace(revCents: number, ytdCents: number, _encCents: number, elapsedPct: number): Pace {
  if (ytdCents <= 0) return "none";
  if (revCents <= 0) return "red";
  if (ytdCents > revCents) return "red";
  const yearShown = Math.round(elapsedPct);
  const spentPct = (ytdCents / revCents) * 100;
  if (spentPct > yearShown + 1) return "yellow";
  if (spentPct < yearShown - 1) return "under";
  return "green";
}

export const PACE_LABEL: Record<Pace, string> = {
  green: "In line",
  yellow: "Spending more than the year's progress",
  red: "Over budget",
  gray: "No budget set in the county report",
  none: "No spending yet",
  under: "Under",
};

/** Short pill text. The long wording stays in the chart legend. */
export const PACE_PILL: Record<Pace, string> = {
  green: "In line",
  yellow: "Ahead",
  red: "Over budget",
  gray: "No budget set",
  none: "No spending yet",
  under: "Under",
};

/**
 * Not yet spent or promised: mid-year limit minus posted spending minus open orders.
 * That is the county report's Available Budget column.
 */
export function leftLabel(
  revCents: number,
  ytdCents: number,
  encCents = 0,
): { title: string; value: string; over: boolean; unbudgeted: boolean } {
  const open = Math.max(encCents, 0);
  if (revCents <= 0) {
    return { title: "Not yet spent or promised", value: "No budget set in the county report", over: false, unbudgeted: true };
  }
  const available = revCents - ytdCents - open;
  if (available < 0) {
    return { title: "Over budget by", value: money(-available), over: true, unbudgeted: false };
  }
  return { title: "Not yet spent or promised", value: money(available), over: false, unbudgeted: false };
}

/** One label for posted spending. The date is the report date, with no leading zeros. */
export function spentTerm(asOf: string | null | undefined, verb: "Spent" | "Released" = "Spent"): string {
  const shown = displayDate(asOf || "");
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(shown);
  const when = match ? `${Number(match[1])}/${Number(match[2])}/${match[3]}` : "the report date";
  return `${verb} (posted in the county's books through ${when})`;
}

export interface FiscalPosition {
  fyLabel: string;
  fyStart: string;
  fyEnd: string;
  asOf: string;
  elapsedDays: number;
  totalDays: number;
  elapsedPct: number;
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function inclusiveDays(startIso: string, endIso: string): number {
  return Math.round((utcDay(endIso) - utcDay(startIso)) / 86400000) + 1;
}

export function fiscalPosition(asOfRaw: string | null | undefined): FiscalPosition {
  const asOf = isoDate(asOfRaw || "") || "2026-09-15";
  const [yearText, monthText] = asOf.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startYear = month >= 10 ? year : year - 1;
  const fyStart = `${startYear}-10-01`;
  const fyEnd = `${startYear + 1}-09-30`;
  const elapsedDays = Math.max(0, inclusiveDays(fyStart, asOf > fyEnd ? fyEnd : asOf));
  const totalDays = inclusiveDays(fyStart, fyEnd);
  const elapsedPct = totalDays ? (elapsedDays / totalDays) * 100 : 0;
  return {
    fyLabel: String(startYear + 1),
    fyStart,
    fyEnd,
    asOf,
    elapsedDays,
    totalDays,
    elapsedPct,
  };
}

export function fyMonthIndex(payDate: string, fyStartYear: number): number | null {
  const iso = isoDate(payDate);
  if (!iso) return null;
  const [y, m] = iso.split("-").map(Number);
  if (y === fyStartYear && m >= 10) return m - 10;
  if (y === fyStartYear + 1 && m <= 9) return m + 2;
  return null;
}

export const FY_MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];

export interface FiscalMonth {
  ym: string;
  label: string;
  short: string;
}

/** Fiscal months from October through the month of the data-as-of date. Later months are omitted. */
export function fiscalYearMonths(asOfRaw: string | null | undefined): FiscalMonth[] {
  const fiscal = fiscalPosition(asOfRaw);
  const startYear = Number(fiscal.fyStart.slice(0, 4));
  const asYm = fiscal.asOf.slice(0, 7);
  const months: FiscalMonth[] = [];
  for (let i = 0; i < 12; i += 1) {
    const month = ((i + 9) % 12) + 1;
    const year = i < 3 ? startYear : startYear + 1;
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    if (ym > asYm) break;
    months.push({ ym, label: FY_MONTHS[i], short: FY_MONTHS[i].slice(0, 1) });
  }
  return months;
}

export function monthBounds(ym: string, asOf: string): { from: string; to: string } {
  const [yearText, monthText] = ym.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${ym}-01`;
  let to = `${ym}-${String(last).padStart(2, "0")}`;
  if (asOf && to > asOf) to = asOf;
  return { from, to };
}
