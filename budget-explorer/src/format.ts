export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  if (!whole) return "0.0%";
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

export function accountKey(fund: string, dept: string, objectCode: string, project: string): string {
  return `${fund}-${dept}-${objectCode}-${project}`;
}

export type Pace = "green" | "yellow" | "red" | "gray";

export function pace(revCents: number, ytdCents: number, encCents: number, elapsedPct: number): Pace {
  if (revCents <= 0) return ytdCents + encCents > 0 ? "red" : "gray";
  const used = ytdCents + encCents;
  if (used > revCents) return "red";
  const elapsed = elapsedPct / 100;
  if (used > revCents * elapsed) return "yellow";
  return "green";
}

export const PACE_LABEL: Record<Pace, string> = {
  green: "On pace",
  yellow: "Above pace",
  red: "Over budget",
  gray: "No budget",
};

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
