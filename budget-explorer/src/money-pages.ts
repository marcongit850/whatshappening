import { esc, gulfName, money, moneyCompact } from "./format";
import { percentTenths, type AmountItem, type PublishedLedger, type ReserveFund } from "./published";

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
  const chart = ready ? donut(items, totalCents, moneyCompact(totalCents), "income", (item) => `/revenue#${item.key}`) : "";
  const caption = ready
    ? `This circle is audited income for the year that ended September 30, 2025. It does not include money moved between county funds.`
    : "Audited income by source will show here after the revenue figures are imported. It stays separate from what has been spent.";
  return `<div class="card income-card">
<div class="eyebrow">Income</div>
<h2>Where the money comes from</h2>
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
  const transfers = ledger.notIncome.find((item) => item.key === "transfers");
  return `<p class="crumb"><a href="/">Overview</a> / Income</p>
<h1>Where the county's income comes from</h1>
<p class="lead page-intro">The lead figures are audited actual income for the year that ended September 30, 2025. Later years on this page are budgets, not money already collected.</p>
<section class="kpis">
<a class="card kpi k1" href="#income-chart"><div class="l">Audited actual</div><div class="n">${esc(moneyCompact(total))}</div><div class="s">Income received in FY2025. Money moved between county funds is not included.</div></a>
<a class="card kpi k2" href="#property-taxes"><div class="l">Property taxes</div><div class="n">${esc(property ? moneyCompact(property.cents) : "")}</div><div class="s">${property ? `${property.pct.toFixed(1)}% of audited income.` : ""}</div></a>
<a class="card kpi k3" href="#bed-tax"><div class="l">Tourist (bed) tax</div><div class="n">${esc(bed ? moneyCompact(bed.cents) : "")}</div><div class="s">A tax on short stays. It goes to the Tourist Development fund.</div></a>
<a class="card kpi k4" href="#not-income"><div class="l">Not income</div><div class="n">${esc(transfers ? moneyCompact(transfers.cents) : "")}</div><div class="s">Transfers between county funds. The same dollars would be counted twice if this were called income.</div></a>
</section>
<section class="card" id="income-chart">
<div class="eyebrow">Audited actual</div>
<h2>FY2025 income by source</h2>
<p class="cap">Each slice is one source of income. Together they are ${esc(money(total))}.</p>
${donut(income, total, moneyCompact(total), "FY2025 income", (item) => `#${item.key}`)}
${sourceLine("FY2025 audited financial report", income[0]?.sourceUrl || "", income[0]?.sourcePages || "")}
</section>
${income.map((item) => sourceBlock(item, total)).join("")}
${beachBlock(ledger, fundCodes)}
${notIncomeBlock(ledger)}
${budgetBlock(ledger)}
${bedBlock(ledger)}
${propertyBlock(ledger)}
${trendBlock(ledger)}
${termList(TRANSFER_TERMS)}
`;
}

export function reservesDocument(ledger: PublishedLedger, fundCodes: Set<string>): string {
  const reserves = ledger.reserves;
  const months = reserves.policy.months.toFixed(1);
  return `<p class="crumb"><a href="/">Overview</a> / Savings</p>
<h1>Savings the county held</h1>
<p class="lead page-intro">Audited year-end balance, not a live balance. The FY2026 year-end balance will exist after the spring 2027 audit.</p>
<section class="kpis">
<a class="card kpi k1" href="#by-type"><div class="l">September 30, 2025</div><div class="n">${esc(moneyCompact(reserves.totalCents))}</div><div class="s">Savings in all governmental funds. A year earlier it was ${esc(moneyCompact(reserves.priorCents))}.</div></a>
<a class="card kpi k2" href="#class-unassigned"><div class="l">Free to spend</div><div class="n">${esc(moneyCompact(reserves.classes.find((item) => item.key === "unassigned")?.cents || 0))}</div><div class="s">General Fund money with no purpose set. The rest is already spoken for.</div></a>
<a class="card kpi k4" href="#policy"><div class="l">Policy cushion</div><div class="n">${esc(months)} mo</div><div class="s">Project calculation. The rule asks for at least two months of General Fund spending.</div></a>
</section>
<section class="card" id="by-type">
<div class="eyebrow">Audited year-end balance</div>
<h2>How the savings are labeled</h2>
<p class="cap">Fund balance means savings left in a fund. Most of it is limited to a purpose. Only the free-to-spend piece has no strings.</p>
${classBar(reserves.classes)}
<div class="stat-grid">
${reserves.classes
  .map(
    (item) => `<a class="card kpi" href="#class-${esc(item.key)}"><div class="l">${esc(item.label)}</div><div class="n">${esc(moneyCompact(item.cents))}</div><div class="s">${item.pct.toFixed(1)}% of savings. ${esc(item.plain)}</div></a>`,
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
<h2>${esc(item.label)}</h2>
<p class="figure-n">${esc(moneyCompact(item.cents))}</p>
<p class="cap">${item.pct.toFixed(1)}% of savings. Exact amount ${esc(money(item.cents))}. ${esc(item.plain)}</p>
<ul class="holder-list">
${holders
  .map((row) => {
    const href = fundHref(row.fund, fundCodes);
    return `<li><a href="${esc(href)}">${esc(row.fund.label)}</a> <b>${esc(money(row.slice?.cents || 0))}</b>${row.slice?.purpose ? `<span>${esc(row.slice.purpose)}</span>` : ""}</li>`;
  })
  .join("")}
</ul>
</section>`;
  })
  .join("")}
<section class="card" id="by-fund">
<div class="eyebrow">By fund</div>
<h2>Which fund holds the savings</h2>
<p class="cap">Open a fund to see its spending page, when this site has that fund. The color bar is the same split as above.</p>
${reserves.funds.map((fund) => fundRow(fund, fundCodes)).join("")}
${sourceLine("FY2025 audited financial report", reserves.sourceUrl, reserves.sourcePages)}
</section>
<section class="card" id="policy">
<div class="eyebrow">Project calculation</div>
<h2>General Fund reserve policy</h2>
<p class="figure-n">${esc(moneyCompact(reserves.policy.unrestrictedCents))}</p>
<p class="cap">About ${esc(months)} months of General Fund spending. The rule says at least two months. This months figure is the project's calculation.</p>
<p>${esc(reserves.policy.detail)}</p>
<p>Two months of the actual spending and transfers out used here is ${esc(money(reserves.policy.twoMonthsCents))}. The policy's word "unrestricted" adds committed, assigned, and free to spend. It is wider than the free-to-spend amount alone.</p>
${whatIs("Fund balance", "Fund balance is the savings left in a fund at the end of the year. It is not a pile of cash you can spend tomorrow.")}
${sourceLine("Fund Balance Policy, Resolution 2012-59", reserves.policy.sourceUrl, "")}
</section>
<section class="card">
<h2>Savings are not the same as cash</h2>
<p class="cap">${esc(gulfName(reserves.cashDetail))} Cash and equivalents were ${esc(money(reserves.cashCents))}. Investments on those same lines were ${esc(money(reserves.investmentsCents))}.</p>
${sourceLine("FY2025 audited financial report", reserves.cashSourceUrl, reserves.cashPages)}
</section>
${termList(RESERVE_TERMS)}
`;
}

export function fundSavings(fund: ReserveFund, asOf: string): string {
  const when = longDate(asOf);
  return `<section class="card fund-savings">
<div class="eyebrow">Audited year-end balance</div>
<h2>Savings in this fund</h2>
<p class="figure-n">${esc(moneyCompact(fund.cents))}</p>
<p class="cap">Held on ${esc(when)}. This is the audited year-end balance, not a live balance. A year earlier it was ${esc(moneyCompact(fund.priorCents))}.</p>
${classBar(fund.classes.map((item) => ({ ...item, pct: fund.cents ? (item.cents / fund.cents) * 100 : 0, plain: "" })))}
<ul class="holder-list">
${fund.classes
  .filter((item) => item.cents > 0)
  .map((item) => `<li><a href="/reserves#class-${esc(item.key)}">${esc(item.label)}</a> <b>${esc(money(item.cents))}</b>${item.purpose ? `<span>${esc(item.purpose)}</span>` : ""}</li>`)
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

function sourceBlock(item: AmountItem, total: number): string {
  const share = total ? item.pct.toFixed(1) : "0.0";
  return `<section class="card source-block" id="${esc(item.key)}">
<p class="eyebrow">${esc(item.status)}</p>
<h2>${esc(item.label)}</h2>
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
<h2>Beach vending</h2>
<p class="cap">These two lines are in the FY2027 budget, inside General Fund account 329004. They are not a separate slice of the FY2025 income circle.</p>
${ledger.beach
  .map(
    (line) => `<article class="cmp">
<h3><a href="${esc(href)}">${esc(line.label)}</a></h3>
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
<h2>Savings brought forward and transfers</h2>
<p class="cap">These amounts are real, and they are not income received from outside the county.</p>
${whatIs("Transfer", "A transfer moves money from one county fund to another. It is not new income. Counting it as income would count the same dollars twice.")}
${ledger.notIncome
  .map(
    (item) => `<article class="cmp" id="${esc(item.key)}">
<h3>${esc(item.label)}</h3>
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
<h2>Adopted budgets next to the audit</h2>
<p class="cap">FY2025 is audited actual. FY2026 and FY2027 are budgets. The FY2026 lines are the last by-source table published before the final hearing. The adopted FY2026 total is ${esc(money(y2026?.adoptedCents || 0))}.</p>
${rows
  .map(([label, needle]) => {
    const a = actual(needle);
    const b = budgetItem(y2026, needle);
    const c = budgetItem(y2027, needle);
    return `<article class="cmp"><h3>${esc(label)}</h3>${line(a?.cents, "Audited actual, FY2025")}${line(b?.cents, "Budget, FY2026")}${line(c?.cents, "Budget, FY2027")}</article>`;
  })
  .join("")}
${ledger.budgets
  .map((pack) => {
    const items = withPercents(pack.items);
    return `<div class="budget-year" id="budget-${pack.fiscalYear}">
<h3>FY${pack.fiscalYear} ${esc(pack.basisLabel)}</h3>
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
${sourceLine(pack.fiscalYear === 2026 ? "FY2026 tentative budget in brief" : "FY2027 county revenue file", pack.sourceUrl, pack.sourcePages)}
</div>`;
  })
  .join("")}
</section>`;
}

function bedBlock(ledger: PublishedLedger): string {
  const bed = ledger.bedTax;
  return `<section class="card" id="bed-collections">
<div class="eyebrow">Collections, not the audit</div>
<h2>Bed tax so far this year</h2>
<p class="figure-n">${esc(moneyCompact(bed.ytdCents))}</p>
<p class="cap">Collected from October 2025 through August 2026. That is ${bed.changePct.toFixed(1)}% more than the same months a year earlier.</p>
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
<h2>Property tax share</h2>
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
<h2>Income over ten years</h2>
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
  return `<article class="reserve-fund" id="fund-${esc(fund.key)}">
<a class="reserve-link" href="${esc(href)}"><span class="reserve-name">${esc(fund.label)}</span><span class="reserve-amt">${esc(moneyCompact(fund.cents))}</span></a>
<p class="cap">Exact amount ${esc(money(fund.cents))}. A year earlier, ${esc(money(fund.priorCents))}. ${esc(linkNote)}</p>
${classBar(
  fund.classes.map((item) => ({
    key: item.key,
    label: item.label,
    cents: item.cents,
    pct: fund.cents ? (item.cents / fund.cents) * 100 : 0,
    plain: item.purpose,
  })),
)}
<ul class="holder-list">
${fund.classes
  .filter((item) => item.cents > 0)
  .map((item) => `<li><a href="#class-${esc(item.key)}">${esc(item.label)}</a> <b>${esc(moneyCompact(item.cents))}</b></li>`)
  .join("")}
</ul>
${fund.detail ? `<details class="what"><summary>What is this?</summary><p>${esc(gulfName(fund.detail))}</p></details>` : ""}
</article>`;
}

function classBar(items: { key: string; label: string; cents: number; pct: number }[]): string {
  const shown = items.filter((item) => item.cents > 0);
  return `<div class="splitbar" role="img" aria-label="Split of savings">${shown
    .map((item) => {
      const color = CLASS_COLORS[item.key] || "#8a6f9e";
      return `<a href="#class-${esc(item.key)}" style="width:${item.pct.toFixed(2)}%;background:${color}"><span class="sr">${esc(item.label)} ${esc(moneyCompact(item.cents))}</span></a>`;
    })
    .join("")}</div>
<div class="legend class-legend">${shown
  .map((item) => `<a href="#class-${esc(item.key)}"><i style="background:${CLASS_COLORS[item.key] || "#8a6f9e"}"></i>${esc(item.label)} ${item.pct.toFixed(1)}%</a>`)
  .join("")}</div>`;
}

function donut(items: AmountItem[], total: number, center: string, centerNote: string, hrefFor: (item: AmountItem) => string): string {
  const r = 72;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = items
    .map((item, index) => {
      const length = total > 0 ? (item.cents / total) * circumference : 0;
      const gap = length > 4 ? 0.9 : 0;
      const drawn = Math.max(length - gap, length > 0 ? 0.35 : 0);
      const color = SLICE_COLORS[index % SLICE_COLORS.length];
      const href = hrefFor(item);
      const arc = `<a href="${esc(href)}"><circle r="${r}" cx="100" cy="100" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${drawn.toFixed(2)} ${(circumference - drawn).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(item.label)} ${esc(moneyCompact(item.cents))}</title></circle></a>`;
      offset += length;
      return item.cents > 0 ? arc : "";
    })
    .join("");
  const legend = items
    .map((item, index) => {
      const color = SLICE_COLORS[index % SLICE_COLORS.length];
      return `<a class="lg" href="${esc(hrefFor(item))}"><i style="background:${color}"></i><span class="donut-label">${esc(item.label)}</span><b>${item.pct.toFixed(1)}%<span class="donut-amt">${esc(moneyCompact(item.cents))}</span></b></a>`;
    })
    .join("");
  return `<div class="donutwrap"><svg viewBox="0 0 200 200" class="donut" role="img" aria-label="${esc(centerNote)}">${arcs}<text x="100" y="96" text-anchor="middle" class="dn1">${esc(center)}</text><text x="100" y="116" text-anchor="middle" class="dn2">${esc(centerNote)}</text></svg><div class="lgs">${legend}</div></div>`;
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

function whatIs(term: string, body: string): string {
  return `<details class="what"><summary>What is this?</summary><p><b>${esc(term)}.</b> ${esc(body)}</p></details>`;
}

function termList(terms: { term: string; body: string }[]): string {
  return `<section class="card"><h2>What is this?</h2>${terms.map((term) => whatIs(term.term, term.body)).join("")}</section>`;
}

function moneyBillions(dollars: number): string {
  return `$${(dollars / 1_000_000_000).toFixed(1)} billion`;
}

function longDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

const TRANSFER_TERMS = [
  {
    term: "Transfer",
    body: "A transfer moves money from one county fund to another. It is not new income. Counting it as income would count the same dollars twice.",
  },
];

const RESERVE_TERMS = [
  {
    term: "Fund balance",
    body: "Fund balance is the savings left in a fund at the end of the year. It is not all free to spend.",
  },
  {
    term: "Restricted",
    body: "Restricted means a law or an outside rule says what the money is for.",
  },
  {
    term: "Committed",
    body: "Committed means the commissioners have voted to use the money for a stated purpose.",
  },
  {
    term: "Assigned",
    body: "Assigned means the county plans to use the money for something, without the stricter vote that committed money needs.",
  },
  {
    term: "Unassigned",
    body: "Unassigned means no purpose has been set. On these books, only the General Fund has that kind of savings.",
  },
];
