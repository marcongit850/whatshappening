import type { AccountRow, DeptRollup, FundRollup, ImportRow, MonthParts, NameMaps, OrgVendor, PaymentRow, PlatSnapshot, SearchFilters } from "./db";
import type { QaRecord } from "./qa";
import {
  PACE_LABEL,
  Pace,
  accountKey,
  displayDate,
  esc,
  fiscalPosition,
  fiscalYearMonths,
  money,
  moneyCompact,
  moneyExact,
  monthBounds,
  nameFor,
  pace,
  pct,
} from "./format";
import { FUND_COLORS, axisPercent, fundSlices, isTransferDepartment, lookPicks, paceDepartments, type SpendRow } from "./overview";

export interface ShellOpts {
  title: string;
  active: string;
  body: string;
  dataAsOf?: string | null;
  admin?: boolean;
  csrf?: string;
  fy?: string;
  bare?: boolean;
  showNames: boolean;
}

const NAV = [
  ["overview", "/", "Overview"],
  ["departments", "/departments", "Departments"],
  ["search", "/search", "Payments"],
  ["ask", "/ask", "Ask a question"],
  ["plat", "/plat", "Plat fee"],
  ["sheriff", "/sheriff", "Sheriff"],
  ["about", "/about", "About the data"],
];

export function page(opts: ShellOpts): string {
  const asOf = opts.dataAsOf ? displayDate(opts.dataAsOf) : "the latest published import";
  const nav = opts.bare
    ? ""
    : NAV.map(([key, href, label]) => `<a class="${opts.active === key ? "on" : ""}" href="${href}">${label}</a>`).join("");
  const adminLink = !opts.bare && opts.admin ? `<a class="${opts.active === "admin" ? "on" : ""}" href="/admin">Admin</a>` : "";
  const logout =
    !opts.bare && opts.csrf
      ? `<form method="post" action="/logout" style="display:inline"><input type="hidden" name="csrf" value="${esc(opts.csrf)}"><button class="linkish" type="submit">Log out</button></form>`
      : "";
  const payrollFooter = opts.showNames
    ? "Payroll rows can include employee names and individual pay."
    : "Payroll is shown as batch totals. Person names and individual pay are hidden.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(opts.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/app.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
<div class="private-strip">Private prototype. Not a county website.</div>
<div class="banner"><div class="banner-inner"><span class="banner-mark"></span><p>Unofficial. Built from public records provided by the Walton County Clerk and Comptroller. Data as of ${esc(asOf)}.</p></div></div>
<header class="site-header"><div class="header-inner">
<div class="header-top">
<a class="brand" href="/"><span class="brand-name">Budget Explorer</span><span class="brand-sub">Walton County, Florida</span></a>
<label class="nav-btn" for="nav-toggle">Menu</label>
</div>
<input class="nav-toggle" id="nav-toggle" type="checkbox">
<nav>${nav}${adminLink}${logout}</nav>
</div></header>
<main>${opts.body}</main>
<footer class="footer"><div class="footer-inner">Concept prototype for private review. Not affiliated with or endorsed by Walton County government. Figures are unaudited and may change. ${payrollFooter} No county seal is used.</div></footer>
<script src="/assets/app.js" defer></script>
</body></html>`;
}

function metric(label: string, value: string, note: string): string {
  return `<article class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-note">${note}</p></article>`;
}

function badge(unmatched: boolean): string {
  return unmatched ? `<span class="tag">unmatched</span>` : "";
}

function pill(status: Pace): string {
  return `<span class="pill ${status}">${PACE_LABEL[status]}</span>`;
}

function bar(rev: number, ytd: number, enc: number, elapsed: number, status: Pace): string {
  if (rev <= 0) return `<div class="bar" title="No revised budget"></div>`;
  const spent = Math.max(0, Math.min(100, (ytd / rev) * 100));
  const extra = Math.max(0, Math.min(100 - spent, (Math.max(enc, 0) / rev) * 100));
  return `<div class="bar" title="Spent ${spent.toFixed(1)} percent"><span class="bar-spent ${status}" style="width:${spent.toFixed(1)}%"></span><span class="bar-enc" style="left:${spent.toFixed(1)}%;width:${extra.toFixed(1)}%"></span><span class="bar-mark" style="left:${Math.max(0, Math.min(100, elapsed)).toFixed(1)}%"></span></div>`;
}

function deptName(row: { code: string; report_name?: string | null }, names: NameMaps): { primary: string; unmatched: boolean } {
  return nameFor(names.department.get(row.code), row.report_name || "", row.code);
}

function fundLabel(code: string, report: string, names: NameMaps): { primary: string; unmatched: boolean } {
  return nameFor(names.fund.get(code), report, code);
}

export function renderLogin(error: string, next: string, formToken = "", showNames = true): string {
  return page({
    title: "Sign in. Budget Explorer",
    active: "",
    csrf: "",
    bare: true,
    showNames,
    body: `<div class="login-wrap"><section class="login-card">
<p class="brand-kicker" style="color:var(--gold)">Private access</p>
<h1>Sign in</h1>
<p class="lede">One shared password opens this prototype. Nothing here is an official county system.</p>
${error ? `<p class="warning">${esc(error)}</p>` : ""}
<form class="stack" method="post" action="/login" data-busy>
<input type="hidden" name="next" value="${esc(next)}">
<input type="hidden" name="form_token" value="${esc(formToken)}">
<div><label for="password">Site password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
<button class="btn" type="submit">Continue</button>
</form>
</section></div>`,
  });
}

export const OVERVIEW_QUESTIONS = [
  "What has the county spent on Recreation Plat Fees?",
  "How much has department 11444000 spent?",
  "Which departments are over their revised budget?",
];

export function renderOverview(opts: {
  row: ImportRow;
  departments: DeptRollup[];
  funds: FundRollup[];
  fundReports: Map<string, string>;
  names: NameMaps;
  months: MonthParts[];
  vendors: OrgVendor[];
  officeCents: number;
  landByMonth: { ym: string; cents: number }[];
  landByDept: Map<string, number>;
  platMonths: MonthParts[];
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const spentPct = opts.row.rev_cents ? (opts.row.ytd_cents / opts.row.rev_cents) * 100 : 0;
  const withEncPct = opts.row.rev_cents ? ((opts.row.ytd_cents + opts.row.enc_cents) / opts.row.rev_cents) * 100 : 0;
  const availPct = opts.row.rev_cents ? (opts.row.avail_cents / opts.row.rev_cents) * 100 : 0;
  const paceWord = spentPct + 0.05 < fiscal.elapsedPct ? "below" : spentPct > fiscal.elapsedPct + 0.05 ? "ahead of" : "with";
  const fundRows = opts.funds.map((fund) => ({
    code: fund.code,
    fund_code: fund.code,
    report_name: fund.report_name,
    rev_cents: fund.rev_cents,
    ytd_cents: fund.ytd_cents,
    enc_cents: fund.enc_cents,
  }));
  const deptRows: SpendRow[] = opts.departments.map((dept) => ({
    code: dept.code,
    fund_code: dept.fund_code,
    report_name: dept.report_name,
    rev_cents: dept.rev_cents,
    ytd_cents: dept.ytd_cents,
    enc_cents: dept.enc_cents,
  }));
  const fundLabelOf = (row: SpendRow) => fundLabel(row.code, opts.fundReports.get(row.code) || row.report_name, opts.names).primary;
  const deptLabelOf = (row: SpendRow) => deptName({ code: row.code, report_name: row.report_name }, opts.names).primary;
  const slices = fundSlices(fundRows, fundLabelOf);
  const paced = paceDepartments(deptRows, opts.names.department);
  const transferCents = deptRows
    .filter((row) => isTransferDepartment(row.report_name, opts.names.department.get(row.code) || ""))
    .reduce((sum, row) => sum + row.ytd_cents, 0);
  const looks = lookPicks(deptRows, fundRows, deptLabelOf, fundLabelOf, opts.landByDept, fiscal.elapsedPct, opts.names.department);
  const monthIndex = new Map(opts.months.map((row) => [row.ym, row]));
  const platIndex = new Map(opts.platMonths.map((row) => [row.ym, row]));
  const fyMonths = fiscalYearMonths(opts.row.data_as_of);
  const body = `
${askBox(opts.csrf)}
<section class="hero">
<div>
<div class="eyebrow">Fiscal year ${esc(fiscal.fyLabel)} &middot; Oct 1, ${esc(fiscal.fyStart.slice(0, 4))} to Sep 30, ${esc(fiscal.fyEnd.slice(0, 4))}</div>
<h1>The county has spent <em><a href="/search">${esc(moneyCompact(opts.row.ytd_cents))}</a></em>, or ${spentPct.toFixed(1)}% of its ${esc(moneyCompact(opts.row.rev_cents))} budget, with ${fiscal.elapsedPct.toFixed(1)}% of the year gone.</h1>
<p class="lead">Budget to actual spending, from the county's year to date report. Everything below is drawn from that report and updates when a new one is published.</p>
</div>
<div class="card pace">
<div class="eyebrow">Budget used and year elapsed</div>
<div class="row"><div class="t"><span>Budget spent so far</span><b>${spentPct.toFixed(1)}%</b></div><div class="meter"><div style="width:${Math.min(spentPct, 100).toFixed(2)}%;background:var(--teal)"></div></div></div>
<div class="row"><div class="t"><span>Fiscal year elapsed (day ${fiscal.elapsedDays} of ${fiscal.totalDays})</span><b>${fiscal.elapsedPct.toFixed(1)}%</b></div><div class="meter"><div style="width:${Math.min(fiscal.elapsedPct, 100).toFixed(2)}%;background:var(--gold)"></div></div></div>
<p class="note">Overall, spending is running ${paceWord} the calendar. Add ${esc(moneyCompact(opts.row.enc_cents))} already committed (encumbered) and ${withEncPct.toFixed(1)}% of the budget is spent or committed.</p>
</div>
</section>
<section class="kpis">
<a class="card kpi k1" href="/departments"><div class="l">Revised budget</div><div class="n">${esc(moneyCompact(opts.row.rev_cents))}</div><div class="s">${esc(moneyCompact(opts.row.orig_cents))} original plus ${esc(moneyCompact(opts.row.adj_cents))} in amendments</div></a>
<a class="card kpi k2" href="/search"><div class="l">Spent so far</div><div class="n">${esc(moneyCompact(opts.row.ytd_cents))}</div><div class="s">${spentPct.toFixed(1)}% of the revised budget</div></a>
<a class="card kpi k3" href="/departments?sort=enc"><div class="l">Encumbered</div><div class="n">${esc(moneyCompact(opts.row.enc_cents))}</div><div class="s">Committed to open orders and contracts</div></a>
<a class="card kpi k4" href="/departments?sort=avail"><div class="l">Still available</div><div class="n">${esc(moneyCompact(opts.row.avail_cents))}</div><div class="s">${availPct.toFixed(1)}% of the revised budget</div></a>
</section>
<section class="grid2">
<div class="card">
<div class="eyebrow">By fund</div>
<h2>Where the money is, fund by fund</h2>
<p class="cap">Spending against each fund's revised budget.</p>
<div class="legend"><span><i style="background:var(--teal)"></i>Spent</span><span><i class="swatch-enc"></i>Encumbered</span><span><i style="background:#e9e5d8"></i>Revised budget</span></div>
${fundBars(slices)}
</div>
<div class="card">
<div class="eyebrow">Share of spending</div>
<h2>Who spends the most</h2>
<p class="cap">Each fund's share of the ${esc(moneyCompact(opts.row.ytd_cents))} spent.</p>
${shareDonut(slices, opts.row.ytd_cents)}
</div>
</section>
${paceSection(paced, opts, fiscal.elapsedPct, transferCents)}
<section class="grid2b">
${monthCard(fyMonths, monthIndex, opts.landByMonth, opts.row)}
${vendorCard(opts.vendors, opts.officeCents, fiscal)}
</section>
<section class="grid2 g3">
${lookCard(looks)}
${platCard(opts.funds, opts.names, fyMonths, platIndex, opts.row.data_as_of || "")}
</section>
<p class="sources"><b>Sources.</b> Walton County year to date budget report, data as of ${esc(displayDate(opts.row.data_as_of))}, as provided by the Walton County Clerk and Comptroller. Spent figures include transfers between funds. ${opts.row.after_cutoff_count === 1 ? "1 payment line" : `${opts.row.after_cutoff_count.toLocaleString("en-US")} payment lines`} dated after ${esc(displayDate(opts.row.data_as_of))} ${opts.row.after_cutoff_count === 1 ? "is" : "are"} left out of the monthly chart and vendor totals.</p>`;
  return page({
    title: "Overview. Budget Explorer",
    active: "overview",
    body,
    dataAsOf: opts.row.data_as_of,
    admin: opts.isAdmin,
    csrf: opts.csrf,
    fy: fiscal.fyLabel,
    showNames: opts.showNames,
  });
}

function askBox(csrf: string): string {
  const examples = OVERVIEW_QUESTIONS.map(
    (question) => `<form method="post" action="/ask"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="example" type="submit" name="question" value="${esc(question)}">${esc(question)}</button></form>`,
  ).join("");
  return `<section class="ask-hero card">
<div class="eyebrow">Questions</div>
<h2>Ask a question about the budget</h2>
<p class="cap">Answers are calculated from this report. They cite the account keys and counts used.</p>
<form method="post" action="/ask" data-busy>
<input type="hidden" name="csrf" value="${esc(csrf)}">
<div class="ask-row">
<label class="sr" for="home-question">Ask a question about the budget</label>
<input id="home-question" name="question" type="text" maxlength="500" required placeholder="Ask a question about the budget" autocomplete="off">
<button class="btn" type="submit">Ask</button>
</div>
</form>
<div class="examples">${examples}</div>
</section>`;
}

function fundBars(slices: ReturnType<typeof fundSlices>): string {
  const max = Math.max(...slices.map((slice) => Math.max(slice.rev, slice.ytd + slice.enc)), 1);
  return slices
    .map((slice) => {
      const used = slice.rev ? Math.round((slice.ytd / slice.rev) * 100) : 0;
      const wRev = (slice.rev / max) * 100;
      const wYtd = (Math.max(slice.ytd, 0) / max) * 100;
      const wEnc = (Math.max(slice.enc, 0) / max) * 100;
      return `<a class="brow" href="${esc(slice.href)}"><div class="btop"><div class="blabel"><b>${esc(slice.name)}</b></div><div class="bval"><b>${esc(moneyCompact(slice.ytd))}</b><span> of ${esc(moneyCompact(slice.rev))} &middot; ${used}% used</span></div></div>
<div class="btrack"><div class="bbudget" style="width:${wRev.toFixed(2)}%"></div><div class="bspent" style="width:${wYtd.toFixed(2)}%"></div><div class="benc" style="left:${wYtd.toFixed(2)}%;width:${wEnc.toFixed(2)}%"></div></div></a>`;
    })
    .join("");
}

function shareDonut(slices: ReturnType<typeof fundSlices>, total: number): string {
  if (total <= 0) return `<p class="cap">No spending is recorded in this import.</p>`;
  const r = 72;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices
    .map((slice, index) => {
      const length = (slice.ytd / total) * c;
      const drawn = Math.max(length - 1.5, 0);
      const color = FUND_COLORS[index] || FUND_COLORS[FUND_COLORS.length - 1];
      const arc = `<a href="${esc(slice.href)}"><circle r="${r}" cx="100" cy="100" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${drawn.toFixed(2)} ${(c - drawn).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(slice.name)}</title></circle></a>`;
      offset += length;
      return slice.ytd > 0 ? arc : "";
    })
    .join("");
  const legend = slices
    .map((slice, index) => {
      const color = FUND_COLORS[index] || FUND_COLORS[FUND_COLORS.length - 1];
      const share = total ? (slice.ytd / total) * 100 : 0;
      return `<a class="lg" href="${esc(slice.href)}"><i style="background:${color}"></i><span>${esc(slice.name)}</span><b>${share.toFixed(1)}%</b></a>`;
    })
    .join("");
  return `<div class="donutwrap"><svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Share of spending by fund">${arcs}<text x="100" y="95" text-anchor="middle" class="dn1">${esc(moneyCompact(total))}</text><text x="100" y="118" text-anchor="middle" class="dn2">spent in total</text></svg><div class="lgs">${legend}</div></div>`;
}

function paceSection(rows: SpendRow[], opts: { names: NameMaps; fundReports: Map<string, string> }, elapsedPct: number, transferCents: number): string {
  const marker = axisPercent(elapsedPct);
  const guides = [25, 50, 75, 100, 125].map((mark) => `<div class="gl" style="left:${axisPercent(mark).toFixed(2)}%"></div>`).join("");
  const axis = [0, 25, 50, 75, 100, 125]
    .map((mark) => `<i style="left:${axisPercent(mark).toFixed(2)}%"></i><u style="left:${axisPercent(mark).toFixed(2)}%">${mark}%</u>`)
    .join("");
  const list = rows
    .map((row) => {
      const status = pace(row.rev_cents, row.ytd_cents, row.enc_cents, elapsedPct);
      const spent = row.rev_cents ? (row.ytd_cents / row.rev_cents) * 100 : 0;
      const enc = row.rev_cents ? (Math.max(row.enc_cents, 0) / row.rev_cents) * 100 : 0;
      const spentPos = axisPercent(spent);
      const encPos = Math.max(axisPercent(spent + enc) - spentPos, 0);
      const named = deptName({ code: row.code, report_name: row.report_name }, opts.names);
      const fund = fundLabel(row.fund_code, opts.fundReports.get(row.fund_code) || "", opts.names);
      return `<a class="drow" href="/departments/${esc(row.code)}"><div class="dname"><b>${esc(named.primary)}</b><span>${esc(fund.primary)}</span></div>
<div class="dplot"><div class="pm" style="left:${marker.toFixed(2)}%"></div><div class="dbar ${status}" style="width:${spentPos.toFixed(2)}%"></div><div class="denc ${status}" style="left:${spentPos.toFixed(2)}%;width:${encPos.toFixed(2)}%"></div></div>
<div class="dnum"><b>${Math.round(spent)}%</b><span>${esc(moneyCompact(row.ytd_cents))} of ${esc(moneyCompact(row.rev_cents))}</span></div>
<div class="dstat"><em class="pill ${status}">${PACE_LABEL[status]}</em></div></a>`;
    })
    .join("");
  return `<section class="card pace-card"><div class="eyebrow">By department</div><h2>Are departments spending on pace?</h2>
<p class="cap">The ${rows.length} departments with the largest budgets. The dark line marks where a steady spender would be today: ${elapsedPct.toFixed(0)}% of the year is gone.</p>
<div class="legend"><span><i style="background:var(--g)"></i>On pace or below</span><span><i style="background:var(--y)"></i>Above pace</span><span><i style="background:var(--r)"></i>Over budget (spent plus committed)</span><span><i class="swatch-hatch"></i>Encumbered</span></div>
<div class="plotarea"><div class="axis top"></div><div class="pacew"><div class="tag" style="left:${marker.toFixed(2)}%">Expected pace ${elapsedPct.toFixed(0)}%</div>${guides}</div>
${list}
<div class="axis">${axis}</div></div>
<div class="mobpace">The line at ${elapsedPct.toFixed(0)}% of budget marks the expected pace today.</div>
<p class="mnote">Percent shown is spent as a share of each department's revised budget. Transfers between funds (${esc(moneyCompact(transferCents))} in total) are left out of this chart.</p></section>`;
}

function monthCard(months: { ym: string; label: string; short: string }[], index: Map<string, MonthParts>, land: { ym: string; cents: number }[], row: ImportRow): string {
  const totals = months.map((month) => {
    const parts = index.get(month.ym) || { ym: month.ym, vendor_cents: 0, payroll_cents: 0, other_cents: 0, journal_cents: 0 };
    return { ...month, ...parts, shown: parts.vendor_cents + parts.payroll_cents + parts.other_cents };
  });
  const max = Math.max(...totals.map((month) => month.shown), 1);
  const height = 280;
  const columns = totals
    .map((month) => {
      const bounds = monthBounds(month.ym, row.data_as_of || "");
      const vendor = (month.vendor_cents / max) * height;
      const payroll = (month.payroll_cents / max) * height;
      const other = (month.other_cents / max) * height;
      return `<a class="mcol" href="/search?from=${esc(bounds.from)}&amp;to=${esc(bounds.to)}"><div class="mval">${esc(moneyCompact(month.shown))}</div><div class="mstack" style="height:${height}px"><div class="seg o" style="height:${other.toFixed(1)}px"></div><div class="seg p" style="height:${payroll.toFixed(1)}px"></div><div class="seg v" style="height:${vendor.toFixed(1)}px"></div></div><div class="mlab"><span class="long">${month.label}</span><span class="short">${month.short}</span></div></a>`;
    })
    .join("");
  const journal = totals.reduce((sum, month) => sum + month.journal_cents, 0);
  const landNote = land
    .filter((item) => item.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 2)
    .map((item) => {
      const label = months.find((month) => month.ym === item.ym)?.label || item.ym;
      return `${moneyCompact(item.cents)} of ${label}`;
    });
  const landSentence = landNote.length ? `Land purchases coded to account 561000 account for ${landNote.join(" and ")}. ` : "";
  return `<div class="card"><div class="eyebrow">Over time</div><h2>Spending by month</h2>
<p class="cap">Payments and payroll posted each month, October through ${esc(displayDate(row.data_as_of))}.</p>
<div class="legend"><span><i style="background:var(--teal)"></i>Vendor payments</span><span><i style="background:var(--gold)"></i>Payroll batches</span><span><i style="background:#9aa7b0"></i>Other</span></div>
<div class="mchart">${columns}</div>
<p class="mnote">${esc(landSentence)}Excludes ${esc(moneyCompact(journal))} of internal journal entries and transfers between funds. Payroll shows batch totals only. Lines dated after ${esc(displayDate(row.data_as_of))} are left out.</p></div>`;
}

function vendorCard(vendors: OrgVendor[], officeCents: number, fiscal: { fyStart: string; asOf: string }): string {
  const max = vendors[0]?.cents || 1;
  const rows = vendors
    .map((vendor, index) => {
      const width = max ? (vendor.cents / max) * 100 : 0;
      const href = `/search?vendor=${encodeURIComponent(vendor.vendor_name)}&from=${fiscal.fyStart}&to=${fiscal.asOf}`;
      return `<a class="vrow" href="${esc(href)}"><div class="vn"><span class="rk">${index + 1}</span>${esc(vendor.vendor_name)}</div><div class="vt"><div class="vb" style="width:${width.toFixed(2)}%"></div></div><div class="vv">${esc(moneyCompact(vendor.cents))}</div></a>`;
    })
    .join("");
  const land = vendors[0]?.land_cents || 0;
  const landSentence = land > 0 ? `The largest vendor total includes ${moneyCompact(land)} coded to Land (account 561000). ` : "";
  const officeSentence = officeCents > 0 ? `Payments to the Sheriff, Clerk, Property Appraiser, and Supervisor of Elections (${moneyCompact(officeCents)}) are budget transfers and are not shown. ` : "";
  return `<div class="card"><div class="eyebrow">Vendors</div><h2>Top 10 vendors by amount paid</h2>
<p class="cap">Businesses and organizations paid from October 1 through ${esc(displayDate(fiscal.asOf))}.</p>
${rows || `<p class="cap">No organization payments are in this import.</p>`}
<p class="mnote">${esc(landSentence)}${esc(officeSentence)}People, payroll, and individual pay are not listed. Names are shortened as printed in the county report.</p></div>`;
}

function lookCard(picks: ReturnType<typeof lookPicks>): string {
  const items = picks
    .map((pick) => {
      if (pick.kind === "committed") {
        return `<a class="item i3" href="${esc(pick.href)}"><span class="tagl">Committed</span><h3>${esc(pick.title)}</h3><div class="big">${esc(moneyCompact(pick.enc))}</div><div class="vs">encumbered</div><p>That is ${pick.encShare.toFixed(0)}% of all encumbrances countywide, against ${esc(moneyCompact(pick.spent))} spent so far.</p></a>`;
      }
      const detail = pick.land > 0
        ? `Includes ${moneyCompact(pick.land)} coded to Land (account 561000). This may reflect an amendment not in this report.`
        : pick.enc > 0
          ? `Another ${moneyCompact(pick.enc)} is encumbered. This may reflect an amendment not in this report.`
          : "This may reflect an amendment not in this report.";
      return `<a class="item" href="${esc(pick.href)}"><span class="tagl">Over budget</span><h3>${esc(pick.title)}</h3><div class="big">${esc(moneyCompact(pick.spent))}</div><div class="vs">spent vs ${esc(moneyCompact(pick.budget))} budget</div><p>${esc(detail)}</p></a>`;
    })
    .join("");
  const empty = picks.length ? "" : `<p class="cap">No department is over its revised budget in this report.</p>`;
  return `<div class="card"><div class="eyebrow warn-label">Worth a look</div><h2>What stands out</h2><p class="cap">Drawn from the numbers above.</p><div class="look">${items}</div>${empty}</div>`;
}

function platCard(funds: FundRollup[], names: NameMaps, months: { ym: string; label: string; short: string }[], index: Map<string, MonthParts>, asOf: string): string {
  const fund = funds.find((row) => row.code === "114");
  if (!fund) {
    return `<div class="card plat"><div class="eyebrow">Fund 114</div><h2>Recreation Plat Fee</h2><p class="cap">This import has no fund 114.</p></div>`;
  }
  const named = fundLabel(fund.code, fund.report_name, names).primary;
  const used = fund.rev_cents ? (fund.ytd_cents / fund.rev_cents) * 100 : 0;
  const available = fund.rev_cents - fund.ytd_cents - fund.enc_cents;
  const heights = months.map((month) => {
    const parts = index.get(month.ym);
    const cents = parts ? parts.vendor_cents + parts.payroll_cents + parts.other_cents : 0;
    return { ...month, cents };
  });
  const max = Math.max(...heights.map((month) => month.cents), 1);
  const bars = heights
    .map((month) => {
      const bounds = monthBounds(month.ym, asOf);
      const height = Math.max((month.cents / max) * 70, month.cents > 0 ? 4 : 2);
      return `<a class="pc" href="/search?fund=114&amp;from=${esc(bounds.from)}&amp;to=${esc(bounds.to)}"><div style="height:${height.toFixed(1)}px"></div><span>${month.short}</span></a>`;
    })
    .join("");
  return `<div class="card plat"><div class="eyebrow">Fund 114</div><h2><a href="/funds/114">${esc(named)}</a></h2><p class="cap">Fees set aside for county recreation.</p>
<div class="n"><a href="/search?fund=114">${esc(moneyCompact(fund.ytd_cents))}</a></div>
<div class="s">spent of ${esc(moneyCompact(fund.rev_cents))} revised budget</div>
<div class="meter" style="margin:16px 0 8px"><div style="width:${Math.min(used, 100).toFixed(1)}%"></div></div>
<div class="s">${used.toFixed(1)}% used &middot; ${esc(moneyCompact(fund.enc_cents))} encumbered &middot; ${esc(moneyCompact(available))} available</div>
<div class="pcs">${bars}</div>
<a class="plat-btn" href="/plat">See Plat Fee detail</a></div>`;
}

export function renderFunds(opts: {
  row: ImportRow;
  funds: FundRollup[];
  names: NameMaps;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const rows = [...opts.funds]
    .sort((a, b) => b.ytd_cents - a.ytd_cents)
    .map((fund) => {
      const named = fundLabel(fund.code, fund.report_name, opts.names);
      return `<tr><td><a class="name" href="/funds/${esc(fund.code)}">${esc(named.primary)}</a></td><td class="mono">${esc(fund.code)}</td><td class="num">${money(fund.rev_cents)}</td><td class="num">${money(fund.ytd_cents)}</td><td class="num">${money(fund.enc_cents)}</td><td class="num">${pct(fund.ytd_cents, fund.rev_cents)}</td></tr>`;
    })
    .join("");
  const body = `<p class="crumb"><a href="/">Overview</a> / Funds</p><h1>Funds</h1><p class="lede">Each fund in the published import. Open a fund to see its departments and accounts.</p>
<section class="panel"><div class="table-wrap"><table><thead><tr><th>Fund</th><th>Code</th><th class="num">Revised</th><th class="num">Spent</th><th class="num">Encumbered</th><th class="num">% used</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  return page({ title: "Funds. Budget Explorer", active: "overview", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

export function renderFund(opts: {
  row: ImportRow;
  fund: FundRollup;
  departments: DeptRollup[];
  names: NameMaps;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const named = fundLabel(opts.fund.code, opts.fund.report_name, opts.names);
  const rows = opts.departments
    .map((dept) => {
      const deptNamed = deptName(dept, opts.names);
      const status = pace(dept.rev_cents, dept.ytd_cents, dept.enc_cents, fiscal.elapsedPct);
      return `<tr><td><a class="name" href="/departments/${esc(dept.code)}">${esc(deptNamed.primary)}</a></td><td class="num">${money(dept.rev_cents)}</td><td class="num">${money(dept.ytd_cents)}</td><td class="num">${money(dept.enc_cents)}</td><td class="num">${pct(dept.ytd_cents, dept.rev_cents)}</td><td>${pill(status)}</td></tr>`;
    })
    .join("");
  const body = `<p class="crumb"><a href="/">Overview</a> / <a href="/funds">Funds</a> / ${esc(opts.fund.code)}</p>
<h1>${esc(named.primary)}</h1>
<p class="lede">Fund ${esc(opts.fund.code)}. Open a department to see its accounts. <a href="/search?fund=${esc(opts.fund.code)}">Payments in this fund</a></p>
<section class="metrics">
${metric("Revised budget", money(opts.fund.rev_cents), `Original ${money(opts.fund.orig_cents)}`)}
${metric("Spent", money(opts.fund.ytd_cents), `${pct(opts.fund.ytd_cents, opts.fund.rev_cents)} of revised budget`)}
${metric("Encumbered", money(opts.fund.enc_cents), "Committed, not yet paid")}
${metric("Available", money(opts.fund.avail_cents), "Budget less spent and encumbered")}
</section>
<section class="panel"><h2>Departments in this fund</h2><div class="table-wrap"><table>
<thead><tr><th>Department</th><th class="num">Revised</th><th class="num">Spent</th><th class="num">Encumbered</th><th class="num">% used</th><th>Status</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="empty">No departments in this fund.</td></tr>`}</tbody>
</table></div></section>`;
  return page({ title: `${named.primary}. Budget Explorer`, active: "overview", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

export function renderDepartments(opts: { row: ImportRow; departments: DeptRollup[]; fundReports: Map<string, string>; names: NameMaps; csrf: string; isAdmin: boolean; showNames: boolean; sort?: string }): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const sortNote = opts.sort === "enc" ? "Sorted by encumbrance." : opts.sort === "spent" ? "Sorted by amount spent." : opts.sort === "avail" ? "Sorted by amount still available." : "Sorted by revised budget.";
  const rows = opts.departments
    .map((dept) => {
      const status = pace(dept.rev_cents, dept.ytd_cents, dept.enc_cents, fiscal.elapsedPct);
      const named = deptName(dept, opts.names);
      const fund = fundLabel(dept.fund_code || "", opts.fundReports.get(dept.fund_code) || "", opts.names);
      return `<tr>
<td><a class="name" href="/departments/${esc(dept.code)}">${esc(named.primary)}</a>${badge(named.unmatched)}<div class="code">${esc(dept.code)} · ${esc(fund.primary)} · ${dept.accounts} accounts</div></td>
<td class="num">${money(dept.rev_cents)}</td>
<td class="num">${money(dept.ytd_cents)}</td>
<td class="num">${money(dept.enc_cents)}</td>
<td class="num">${pct(dept.ytd_cents, dept.rev_cents)}</td>
<td>${pill(status)}</td>
</tr>`;
    })
    .join("");
  const body = `<h1>Departments</h1><p class="lede">${opts.departments.length} departments in the published import. ${sortNote} Names come from the chart of accounts. A code with no chart name is marked unmatched.</p>
<section class="panel"><div class="table-wrap"><table>
<thead><tr><th>Department</th><th class="num">Revised</th><th class="num">Spent</th><th class="num">Encumbered</th><th class="num">% used</th><th>Status</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="empty">No departments in this import.</td></tr>`}</tbody>
</table></div></section>`;
  return page({ title: "Departments. Budget Explorer", active: "departments", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

export function renderDepartment(opts: {
  row: ImportRow;
  dept: DeptRollup;
  accounts: AccountRow[];
  fundReport: string;
  names: NameMaps;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const named = deptName(opts.dept, opts.names);
  const fund = fundLabel(opts.dept.fund_code || "", opts.fundReport, opts.names);
  const status = pace(opts.dept.rev_cents, opts.dept.ytd_cents, opts.dept.enc_cents, fiscal.elapsedPct);
  const available = opts.dept.rev_cents - opts.dept.ytd_cents - opts.dept.enc_cents;
  const rows = opts.accounts
    .map((account) => {
      const accountStatus = pace(account.rev_cents, account.ytd_cents, account.enc_cents, fiscal.elapsedPct);
      const objectName = nameFor(opts.names.object.get(account.object_code), account.title || "", account.object_code);
      const project = account.project_code ? `-${account.project_code}` : "";
      const href = `/departments/${esc(account.dept_code)}/${esc(account.object_code)}/${esc(account.project_code || "_")}`;
      const payroll = account.is_payroll ? `<span class="code">${opts.showNames ? " names and pay" : " batch totals"}</span>` : "";
      return `<tr>
<td><a class="mono" href="${href}">${esc(account.object_code)}${esc(project)}</a> <a class="name" href="${href}">${esc(objectName.primary)}</a>${badge(objectName.unmatched)}${payroll}</td>
<td class="num">${money(account.rev_cents)}</td>
<td class="num">${money(account.ytd_cents)}</td>
<td class="num">${money(account.enc_cents)}</td>
<td>${bar(account.rev_cents, account.ytd_cents, account.enc_cents, fiscal.elapsedPct, accountStatus)}</td>
<td class="num">${pct(account.ytd_cents, account.rev_cents)}</td>
<td>${pill(accountStatus)}</td>
</tr>`;
    })
    .join("");
  const body = `
<p class="crumb"><a href="/">Overview</a> / <a href="/departments">Departments</a> / ${esc(opts.dept.code)}</p>
<h1>${esc(named.primary)}${badge(named.unmatched)}</h1>
<p class="lede">${esc(fund.primary)} · ${opts.accounts.length} accounts · ${pill(status)}</p>
<section class="metrics">
${metric("Revised budget", money(opts.dept.rev_cents), `Original ${money(opts.dept.orig_cents)}`)}
${metric("Spent", money(opts.dept.ytd_cents), `${pct(opts.dept.ytd_cents, opts.dept.rev_cents)} of revised budget`)}
${metric("Encumbered", money(opts.dept.enc_cents), "Committed, not yet paid")}
${metric("Available", money(available), "Budget less spent and encumbered")}
</section>
<section class="panel">
<h2>Accounts in this department</h2>
<p class="hint">Open an account to see its payments. ${opts.showNames ? "Payroll accounts list employee names and individual pay." : "Payroll accounts list batch totals. Person names and individual pay are hidden."}</p>
<div class="table-wrap"><table>
<thead><tr><th>Account</th><th class="num">Revised budget</th><th class="num">Spent</th><th class="num">Encumbered</th><th>Spent and encumbered vs. budget</th><th class="num">% used</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
</section>`;
  return page({ title: `${named.primary}. Budget Explorer`, active: "departments", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

export function renderAccount(opts: {
  row: ImportRow;
  account: AccountRow;
  payments: PaymentRow[];
  total: number;
  pageIndex: number;
  pageSize: number;
  names: NameMaps;
  deptReport: string;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const objectName = nameFor(opts.names.object.get(opts.account.object_code), opts.account.title || "", opts.account.object_code);
  const dept = nameFor(opts.names.department.get(opts.account.dept_code), opts.deptReport, opts.account.dept_code);
  const pages = Math.max(1, Math.ceil(opts.total / opts.pageSize));
  const rows = opts.payments
    .map(
      (payment) => `<tr>
<td>${esc(displayDate(payment.pay_date))}</td>
<td class="name">${esc(payment.vendor_name || "unmatched")}</td>
<td class="mono">${esc(payment.invoice || "")}</td>
<td>${esc(payment.description || "")}</td>
<td class="mono">${esc(payment.check_number || "")}</td>
<td class="num">${moneyExact(payment.amount_cents)}</td>
</tr>`,
    )
    .join("");
  const base = `/departments/${opts.account.dept_code}/${opts.account.object_code}/${opts.account.project_code || "_"}`;
  const payrollNote = opts.account.is_payroll
    ? opts.showNames
      ? `<p class="note">This is a payroll account. Employee names and individual pay are shown.</p>`
      : `<p class="note">This is a payroll account. Totals that clear the group minimum are labeled Payroll (batch total). Smaller groups are combined as Other payroll when that total also clears the minimum, and left off this list when it does not. Person names and individual pay are hidden.</p>`
    : "";
  const table = `<div class="table-wrap"><table>
<thead><tr><th>Date</th><th>Vendor</th><th>Invoice number</th><th>Description</th><th>Check number</th><th class="num">Amount</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="empty">No visible payment lines. Lines dated after the report date are stored and excluded here.</td></tr>`}</tbody>
</table></div>${pager(opts.pageIndex, pages, (index) => `${base}?page=${index + 1}`)}`;
  const body = `
<p class="crumb"><a href="/departments/${esc(opts.account.dept_code)}">${esc(dept.primary)}</a> / ${esc(opts.account.object_code)}</p>
<h1>${esc(objectName.primary)}${badge(objectName.unmatched)}</h1>
<p class="lede">Account ${esc(accountKey(opts.account.fund_code, opts.account.dept_code, opts.account.object_code, opts.account.project_code))} · revised ${money(opts.account.rev_cents)} · spent ${moneyExact(opts.account.ytd_cents)}</p>
<section class="panel">
<h2>Payments</h2>
<p class="hint">${opts.total.toLocaleString("en-US")} visible lines. Vendor names and descriptions are shortened in the Clerk's report, so the invoice number and check number are the reliable way to find a payment.</p>
${payrollNote}
${table}
</section>`;
  return page({ title: `${objectName.primary}. Budget Explorer`, active: "departments", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

export function renderSearch(opts: {
  row: ImportRow;
  filters: SearchFilters;
  departments: DeptRollup[];
  fundReports: Map<string, string>;
  names: NameMaps;
  payments: PaymentRow[];
  total: number;
  totalCents: number;
  pageIndex: number;
  pageSize: number;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const pages = Math.max(1, Math.ceil(opts.total / opts.pageSize));
  const fundCodes = [...new Set(opts.departments.map((dept) => dept.fund_code).filter(Boolean))].sort();
  const fundOptions = [`<option value="">All funds</option>`]
    .concat(
      fundCodes.map((code) => {
        const named = fundLabel(code, opts.fundReports.get(code) || "", opts.names);
        const selected = opts.filters.fund === code ? " selected" : "";
        return `<option value="${esc(code)}"${selected}>${esc(code)} ${esc(named.primary)}</option>`;
      }),
    )
    .join("");
  const options = [`<option value="">All departments</option>`]
    .concat(
      opts.departments.map((dept) => {
        const named = deptName(dept, opts.names);
        const selected = opts.filters.dept === dept.code ? " selected" : "";
        return `<option value="${esc(dept.code)}"${selected}>${esc(dept.code)} ${esc(named.primary)}</option>`;
      }),
    )
    .join("");
  const rows = opts.payments
    .map((payment) => {
      const named = nameFor(opts.names.department.get(payment.dept_code), "", payment.dept_code);
      return `<tr>
<td>${esc(displayDate(payment.pay_date))}</td>
<td class="name">${esc(payment.vendor_name || "")}</td>
<td class="mono">${esc(payment.invoice || "")}</td>
<td>${esc(payment.description || "")}</td>
<td><a href="/departments/${esc(payment.dept_code)}">${esc(named.primary)}</a></td>
<td class="mono">${esc(payment.check_number || "")}</td>
<td class="num">${moneyExact(payment.amount_cents)}</td>
</tr>`;
    })
    .join("");
  const query = searchQuery(opts.filters);
  const body = `
<h1>Payment search</h1>
<p class="lede">Search payment lines in the published import. ${opts.showNames ? "Employee names and individual pay are included." : "Payroll is included as batch totals. Person names and individual pay are hidden."} Lines dated after ${esc(displayDate(opts.row.data_as_of))} are stored and excluded.</p>
<section class="panel">
<form method="get" action="/search">
<div class="filters">
<div><label for="q">${opts.showNames ? "Vendor, employee, invoice, check, or description" : "Vendor, invoice, check, or description"}</label><input id="q" name="q" type="search" value="${esc(opts.filters.q)}"></div>
<div><label for="fund">Fund</label><select id="fund" name="fund">${fundOptions}</select></div>
<div><label for="dept">Department</label><select id="dept" name="dept">${options}</select></div>
<div><label for="vendor">Vendor name</label><input id="vendor" name="vendor" type="text" value="${esc(opts.filters.vendor)}"></div>
<div><label for="min">Minimum amount</label><input id="min" name="min" type="text" inputmode="decimal" value="${esc(opts.filters.minCents ? (opts.filters.minCents / 100).toString() : "")}"></div>
<div><label for="from">From date</label><input id="from" name="from" type="date" value="${esc(opts.filters.from)}"></div>
<div><label for="to">To date</label><input id="to" name="to" type="date" value="${esc(opts.filters.to)}"></div>
<div><button class="btn" type="submit">Search</button></div>
</div>
</form>
</section>
<section class="panel">
<h2>${opts.total.toLocaleString("en-US")} payments found, totaling ${moneyExact(opts.totalCents)}</h2>
<p class="hint">Sorted by amount, largest first. <a href="/search.csv?${query}">Download results (CSV)</a></p>
<div class="table-wrap"><table>
<thead><tr><th>Date</th><th>Vendor</th><th>Invoice</th><th>Description</th><th>Department</th><th>Check</th><th class="num">Amount</th></tr></thead>
<tbody>${rows || `<tr><td colspan="7" class="empty">No payments match these filters.</td></tr>`}</tbody>
</table></div>
${pager(opts.pageIndex, pages, (index) => `/search?${query}&page=${index + 1}`)}
<p class="note" style="margin-top:16px">Descriptions are shortened in the Clerk's report. Some departments pay the same vendor through purchase cards, which appear under the card vendor. Payment dates after the report date are excluded here.</p>
</section>`;
  return page({ title: "Payment search. Budget Explorer", active: "search", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

function searchQuery(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.vendor) params.set("vendor", filters.vendor);
  if (filters.dept) params.set("dept", filters.dept);
  if (filters.fund) params.set("fund", filters.fund);
  if (filters.minCents) params.set("min", (filters.minCents / 100).toString());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

function pager(pageIndex: number, pages: number, href: (index: number) => string): string {
  const prev = pageIndex > 0 ? `<a href="${esc(href(pageIndex - 1))}">Previous</a>` : `<span></span>`;
  const next = pageIndex + 1 < pages ? `<a href="${esc(href(pageIndex + 1))}">Next</a>` : `<span></span>`;
  return `<div class="pager">${prev}<span>Page ${pageIndex + 1} of ${pages}</span>${next}</div>`;
}

export function renderAsk(opts: {
  row: ImportRow;
  csrf: string;
  question: string;
  answer: string;
  records: QaRecord[];
  error: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const recordRows = opts.records
    .map((record, index) => `<tr><td class="num">${index + 1}</td><td>${esc(record.text)}</td></tr>`)
    .join("");
  const body = `
<h1>Ask a question</h1>
<p class="lede">Ask in plain language. The answer is calculated from the published import and should cite account keys and invoice numbers.</p>
<section class="panel">
<form method="post" action="/ask" data-busy>
<input type="hidden" name="csrf" value="${esc(opts.csrf)}">
<label for="question">Your question</label>
<textarea id="question" name="question" maxlength="500" required>${esc(opts.question)}</textarea>
<p class="hint">Try a vendor, a department code, or an object code. Limit 500 characters. ${12} questions an hour and ${40} a day for each signed-in visitor.</p>
<button class="btn" type="submit">Ask</button>
</form>
</section>
${opts.error ? `<p class="warning">${esc(opts.error)}</p>` : ""}
${
  opts.answer
    ? `<section class="answer"><h2>Answer</h2><p>${esc(opts.answer).replace(/\n/g, "<br>")}</p>
<p class="warning">Answers can be wrong. Check the cited account lines and invoice numbers. This tool only reads the imported file.</p>
${
  opts.records.length
    ? `<h2 style="margin-top:22px">Records used</h2><div class="table-wrap"><table><thead><tr><th class="num">#</th><th>Record</th></tr></thead><tbody>${recordRows}</tbody></table></div>`
    : ""
}
</section>`
    : `<section class="panel"><p class="empty">Answers appear here, with the records that were retrieved from the database.</p></section>`
}`;
  return page({ title: "Ask a question. Budget Explorer", active: "ask", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

export function renderAbout(row: ImportRow | null, csrf: string, isAdmin: boolean, baseUrl = "", showNames = true): string {
  const body = `
<h1>About the data</h1>
<p class="lede">This is a private concept prototype. It is not a Walton County website and it does not use the county seal.</p>
<section class="panel">
<h2>Source</h2>
<p>Figures come from a year to date budget report produced by the Walton County Clerk and Comptroller, imported by an administrator. The published snapshot is what the pages read. Older imports are kept.</p>
<p>Department and object names come from a chart of accounts when one has been imported. Until then, a code is marked unmatched. Every figure is keyed by fund, department, object, and project codes.</p>
<p>${showNames ? "Payroll lines keep employee names and individual pay. An administrator can hide both without importing the file again." : "Person names and individual pay are hidden. Payroll is shown as batch totals. The names and amounts stay in the database."} Payment lines dated after the report date are stored, flagged, and left out of search, department payments, and questions.</p>
<p>Status compares spent plus encumbered with the share of the fiscal year that has passed. The fiscal year starts on October 1.</p>
${row ? `<p class="code">Published import ${row.id}. Data as of ${esc(displayDate(row.data_as_of))}. ${row.account_count.toLocaleString("en-US")} accounts. ${row.payment_count.toLocaleString("en-US")} payment lines.</p>` : `<p>No import has been published yet.</p>`}
${baseUrl ? `<p>Public base URL: ${esc(baseUrl)}</p>` : `<p>No public base URL is configured. Links stay relative so this prototype can move to another hostname.</p>`}
</section>`;
  return page({ title: "About the data. Budget Explorer", active: "about", body, dataAsOf: row?.data_as_of, admin: isAdmin, csrf, fy: row ? fiscalPosition(row.data_as_of).fyLabel : undefined, showNames });
}

export function renderSheriff(row: ImportRow | null, csrf: string, isAdmin: boolean, showNames = true): string {
  const body = `
<h1>Sheriff</h1>
<p class="lede">This section is a placeholder. A separate Sheriff view is not built yet.</p>
<section class="panel">
<p>Sheriff activity that appears in the imported budget report is still available through Departments and Payment search, under its department code. This page does not add a second set of figures.</p>
<p><a class="btn secondary" href="/departments">Browse departments</a></p>
</section>`;
  return page({ title: "Sheriff. Budget Explorer", active: "sheriff", body, dataAsOf: row?.data_as_of, admin: isAdmin, csrf, showNames });
}

export function renderPlat(opts: { row: ImportRow | null; history: PlatSnapshot[]; payments: PaymentRow[]; selected: number | null; names: NameMaps; csrf: string; isAdmin: boolean; showNames: boolean }): string {
  const rows = opts.history
    .map((item) => {
      const available = item.rev_cents - item.ytd_cents - item.enc_cents;
      return `<tr>
<td><a href="/plat?import=${item.id}">${esc(displayDate(item.data_as_of) || item.created_at.slice(0, 10))}</a></td>
<td>${esc(item.status)}</td>
<td class="num">${money(item.rev_cents)}</td>
<td class="num">${money(item.ytd_cents)}</td>
<td class="num">${money(item.enc_cents)}</td>
<td class="num">${money(available)}</td>
<td class="num">${item.accounts}</td>
</tr>`;
    })
    .join("");
  const activity = opts.payments
    .map(
      (payment) => `<tr>
<td>${esc(displayDate(payment.pay_date))}</td>
<td>${esc(payment.vendor_name || "")}</td>
<td class="mono">${esc(payment.invoice || "")}</td>
<td class="mono">${esc(payment.check_number || "")}</td>
<td class="num">${moneyExact(payment.amount_cents)}</td>
</tr>`,
    )
    .join("");
  const body = `
<h1>Recreation plat fee</h1>
<p class="lede">Fund 114, department 11444000. Each import is its own snapshot. Balances are not added across imports. A payment that appears in two overlapping imports is listed under each import date, and duplicate check keys are not merged into a new total.</p>
<section class="panel">
<h2>Balance by import</h2>
<div class="table-wrap"><table>
<thead><tr><th>Data as of</th><th>Status</th><th class="num">Revised</th><th class="num">Spent</th><th class="num">Encumbered</th><th class="num">Available</th><th class="num">Accounts</th></tr></thead>
<tbody>${rows || `<tr><td colspan="7" class="empty">No imports yet.</td></tr>`}</tbody>
</table></div>
</section>
<section class="panel">
<h2>Activity${opts.selected ? ` for import ${opts.selected}` : ""}</h2>
<p class="hint">Visible payment lines only. Payroll batches and lines after the report date are not listed here.</p>
<div class="table-wrap"><table>
<thead><tr><th>Date</th><th>Vendor</th><th>Invoice</th><th>Check</th><th class="num">Amount</th></tr></thead>
<tbody>${activity || `<tr><td colspan="5" class="empty">No visible activity for this import.</td></tr>`}</tbody>
</table></div>
</section>`;
  return page({ title: "Recreation plat fee. Budget Explorer", active: "plat", body, dataAsOf: opts.row?.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, showNames: opts.showNames });
}

export function renderAdminHome(
  imports: ImportRow[],
  csrf: string,
  chartCount: number,
  privacy: { shown: boolean; updatedAt: string | null },
): string {
  const rows = imports
    .map(
      (item) => `<tr>
<td><a href="/admin/import/${item.id}">${item.id}</a></td>
<td>${esc(item.created_at.replace("T", " ").slice(0, 16))}</td>
<td>${esc(displayDate(item.data_as_of))}</td>
<td>${esc(item.status)}</td>
<td class="num">${item.account_count.toLocaleString("en-US")}</td>
<td class="num">${item.payment_count.toLocaleString("en-US")}</td>
<td class="num">${money(item.ytd_cents)}</td>
<td>${esc(item.filename || "")}</td>
</tr>`,
    )
    .join("");
  const body = `
<h1>Admin</h1>
<p class="lede">Import a budget report, check it against the printed totals, then publish. Older imports stay in the history. Chart names on file: ${chartCount.toLocaleString("en-US")}.</p>
<section class="panel">
<h2>Import a file</h2>
<p class="hint">The text export of the year to date budget report is the primary format. CSV and the first worksheet of an Excel file can load a chart of accounts. PDF text extraction is not available in this Worker. Export the report as text, or upload a .txt file.</p>
<form method="post" action="/admin/import" enctype="multipart/form-data" data-busy>
<input type="hidden" name="csrf" value="${esc(optsCsrf(csrf))}">
<div class="drop">
<strong>Drop a text, CSV, or Excel file</strong>
<p class="hint">You can also choose a file below. A full year report is large and can take a minute to save.</p>
<input name="file" type="file" accept=".txt,.csv,.xlsx,.pdf,text/plain,text/csv,application/pdf" required>
</div>
<p style="margin-top:16px"><button class="btn" type="submit">Read file</button> <a class="btn secondary" href="/admin/history">Import history</a></p>
</form>
</section>
<section class="panel">
<h2>Recent imports</h2>
<div class="table-wrap"><table>
<thead><tr><th>Id</th><th>Imported</th><th>Data as of</th><th>Status</th><th class="num">Accounts</th><th class="num">Payments</th><th class="num">Spent</th><th>File</th></tr></thead>
<tbody>${rows || `<tr><td colspan="8" class="empty">No imports yet.</td></tr>`}</tbody>
</table></div>
</section>
<section class="panel">
<h2>Chart of accounts</h2>
<p class="hint">Upload funds.csv or the expenditures chart. Codes that do not match are shown as unmatched.</p>
<form method="post" action="/admin/chart" enctype="multipart/form-data">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<input name="file" type="file" accept=".csv,.xlsx,text/csv" required>
<p style="margin-top:12px"><button class="btn secondary" type="submit">Update chart</button></p>
</form>
</section>
<section class="panel">
<h2>Person names and individual pay</h2>
<p>Current state: ${privacy.shown ? "on" : "off"}. ${privacy.updatedAt ? `Last change ${esc(privacy.updatedAt)}.` : "Names and individual pay are shown by default. No change has been saved."}</p>
<p class="hint">This switch hides names and individual pay on every page, in search, in exports, and in questions. It does not require a new import or a deploy. The rows stay in the database.</p>
<form method="post" action="/admin/settings">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<input type="hidden" name="show_person_names" value="0">
<label><input type="checkbox" name="show_person_names" value="1"${privacy.shown ? " checked" : ""}> Show person names and individual pay</label>
<p style="margin-top:12px"><button class="btn" type="submit">Save</button></p>
</form>
</section>`;
  return page({ title: "Admin. Budget Explorer", active: "admin", body, admin: true, csrf, showNames: privacy.shown });
}

function optsCsrf(csrf: string): string {
  return csrf;
}

export function renderPreview(opts: {
  row: ImportRow;
  mismatches: AccountRow[];
  unmatchedDepts: { code: string; report_name: string }[];
  unmatchedObjects: { code: string; title: string }[];
  overlap: number | null;
  csrf: string;
  error: string;
  showNames: boolean;
}): string {
  const printed = opts.row.printed_ytd_cents == null
    ? "This file has no printed grand total line."
    : `Printed totals: original ${moneyExact(opts.row.printed_orig_cents || 0)}, revised ${moneyExact(opts.row.printed_rev_cents || 0)}, spent ${moneyExact(opts.row.printed_ytd_cents || 0)}. Parsed totals: original ${moneyExact(opts.row.orig_cents)}, revised ${moneyExact(opts.row.rev_cents)}, spent ${moneyExact(opts.row.ytd_cents)}.`;
  const mismatchRows = opts.mismatches
    .slice(0, 50)
    .map(
      (account) => `<tr>
<td class="mono">${esc(accountKey(account.fund_code, account.dept_code, account.object_code, account.project_code))}</td>
<td>${esc(account.title || "")}</td>
<td class="num">${moneyExact(account.ytd_cents)}</td>
<td class="num">${moneyExact(account.payment_sum_cents)}</td>
<td class="num">${moneyExact(account.recon_diff_cents)}</td>
</tr>`,
    )
    .join("");
  const foldedWarning = opts.row.note && opts.row.note.startsWith("Folded ") ? opts.row.note : "";
  const deptList = opts.unmatchedDepts
    .slice(0, 40)
    .map((dept) => `<li><span class="mono">${esc(dept.code)}</span> ${esc(dept.report_name || "unmatched")}</li>`)
    .join("");
  const body = `
<p class="crumb"><a href="/admin">Admin</a> / Import ${opts.row.id}</p>
<h1>Import preview</h1>
<p class="lede">${esc(opts.row.filename || "upload")} · data as of ${esc(displayDate(opts.row.data_as_of) || "unknown")} · status ${esc(opts.row.status)}</p>
${opts.error ? `<p class="warning">${esc(opts.error)}</p>` : ""}
<section class="metrics">
${metric("Funds", String(opts.row.fund_count), "From the report")}
${metric("Accounts", opts.row.account_count.toLocaleString("en-US"), `${opts.row.department_count} departments`)}
${metric("Payment lines", opts.row.payment_count.toLocaleString("en-US"), `${opts.row.payroll_batch_count.toLocaleString("en-US")} payroll batches`)}
${metric("After report date", opts.row.after_cutoff_count.toLocaleString("en-US"), "Stored, excluded from search")}
</section>
<section class="panel">
<h2>Reconciliation</h2>
<p>${esc(printed)}</p>
<p>${opts.mismatches.length ? `${opts.mismatches.length} accounts whose payments do not sum to year to date spending.` : "Every account's payment lines, including payroll batches, sum to its year to date spending."}</p>
${
  opts.mismatches.length
    ? `<div class="table-wrap"><table><thead><tr><th>Account</th><th>Title</th><th class="num">YTD</th><th class="num">Payments</th><th class="num">Difference</th></tr></thead><tbody>${mismatchRows}</tbody></table></div>`
    : ""
}
${opts.overlap != null ? `<p class="hint">${opts.overlap.toLocaleString("en-US")} payment lines share a check key with the previously published import. Publishing this snapshot does not add those lines on top of the older one. The site reads only the latest published import.</p>` : ""}
${foldedWarning ? `<p class="warning">${esc(foldedWarning)} Review this before publishing.</p>` : ""}
<p class="hint">Employee names and individual pay are stored with this import. The admin switch controls whether pages show them.</p>
${
  opts.row.status !== "published"
    ? `<form method="post" action="/admin/import/${opts.row.id}/publish"><input type="hidden" name="csrf" value="${esc(opts.csrf)}"><button class="btn gold" type="submit">Publish this import</button></form>`
    : `<p class="note">This import is published.</p>`
}
</section>
<section class="panel">
<h2>Unmatched codes</h2>
<p class="hint">${opts.unmatchedDepts.length} departments and ${opts.unmatchedObjects.length} object codes have no chart name yet. They display as unmatched until a chart is imported.</p>
${deptList ? `<ul>${deptList}</ul>` : `<p>All department codes in this import match the chart.</p>`}
</section>`;
  return page({ title: "Import preview. Budget Explorer", active: "admin", body, dataAsOf: opts.row.data_as_of, admin: true, csrf: opts.csrf, showNames: opts.showNames });
}

export function renderMessage(title: string, message: string, csrf: string, dataAsOf?: string | null, showNames = true): string {
  return page({
    title,
    active: "admin",
    admin: true,
    csrf,
    dataAsOf,
    showNames,
    body: `<h1>${esc(title)}</h1><section class="panel"><p>${esc(message)}</p><p><a class="btn" href="/admin">Back to admin</a></p></section>`,
  });
}

export function renderEmpty(csrf: string, admin: boolean, showNames = true): string {
  const body = `<h1>No budget published yet</h1><p class="lede">An administrator needs to import a year to date report and publish it.</p>${admin ? `<p><a class="btn" href="/admin">Go to import</a></p>` : ""}`;
  return page({ title: "Budget Explorer", active: "overview", body, admin, csrf, showNames });
}

export function renderAdminDisabled(csrf: string, showNames = true): string {
  return page({
    title: "Admin is off. Budget Explorer",
    active: "",
    csrf,
    admin: false,
    showNames,
    body: `<h1>Admin is off</h1><p class="lede">Admin tools stay off until ADMIN_PASSWORD is set on the Worker.</p>`,
  });
}

export function renderUnlock(csrf: string, error: string, showNames = true): string {
  const body = `<div class="login-wrap"><section class="login-card"><h1>Admin password</h1>
<p class="lede">This site password is signed in. Admin pages need the additional password.</p>
${error ? `<p class="warning">${esc(error)}</p>` : ""}
<form method="post" action="/admin/unlock" class="stack">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<div><label for="admin_password">Admin password</label><input id="admin_password" name="admin_password" type="password" required></div>
<button class="btn" type="submit">Unlock admin</button>
</form></section></div>`;
  return page({ title: "Admin password. Budget Explorer", active: "admin", body, csrf, admin: false, showNames });
}

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#13283a"/><path d="M9 22V10h3.2c2.7 0 4.3 1.4 4.3 3.6 0 2.3-1.6 3.7-4.3 3.7H11.4V22H9zm2.4-6.2h.7c1.3 0 2-.6 2-1.6s-.7-1.6-2-1.6h-.7v3.2z" fill="#c6aa72"/></svg>`;
