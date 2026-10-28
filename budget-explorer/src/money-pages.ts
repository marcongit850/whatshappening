import { esc, firstSentence, gulfName, infoTip, money, moneyCompact } from "./format";
import { percentTenths, type AmountItem, type InterestLine, type InterestReport, type PublishedLedger, type ReserveFund } from "./published";

const SLICE_COLORS = ["#17505c", "#1f6a78", "#c9a24b", "#8a6f9e", "#c5603f", "#1b6542", "#7fb0b9", "#8a5b12", "#4d6d8a", "#5c4a3a", "#b9b4a6"];
const CLASS_COLORS: Record<string, string> = {
  committed: "#17505c",
  assigned: "#2f7d8c",
  restricted: "#c9a24b",
  unassigned: "#1b6542",
  nonspendable: "#8a6f9e",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function incomeCard(items: AmountItem[] | null, totalCents: number): string {
  const ready = items && items.length > 0 && totalCents > 0;
  const chart = ready ? donutChart(items, totalCents, moneyCompact(totalCents), "income", (item) => `/revenue#${item.key}`) : "";
  const caption = ready
    ? `This circle is audited income for the year that ended September 30, 2025. It does not include money moved between county funds.`
    : "Audited income by source will show here after the revenue figures are imported. It stays separate from what has been spent.";
  return `<div class="card income-card pie-card">
<div class="eyebrow">Income</div>
<h2>Where the money comes from${infoTip("income-card", firstSentence(caption))}</h2>
<p class="cap">${esc(caption)}</p>
${chart}
<p class="more-links"><a href="/revenue">See all income sources</a><a href="/reserves">How much is in savings</a></p>
</div>`;
}

export function revenueDocument(ledger: PublishedLedger, fundCodes: Set<string>): string {
  const income = withPercents(ledger.income);
  const total = ledger.incomeTotalCents;
  const property = income.find((item) => item.key === "property-taxes");
  const bed = income.find((item) => item.key === "bed-tax");
  const interest = income.find((item) => item.key === "interest");
  const transfers = ledger.notIncome.find((item) => item.key === "transfers");
  return `<p class="crumb"><a href="/">Overview</a> / Income</p>
<h1>Where the county's income comes from${infoTip("revenue-title", "The lead figures are audited actual income for the year that ended September 30, 2025.")}</h1>
<p class="lead page-intro">The lead figures are audited actual income for the year that ended September 30, 2025. Later years on this page are budgets, not money already collected.</p>
<section class="kpis">
<div class="card kpi k1"><div class="l"><span>Audited actual</span>${infoTip("rev-actual", "Income received in FY2025.")}</div><a class="n" href="#income-chart">${esc(moneyCompact(total))}</a><div class="s">Income received in FY2025. Money moved between county funds is not included.</div></div>
<div class="card kpi k2"><div class="l"><span>Property taxes</span>${property ? infoTip("rev-property", `${property.pct.toFixed(1)}% of audited income.`) : ""}</div><a class="n" href="#property-taxes">${esc(property ? moneyCompact(property.cents) : "")}</a><div class="s">${property ? `${property.pct.toFixed(1)}% of audited income.` : ""}</div></div>
<div class="card kpi k3"><div class="l"><span>Tourist (bed) tax</span>${infoTip("rev-bed", "A tax on short stays.")}</div><a class="n" href="#bed-tax">${esc(bed ? moneyCompact(bed.cents) : "")}</a><div class="s">A tax on short stays. It goes to the Tourist Development fund.</div></div>
<div class="card kpi k4"><div class="l"><span>Not income</span>${infoTip("rev-transfers", "Transfers between county funds.")}</div><a class="n" href="#not-income">${esc(transfers ? moneyCompact(transfers.cents) : "")}</a><div class="s">Transfers between county funds. The same dollars would be counted twice if this were called income.</div></div>
</section>
<section class="card" id="income-chart">
<div class="eyebrow">Audited actual</div>
<h2>FY2025 income by source${infoTip("income-chart", "Each slice is one source of income.")}</h2>
<p class="cap">Each slice is one source of income. Together they are ${esc(money(total))}.</p>
${donutChart(income, total, moneyCompact(total), "FY2025 income", (item) => `#${item.key}`, "FY2025 income", (item) => item.label === "Interest earned")}
${interest ? `<p class="interest-call"><a href="#interest">Interest earned</a> is ${esc(moneyCompact(interest.cents))} of this circle. <a href="/reserves#cash">Savings</a>.</p>` : ""}
${sourceLine("FY2025 audited financial report", income[0]?.sourceUrl || "", income[0]?.sourcePages || "")}
</section>
${income.map((item) => (item.key === "interest" ? interestBlock(ledger, item, total, fundCodes) : sourceBlock(item, total))).join("")}
${beachBlock(ledger, fundCodes)}
${notIncomeBlock(ledger)}
${budgetBlock(ledger)}
${bedBlock(ledger)}
${propertyBlock(ledger)}
${trendBlock(ledger)}
`;
}

export function reservesDocument(ledger: PublishedLedger, fundCodes: Set<string>): string {
  const reserves = ledger.reserves;
  return `<p class="crumb"><a href="/">Overview</a> / Savings</p>
<h1>Savings the county held${infoTip("reserves-title", "Audited year-end balance, not a live balance.")}</h1>
<p class="lead page-intro">Audited year-end balance, not a live balance. The FY2026 year-end balance will exist after the spring 2027 audit.</p>
<section class="kpis">
<div class="card kpi k1"><div class="l"><span>September 30, 2025</span>${infoTip("res-total", "Savings in all governmental funds.")}</div><a class="n" href="#by-type">${esc(moneyCompact(reserves.totalCents))}</a><div class="s">Savings in all governmental funds. A year earlier it was ${esc(moneyCompact(reserves.priorCents))}.</div></div>
<div class="card kpi k2"><div class="l"><span>Free to spend</span>${infoTip("res-free", "General Fund money with no purpose set.")}</div><a class="n" href="#class-unassigned">${esc(moneyCompact(reserves.classes.find((item) => item.key === "unassigned")?.cents || 0))}</a><div class="s">General Fund money with no purpose set. The rest is already spoken for.</div></div>
<div class="card kpi k4"><div class="l"><span>Policy cushion</span>${infoTip("res-policy", "Project calculation.")}</div><a class="n" href="#policy">about 5 months</a><div class="s">Project calculation. The rule asks for at least two months of General Fund spending.</div></div>
</section>
<section class="card" id="by-type">
<div class="eyebrow">Audited year-end balance</div>
<h2>How the savings are labeled${infoTip("res-labels", "Fund balance means savings left in a fund.")}</h2>
<p class="cap">Fund balance means savings left in a fund. Most of it is limited to a purpose. Only the free-to-spend piece has no strings.</p>
${classBar(reserves.classes, "savings")}
<div class="stat-grid">
${reserves.classes
  .map(
    (item) => `<div class="card kpi"><div class="l"><span>${esc(item.label)}</span>${infoTip(`res-kpi-${item.key}`, classTip(item.key, item.plain))}</div><a class="n" href="#class-${esc(item.key)}">${esc(moneyCompact(item.cents))}</a><div class="s">${item.pct.toFixed(1)}% of savings. ${esc(item.plain)}</div></div>`,
  )
  .join("")}
</div>
${sourceLine("FY2025 audited financial report", reserves.sourceUrl, reserves.sourcePages)}
</section>
${reserves.classes
  .map((item) => {
    const holders = reserves.funds
      .map((fund) => ({ fund, slice: fund.classes.find((cls) => cls.key === item.key) }))
      .filter((row) => (row.slice?.cents || 0) > 0);
    return `<section class="card" id="class-${esc(item.key)}">
<h2>${esc(item.label)}${infoTip(`res-class-${item.key}`, classTip(item.key, item.plain))}</h2>
<p class="figure-n">${esc(moneyCompact(item.cents))}</p>
<p class="cap">${item.pct.toFixed(1)}% of savings. Exact amount ${esc(money(item.cents))}. ${esc(item.plain)}</p>
<ul class="holder-list">
${holders
  .map((row) => {
    const href = fundHref(row.fund, fundCodes);
    const purpose = row.slice?.purpose ? firstSentence(row.slice.purpose) : "";
    return `<li><a href="${esc(href)}">${esc(row.fund.label)}</a>${purpose ? infoTip(`hold-${item.key}-${row.fund.key}`, purpose) : ""} <b>${esc(money(row.slice?.cents || 0))}</b>${row.slice?.purpose ? `<span>${esc(row.slice.purpose)}</span>` : ""}</li>`;
  })
  .join("")}
</ul>
</section>`;
  })
  .join("")}
<section class="card" id="by-fund">
<div class="eyebrow">By fund</div>
<h2>Which fund holds the savings${infoTip("res-by-fund", "Open a fund to see its spending page, when this site has that fund.")}</h2>
<p class="cap">Open a fund to see its spending page, when this site has that fund. The color bar is the same split as above.</p>
${reserves.funds.map((fund) => fundRow(fund, fundCodes)).join("")}
${sourceLine("FY2025 audited financial report", reserves.sourceUrl, reserves.sourcePages)}
</section>
<section class="card" id="policy">
<div class="eyebrow">Project calculation</div>
<h2>General Fund reserve policy${infoTip("res-rule", "Fund balance is the savings left in a fund at the end of the year.")}</h2>
<p class="figure-n">${esc(moneyCompact(reserves.policy.unrestrictedCents))}</p>
<p class="cap">About 5 months of General Fund spending. The rule says at least two months. This months figure is the project's calculation.</p>
<p>${esc(reserves.policy.detail)}</p>
<p>Two months of the actual spending and transfers out used here is ${esc(money(reserves.policy.twoMonthsCents))}. The policy's word "unrestricted" adds committed, assigned, and free to spend. It is wider than the free-to-spend amount alone.</p>
<p>It is not a pile of cash you can spend tomorrow.</p>
${sourceLine("Fund Balance Policy, Resolution 2012-59", reserves.policy.sourceUrl, "")}
</section>
<section class="card" id="cash">
<h2>Savings are not the same as cash${infoTip("res-cash", firstSentence(gulfName(reserves.cashDetail)))}</h2>
<p class="cap">${esc(gulfName(reserves.cashDetail))} Cash and equivalents were ${esc(money(reserves.cashCents))}. Investments on those same lines were ${esc(money(reserves.investmentsCents))}. <a href="/revenue#interest">Interest earned</a> on investments is income.</p>
${sourceLine("FY2025 audited financial report", reserves.cashSourceUrl, reserves.cashPages)}
</section>
`;
}

export function fundSavings(fund: ReserveFund, asOf: string): string {
  const when = longDate(asOf);
  return `<section class="card fund-savings">
<div class="eyebrow">Audited year-end balance</div>
<h2>Savings in this fund${infoTip(`save-${fund.key}`, "This is the audited year-end balance, not a live balance.")}</h2>
<p class="figure-n">${esc(moneyCompact(fund.cents))}</p>
<p class="cap">Held on ${esc(when)}. This is the audited year-end balance, not a live balance. A year earlier it was ${esc(moneyCompact(fund.priorCents))}.</p>
${classBar(
  fund.classes.map((item) => ({ ...item, pct: fund.cents ? (item.cents / fund.cents) * 100 : 0 })),
  `save-${fund.key}`,
)}
<ul class="holder-list">
${fund.classes
  .filter((item) => item.cents > 0)
  .map((item) => `<li><a href="/reserves#class-${esc(item.key)}">${esc(item.label)}</a>${infoTip(`save-row-${fund.key}-${item.key}`, classTip(item.key, ""))} <b>${esc(money(item.cents))}</b>${item.purpose ? `<span>${esc(item.purpose)}</span>` : ""}</li>`)
  .join("")}
</ul>
${fund.detail ? `<p>${esc(gulfName(fund.detail))}</p>` : ""}
<p class="more-links"><a href="/reserves#fund-${esc(fund.key)}">How much is in savings</a></p>
</section>`;
}

export function revenueEmpty(): string {
  return `<h1>Where the county's income comes from</h1>
<p class="lead">Audited income by source is not loaded in this copy of the database yet.</p>
<p class="more-links"><a href="/reserves">How much is in savings</a></p>`;
}

export function reservesEmpty(): string {
  return `<h1>Savings the county held</h1>
<p class="lead">Audited year-end savings are not loaded in this copy of the database yet.</p>
<p class="more-links"><a href="/revenue">See all income sources</a></p>`;
}

function interestBlock(ledger: PublishedLedger, item: AmountItem, total: number, fundCodes: Set<string>): string {
  const report = ledger.interest;
  const share = total ? item.pct.toFixed(1) : "0.0";
  const caption = interestCaption(report);
  const majors = report.fy2025.filter((line) => line.budgetCents != null);
  const smaller = report.fy2025.filter((line) => line.budgetCents == null);
  if (!report.fy2025.length) return sourceBlock(item, total);
  return `<section class="card source-block" id="interest">
<p class="eyebrow">${esc(item.status)}</p>
<h2>Interest and investment earnings${caption ? infoTip("interest-gap", caption) : ""}</h2>
<p class="figure-n">${esc(moneyCompact(item.cents))}</p>
<p class="cap">${share}% of audited FY2025 income. Exact amount ${esc(money(item.cents))}.</p>
${caption ? `<p class="interest-note">${esc(caption)}</p>` : ""}
<table class="interest-table">
<thead><tr><th>Fund</th><th class="num">FY2025 earned</th><th class="num">FY2025 budget</th></tr></thead>
<tbody>
${majors.map((line) => interestRow(line, fundCodes, true)).join("")}
<tr class="interest-total"><td>Six major funds</td><td class="num">${esc(money(report.majorEarnedCents))}</td><td class="num">${esc(money(report.majorBudgetCents))}</td></tr>
${smaller.map((line) => interestRow(line, fundCodes, true)).join("")}
</tbody>
</table>
<p class="interest-note">On these six funds the original budget and the final budget are the same.</p>
<table class="interest-table">
<thead><tr><th>Fund</th><th class="num">FY2027 budget</th></tr></thead>
<tbody>
${report.fy2027.map((line) => interestRow(line, fundCodes, false)).join("")}
<tr class="interest-total"><td>Adopted interest</td><td class="num">${esc(money(report.fy2027Cents))}</td></tr>
</tbody>
</table>
${report.excludedSelfInsuranceCents ? `<p class="interest-note">The FY2027 budget leaves out ${esc(money(report.excludedSelfInsuranceCents))} of interest in the Self-Insurance fund. That fund is outside the adopted total.</p>` : ""}
<p class="interest-note">The earnings are recorded in the fund that earned them. The audit says investment earnings are used to offset any projected revenue shortfalls in the budget.</p>
<p class="interest-note">Investments are reported at fair value, and U.S. Treasury notes are valued at quoted market. FY2022 was a loss, so the audited figure is not only cash interest.</p>
${interestTrend(report)}
<p class="more-links"><a href="/reserves#cash">How much is in savings</a></p>
${sourceLine("FY2025 audited financial report", item.sourceUrl, item.sourcePages)}
${sourceLine("FY2025 budget to actual", report.budgetSourceUrl, report.budgetPages)}
${sourceLine("Ten-year schedule", report.trendSourceUrl, report.trendPages)}
${sourceLine("County FY2027 revenue file", report.fy2027SourceUrl, report.fy2027Pages)}
</section>`;
}

function interestCaption(report: InterestReport): string {
  if (!report.majorBudgetCents || !report.majorEarnedCents) return "";
  return `The county budgets far less interest than it earns. In FY2025 the six major funds budgeted about ${aboutMillions(report.majorBudgetCents)} and earned ${aboutMillions(report.majorEarnedCents)}.`;
}

function aboutMillions(cents: number): string {
  return `$${(Math.abs(cents) / 100 / 1_000_000).toFixed(1)}M`;
}

function interestRow(line: InterestLine, fundCodes: Set<string>, showEarned: boolean): string {
  const name = line.fundCode && fundCodes.has(line.fundCode) ? `<a href="/funds/${esc(line.fundCode)}">${esc(line.label)}</a>` : esc(line.label);
  const budget = line.budgetCents == null ? "Not combined" : esc(money(line.budgetCents));
  if (!showEarned) return `<tr><td>${name}</td><td class="num">${budget}</td></tr>`;
  return `<tr><td>${name}</td><td class="num">${esc(money(line.earnedCents || 0))}</td><td class="num">${budget}</td></tr>`;
}

function interestTrend(report: InterestReport): string {
  const byYear = new Map(report.trend.map((point) => [point.year, point.cents]));
  const loss = byYear.get(2022);
  const y2023 = byYear.get(2023);
  const y2024 = byYear.get(2024);
  const y2025 = byYear.get(2025);
  if (loss == null || y2023 == null || y2024 == null || y2025 == null) return "";
  return `<p class="interest-trend">Ten-year schedule, FY2022 to FY2025: loss of ${esc(trendMillions(Math.abs(loss)))}, then ${esc(trendMillions(y2023))}, ${esc(trendMillions(y2024))}, and ${esc(moneyCompact(y2025))}.</p>`;
}

function trendMillions(cents: number): string {
  return `$${(cents / 100 / 1_000_000).toFixed(2)}M`;
}

function sourceBlock(item: AmountItem, total: number): string {
  const share = total ? item.pct.toFixed(1) : "0.0";
  return `<section class="card source-block" id="${esc(item.key)}">
<p class="eyebrow">${esc(item.status)}</p>
<h2>${esc(item.label)}${infoTip(`src-${item.key}`, firstSentence(item.detail))}</h2>
<p class="figure-n">${esc(moneyCompact(item.cents))}</p>
<p class="cap">${share}% of audited FY2025 income. Exact amount ${esc(money(item.cents))}.</p>
<p>${esc(gulfName(item.detail))}</p>
${sourceLine("FY2025 audited financial report", item.sourceUrl, item.sourcePages)}
</section>`;
}

function beachBlock(ledger: PublishedLedger, fundCodes: Set<string>): string {
  const href = fundCodes.has("001") ? "/funds/001" : "#permits";
  return `<section class="card" id="beach-vending">
<div class="eyebrow">Budget, not an audited receipt</div>
<h2>Beach vending${infoTip("beach", "They are not a separate slice of the FY2025 income circle.")}</h2>
<p class="cap">These two lines are in the FY2027 budget, inside General Fund account 329004. They are not a separate slice of the FY2025 income circle.</p>
${ledger.beach
  .map(
    (line, index) => `<article class="cmp">
<h3><a href="${esc(href)}">${esc(line.label)}</a>${infoTip(`beach-${index}`, firstSentence(line.detail || "Budget for one year."))}</h3>
<p class="figure-n">${esc(moneyCompact(line.cents))}</p>
<p class="cap">Budget for one year.</p>
<p>${esc(gulfName(line.detail))}</p>
</article>`,
  )
  .join("")}
<p>${esc(ledger.beachNote)}</p>
${sourceLine("County FY2027 revenue file", ledger.beach[0]?.sourceUrl || "", "")}
</section>`;
}

function notIncomeBlock(ledger: PublishedLedger): string {
  return `<section class="card" id="not-income">
<div class="eyebrow">Not income</div>
<h2>Savings brought forward and transfers${infoTip("not-income", "These amounts are real, and they are not income received from outside the county.")}</h2>
<p class="cap">These amounts are real, and they are not income received from outside the county.</p>
<p>It is not new income. Counting it as income would count the same dollars twice.</p>
${ledger.notIncome
  .map(
    (item) => `<article class="cmp" id="${esc(item.key)}">
<h3>${esc(item.label)}${item.key === "transfers" ? infoTip("transfer", "A transfer moves money from one county fund to another.") : infoTip(`aside-${item.key}`, firstSentence(item.detail))}</h3>
<p class="figure-n">${esc(moneyCompact(item.cents))}</p>
<p class="cap">${esc(item.status)}. Exact amount ${esc(money(item.cents))}.</p>
<p>${esc(gulfName(item.detail))}</p>
</article>`,
  )
  .join("")}
<p class="more-links"><a href="/reserves">How much is in savings</a></p>
${sourceLine("FY2025 audited financial report", ledger.notIncome[0]?.sourceUrl || "", ledger.notIncome[0]?.sourcePages || "")}
</section>`;
}

function budgetBlock(ledger: PublishedLedger): string {
  const rows = [
    ["Property taxes", "property"],
    ["Tourist (bed) tax", "tourist"],
    ["Sales taxes", "sales"],
    ["Gas taxes", "gas"],
    ["Fees and charges", "fees"],
    ["Permits", "permit"],
    ["Fines", "fine"],
  ];
  const year = (fiscal: number) => ledger.budgets.find((item) => item.fiscalYear === fiscal);
  const y2026 = year(2026);
  const y2027 = year(2027);
  const actual = (needle: string) => ledger.income.find((item) => item.label.toLowerCase().includes(needle) || item.key.includes(needle));
  const budgetItem = (pack: typeof y2026, needle: string) =>
    pack ? [...pack.items, ...pack.aside].find((item) => item.label.toLowerCase().includes(needle)) : undefined;
  const line = (cents: number | undefined, kind: string) =>
    `<p><span>${esc(kind)}</span><b>${cents == null ? "Not a separate line" : esc(moneyCompact(cents))}</b></p>`;
  return `<section class="card" id="budgets">
<div class="eyebrow">Budget, not actual</div>
<h2>Adopted budgets next to the audit${infoTip("budgets", "FY2025 is audited actual.")}</h2>
<p class="cap">FY2025 is audited actual. FY2026 and FY2027 are budgets. The FY2026 lines are the last by-source table published before the final hearing. The adopted FY2026 total is ${esc(money(y2026?.adoptedCents || 0))}.</p>
${rows
  .map(([label, needle]) => {
    const a = actual(needle);
    const b = budgetItem(y2026, needle);
    const c = budgetItem(y2027, needle);
    const permitNote = label === "Permits"
      ? `<p>FY2025 $7.41M includes $4.16M of Building Department permits. The FY2026 and FY2027 budgets show no building permit revenue, so these rows are not comparable.</p>`
      : "";
    return `<article class="cmp"><h3>${esc(label)}</h3>${line(a?.cents, "Audited actual, FY2025")}${line(b?.cents, "Tentative budget, FY2026")}${line(c?.cents, "Budget, FY2027")}${permitNote}</article>`;
  })
  .join("")}
${ledger.budgets
  .map((pack) => {
    const items = withPercents(pack.items);
    return `<div class="budget-year" id="budget-${pack.fiscalYear}">
<h3>FY${pack.fiscalYear} ${esc(pack.basisLabel)}${infoTip(`budget-${pack.fiscalYear}`, `Adopted total ${money(pack.adoptedCents)}.`)}</h3>
<p class="figure-n">${esc(moneyCompact(pack.adoptedCents))}</p>
<p class="cap">Adopted total ${esc(money(pack.adoptedCents))}. The lines below add to ${esc(money(pack.totalCents))}. ${esc(pack.detail)}</p>
${items
  .map(
    (item) => `<a class="cmp" href="#budget-${pack.fiscalYear}"><h3>${esc(item.label)}</h3><p><span>Budget</span><b>${esc(moneyCompact(item.cents))}</b></p><p><span>Share of this budget's income lines</span><b>${item.pct.toFixed(1)}%</b></p></a>`,
  )
  .join("")}
${pack.aside
  .map(
    (item) => `<article class="cmp"><h3>${esc(item.label)}</h3><p class="figure-n">${esc(moneyCompact(item.cents))}</p><p class="cap">Not income. ${esc(item.detail)}</p></article>`,
  )
  .join("")}
${sourceLine(pack.fiscalYear === 2026 ? "FY2026 tentative budget in brief" : "Agenda packet, 9/28/2026", pack.sourceUrl, pack.sourcePages)}
</div>`;
  })
  .join("")}
</section>`;
}

function bedBlock(ledger: PublishedLedger): string {
  const bed = ledger.bedTax;
  return `<section class="card" id="bed-collections">
<div class="eyebrow">Collections, not the audit</div>
<h2>Bed tax so far this year${infoTip("bed-ytd", "Collected from October 2025 through August 2026.")}</h2>
<p class="figure-n">${esc(moneyCompact(bed.ytdCents))}</p>
<p class="cap">Collected from October 2025 through August 2026. That is <span class="${bed.changePct < 0 ? "chg-down" : "chg-up"}">${bed.changePct.toFixed(1)}%</span> more than the same months a year earlier.</p>
<p>${esc(bed.detail)}</p>
<p>The FY2025 audited bed tax was ${esc(money(bed.actualCents))}. The FY2026 tentative budget for bed tax was ${esc(money(bed.budgetCents))}.</p>
${sourceLine("Clerk tourist development tax collections report", bed.sourceUrl, "")}
</section>`;
}

function propertyBlock(ledger: PublishedLedger): string {
  const property = ledger.property;
  const slice = ledger.income.find((item) => item.key === "property-taxes");
  return `<section class="card" id="property-share">
<div class="eyebrow">Audited actual</div>
<h2>Property tax share${infoTip("property-share", "Property taxes were this share of audited FY2025 income.")}</h2>
<p class="figure-n">${slice ? slice.pct.toFixed(1) : property.sharePct.toFixed(1)}%</p>
<p class="cap">Property taxes were this share of audited FY2025 income. The rate below is the county millage, which is the tax rate per $1,000 of taxable value.</p>
${property.values
  .map(
    (value) => `<article class="cmp"><h3>${esc(value.year)} taxable value</h3><p><span>${value.approx ? "Approximate taxable value" : "Taxable value"}</span><b>${esc(moneyBillions(value.dollars))}</b></p></article>`,
  )
  .join("")}
${property.millage
  .map((rate) => `<article class="cmp"><h3>${esc(rate.year)} property tax rate</h3><p><span>Millage</span><b>${esc(rate.rate)}</b></p>${sourceLine("Millage source", rate.sourceUrl, "")}</article>`)
  .join("")}
<p>${esc(property.detail)}</p>
${sourceLine("Taxable value", property.values[0]?.sourceUrl || "", property.values[0]?.pages || "")}
</section>`;
}

function trendBlock(ledger: PublishedLedger): string {
  const max = Math.max(...ledger.trend.map((point) => point.cents), 1);
  return `<section class="card">
<div class="eyebrow">Audited actual</div>
<h2>Income over ten years${infoTip("trend", "Each bar is governmental fund income for that year.")}</h2>
<p class="cap">Each bar is governmental fund income for that year. The last bar is FY2025. Earlier bars come from the prior audit's ten-year table. Use 2020 onward if you compare years, because the older printed rows do not all agree.</p>
<div class="trend">
${ledger.trend
  .map((point) => {
    const height = Math.max(4, (point.cents / max) * 120);
    return `<a href="${esc(point.year === 2025 ? ledger.income[0]?.sourceUrl || ledger.trendSourceUrl : ledger.trendSourceUrl)}"><span class="trend-bar" style="height:${height.toFixed(0)}px"></span><span>${String(point.year).slice(2)}</span></a>`;
  })
  .join("")}
</div>
${sourceLine("Ten-year revenue table", ledger.trendSourceUrl, ledger.trendPages)}
</section>`;
}

function fundRow(fund: ReserveFund, fundCodes: Set<string>): string {
  const href = fundHref(fund, fundCodes);
  const linkNote = fund.fundCode && fundCodes.has(fund.fundCode) ? "Opens this fund's spending page." : "This rollup is more than one fund, so it stays on the savings page.";
  const detail = fund.detail ? gulfName(fund.detail) : "";
  const more = detail.slice(firstSentence(detail).length).trim();
  return `<article class="reserve-fund" id="fund-${esc(fund.key)}">
<div class="reserve-link"><span class="reserve-name"><a href="${esc(href)}">${esc(fund.label)}</a>${detail ? infoTip(`reserve-${fund.key}`, detail) : ""}</span><a class="reserve-amt" href="${esc(href)}">${esc(moneyCompact(fund.cents))}</a></div>
<p class="cap">Exact amount ${esc(money(fund.cents))}. A year earlier, ${esc(money(fund.priorCents))}. ${esc(linkNote)}</p>
${classBar(
  fund.classes.map((item) => ({
    key: item.key,
    label: item.label,
    cents: item.cents,
    pct: fund.cents ? (item.cents / fund.cents) * 100 : 0,
  })),
  `reserve-bar-${fund.key}`,
)}
<ul class="holder-list">
${fund.classes
  .filter((item) => item.cents > 0)
  .map((item) => `<li><a href="#class-${esc(item.key)}">${esc(item.label)}</a>${infoTip(`reserve-hold-${fund.key}-${item.key}`, classTip(item.key, ""))} <b>${esc(moneyCompact(item.cents))}</b></li>`)
  .join("")}
</ul>
${more ? `<p>${esc(more)}</p>` : ""}
</article>`;
}

function classBar(items: { key: string; label: string; cents: number; pct: number }[], prefix: string): string {
  const shown = items.filter((item) => item.cents > 0);
  return `<div class="splitbar" role="img" aria-label="Split of savings">${shown
    .map((item) => {
      const color = CLASS_COLORS[item.key] || "#8a6f9e";
      return `<a href="#class-${esc(item.key)}" style="width:${item.pct.toFixed(2)}%;background:${color}"><span class="sr">${esc(item.label)} ${esc(moneyCompact(item.cents))}</span></a>`;
    })
    .join("")}</div>
<div class="legend class-legend">${shown
  .map((item) => `<span class="legend-tip"><a href="#class-${esc(item.key)}"><i style="background:${CLASS_COLORS[item.key] || "#8a6f9e"}"></i>${esc(item.label)} ${item.pct.toFixed(1)}%</a>${infoTip(`${prefix}-${item.key}`, classTip(item.key, ""))}</span>`)
  .join("")}</div>`;
}

function classTip(key: string, plain: string): string {
  const known: Record<string, string> = {
    committed: "Committed means the commissioners have voted to use the money for a stated purpose.",
    assigned: "Assigned means the county plans to use the money for something, without the stricter vote that committed money needs.",
    restricted: "Restricted means a law or an outside rule says what the money is for.",
    unassigned: "Unassigned means no purpose has been set. On these books, only the General Fund has that kind of savings.",
    nonspendable: "Tied up in supplies, bills paid ahead, or a loan.",
  };
  return known[key] || plain;
}

export function donutChart<T extends { label: string; cents: number; pct: number }>(
  items: T[],
  total: number,
  center: string,
  centerNote: string,
  hrefFor: (item: T) => string,
  ariaLabel = centerNote,
  emphasize?: (item: T) => boolean,
): string {
  const r = 72;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = items
    .map((item, index) => {
      const length = total > 0 ? (item.cents / total) * circumference : 0;
      const gap = length > 4 ? 0.9 : 0;
      const drawn = Math.max(length - gap, length > 0 ? 0.35 : 0);
      const marked = emphasize?.(item) === true;
      const color = marked ? "#8a5b12" : SLICE_COLORS[index % SLICE_COLORS.length];
      const href = hrefFor(item);
      const arc = `<a${marked ? ` class="arc-mark"` : ""} href="${esc(href)}"><circle r="${r}" cx="100" cy="100" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${drawn.toFixed(2)} ${(circumference - drawn).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(item.label)} ${esc(moneyCompact(item.cents))}</title></circle></a>`;
      offset += length;
      return item.cents > 0 ? arc : "";
    })
    .join("");
  const legend = items
    .map((item, index) => {
      const marked = emphasize?.(item) === true;
      const color = marked ? "#8a5b12" : SLICE_COLORS[index % SLICE_COLORS.length];
      return `<a class="lg${marked ? " lg-mark" : ""}" href="${esc(hrefFor(item))}"><i style="background:${color}"></i><span class="donut-label">${esc(item.label)}</span><b>${item.pct.toFixed(1)}%<span class="donut-amt">${esc(moneyCompact(item.cents))}</span></b></a>`;
    })
    .join("");
  return `<div class="donutwrap"><svg viewBox="0 0 200 200" class="donut" role="img" aria-label="${esc(ariaLabel)}">${arcs}<text x="100" y="96" text-anchor="middle" class="dn1">${esc(center)}</text><text x="100" y="116" text-anchor="middle" class="dn2">${esc(centerNote)}</text></svg><div class="lgs">${legend}</div></div>`;
}

function withPercents(items: AmountItem[]): AmountItem[] {
  const pcts = percentTenths(items.map((item) => item.cents));
  return items.map((item, index) => ({ ...item, pct: pcts[index] ?? item.pct }));
}

function fundHref(fund: ReserveFund, fundCodes: Set<string>): string {
  if (fund.fundCode && fundCodes.has(fund.fundCode)) return `/funds/${fund.fundCode}`;
  return `#fund-${fund.key}`;
}

function sourceLine(label: string, url: string, pages: string): string {
  if (!url) return "";
  const page = pages ? `, ${esc(pages)}` : "";
  return `<p class="src">Source. <a href="${esc(url)}">${esc(label)}</a>${page}.</p>`;
}

function moneyBillions(dollars: number): string {
  return `$${(dollars / 1_000_000_000).toFixed(1)} billion`;
}

function longDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

