import { BUDGET_BOOK_URL } from "./chrome";
import { esc, money, moneyCompact, moneyExact, moneyWords } from "./format";
import {
  DEPARTMENTS,
  SOURCE_LINKS,
  STAFF_YEARS,
  YEAR_TOTALS,
  type DeptYearFigures,
  type DollarsBasis,
  type StaffDepartment,
  type StaffYear,
  type YearTotals,
  yearTotals,
} from "./staff-data";
import { page } from "./view";

const FIRST = yearTotals(2020);
const LAST = yearTotals(2027);

export type StaffSort = "name" | "entity" | "fte0" | "fte1" | "pay0" | "pay1";

const SORTS = new Set<StaffSort>(["name", "entity", "fte0", "fte1", "pay0", "pay1"]);

export function parseStaffSort(value: string | undefined): StaffSort {
  if (value && SORTS.has(value as StaffSort)) return value as StaffSort;
  return "fte1";
}

export function parseStaffDir(value: string | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

export function formatFte(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatFteCell(value: number | null): string {
  return value == null ? "n/a" : formatFte(value);
}

function dollarsBasisLabel(basis: DollarsBasis, year: number): string {
  return basis === "actual" ? `FY${year} actual` : `FY${year} adopted budget`;
}

function emptyFigs(): DeptYearFigures {
  return { fte: null, personalServicesCents: null, salariesCents: null, benefitsCents: null, unsplitCents: null };
}

function figsFor(dept: StaffDepartment, year: StaffYear): DeptYearFigures {
  return dept.byYear[year] || emptyFigs();
}

function growthPct(before: number, after: number): string {
  if (!before) return "n/a";
  const pct = ((after - before) / before) * 100;
  const digits = Math.abs(pct) >= 10 ? 0 : 1;
  const rounded = pct.toFixed(digits);
  if (pct > 0) return `${rounded}% more`;
  if (pct < 0) return `${Math.abs(Number(rounded))}% less`;
  return "unchanged";
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const raw = value * 1.08;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / pow;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return nice * pow;
}

function ticks(max: number): number[] {
  const step = max / 4;
  return [0, step, step * 2, step * 3, max];
}

type ChartPoint = { year: StaffYear; value: number; label: string; detail: string; series?: string };

function linePath(xs: number[], ys: number[]): string {
  return xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(" ");
}

function chartFrame(opts: {
  id: string;
  title: string;
  aria: string;
  caption: string;
  max: number;
  tickFormat: (value: number) => string;
  series: { key: string; label: string; color: string; dashed?: boolean; points: ChartPoint[] }[];
  mode: "line" | "grouped";
}): string {
  const W = 640;
  const H = 268;
  const pad = { l: 54, r: 44, t: 22, b: 40 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const years = STAFF_YEARS;
  const xAt = (index: number) => pad.l + (index / (years.length - 1)) * plotW;
  const yAt = (value: number) => pad.t + (1 - value / opts.max) * plotH;
  const grid = ticks(opts.max)
    .map((tick) => {
      const y = yAt(tick);
      return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" class="staff-grid" /><text x="${pad.l - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="staff-axis">${esc(opts.tickFormat(tick))}</text>`;
    })
    .join("");
  const yearLabs = years
    .map((year, index) => {
      const budget = year >= 2026;
      return `<text x="${xAt(index).toFixed(1)}" y="${H - 14}" text-anchor="middle" class="staff-axis${budget ? " staff-axis-budget" : ""}">${year === 2020 || year === 2027 || year === 2025 ? `FY${year}` : `'${String(year).slice(2)}`}</text>`;
    })
    .join("");
  const budgetMark = `<rect x="${xAt(5).toFixed(1)}" y="${pad.t}" width="${(xAt(7) - xAt(5)).toFixed(1)}" height="${plotH}" class="staff-budget-band" />`;
  const shapes: string[] = [];
  const buttons: string[] = [];
  if (opts.mode === "line") {
    for (const series of opts.series) {
      const xs = series.points.map((point) => xAt(years.indexOf(point.year)));
      const ys = series.points.map((point) => yAt(point.value));
      const dash = series.dashed ? ` class="staff-line staff-line-dash" style="stroke:${series.color}"` : ` class="staff-line" style="stroke:${series.color}"`;
      shapes.push(`<path d="${linePath(xs, ys)}" fill="none"${dash} />`);
    }
  } else {
    const groupW = plotW / years.length;
    const barW = Math.min(18, (groupW * 0.7) / Math.max(opts.series.length, 1));
    const totalW = barW * opts.series.length + 4 * Math.max(0, opts.series.length - 1);
    years.forEach((year, index) => {
      const center = xAt(index);
      opts.series.forEach((series, seriesIndex) => {
        const point = series.points.find((item) => item.year === year);
        if (!point) return;
        const h = (point.value / opts.max) * plotH;
        const x = center - totalW / 2 + seriesIndex * (barW + 4);
        const y = pad.t + plotH - h;
        shapes.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="3" fill="${series.color}" />`);
      });
    });
  }
  for (const series of opts.series) {
    for (const point of series.points) {
      const index = years.indexOf(point.year);
      const xPct = (xAt(index) / W) * 100;
      const yPct = (yAt(point.value) / H) * 100;
      const tipId = `${opts.id}-${series.key}-${point.year}`;
      const color = series.color;
      buttons.push(
        `<button type="button" class="tip-btn staff-pt" style="left:${xPct.toFixed(2)}%;top:${yPct.toFixed(2)}%;background:${color};box-shadow:0 0 0 1px ${color}" aria-label="${esc(point.label)}" aria-expanded="false" aria-controls="${esc(tipId)}" aria-describedby="${esc(tipId)}"></button><span class="tip-pop" id="${esc(tipId)}" role="tooltip" hidden>${esc(point.detail)}</span>`,
      );
    }
  }
  const legend = opts.series
    .map((series) => `<span class="staff-leg"><i style="background:${series.color}"></i>${esc(series.label)}</span>`)
    .join("");
  return `<section class="panel staff-panel" aria-labelledby="${esc(opts.id)}-title">
<h2 id="${opts.id}-title">${esc(opts.title)}</h2>
<p class="cap">${esc(opts.caption)}</p>
<div class="staff-chart-wrap">
<div class="staff-chart">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${budgetMark}${grid}${shapes.join("")}${yearLabs}</svg>
<div class="staff-chart-pts">${buttons.join("")}</div>
</div>
</div>
<div class="staff-legend">${legend}<span class="staff-leg staff-leg-note">Shaded years are adopted budget, not actuals</span></div>
</section>`;
}

function fteLineChart(): string {
  const sheriff: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.sheriffFte,
    label: `FY${row.fiscalYear} Sheriff, ${formatFte(row.sheriffFte)} budgeted FTE`,
    detail: `FY${row.fiscalYear}. Sheriff: ${formatFte(row.sheriffFte)} budgeted FTE.`,
  }));
  const rest: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.restFte,
    label: `FY${row.fiscalYear} rest of county, ${formatFte(row.restFte)} budgeted FTE`,
    detail: `FY${row.fiscalYear}. Rest of county: ${formatFte(row.restFte)} budgeted FTE.`,
  }));
  const all: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.fte,
    label: `FY${row.fiscalYear} county total, ${formatFte(row.fte)} budgeted FTE`,
    detail: `FY${row.fiscalYear}. County total: ${formatFte(row.fte)} budgeted FTE. BCC ${formatFte(row.bccFte)}, constitutional officers ${formatFte(row.officersFte)}.`,
  }));
  return lineChartOrGroup("staff-fte", "Budgeted FTE", "Countywide budgeted positions, FY2020 to FY2027. These are budgeted FTE, not filled jobs.", "Line chart of budgeted FTE by year for the county, the Sheriff, and the rest of the county.", Math.max(...YEAR_TOTALS.map((row) => row.fte)), formatFte, [
    { key: "all", label: "County total", color: "#14232f", points: all },
    { key: "sheriff", label: "Sheriff", color: "#8a1f1c", points: sheriff },
    { key: "rest", label: "Rest of county", color: "#2f6f7e", points: rest },
  ], "line");
}

function payChart(): string {
  const all: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.personalServicesCents,
    label: `FY${row.fiscalYear} personal services ${moneyWords(row.personalServicesCents)}`,
    detail: `${dollarsBasisLabel(row.dollarsBasis, row.fiscalYear)}. County total: ${moneyExact(row.personalServicesCents)}.`,
  }));
  const sheriff: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.sheriffPersonalServicesCents,
    label: `FY${row.fiscalYear} Sheriff personal services ${moneyWords(row.sheriffPersonalServicesCents)}`,
    detail: `${dollarsBasisLabel(row.dollarsBasis, row.fiscalYear)}. Sheriff: ${moneyExact(row.sheriffPersonalServicesCents)}.`,
  }));
  const rest: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.restPersonalServicesCents,
    label: `FY${row.fiscalYear} rest of county personal services ${moneyWords(row.restPersonalServicesCents)}`,
    detail: `${dollarsBasisLabel(row.dollarsBasis, row.fiscalYear)}. Rest of county: ${moneyExact(row.restPersonalServicesCents)}.`,
  }));
  return lineChartOrGroup("staff-pay", "Personal services", "Salary plus benefits, as carried in the county budget. FY2020 to FY2025 are actuals. FY2026 and FY2027 are adopted budget.", "Line chart of personal services dollars by year for the county, the Sheriff, and the rest of the county.", Math.max(...YEAR_TOTALS.map((row) => row.personalServicesCents)), moneyCompact, [
    { key: "all", label: "County total", color: "#14232f", points: all },
    { key: "sheriff", label: "Sheriff", color: "#8a1f1c", points: sheriff },
    { key: "rest", label: "Rest of county", color: "#2f6f7e", points: rest },
  ], "line");
}

function sheriffBars(): string {
  const sheriffFte: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.sheriffFte,
    label: `FY${row.fiscalYear} Sheriff ${formatFte(row.sheriffFte)} FTE`,
    detail: `FY${row.fiscalYear}. Sheriff: ${formatFte(row.sheriffFte)} budgeted FTE.`,
  }));
  const restFte: ChartPoint[] = YEAR_TOTALS.map((row) => ({
    year: row.fiscalYear,
    value: row.restFte,
    label: `FY${row.fiscalYear} rest of county ${formatFte(row.restFte)} FTE`,
    detail: `FY${row.fiscalYear}. Rest of county: ${formatFte(row.restFte)} budgeted FTE.`,
  }));
  return lineChartOrGroup("staff-share", "Sheriff compared with the rest of the county", "Budgeted FTE. In FY2027 the Sheriff accounts for " + formatFte(LAST.sheriffFte) + " of " + formatFte(LAST.fte) + " positions.", "Grouped bar chart of Sheriff FTE versus the rest of the county, FY2020 to FY2027.", Math.max(...YEAR_TOTALS.map((row) => Math.max(row.sheriffFte, row.restFte))), formatFte, [
    { key: "sheriff", label: "Sheriff", color: "#8a1f1c", points: sheriffFte },
    { key: "rest", label: "Rest of county", color: "#2f6f7e", points: restFte },
  ], "grouped");
}

function lineChartOrGroup(
  id: string,
  title: string,
  caption: string,
  aria: string,
  maxValue: number,
  tickFormat: (value: number) => string,
  series: { key: string; label: string; color: string; dashed?: boolean; points: ChartPoint[] }[],
  mode: "line" | "grouped",
): string {
  const max = niceMax(maxValue);
  return chartFrame({ id, title, aria, caption, max, tickFormat, series, mode });
}

function splitChart(): string {
  const W = 640;
  const H = 268;
  const pad = { l: 54, r: 44, t: 22, b: 40 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = niceMax(Math.max(...YEAR_TOTALS.map((row) => row.personalServicesCents)));
  const xAt = (index: number) => pad.l + (index / (STAFF_YEARS.length - 1)) * plotW;
  const yAt = (value: number) => pad.t + (1 - value / max) * plotH;
  const groupW = plotW / STAFF_YEARS.length;
  const barW = Math.min(28, groupW * 0.55);
  const grid = ticks(max)
    .map((tick) => {
      const y = yAt(tick);
      return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" class="staff-grid" /><text x="${pad.l - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="staff-axis">${esc(moneyCompact(tick))}</text>`;
    })
    .join("");
  const yearLabs = STAFF_YEARS.map((year, index) => `<text x="${xAt(index).toFixed(1)}" y="${H - 14}" text-anchor="middle" class="staff-axis">${year === 2020 || year === 2025 || year === 2027 ? `FY${year}` : `'${String(year).slice(2)}`}</text>`).join("");
  const budgetMark = `<rect x="${xAt(5).toFixed(1)}" y="${pad.t}" width="${(xAt(7) - xAt(5)).toFixed(1)}" height="${plotH}" class="staff-budget-band" />`;
  const colors = { salaries: "#1d4e63", benefits: "#c9a24b", unsplit: "#8a6a4b" };
  const shapes: string[] = [];
  const buttons: string[] = [];
  YEAR_TOTALS.forEach((row, index) => {
    const x = xAt(index) - barW / 2;
    let y = pad.t + plotH;
    const parts: { key: string; label: string; cents: number; color: string }[] = [
      { key: "salaries", label: "Salaries", cents: row.salariesCents, color: colors.salaries },
      { key: "benefits", label: "Benefits", cents: row.benefitsCents, color: colors.benefits },
      { key: "unsplit", label: "Unsplit transfers and other", cents: row.unsplitCents, color: colors.unsplit },
    ];
    for (const part of parts) {
      const h = (part.cents / max) * plotH;
      y -= h;
      shapes.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" fill="${part.color}" />`);
      const tipId = `staff-split-${part.key}-${row.fiscalYear}`;
      const xPct = ((x + barW / 2) / W) * 100;
      const yPct = ((y + h / 2) / H) * 100;
      const detail = `${dollarsBasisLabel(row.dollarsBasis, row.fiscalYear)}. ${part.label}: ${moneyExact(part.cents)}. Share of ${moneyExact(row.personalServicesCents)}.`;
      buttons.push(
        `<button type="button" class="tip-btn staff-pt staff-pt-bar" style="left:${xPct.toFixed(2)}%;top:${yPct.toFixed(2)}%;background:${part.color};box-shadow:0 0 0 1px ${part.color}" aria-label="${esc(`FY${row.fiscalYear} ${part.label} ${moneyWords(part.cents)}`)}" aria-expanded="false" aria-controls="${tipId}" aria-describedby="${tipId}"></button><span class="tip-pop" id="${tipId}" role="tooltip" hidden>${esc(detail)}</span>`,
      );
    }
  });
  return `<section class="panel staff-panel" aria-labelledby="staff-split-title">
<h2 id="staff-split-title">Salaries, benefits, and unsplit amounts</h2>
<p class="cap">Where the budget splits personal services, salaries and benefits are shown separately. Most constitutional officer dollars sit in an unsplit transfer lump, so that bar is not a full salary and benefit split.</p>
<div class="staff-chart-wrap">
<div class="staff-chart">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stacked bar chart of salaries, benefits, and unsplit personal services, FY2020 to FY2027.">${budgetMark}${grid}${shapes.join("")}${yearLabs}</svg>
<div class="staff-chart-pts">${buttons.join("")}</div>
</div>
</div>
<div class="staff-legend"><span class="staff-leg"><i style="background:${colors.salaries}"></i>Salaries</span><span class="staff-leg"><i style="background:${colors.benefits}"></i>Benefits</span><span class="staff-leg"><i style="background:${colors.unsplit}"></i>Unsplit transfers and other</span><span class="staff-leg staff-leg-note">Shaded years are adopted budget, not actuals</span></div>
</section>`;
}

function deptBarChart(): string {
  const rows = DEPARTMENTS
    .map((dept) => ({ dept, fte: figsFor(dept, 2027).fte }))
    .filter((row) => row.fte != null && row.fte > 0)
    .sort((a, b) => (b.fte || 0) - (a.fte || 0) || a.dept.label.localeCompare(b.dept.label));
  const top = rows.slice(0, 12);
  const otherFte = rows.slice(12).reduce((sum, row) => sum + (row.fte || 0), 0);
  const items = top.map((row) => ({ label: row.dept.label, fte: row.fte as number, transfer: row.dept.transferOnlyDollars }));
  if (otherFte > 0) items.push({ label: "All other departments", fte: otherFte, transfer: false });
  const max = items[0]?.fte || 1;
  const bars = items
    .map((item, index) => {
      const width = Math.max(2, (item.fte / max) * 100);
      const tipId = `staff-deptbar-${index}`;
      const detail = `FY2027. ${item.label}: ${formatFte(item.fte)} budgeted FTE.`;
      return `<div class="staff-hbar">
<div class="staff-hbar-lab"><span>${esc(item.label)}</span><span class="staff-hbar-n">${esc(formatFte(item.fte))}</span></div>
<div class="staff-hbar-track">
<button type="button" class="tip-btn staff-hbar-bar" style="width:${width.toFixed(1)}%" aria-label="${esc(detail)}" aria-expanded="false" aria-controls="${tipId}" aria-describedby="${tipId}"></button>
<span class="tip-pop" id="${tipId}" role="tooltip" hidden>${esc(detail)}</span>
</div>
</div>`;
    })
    .join("");
  return `<section class="panel staff-panel" aria-labelledby="staff-deptchart-title">
<h2 id="staff-deptchart-title">FY2027 FTE by department</h2>
<p class="cap">The 12 largest departments by budgeted FTE, plus all others combined. Sheriff is listed as one office.</p>
<div class="staff-hbars">${bars}</div>
</section>`;
}

function sortValue(dept: StaffDepartment, sort: StaffSort): string | number {
  const first = figsFor(dept, 2020);
  const last = figsFor(dept, 2027);
  if (sort === "name") return dept.label.toLowerCase();
  if (sort === "entity") return `${dept.entityGroup} ${dept.entity.toLowerCase()} ${dept.label.toLowerCase()}`;
  if (sort === "fte0") return first.fte ?? -1;
  if (sort === "fte1") return last.fte ?? -1;
  if (sort === "pay0") return first.personalServicesCents ?? -1;
  return last.personalServicesCents ?? -1;
}

function sortDepartments(sort: StaffSort, dir: "asc" | "desc"): StaffDepartment[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...DEPARTMENTS].sort((a, b) => {
    const left = sortValue(a, sort);
    const right = sortValue(b, sort);
    if (typeof left === "number" && typeof right === "number") {
      if (left !== right) return (left - right) * sign;
    } else {
      const cmp = String(left).localeCompare(String(right));
      if (cmp) return cmp * sign;
    }
    return a.label.localeCompare(b.label);
  });
}

function sortHref(sort: StaffSort, current: StaffSort, dir: "asc" | "desc"): string {
  const nextDir = sort === current && dir === "desc" ? "asc" : "desc";
  return `/staff?sort=${sort}&dir=${nextDir}`;
}

function sortHead(label: string, sort: StaffSort, current: StaffSort, dir: "asc" | "desc", numeric: boolean): string {
  const on = sort === current;
  return `<th class="${numeric ? "num " : ""}"><a href="${esc(sortHref(sort, current, dir))}" class="staff-sort${on ? " on" : ""}">${esc(label)}</a></th>`;
}

function deptTable(sort: StaffSort, dir: "asc" | "desc"): string {
  const rows = sortDepartments(sort, dir)
    .map((dept) => {
      const first = figsFor(dept, 2020);
      const last = figsFor(dept, 2027);
      const note = dept.transferOnlyDollars
        ? `<div class="code">County transfer only, not this office's full payroll.</div>`
        : dept.entityGroup === "sheriff"
          ? `<div class="code">Sheriff personal services as carried in the county budget.</div>`
          : dept.entityGroup === "courts"
            ? `<div class="code">BCC-funded court position. From FY2024 on this 1 FTE is also inside the BCC total.</div>`
            : dept.entity !== "BCC"
              ? `<div class="code">${esc(dept.entity)}</div>`
              : "";
      return `<tr>
<td><span class="name">${esc(dept.label)}</span>${note}</td>
<td class="num">${esc(formatFteCell(first.fte))}</td>
<td class="num">${esc(formatFteCell(last.fte))}</td>
<td class="num">${first.personalServicesCents == null ? "n/a" : money(first.personalServicesCents)}</td>
<td class="num">${last.personalServicesCents == null ? "n/a" : money(last.personalServicesCents)}</td>
</tr>`;
    })
    .join("");
  return `<section class="panel staff-panel" aria-labelledby="staff-table-title">
<h2 id="staff-table-title">Department comparison, FY2020 and FY2027</h2>
<p class="cap">Sorted ${esc(sortLabel(sort, dir))}. A department with n/a in one year may be new, reorganized, or listed under a different name in that year's source. Tourism was one Tourist Development line in earlier books and several Tourism departments after the FY2025 split.</p>
<div class="table-wrap"><table class="staff-table">
<thead><tr>
${sortHead("Department", "name", sort, dir, false)}
${sortHead("FY2020 FTE", "fte0", sort, dir, true)}
${sortHead("FY2027 FTE", "fte1", sort, dir, true)}
${sortHead("FY2020 pay", "pay0", sort, dir, true)}
${sortHead("FY2027 pay", "pay1", sort, dir, true)}
</tr></thead>
<tbody>${rows}</tbody>
</table></div>
</section>`;
}

function sortLabel(sort: StaffSort, dir: "asc" | "desc"): string {
  const names: Record<StaffSort, string> = {
    name: "department name",
    entity: "office",
    fte0: "FY2020 FTE",
    fte1: "FY2027 FTE",
    pay0: "FY2020 personal services",
    pay1: "FY2027 personal services",
  };
  return `by ${names[sort]}, ${dir === "asc" ? "lowest to highest" : "highest to lowest"}`;
}

function metricCards(): string {
  return `<div class="metrics staff-metrics">
${metric("Budgeted FTE", formatFte(LAST.fte), `From ${formatFte(FIRST.fte)} in FY2020, ${growthPct(FIRST.fte, LAST.fte)}. Budgeted positions, not filled jobs.`)}
${metric("Personal services", moneyCompact(LAST.personalServicesCents), `From ${moneyCompact(FIRST.personalServicesCents)} in FY2020, ${growthPct(FIRST.personalServicesCents, LAST.personalServicesCents)}. FY2027 is adopted budget. The exact FY2027 figure is ${moneyExact(LAST.personalServicesCents)}.`)}
${metric("Sheriff FTE", formatFte(LAST.sheriffFte), `From ${formatFte(FIRST.sheriffFte)} in FY2020, ${growthPct(FIRST.sheriffFte, LAST.sheriffFte)}.`)}
${metric("Sheriff personal services", moneyCompact(LAST.sheriffPersonalServicesCents), `From ${moneyCompact(FIRST.sheriffPersonalServicesCents)} in FY2020, ${growthPct(FIRST.sheriffPersonalServicesCents, LAST.sheriffPersonalServicesCents)}. The exact FY2027 figure is ${moneyExact(LAST.sheriffPersonalServicesCents)}.`)}
</div>`;
}

function metric(label: string, value: string, note: string): string {
  return `<article class="metric"><p class="metric-label">${esc(label)}</p><p class="metric-value">${esc(value)}</p><p class="metric-note">${esc(note)}</p></article>`;
}

function caveats(): string {
  return `<section class="staff-caveats" aria-labelledby="staff-caveats-title">
<h2 id="staff-caveats-title">How to read these figures</h2>
<ol>
<li>Dollars for the Clerk of Court, Property Appraiser, Tax Collector, and Supervisor of Elections are only the county's transfers to those offices, not their full payroll.</li>
<li>FTE figures are budgeted positions, not filled jobs.</li>
<li>Dollars are actuals through FY2025, then adopted budget for FY2026 and FY2027.</li>
<li>Department reorganizations, such as Tourism splitting in FY2025, cause jumps in the trend lines and in the department table.</li>
</ol>
<p>From FY2024 on, the BCC FTE total includes 1 Circuit Court position. That position is listed with the courts in the table, so BCC department rows sum to 1 FTE less than the BCC total. The countywide FTE total already includes it once.</p>
</section>`;
}

function sources(): string {
  const links = SOURCE_LINKS.map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`).join(" and ");
  return `<section class="panel staff-panel">
<h2>Sources</h2>
<p>FTE counts come from the county's Summary of Personnel in the final budget books, and from the FY2027 final budget staffing file for later years. Personal services dollars come from object codes 510000 to 525000 in that FY2027 budget dataset. FY2020 to FY2025 are actuals. FY2026 is the original adopted budget. FY2027 is the adopted budget (the field is labeled Proposed in the dataset).</p>
<p>Sources: ${links}. The county also publishes a <a href="${BUDGET_BOOK_URL}">budget book site</a>.</p>
<p>This page is a multi-year staffing trend from those budget publications. It is not drawn from the year-to-date account detail used on the overview, vendors, and payments pages.</p>
</section>`;
}

export function renderStaff(opts: { csrf: string; isAdmin: boolean; showNames: boolean; sort?: string; dir?: string }): string {
  const sort = parseStaffSort(opts.sort);
  const dir = parseStaffDir(opts.dir);
  const body = `
<h1>Staff and payroll</h1>
<p class="lede">Walton County budgeted staffing grew from ${formatFte(FIRST.fte)} FTE in FY2020 to ${formatFte(LAST.fte)} FTE in FY2027. Personal services, meaning salary plus benefits as carried in the county budget, grew from ${moneyWords(FIRST.personalServicesCents)} to ${moneyWords(LAST.personalServicesCents)}. The Sheriff went from ${formatFte(FIRST.sheriffFte)} staff and ${moneyWords(FIRST.sheriffPersonalServicesCents)} to ${formatFte(LAST.sheriffFte)} staff and ${moneyWords(LAST.sheriffPersonalServicesCents)}.</p>
${metricCards()}
${caveats()}
${fteLineChart()}
${payChart()}
${sheriffBars()}
${splitChart()}
${deptBarChart()}
${deptTable(sort, dir)}
${sources()}
`;
  return page({
    title: "Staff and payroll. Budget Explorer",
    active: "staff",
    body,
    admin: opts.isAdmin,
    csrf: opts.csrf,
    showNames: opts.showNames,
  });
}

export function headlineFigures(): {
  fte2020: number;
  fte2027: number;
  pay2020: number;
  pay2027: number;
  sheriffFte2020: number;
  sheriffFte2027: number;
  sheriffPay2020: number;
  sheriffPay2027: number;
} {
  return {
    fte2020: FIRST.fte,
    fte2027: LAST.fte,
    pay2020: FIRST.personalServicesCents,
    pay2027: LAST.personalServicesCents,
    sheriffFte2020: FIRST.sheriffFte,
    sheriffFte2027: LAST.sheriffFte,
    sheriffPay2020: FIRST.sheriffPersonalServicesCents,
    sheriffPay2027: LAST.sheriffPersonalServicesCents,
  };
}

// Satisfy the compiler if a helper is kept for tests
export function yearRow(year: StaffYear): YearTotals {
  return yearTotals(year);
}
