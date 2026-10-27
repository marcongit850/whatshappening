import type { AccountSpend, BudgetFacts, CategorySpend, FundRollup, VendorSpendRow } from "./budget";
import { TRANSFER_OBJECT, factsFromRow } from "./budget";
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
  moneyWords,
  nameFor,
  pace,
  pct,
} from "./format";
import { titleCaseVendor } from "./vendors";

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
  ["funds", "/funds", "Funds"],
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
<a class="brand" href="/"><span class="brand-kicker">Walton County</span><span class="brand-name">Budget Explorer</span><span class="brand-sub">Fiscal year ${esc(opts.fy || fiscal.fyLabel)}. What was budgeted, and what has been spent, from October 1 to September 30.</span></a>
<label class="nav-btn" for="nav-toggle">Menu</label>
</div>
<input class="nav-toggle" id="nav-toggle" type="checkbox">
<div class="nav-scroller"><nav>${nav}${adminLink}${logout}</nav></div>
</div></header>
<main>${opts.body}</main>
<footer class="footer"><div class="footer-inner">Concept prototype for private review. Not affiliated with or endorsed by Walton County government. Figures are unaudited and may change. ${payrollFooter} No county seal is used.</div></footer>
<script src="/assets/app.js" defer></script>
</body></html>`;
}

function metric(label: string, value: string, note: string, captionText = ""): string {
  const captionHtml = captionText ? `<p class="caption">${captionText}</p>` : "";
  const noteHtml = note ? `<p class="metric-note">${note}</p>` : "";
  return `<article class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p>${captionHtml}${noteHtml}</article>`;
}

function caption(text: string): string {
  return `<p class="caption">${text}</p>`;
}

function plainLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return titleCaseVendor(trimmed);
  return trimmed;
}

function whatIs(term: "fund" | "carryforward" | "transfer"): string {
  const copy = {
    fund: ["What is a fund?", "A fund is a separate pot of money, like its own checking account. The county does not keep all of its money in one pile."],
    carryforward: ["What is carryforward?", "Carryforward is money set aside last year for a project or grant that is still going. It was not in the budget the commissioners first passed."],
    transfer: ["What is a transfer?", "A transfer moves money from one county fund to another. It is not a payment to an outside business. The raw report counts it twice. We count it once."],
  }[term];
  return `<details class="what"><summary>${copy[0]}</summary><p>${copy[1]}</p></details>`;
}

function netOf(row: {
  orig_cents: number;
  rev_cents: number;
  ytd_cents: number;
  enc_cents: number;
  transfer_orig_cents?: number;
  transfer_rev_cents?: number;
  transfer_ytd_cents?: number;
  transfer_enc_cents?: number;
}): BudgetFacts {
  return factsFromRow({
    orig_cents: row.orig_cents,
    rev_cents: row.rev_cents,
    ytd_cents: row.ytd_cents,
    enc_cents: row.enc_cents,
    transfer_orig_cents: row.transfer_orig_cents || 0,
    transfer_rev_cents: row.transfer_rev_cents || 0,
    transfer_ytd_cents: row.transfer_ytd_cents || 0,
    transfer_enc_cents: row.transfer_enc_cents || 0,
  });
}

function compareBar(budget: number, spent: number, elapsed: number): string {
  if (budget <= 0 && spent <= 0) return `<div class="compare" title="No budget set"></div>`;
  const width = budget > 0 ? Math.max(0, Math.min(100, (spent / budget) * 100)) : 100;
  const over = budget <= 0 || spent > budget;
  const label = budget > 0 ? `Spent ${pct(spent, budget)}` : "No budget set";
  const mark = budget > 0 && elapsed >= 0 ? `<span class="compare-mark" style="left:${Math.max(0, Math.min(100, elapsed)).toFixed(1)}%"></span>` : "";
  return `<div class="compare" title="${label}"><span class="compare-spent${over ? " over" : ""}" style="width:${width.toFixed(1)}%"></span>${mark}</div>`;
}

function budgetHead(net: BudgetFacts, asOf: string, elapsed: number): string {
  const spentNote = net.current > 0 ? `${pct(net.spent, net.current)} of the budget has been spent.` : "There is no budget on the books, so the percent is n/a.";
  return `<section class="metrics">
${metric("Budgeted", moneyWords(net.current), `Exactly ${money(net.current)}.`, "The budget for this right now.")}
${metric("Money spent so far", moneyWords(net.spent), `Paid through ${esc(asOf)}.`, "What has actually been paid.")}
${metric("Money left", moneyWords(net.left), net.encumbered > 0 ? `Another ${moneyWords(net.encumbered)} is promised but not paid yet.` : "", "Budget minus money spent so far.")}
</section>
<div class="budget-hero">${compareBar(net.current, net.spent, elapsed)}</div>
${caption(`The bar fills as money is spent. The dark line is how far we are through the year. ${spentNote}`)}`;
}

function badge(unmatched: boolean): string {
  return unmatched ? `<span class="tag">unmatched</span>` : "";
}

function pill(status: Pace): string {
  return `<span class="pill ${status}">${PACE_LABEL[status]}</span>`;
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
  funds: FundRollup[];
  names: NameMaps;
  months: number[];
  facts: BudgetFacts;
  vendors: VendorSpendRow[];
  displayName: (raw: string) => string;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const asOf = displayDate(fiscal.asOf);
  const facts = opts.facts;
  const counts: Record<Pace, number> = { green: 0, yellow: 0, red: 0, gray: 0, none: 0 };
  const spendingDepts = opts.departments.filter((dept) => !transferOnly(netOf(dept)));
  for (const dept of spendingDepts) counts[pace(netOf(dept).current, netOf(dept).spent, 0, fiscal.elapsedPct)] += 1;
  const top = [...spendingDepts].sort((a, b) => netOf(b).current - netOf(a).current).slice(0, 12);
  const rows = top
    .map((dept) => {
      const net = netOf(dept);
      const status = pace(net.current, net.spent, 0, fiscal.elapsedPct);
      const named = niceDept(dept, opts.names);
      const fundRow = opts.funds.find((item) => item.fund_code === dept.fund_code);
      const fund = fundLabel(dept.fund_code || "", fundRow?.report_name || "", opts.names);
      const shownFund = plainLabel(fund.primary);
      return `<tr>
<td data-label="Department"><a class="name" href="/departments/${esc(dept.code)}">${esc(named.primary)}</a>${badge(named.unmatched)}<div class="code">Dept ${esc(dept.code)} · <a href="/funds/${esc(dept.fund_code)}">${esc(shownFund)}</a></div></td>
<td data-label="Budget" class="num">${money(net.current)}</td>
<td data-label="Spent so far" class="num">${money(net.spent)}</td>
<td data-label="Money left" class="num">${money(net.left)}</td>
<td data-label="Budget versus spent">${compareBar(net.current, net.spent, fiscal.elapsedPct)}</td>
<td data-label="% spent" class="num">${pct(net.spent, net.current)}</td>
<td data-label="Status">${pill(status)}</td>
</tr>`;
    })
    .join("");
  const fundRows = fundBars(opts.funds, opts.names, fiscal.elapsedPct);
  const chart = lineChart(opts.months, facts.current, facts.spent);
  const donut = fundDonut(opts.funds, opts.names);
  const vendors = mergeVendors(opts.vendors, opts.displayName);
  const vendorList = vendors
    .map(
      (vendor) =>
        `<li><a href="/search?vendor=${encodeURIComponent(vendor.raw)}">${esc(vendor.name)}</a> <span class="num">${money(vendor.cents)}</span></li>`,
    )
    .join("");
  const ahead = spendingDepts.find((dept) => {
    const net = netOf(dept);
    const status = pace(net.current, net.spent, 0, fiscal.elapsedPct);
    return status === "yellow" || status === "red";
  });
  const biggest = [...opts.funds].sort((a, b) => netOf(b).current - netOf(a).current)[0];
  const biggestNet = biggest ? netOf(biggest) : null;
  const biggestName = biggest ? plainLabel(fundLabel(biggest.fund_code, biggest.report_name, opts.names).primary) : "";
  const standout = [
    biggestNet && biggestNet.current > 0
      ? `${esc(biggestName)} is the largest fund, with ${moneyWords(biggestNet.spent)} spent of a ${moneyWords(biggestNet.current)} budget.`
      : "Open a fund to see its budget and what it has spent.",
    `${moneyWords(facts.left)} is still left in the current budget.`,
    ahead
      ? `${esc(niceDept(ahead, opts.names).primary)} has spent more than the share of the year that has passed.`
      : "No large department has spent past the share of the year that has passed.",
  ];
  const statusLine = (["green", "yellow", "red", "none"] as Pace[])
    .filter((key) => counts[key])
    .map((key) => `${counts[key]} ${PACE_LABEL[key].toLowerCase()}`)
    .join(", ");
  const body = `
<h1>Where the money stands</h1>
<p class="lede">This is the county budget for the year that started October 1, and what has been spent through ${esc(asOf)}. ${fiscal.elapsedPct.toFixed(0)}% of the year has passed.</p>
<section class="metrics">
${metric("Budget passed by commissioners", moneyWords(facts.adopted), `Exactly ${money(facts.adopted)}.`, "The budget the commissioners voted for.")}
${metric("Current budget", moneyWords(facts.current), `Leaves out ${moneyWords(facts.transfer)} moved between county funds.`, "The budget they passed, plus money carried over and other changes.")}
${metric("Money spent so far", moneyWords(facts.spent), `Paid through ${esc(asOf)}.`, "Checks and payments so far. Money moved between funds is not counted again.")}
${metric("Money left", moneyWords(facts.left), facts.encumbered > 0 ? `Another ${moneyWords(facts.encumbered)} is promised but not paid yet.` : "", "Current budget minus money spent so far.")}
</section>
<p class="note">The county's raw report also counts ${moneyWords(facts.transfer)} of transfers between county funds. We leave that out so the same money is not counted twice.</p>
${whatIs("transfer")}
<details class="explainer">
<summary>How we count the budget</summary>
<p>The county keeps many funds. Each fund is like its own checking account.</p>
<p>When money moves from one fund to another, the raw report counts it as spending in both places. We count it once.</p>
<figure class="flow" aria-label="Money moves from one county fund to another">
<div class="flow-pot">One county fund</div>
<div class="flow-move">money moves</div>
<div class="flow-pot">Another county fund</div>
</figure>
<ol class="steps">
<li>Budget passed by commissioners: ${moneyWords(facts.adopted)}.</li>
<li>Plus changes since that vote: ${moneyWords(facts.amendments)}. Most of this is money carried over from last year's projects and grants. The county approved that in resolutions 2025-82 and 2025-87. The rest is other changes this year, mostly grants. ${whatIs("carryforward")}</li>
<li>Current budget: ${moneyWords(facts.current)}.</li>
</ol>
<p class="hint">The September 15 report has no lines for money transferred in. We subtract money transferred out so it is not counted twice.</p>
<p>Sources: <a href="https://walton.civicweb.net/document/511445/">County budget documents</a> and <a href="https://midbaynews.com/post/walton-county-passes-328m-budget-in-narrow-3-2-vote">news report on the budget vote</a>.</p>
</details>
<section class="panel">
<h2>Funds</h2>
${caption("Each fund is a separate pot of money. The bar shows how much of its budget has been spent.")}
${whatIs("fund")}
<div class="fund-list">${fundRows}</div>
<div class="transfer-row"><strong>Money moved between county funds</strong><span>${moneyWords(facts.transfer)}</span><p class="caption">This is kept separate so it is not counted as new spending.</p></div>
<div class="donut-row">${donut}<div><p class="caption">Share of the current budget by fund. Transfers are not in the circle.</p></div></div>
</section>
<section class="panel">
<h2>Departments</h2>
${caption("The largest departments. Open one to see its budget and what it has spent.")}
<p class="scroll-hint">Swipe sideways to see the rest.</p>
<div class="table-wrap"><table class="stack-cards">
<thead><tr><th>Department</th><th class="num">Budget</th><th class="num">Spent so far</th><th class="num">Money left</th><th>Budget versus spent</th><th class="num">% spent</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<p class="hint">${esc(statusLine || "No departments yet")}. The percent is money spent divided by the budget. Above pace means that percent is higher than ${fiscal.elapsedPct.toFixed(0)}% of the year. On pace means it is not. No spending yet means nothing has been paid.</p>
<p><a href="/departments">See every department</a></p>
</section>
<section class="panel">
<h2>Who the county paid</h2>
${caption("Outside businesses paid the most. Money moved between county funds is not included, so a transfer does not crowd out the other bars.")}
${vendorList ? `<ol class="vendor-bars">${vendorBars(vendors)}</ol>` : `<p class="empty">No vendor payments in this import.</p>`}
</section>
<div class="split">
<section class="panel"><h2>Money spent by month</h2>${caption("Running total of money spent each month. Money moved between county funds is not in this line.")}${chart}</section>
<section class="panel standout"><h2>What stands out</h2>${caption("A few plain notes from this budget.")}<ul class="standout-list">${standout.map((item) => `<li>${item}</li>`).join("")}</ul></section>
</div>`;
  return page({ title: "Overview. Budget Explorer", active: "overview", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

function transferOnly(facts: BudgetFacts): boolean {
  return facts.transfer > 0 && facts.current === 0 && facts.spent === 0;
}

function niceDept(row: { code: string; report_name?: string | null }, names: NameMaps): { primary: string; unmatched: boolean } {
  const named = deptName(row, names);
  return { primary: plainLabel(named.primary), unmatched: named.unmatched };
}

function mergeVendors(rows: VendorSpendRow[], displayName: (raw: string) => string): { name: string; raw: string; cents: number }[] {
  const map = new Map<string, { name: string; raw: string; cents: number }>();
  for (const row of rows) {
    const name = displayName(row.vendor_name);
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.cents += Number(row.cents);
      if (row.vendor_name.length > existing.raw.length) existing.raw = row.vendor_name;
    } else {
      map.set(key, { name, raw: row.vendor_name, cents: Number(row.cents) });
    }
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, 8);
}

function vendorBars(vendors: { name: string; raw: string; cents: number }[]): string {
  const max = vendors[0]?.cents || 1;
  return vendors
    .map((vendor) => {
      const width = Math.max(2, Math.min(100, (vendor.cents / max) * 100));
      return `<li><a href="/search?vendor=${encodeURIComponent(vendor.raw)}">${esc(vendor.name)}</a><span class="vendor-track"><span class="vendor-fill" style="width:${width.toFixed(1)}%"></span></span><span class="num">${money(vendor.cents)}</span></li>`;
    })
    .join("");
}

function fundBars(funds: FundRollup[], names: NameMaps, elapsed: number): string {
  const rows = funds
    .map((fund) => ({ fund, net: netOf(fund) }))
    .filter((item) => !transferOnly(item.net))
    .sort((a, b) => b.net.current - a.net.current || b.net.spent - a.net.spent);
  return rows
    .map(({ fund, net }) => {
      const named = fundLabel(fund.fund_code, fund.report_name, names);
      const label = plainLabel(named.primary);
      return `<a class="fund-row" href="/funds/${esc(fund.fund_code)}">
<span class="fund-name">${esc(label)} <span class="code">${esc(fund.fund_code)}</span></span>
${compareBar(net.current, net.spent, elapsed)}
<span class="num">${money(net.spent)} of ${money(net.current)}</span>
</a>`;
    })
    .join("");
}

function fundDonut(funds: FundRollup[], names: NameMaps): string {
  const slices = funds
    .map((fund) => ({
      label: plainLabel(fundLabel(fund.fund_code, fund.report_name, names).primary),
      cents: Math.max(0, netOf(fund).current),
    }))
    .filter((slice) => slice.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  const top = slices.slice(0, 6);
  const rest = slices.slice(6).reduce((sum, slice) => sum + slice.cents, 0);
  if (rest > 0) top.push({ label: "Other funds", cents: rest });
  const total = top.reduce((sum, slice) => sum + slice.cents, 0) || 1;
  const colors = ["#1c5f5b", "#8d7344", "#245b86", "#6e4b73", "#3d6b4f", "#a15c38", "#4d6280"];
  const r = 58;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = top
    .map((slice, index) => {
      const length = (c * slice.cents) / total;
      const arc = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${colors[index % colors.length]}" stroke-width="14" stroke-dasharray="${length.toFixed(2)} ${(c - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 80 80)"><title>${esc(slice.label)} ${esc(money(slice.cents))}</title></circle>`;
      offset += length;
      return arc;
    })
    .join("");
  const legend = top
    .map((slice, index) => `<div><span class="swatch" style="background:${colors[index % colors.length]}"></span> ${esc(slice.label)}</div>`)
    .join("");
  return `<svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Share of the current budget by fund">${arcs}<text x="80" y="84" text-anchor="middle" font-size="13" fill="#5c6976" font-family="IBM Plex Sans, sans-serif">by fund</text></svg><div class="legend">${legend}</div>`;
}

function lineChart(months: number[], budgetCents: number, spentCents: number): string {
  const w = 640;
  const h = 220;
  const left = 64;
  const bottom = 28;
  const total = months.reduce((sum, value) => sum + value, 0);
  const max = Math.max(budgetCents, total, 1);
  const x = (i: number) => left + (i * (w - left - 16)) / 11;
  const y = (value: number) => h - bottom - (value / max) * (h - bottom - 28);
  let running = 0;
  const cumulative = months.map((value) => {
    running += value;
    return running;
  });
  const points = cumulative.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const grid = [0, 0.5, 1]
    .map((share) => {
      const value = max * share;
      const yy = y(value);
      return `<line x1="${left}" x2="${w - 16}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#e6e1d8"/><text x="${left - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5c6976" font-family="IBM Plex Sans, sans-serif">${esc(moneyShort(value))}</text>`;
    })
    .join("");
  const labels = FY_MONTHS.map((month, i) => `<text x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="11" fill="#5c6976" font-family="IBM Plex Sans, sans-serif">${month}</text>`).join("");
  const budgetY = y(budgetCents);
  const area = `${left},${(h - bottom).toFixed(1)} ${points} ${x(11).toFixed(1)},${(h - bottom).toFixed(1)}`;
  const dots = cumulative
    .map((value, i) => {
      const labelY = Math.max(14, y(value) - 8);
      return `<text class="point-label" x="${x(i).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="10" fill="#1c5f5b" font-family="IBM Plex Sans, sans-serif">${esc(moneyShort(value))}</text><circle cx="${x(i).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3.2" fill="#fcfbf8" stroke="#1c5f5b" stroke-width="1.6"><title>${FY_MONTHS[i]} ${esc(money(value))}</title></circle>`;
    })
    .join("");
  const readout = `<ul class="month-readout">${cumulative.map((value, i) => `<li><span>${FY_MONTHS[i]}</span> <strong>${esc(money(value))}</strong></li>`).join("")}</ul>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Money spent reaches ${money(spentCents)}">
${grid}${labels}
<polygon points="${area}" fill="rgba(28,95,91,0.08)"/>
<line x1="${left}" x2="${w - 16}" y1="${budgetY.toFixed(1)}" y2="${budgetY.toFixed(1)}" stroke="#8d7344" stroke-dasharray="5 4"/>
<text x="${left + 8}" y="${(budgetY - 6).toFixed(1)}" font-size="11" fill="#8d7344" font-family="IBM Plex Sans, sans-serif">Budget ${esc(moneyShort(budgetCents))}</text>
<polyline points="${points}" fill="none" stroke="#1c5f5b" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>
${dots}
</svg>${readout}`;
}

export function renderDepartments(opts: { row: ImportRow; departments: DeptRollup[]; fundReports: Map<string, string>; names: NameMaps; csrf: string; isAdmin: boolean; showNames: boolean }): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const rows = opts.departments
    .map((dept) => {
      const net = netOf(dept);
      const status = pace(net.current, net.spent, 0, fiscal.elapsedPct);
      const named = niceDept(dept, opts.names);
      const fund = fundLabel(dept.fund_code || "", opts.fundReports.get(dept.fund_code) || "", opts.names);
      return `<tr>
<td data-label="Department"><a class="name" href="/departments/${esc(dept.code)}">${esc(named.primary)}</a>${badge(named.unmatched)}<div class="code">${esc(dept.code)} · <a href="/funds/${esc(dept.fund_code)}">${esc(plainLabel(fund.primary))}</a> · ${dept.accounts} accounts</div></td>
<td data-label="Budget" class="num">${money(net.current)}</td>
<td data-label="Spent so far" class="num">${money(net.spent)}</td>
<td data-label="Money left" class="num">${money(net.left)}</td>
<td data-label="% spent" class="num">${pct(net.spent, net.current)}</td>
<td data-label="Status">${pill(status)}</td>
</tr>`;
    })
    .join("");
  const body = `<h1>Departments</h1><p class="lede">Every department in this budget. Open one to see what was budgeted and what has been spent.</p>
${caption("Budget is the current budget. Spent so far is what has been paid. Money moved between county funds is left out.")}
<section class="panel"><p class="scroll-hint">Swipe sideways to see the rest.</p><div class="table-wrap"><table class="stack-cards">
<thead><tr><th>Department</th><th class="num">Budget</th><th class="num">Spent so far</th><th class="num">Money left</th><th class="num">% spent</th><th>Status</th></tr></thead>
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
  categories: CategorySpend[];
  vendors: VendorSpendRow[];
  payments: PaymentRow[];
  displayName: (raw: string) => string;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const named = niceDept(opts.dept, opts.names);
  const fund = fundLabel(opts.dept.fund_code || "", opts.fundReport, opts.names);
  const net = netOf(opts.dept);
  const status = pace(net.current, net.spent, 0, fiscal.elapsedPct);
  const rows = opts.accounts
    .filter((account) => account.object_code !== TRANSFER_OBJECT)
    .map((account) => {
      const accountStatus = pace(account.rev_cents, account.ytd_cents, 0, fiscal.elapsedPct);
      const objectName = nameFor(opts.names.object.get(account.object_code), account.title || "", account.object_code);
      const project = account.project_code ? `-${account.project_code}` : "";
      const href = `/departments/${esc(account.dept_code)}/${esc(account.object_code)}/${esc(account.project_code || "_")}`;
      const payroll = account.is_payroll ? `<span class="code">${opts.showNames ? " names and pay" : " batch totals"}</span>` : "";
      return `<tr>
<td data-label="Account"><a class="mono" href="${href}">${esc(account.object_code)}${esc(project)}</a> <a class="name" href="${href}">${esc(plainLabel(objectName.primary))}</a>${badge(objectName.unmatched)}${payroll}</td>
<td data-label="Budget" class="num">${money(account.rev_cents)}</td>
<td data-label="Spent so far" class="num">${money(account.ytd_cents)}</td>
<td data-label="Budget versus spent">${compareBar(account.rev_cents, account.ytd_cents, fiscal.elapsedPct)}</td>
<td data-label="% spent" class="num">${pct(account.ytd_cents, account.rev_cents)}</td>
<td data-label="Status">${pill(accountStatus)}</td>
</tr>`;
    })
    .join("");
  const vendors = mergeVendors(opts.vendors, opts.displayName);
  const body = `
<p class="crumb"><a href="/">Overview</a> / <a href="/funds/${esc(opts.dept.fund_code)}">${esc(plainLabel(fund.primary))}</a> / ${esc(opts.dept.code)}</p>
<h1>${esc(named.primary)}${badge(named.unmatched)}</h1>
<p class="lede">Part of <a href="/funds/${esc(opts.dept.fund_code)}">${esc(plainLabel(fund.primary))}</a>. ${pill(status)}</p>
${caption("This page shows the budget for this department, then what has been spent.")}
${budgetHead(net, displayDate(fiscal.asOf), fiscal.elapsedPct)}
${whereMoneyWent(opts.categories, vendors, opts.payments, opts.dept.fund_code, opts.dept.code)}
<section class="panel">
<h2>Accounts in this department</h2>
${caption("Open an account to see the payment lines behind it.")}
<p class="hint">${opts.showNames ? "Payroll accounts list employee names and individual pay." : "Payroll accounts list batch totals. Person names and individual pay are hidden."}</p>
<p class="scroll-hint">Swipe sideways to see the rest.</p>
<div class="table-wrap"><table class="stack-cards">
<thead><tr><th>Account</th><th class="num">Budget</th><th class="num">Spent so far</th><th>Budget versus spent</th><th class="num">% spent</th><th>Status</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="empty">No spending accounts in this department.</td></tr>`}</tbody>
</table></div>
</section>`;
  return page({ title: `${named.primary}. Budget Explorer`, active: "departments", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
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
    .map((fund) => ({ fund, net: netOf(fund) }))
    .filter((item) => !transferOnly(item.net))
    .sort((a, b) => b.net.current - a.net.current)
    .map(({ fund, net }) => {
      const named = fundLabel(fund.fund_code, fund.report_name, opts.names);
      return `<tr>
<td data-label="Fund"><a class="name" href="/funds/${esc(fund.fund_code)}">${esc(plainLabel(named.primary))}</a><div class="code">${esc(fund.fund_code)}</div></td>
<td data-label="Budget" class="num">${money(net.current)}</td>
<td data-label="Spent so far" class="num">${money(net.spent)}</td>
<td data-label="Money left" class="num">${money(net.left)}</td>
<td data-label="Budget versus spent">${compareBar(net.current, net.spent, fiscal.elapsedPct)}</td>
<td data-label="% spent" class="num">${pct(net.spent, net.current)}</td>
</tr>`;
    })
    .join("");
  const body = `<h1>Funds</h1>
<p class="lede">Each fund is a separate pot of money. Open one to see its budget and what has been spent.</p>
${whatIs("fund")}
<section class="panel"><p class="scroll-hint">Swipe sideways to see the rest.</p><div class="table-wrap"><table class="stack-cards">
<thead><tr><th>Fund</th><th class="num">Budget</th><th class="num">Spent so far</th><th class="num">Money left</th><th>Budget versus spent</th><th class="num">% spent</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="empty">No funds in this import.</td></tr>`}</tbody>
</table></div></section>`;
  return page({ title: "Funds. Budget Explorer", active: "funds", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

export function renderFund(opts: {
  row: ImportRow;
  fund: FundRollup;
  departments: DeptRollup[];
  categories: CategorySpend[];
  accounts: AccountSpend[];
  vendors: VendorSpendRow[];
  payments: PaymentRow[];
  names: NameMaps;
  displayName: (raw: string) => string;
  csrf: string;
  isAdmin: boolean;
  showNames: boolean;
}): string {
  const fiscal = fiscalPosition(opts.row.data_as_of);
  const named = fundLabel(opts.fund.fund_code, opts.fund.report_name, opts.names);
  const label = plainLabel(named.primary);
  const net = netOf(opts.fund);
  const deptRows = opts.departments
    .filter((dept) => dept.fund_code === opts.fund.fund_code)
    .map((dept) => ({ dept, net: netOf(dept) }))
    .filter((item) => !transferOnly(item.net))
    .sort((a, b) => b.net.current - a.net.current)
    .map(({ dept, net: deptNet }) => {
      const deptNamed = niceDept(dept, opts.names);
      return `<tr>
<td data-label="Department"><a class="name" href="/departments/${esc(dept.code)}">${esc(deptNamed.primary)}</a></td>
<td data-label="Budget" class="num">${money(deptNet.current)}</td>
<td data-label="Spent so far" class="num">${money(deptNet.spent)}</td>
<td data-label="Money left" class="num">${money(deptNet.left)}</td>
<td data-label="Budget versus spent">${compareBar(deptNet.current, deptNet.spent, fiscal.elapsedPct)}</td>
<td data-label="% spent" class="num">${pct(deptNet.spent, deptNet.current)}</td>
</tr>`;
    })
    .join("");
  const accountRows = opts.accounts
    .map((account) => {
      const href = `/departments/${esc(account.dept_code)}/${esc(account.object_code)}/${esc(account.project_code || "_")}`;
      const objectName = nameFor(opts.names.object.get(account.object_code), account.title || "", account.object_code);
      return `<tr>
<td data-label="Account"><a href="${href}">${esc(plainLabel(objectName.primary))}</a></td>
<td data-label="Spent so far" class="num">${money(account.ytd_cents)}</td>
<td data-label="Budget" class="num">${money(account.rev_cents)}</td>
</tr>`;
    })
    .join("");
  const vendors = mergeVendors(opts.vendors, opts.displayName);
  const transferNote = net.transfer > 0 ? `<p class="note">This fund also moved ${moneyWords(net.transfer)} to other county funds. That amount is not in the bar.</p>` : "";
  const body = `
<p class="crumb"><a href="/">Overview</a> / <a href="/funds">Funds</a> / ${esc(opts.fund.fund_code)}</p>
<h1>${esc(label)}</h1>
<p class="lede">Fund ${esc(opts.fund.fund_code)}. ${whatIs("fund")}</p>
${caption("This page shows the budget for this fund, then what has been spent.")}
${budgetHead(net, displayDate(fiscal.asOf), fiscal.elapsedPct)}
${transferNote}
${whereMoneyWent(opts.categories, vendors, opts.payments, opts.fund.fund_code)}
<section class="panel">
<h2>Departments in this fund</h2>
${caption("Each department is part of this fund. Open one to see its budget and what it spent.")}
<p class="scroll-hint">Swipe sideways to see the rest.</p>
<div class="table-wrap"><table class="stack-cards">
<thead><tr><th>Department</th><th class="num">Budget</th><th class="num">Spent so far</th><th class="num">Money left</th><th>Budget versus spent</th><th class="num">% spent</th></tr></thead>
<tbody>${deptRows || `<tr><td colspan="6" class="empty">No departments in this fund.</td></tr>`}</tbody>
</table></div>
</section>
<section class="panel">
<h2>Largest accounts</h2>
${caption("These accounts are where most of the money in this fund was spent. Open one for the payment lines.")}
<div class="table-wrap"><table class="stack-cards">
<thead><tr><th>Account</th><th class="num">Spent so far</th><th class="num">Budget</th></tr></thead>
<tbody>${accountRows || `<tr><td colspan="3" class="empty">No accounts yet.</td></tr>`}</tbody>
</table></div>
</section>`;
  return page({ title: `${label}. Budget Explorer`, active: "funds", body, dataAsOf: opts.row.data_as_of, admin: opts.isAdmin, csrf: opts.csrf, fy: fiscal.fyLabel, showNames: opts.showNames });
}

function whereMoneyWent(
  categories: CategorySpend[],
  vendors: { name: string; raw: string; cents: number }[],
  payments: PaymentRow[],
  fund: string,
  dept = "",
): string {
  const cats = categories
    .map(
      (category) =>
        `<div class="cat-row"><span>${esc(category.label)}</span>${compareBar(category.rev_cents, category.ytd_cents, -1)}<span class="num">${money(category.ytd_cents)} spent of ${money(category.rev_cents)}</span></div>`,
    )
    .join("");
  const payRows = payments
    .map((payment) => {
      const href = `/departments/${esc(payment.dept_code)}/${esc(payment.object_code)}/${esc(payment.project_code || "_")}`;
      return `<tr>
<td data-label="Date">${esc(displayDate(payment.pay_date))}</td>
<td data-label="Who got paid">${esc(payment.vendor_name || "")}</td>
<td data-label="Amount" class="num"><a href="${href}">${moneyExact(payment.amount_cents)}</a></td>
</tr>`;
    })
    .join("");
  const vendorLink = dept ? `/search?dept=${esc(dept)}&amp;vendor=` : `/search?fund=${esc(fund)}&amp;vendor=`;
  const vendorHtml = vendors.length
    ? `<ol class="vendor-bars">${vendors
        .map((vendor) => {
          const width = Math.max(2, Math.min(100, (vendor.cents / (vendors[0].cents || 1)) * 100));
          return `<li><a href="${vendorLink}${encodeURIComponent(vendor.raw)}">${esc(vendor.name)}</a><span class="vendor-track"><span class="vendor-fill" style="width:${width.toFixed(1)}%"></span></span><span class="num">${money(vendor.cents)}</span></li>`;
        })
        .join("")}</ol>`
    : `<p class="empty">No outside payments in this view.</p>`;
  return `<section class="panel">
<h2>Where the money went</h2>
${caption("These are the kinds of things this money paid for.")}
${cats || `<p class="empty">No spending categories yet.</p>`}
<h2>Who got paid</h2>
${caption("The businesses paid the most. Open one to see the payment lines. Money moved between county funds is not included.")}
${vendorHtml}
<h2>Largest payments</h2>
${caption("Open an amount to see that payment with the other lines on its account.")}
<p class="scroll-hint">Swipe sideways to see the rest.</p>
<div class="table-wrap"><table class="stack-cards">
<thead><tr><th>Date</th><th>Who got paid</th><th class="num">Amount</th></tr></thead>
<tbody>${payRows || `<tr><td colspan="3" class="empty">No payments yet.</td></tr>`}</tbody>
</table></div>
</section>`;
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
      : `<p class="note">This is a payroll account. Rows are labeled Payroll (batch total). Person names and individual pay are hidden.</p>`
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
${opts.filters.fund ? `<input type="hidden" name="fund" value="${esc(opts.filters.fund)}">` : ""}
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
<p class="scroll-hint">Swipe sideways to see the rest.</p>
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
<p class="lede">Ask in plain language. The first sentence is the answer. Figures come from this budget file.</p>
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
<p>The headline budget leaves out money moved from one county fund to another, so the same dollars are not counted twice. Status compares money spent with the share of the year that has passed. The year starts on October 1.</p>
<p>Sources: <a href="https://walton.civicweb.net/document/511445/">County budget documents</a> and <a href="https://midbaynews.com/post/walton-county-passes-328m-budget-in-narrow-3-2-vote">news report on the budget vote</a>.</p>
${row ? `<p class="code">Published import ${row.id}. Data as of ${esc(displayDate(row.data_as_of))}. ${row.account_count.toLocaleString("en-US")} accounts. ${row.payment_count.toLocaleString("en-US")} payment lines.</p>` : `<p>No import has been published yet.</p>`}
${baseUrl ? `<p>Public base URL: ${esc(baseUrl)}</p>` : `<p>No public base URL is configured. Links stay relative so this prototype can move to another hostname.</p>`}
</section>`;
  return page({ title: "About the data. Budget Explorer", active: "about", body, dataAsOf: row?.data_as_of, admin: isAdmin, csrf, fy: row ? fiscalPosition(row.data_as_of).fyLabel : undefined, showNames });
}

export function renderSheriff(row: ImportRow | null, csrf: string, isAdmin: boolean, showNames = true): string {
  const body = `
<h1>Sheriff</h1>
<p class="lede">The Sheriff is one of the county funds. Open it to see the budget and what has been spent.</p>
<section class="panel">
<p>This page does not keep a second set of figures. The fund page is the budget, the spending, and the payments.</p>
<p><a class="btn secondary" href="/funds">See the funds</a></p>
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
