import type { AccountRow, DeptRollup, ImportRow, NameMaps, PaymentRow, PlatSnapshot, SearchFilters } from "./db";
import type { QaRecord } from "./qa";
import {
  FY_MONTHS,
  PACE_LABEL,
  Pace,
  accountKey,
  displayDate,
  esc,
  fiscalPosition,
  money,
  moneyExact,
  moneyShort,
  nameFor,
  pace,
  pct,
} from "./format";

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
  ["search", "/search", "Payment search"],
  ["ask", "/ask", "Ask a question"],
  ["plat", "/plat", "Plat fee"],
  ["sheriff", "/sheriff", "Sheriff"],
  ["about", "/about", "About the data"],
];

export function page(opts: ShellOpts): string {
  const fiscal = fiscalPosition(opts.dataAsOf);
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
<a class="brand" href="/"><span class="brand-kicker">Walton County</span><span class="brand-name">Budget Explorer</span><span class="brand-sub">Fiscal year ${esc(opts.fy || fiscal.fyLabel)}. Budget to actual spending, October 1 to September 30.</span></a>
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

export function renderOverview(opts: {
  row: ImportRow;
  departments: DeptRollup[];
  fundReports: Map<string, string>;
  names: NameMaps;
  months: number[];
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
  for (const dept of opts.departments) counts[pace(dept.rev_cents, dept.ytd_cents, dept.enc_cents, fiscal.elapsedPct)] += 1;
  const top = opts.departments.slice(0, 12);
  const rows = top
    .map((dept) => {
      const status = pace(dept.rev_cents, dept.ytd_cents, dept.enc_cents, fiscal.elapsedPct);
      const named = deptName(dept, opts.names);
      const fund = fundLabel(dept.fund_code || "", opts.fundReports.get(dept.fund_code) || "", opts.names);
      return `<tr>
<td><a class="name" href="/departments/${esc(dept.code)}">${esc(named.primary)}</a>${badge(named.unmatched)}<div class="code">Dept ${esc(dept.code)} · ${esc(fund.primary)}</div></td>
<td class="num">${money(dept.rev_cents)}</td>
<td class="num">${money(dept.ytd_cents)}</td>
<td class="num">${money(dept.enc_cents)}</td>
<td>${bar(dept.rev_cents, dept.ytd_cents, dept.enc_cents, fiscal.elapsedPct, status)}</td>
<td class="num">${pct(dept.ytd_cents, dept.rev_cents)}</td>
<td>${pill(status)}</td>
</tr>`;
    })
    .join("");
  const used = pct(opts.row.ytd_cents, opts.row.rev_cents);
  const withEnc = pct(opts.row.ytd_cents + opts.row.enc_cents, opts.row.rev_cents);
  const chart = lineChart(opts.months, opts.row.rev_cents, opts.row.ytd_cents);
  const donut = donutChart(counts);
  const body = `
<h1>Where the money stands</h1>
<p class="lede">Fiscal year ${esc(fiscal.fyLabel)} through ${esc(displayDate(fiscal.asOf))}. ${fiscal.elapsedPct.toFixed(1)}% of the fiscal year has passed (${fiscal.elapsedDays} of ${fiscal.totalDays} days).</p>
<section class="metrics">
${metric("Revised budget", money(opts.row.rev_cents), `Original ${money(opts.row.orig_cents)} plus ${money(opts.row.adj_cents)} in amendments`)}
${metric("Spent to date", money(opts.row.ytd_cents), `Paid through ${esc(displayDate(opts.row.data_as_of))}`)}
${metric("Encumbered", money(opts.row.enc_cents), "Committed by purchase orders, not yet paid")}
${metric("Available", money(opts.row.avail_cents), `Spent only is ${used}. With encumbrances: ${withEnc}`)}
</section>
<section class="panel">
<h2>Departments by size of budget</h2>
<p class="hint">Twelve largest of ${opts.departments.length} departments. The solid bar is money spent. The hatch is encumbered. The tick marks where the year stands (${fiscal.elapsedPct.toFixed(0)}%).</p>
<div class="table-wrap"><table>
<thead><tr><th>Department</th><th class="num">Revised budget</th><th class="num">Spent</th><th class="num">Encumbered</th><th>Spent and encumbered vs. budget</th><th class="num">% used</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<p class="note" style="margin-top:16px"><strong>How status works.</strong> On pace: spent plus encumbered is at or below the share of the year that has passed (${fiscal.elapsedPct.toFixed(1)}%). Above pace: ahead of the calendar but still within the revised budget. Over budget: spent plus encumbered is above the revised budget. Status is a prompt to look closer, not a finding of a problem. Capital projects and grants often span several years.</p>
</section>
<div class="split">
<section class="panel"><h2>Cumulative spending by month</h2><p class="hint">Running total of payments posted in each fiscal month, including payroll batches, against the revised budget.</p>${chart}</section>
<section class="panel"><h2>Department status</h2><p class="hint">All ${opts.departments.length} departments with a row in this import.</p><div class="donut-row">${donut}<div class="legend">${(["green", "yellow", "red", "gray"] as Pace[]).map((key) => `<div>${pill(key)} <strong>${counts[key]}</strong></div>`).join("")}</div></div></section>
</div>`;
  return page({ title: "Overview. Budget Explorer", active: "overview", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

function lineChart(months: number[], revCents: number, ytdCents: number): string {
  const w = 640;
  const h = 250;
  const left = 64;
  const bottom = 32;
  const total = months.reduce((sum, value) => sum + value, 0);
  const max = Math.max(revCents, total, 1);
  const x = (i: number) => left + (i * (w - left - 16)) / 11;
  const y = (value: number) => h - bottom - (value / max) * (h - bottom - 18);
  let running = 0;
  const cumulative = months.map((value) => {
    running += value;
    return running;
  });
  const points = cumulative.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((share) => {
      const value = max * share;
      const yy = y(value);
      return `<line x1="${left}" x2="${w - 16}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#e6e1d8"/><text x="${left - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5c6976" font-family="IBM Plex Sans, sans-serif">${esc(moneyShort(value))}</text>`;
    })
    .join("");
  const labels = FY_MONTHS.map((month, i) => `<text x="${x(i).toFixed(1)}" y="${h - 10}" text-anchor="middle" font-size="11" fill="#5c6976" font-family="IBM Plex Sans, sans-serif">${month}</text>`).join("");
  const budgetY = y(revCents);
  const area = `${left},${(h - bottom).toFixed(1)} ${points} ${x(Math.max(months.length - 1, 0)).toFixed(1)},${(h - bottom).toFixed(1)}`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Cumulative spending reaches ${money(ytdCents)}">
${grid}${labels}
<polygon points="${area}" fill="rgba(28,95,91,0.08)"/>
<line x1="${left}" x2="${w - 16}" y1="${budgetY.toFixed(1)}" y2="${budgetY.toFixed(1)}" stroke="#8d7344" stroke-dasharray="5 4"/>
<text x="${left + 8}" y="${(budgetY - 6).toFixed(1)}" font-size="11" fill="#8d7344" font-family="IBM Plex Sans, sans-serif">Revised ${esc(moneyShort(revCents))}</text>
<polyline points="${points}" fill="none" stroke="#1c5f5b" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>
${cumulative.map((value, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(value).toFixed(1)}" r="2.6" fill="#fcfbf8" stroke="#1c5f5b" stroke-width="1.6"/>`).join("")}
</svg>`;
}

function donutChart(counts: Record<Pace, number>): string {
  const total = counts.green + counts.yellow + counts.red + counts.gray || 1;
  const colors: Record<Pace, string> = { green: "#2f8f62", yellow: "#c4923a", red: "#b55252", gray: "#9aa6b0" };
  const r = 58;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = (["green", "yellow", "red", "gray"] as Pace[])
    .map((key) => {
      const length = (c * counts[key]) / total;
      const arc = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${colors[key]}" stroke-width="14" stroke-dasharray="${length.toFixed(2)} ${(c - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 80 80)"/>`;
      offset += length;
      return counts[key] ? arc : "";
    })
    .join("");
  return `<svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${total} departments">${arcs}<text x="80" y="76" text-anchor="middle" font-size="28" font-family="Fraunces, serif" fill="#1a2330">${total}</text><text x="80" y="96" text-anchor="middle" font-size="11" fill="#5c6976">departments</text></svg>`;
}

export function renderDepartments(opts: { row: ImportRow; departments: DeptRollup[]; fundReports: Map<string, string>; names: NameMaps; csrf: string; isAdmin: boolean; showNames: boolean }): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
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
  const body = `<h1>Departments</h1><p class="lede">${opts.departments.length} departments in the published import. Names come from the chart of accounts. A code with no chart name is marked unmatched.</p>
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
