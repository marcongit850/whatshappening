import { BUDGET_BOOK_URL, headAssets, siteFooter, siteHeader } from "./chrome";
import { esc, money, moneyCompact, moneyExact, moneyShort, moneyWords } from "./format";
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

const INK = "#14232f";
const SHERIFF = "#8c3030";
const REST = "#2f7d8c";
const SALARY = "#17505c";
const BENEFIT = "#c9a24b";
const UNSPLIT = "#7d8b92";

function formatAxisFte(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function yOf(value: number, max: number): number {
  const inset = 6;
  if (max <= 0) return 100 - inset;
  return inset + (1 - value / max) * (100 - inset * 2);
}

function slotX(index: number): number {
  return (index / STAFF_YEARS.length) * 100;
}

function slotW(): number {
  return 100 / STAFF_YEARS.length;
}

function midX(index: number): number {
  return slotX(index) + slotW() / 2;
}

function yearLabels(): string {
  return STAFF_YEARS.map((year) => {
    const budget = year >= 2026 ? " is-budget" : "";
    const short = String(year).slice(2);
    return `<span class="staff-xlab${budget}"><span class="fy-long">FY${year}</span><span class="fy-short">FY${short}</span><span class="fy-tiny">${short}</span></span>`;
  }).join("");
}

function yLabels(max: number, format: (value: number) => string): string {
  return ticks(max)
    .map((tick) => `<span style="top:${yOf(tick, max).toFixed(2)}%">${esc(format(tick))}</span>`)
    .join("");
}

function axisMarks(max: number, band: boolean): string {
  const grid = ticks(max)
    .map((tick) => {
      const y = yOf(tick, max).toFixed(2);
      const klass = tick === 0 ? "staff-grid staff-baseline" : "staff-grid";
      return `<line x1="0" y1="${y}" x2="100" y2="${y}" class="${klass}" vector-effect="non-scaling-stroke" />`;
    })
    .join("");
  if (!band) return grid;
  const bandX = slotX(6).toFixed(2);
  const bandW = (100 - slotX(6)).toFixed(2);
  return `<rect x="${bandX}" y="0" width="${bandW}" height="100" class="staff-budget-band" />${grid}`;
}

function yearHit(id: string, year: number, label: string, detail: string): string {
  const index = STAFF_YEARS.indexOf(year as StaffYear);
  const tipId = `${id}-${year}`;
  return `<button type="button" class="tip-btn staff-hit" style="left:${slotX(index).toFixed(2)}%;width:${slotW().toFixed(2)}%" aria-label="${esc(label)}" aria-expanded="false" aria-controls="${esc(tipId)}" aria-describedby="${esc(tipId)}"></button><span class="tip-pop" id="${esc(tipId)}" role="tooltip" hidden>${esc(detail)}</span>`;
}

function legend(items: { color: string; label: string; line?: boolean }[], band = true): string {
  const swatches = items
    .map((item) => `<span class="staff-leg"><i class="staff-swatch${item.line ? " staff-swatch-line" : ""}" style="background:${item.color}"></i>${esc(item.label)}</span>`)
    .join("");
  const note = band ? `<span class="staff-leg"><i class="staff-swatch staff-swatch-band"></i>Shaded years are adopted budget, not actuals</span>` : "";
  return `<div class="staff-legend">${swatches}${note}</div>`;
}

function chartShell(opts: {
  id: string;
  title: string;
  caption: string;
  aria: string;
  max: number;
  tickFormat: (value: number) => string;
  unit: string;
  shapes: string;
  dots: string;
  hits: string;
  legendHtml: string;
  band?: boolean;
}): string {
  const unit = opts.unit ? `<p class="staff-unit">${esc(opts.unit)}</p>` : "";
  return `<section class="panel staff-panel" aria-labelledby="${esc(opts.id)}-title">
<h2 id="${opts.id}-title">${esc(opts.title)}</h2>
<p class="cap">${esc(opts.caption)}</p>
<div class="staff-chart">
${unit}
<div class="staff-chart-row">
<div class="staff-y" aria-hidden="true">${yLabels(opts.max, opts.tickFormat)}</div>
<div class="staff-plot">
<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(opts.aria)}">${axisMarks(opts.max, opts.band !== false)}${opts.shapes}</svg>
<div class="staff-dots" aria-hidden="true">${opts.dots}</div>
<div class="staff-hits">${opts.hits}</div>
</div>
</div>
<div class="staff-x" aria-hidden="true">${yearLabels()}</div>
</div>
${opts.legendHtml}
</section>`;
}

function linePath(values: number[], max: number): string {
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${midX(index).toFixed(2)} ${yOf(value, max).toFixed(2)}`).join(" ");
}

function areaPath(values: number[], max: number): string {
  const line = linePath(values, max);
  const last = midX(values.length - 1).toFixed(2);
  const first = midX(0).toFixed(2);
  const base = yOf(0, max).toFixed(2);
  return `${line} L${last} ${base} L${first} ${base} Z`;
}

function dots(values: number[], max: number, color: string): string {
  return values
    .map((value, index) => `<span class="staff-dot" style="left:${midX(index).toFixed(2)}%;top:${yOf(value, max).toFixed(2)}%;background:${color}"></span>`)
    .join("");
}

function fteLineChart(): string {
  const max = niceMax(Math.max(...YEAR_TOTALS.map((row) => row.fte)));
  const hits = YEAR_TOTALS.map((row) =>
    yearHit(
      "staff-fte",
      row.fiscalYear,
      `FY${row.fiscalYear}, ${formatFte(row.fte)} budgeted FTE`,
      `FY${row.fiscalYear}. County total: ${formatFte(row.fte)} budgeted FTE. Sheriff: ${formatFte(row.sheriffFte)}. Rest of county: ${formatFte(row.restFte)}. BCC ${formatFte(row.bccFte)}, constitutional officers ${formatFte(row.officersFte)}.`,
    ),
  ).join("");
  const shapes = [
    `<path d="${areaPath(YEAR_TOTALS.map((row) => row.fte), max)}" class="staff-area" />`,
    `<path d="${linePath(YEAR_TOTALS.map((row) => row.restFte), max)}" fill="none" stroke="${REST}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />`,
    `<path d="${linePath(YEAR_TOTALS.map((row) => row.sheriffFte), max)}" fill="none" stroke="${SHERIFF}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />`,
    `<path d="${linePath(YEAR_TOTALS.map((row) => row.fte), max)}" fill="none" stroke="${INK}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />`,
  ].join("");
  const dotHtml = [
    dots(YEAR_TOTALS.map((row) => row.restFte), max, REST),
    dots(YEAR_TOTALS.map((row) => row.sheriffFte), max, SHERIFF),
    dots(YEAR_TOTALS.map((row) => row.fte), max, INK),
  ].join("");
  return chartShell({
    id: "staff-fte",
    title: "Budgeted FTE",
    caption: "Countywide budgeted positions, FY2020 to FY2027. These are budgeted FTE, not filled jobs.",
    aria: "Line chart of budgeted FTE by year for the county, the Sheriff, and the rest of the county.",
    max,
    tickFormat: formatAxisFte,
    unit: "FTE",
    shapes,
    dots: dotHtml,
    hits,
    legendHtml: legend(
      [
        { color: INK, label: "County total", line: true },
        { color: SHERIFF, label: "Sheriff", line: true },
        { color: REST, label: "Rest of county", line: true },
      ],
      false,
    ),
    band: false,
  });
}

function stackedColumns(series: { color: string; values: number[] }[], max: number, widthRatio: number): string {
  return YEAR_TOTALS.map((_row, index) => {
    const width = slotW() * widthRatio;
    const x = slotX(index) + (slotW() - width) / 2;
    let y = 100;
    return series
      .map((item) => {
        const h = ((item.values[index] || 0) / max) * 100;
        y -= h;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${Math.max(h, 0).toFixed(2)}" fill="${item.color}" />`;
      })
      .join("");
  }).join("");
}

function groupedColumns(series: { color: string; values: number[] }[], max: number): string {
  return YEAR_TOTALS.map((_row, index) => {
    const inset = slotW() * 0.16;
    const gap = slotW() * 0.06;
    const barW = (slotW() - inset * 2 - gap * (series.length - 1)) / series.length;
    return series
      .map((item, seriesIndex) => {
        const value = item.values[index] || 0;
        const height = (value / max) * 100;
        const x = slotX(index) + inset + seriesIndex * (barW + gap);
        const y = 100 - height;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(height, 0).toFixed(2)}" fill="${item.color}" />`;
      })
      .join("");
  }).join("");
}

function payChart(): string {
  const max = niceMax(Math.max(...YEAR_TOTALS.map((row) => row.personalServicesCents)));
  const hits = YEAR_TOTALS.map((row) =>
    yearHit(
      "staff-pay",
      row.fiscalYear,
      `FY${row.fiscalYear} personal services ${moneyWords(row.personalServicesCents)}`,
      `${dollarsBasisLabel(row.dollarsBasis, row.fiscalYear)}. County total: ${moneyExact(row.personalServicesCents)}. Sheriff: ${moneyExact(row.sheriffPersonalServicesCents)}. Rest of county: ${moneyExact(row.restPersonalServicesCents)}.`,
    ),
  ).join("");
  return chartShell({
    id: "staff-pay",
    title: "Personal services",
    caption: "Salary plus benefits, as carried in the county budget. Each column is the county total, with the Sheriff below and the rest of the county above. FY2020 to FY2025 are actuals. FY2026 and FY2027 are adopted budget.",
    aria: "Stacked bar chart of personal services by year. Each column is the county total. The lower part is the Sheriff and the upper part is the rest of the county.",
    max,
    tickFormat: moneyShort,
    unit: "",
    shapes: stackedColumns(
      [
        { color: SHERIFF, values: YEAR_TOTALS.map((row) => row.sheriffPersonalServicesCents) },
        { color: REST, values: YEAR_TOTALS.map((row) => row.restPersonalServicesCents) },
      ],
      max,
      0.54,
    ),
    dots: "",
    hits,
    legendHtml: legend([
      { color: SHERIFF, label: "Sheriff" },
      { color: REST, label: "Rest of county" },
    ]),
  });
}

function sheriffBars(): string {
  const max = niceMax(Math.max(...YEAR_TOTALS.map((row) => Math.max(row.sheriffFte, row.restFte))));
  const hits = YEAR_TOTALS.map((row) =>
    yearHit(
      "staff-share",
      row.fiscalYear,
      `FY${row.fiscalYear} Sheriff ${formatFte(row.sheriffFte)} FTE`,
      `FY${row.fiscalYear}. Sheriff: ${formatFte(row.sheriffFte)} budgeted FTE. Rest of county: ${formatFte(row.restFte)} budgeted FTE.`,
    ),
  ).join("");
  return chartShell({
    id: "staff-share",
    title: "Sheriff compared with the rest of the county",
    caption: "Budgeted FTE. In FY2027 the Sheriff accounts for " + formatFte(LAST.sheriffFte) + " of " + formatFte(LAST.fte) + " positions.",
    aria: "Grouped bar chart of Sheriff FTE versus the rest of the county, FY2020 to FY2027.",
    max,
    tickFormat: formatAxisFte,
    unit: "FTE",
    shapes: groupedColumns(
      [
        { color: SHERIFF, values: YEAR_TOTALS.map((row) => row.sheriffFte) },
        { color: REST, values: YEAR_TOTALS.map((row) => row.restFte) },
      ],
      max,
    ),
    dots: "",
    hits,
    legendHtml: legend(
      [
        { color: SHERIFF, label: "Sheriff" },
        { color: REST, label: "Rest of county" },
      ],
      false,
    ),
    band: false,
  });
}

function splitChart(): string {
  const max = niceMax(Math.max(...YEAR_TOTALS.map((row) => row.personalServicesCents)));
  const hits = YEAR_TOTALS.map((row) =>
    yearHit(
      "staff-split",
      row.fiscalYear,
      `FY${row.fiscalYear} personal services ${moneyWords(row.personalServicesCents)}`,
      `${dollarsBasisLabel(row.dollarsBasis, row.fiscalYear)}. Salaries: ${moneyExact(row.salariesCents)}. Benefits: ${moneyExact(row.benefitsCents)}. Unsplit transfers and other: ${moneyExact(row.unsplitCents)}. County total: ${moneyExact(row.personalServicesCents)}.`,
    ),
  ).join("");
  return chartShell({
    id: "staff-split",
    title: "Salaries, benefits, and unsplit amounts",
    caption: "Where the budget splits personal services, salaries and benefits are shown separately. Most constitutional officer dollars sit in an unsplit transfer lump, so that bar is not a full salary and benefit split.",
    aria: "Stacked bar chart of salaries, benefits, and unsplit personal services, FY2020 to FY2027.",
    max,
    tickFormat: moneyShort,
    unit: "",
    shapes: stackedColumns(
      [
        { color: SALARY, values: YEAR_TOTALS.map((row) => row.salariesCents) },
        { color: BENEFIT, values: YEAR_TOTALS.map((row) => row.benefitsCents) },
        { color: UNSPLIT, values: YEAR_TOTALS.map((row) => row.unsplitCents) },
      ],
      max,
      0.54,
    ),
    dots: "",
    hits,
    legendHtml: legend([
      { color: SALARY, label: "Salaries" },
      { color: BENEFIT, label: "Benefits" },
      { color: UNSPLIT, label: "Unsplit transfers and other" },
    ]),
  });
}

function groupColor(group: StaffDepartment["entityGroup"]): string {
  if (group === "sheriff") return SHERIFF;
  if (group === "bcc") return SALARY;
  if (group === "officer") return "#a67c2d";
  return "#5d6974";
}

function groupLabel(group: StaffDepartment["entityGroup"]): string {
  if (group === "sheriff") return "Sheriff";
  if (group === "bcc") return "BCC";
  if (group === "officer") return "Constitutional officers";
  return "Courts";
}

function deptBarChart(): string {
  const rows = DEPARTMENTS.map((dept) => ({ dept, fte: figsFor(dept, 2027).fte }))
    .filter((row) => row.fte != null && row.fte > 0)
    .sort((a, b) => (b.fte || 0) - (a.fte || 0) || a.dept.label.localeCompare(b.dept.label));
  const top = rows.slice(0, 12);
  const rest = rows.slice(12);
  const otherFte = rest.reduce((sum, row) => sum + (row.fte || 0), 0);
  const items = top.map((row) => ({
    label: row.dept.label,
    fte: row.fte as number,
    color: groupColor(row.dept.entityGroup),
    group: groupLabel(row.dept.entityGroup),
  }));
  const max = items[0]?.fte || 1;
  const seen = new Set<string>();
  const legendItems: { color: string; label: string }[] = [];
  for (const item of items) {
    if (seen.has(item.group)) continue;
    seen.add(item.group);
    legendItems.push({ color: item.color, label: item.group });
  }
  const bars = items
    .map((item, index) => {
      const width = Math.max(1.5, (item.fte / max) * 100);
      const tipId = `staff-deptbar-${index}`;
      const detail = `FY2027. ${item.label}: ${formatFte(item.fte)} budgeted FTE.`;
      return `<div class="staff-hbar">
<span class="staff-hbar-name">${esc(item.label)}</span>
<span class="staff-hbar-n">${esc(formatFte(item.fte))}</span>
<div class="staff-hbar-track">
<button type="button" class="tip-btn staff-hbar-bar" style="width:${width.toFixed(1)}%;background:${item.color}" aria-label="${esc(detail)}" aria-expanded="false" aria-controls="${tipId}" aria-describedby="${tipId}"></button>
<span class="tip-pop" id="${tipId}" role="tooltip" hidden>${esc(detail)}</span>
</div>
</div>`;
    })
    .join("");
  return `<section class="panel staff-panel" aria-labelledby="staff-deptchart-title">
<h2 id="staff-deptchart-title">FY2027 FTE by department</h2>
<p class="cap">The 12 largest departments by budgeted FTE. Sheriff is listed as one office. Bar color shows the office group.${otherFte > 0 ? ` ${rest.length} other departments account for ${formatFte(otherFte)} budgeted FTE combined, and are not drawn as one bar.` : ""}</p>
<div class="staff-hbars">${bars}</div>
${legend(legendItems, false)}
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

function sortHref(sort: StaffSort, current: StaffSort, dir: "asc" | "desc", staffPath: string): string {
  const nextDir = sort === current && dir === "desc" ? "asc" : "desc";
  return `${staffPath}?sort=${sort}&dir=${nextDir}`;
}

function sortHead(label: string, sort: StaffSort, current: StaffSort, dir: "asc" | "desc", numeric: boolean, staffPath: string): string {
  const on = sort === current;
  const arrow = on ? `<span class="staff-dir" aria-hidden="true">${dir === "asc" ? " \u2191" : " \u2193"}</span>` : "";
  return `<th class="${numeric ? "num " : ""}"><a href="${esc(sortHref(sort, current, dir, staffPath))}" class="staff-sort${on ? " on" : ""}">${esc(label)}${arrow}</a></th>`;
}

function numCell(text: string, missing: boolean): string {
  return `<td class="num${missing ? " na" : ""}">${missing ? "n/a" : esc(text)}</td>`;
}

function deptTable(sort: StaffSort, dir: "asc" | "desc", staffPath: string): string {
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
${numCell(formatFteCell(first.fte), first.fte == null)}
${numCell(formatFteCell(last.fte), last.fte == null)}
${numCell(first.personalServicesCents == null ? "" : money(first.personalServicesCents), first.personalServicesCents == null)}
${numCell(last.personalServicesCents == null ? "" : money(last.personalServicesCents), last.personalServicesCents == null)}
</tr>`;
    })
    .join("");
  return `<section class="panel staff-panel" aria-labelledby="staff-table-title">
<h2 id="staff-table-title">Department comparison, FY2020 and FY2027</h2>
<p class="cap">Sorted ${esc(sortLabel(sort, dir))}. A department with n/a in one year may be new, reorganized, or listed under a different name in that year's source. Tourism was one Tourist Development line in earlier books and several Tourism departments after the FY2025 split.</p>
<p class="table-hint">Swipe sideways to see every column.</p>
<div class="table-wrap staff-table-wrap"><table class="staff-table">
<thead><tr>
${sortHead("Department", "name", sort, dir, false, staffPath)}
${sortHead("FY2020 FTE", "fte0", sort, dir, true, staffPath)}
${sortHead("FY2027 FTE", "fte1", sort, dir, true, staffPath)}
${sortHead("FY2020 pay", "pay0", sort, dir, true, staffPath)}
${sortHead("FY2027 pay", "pay1", sort, dir, true, staffPath)}
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

function publicStaffPage(body: string): string {
  const chrome = { mode: "public" as const, active: "", reportHref: "/report" };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Staff and payroll. Budget Explorer</title>
${headAssets()}
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
${siteHeader(chrome)}
<main id="content">${body}</main>
${siteFooter(chrome)}
<script src="/assets/app.js" defer></script>
</body></html>`;
}

export function renderStaff(opts: {
  csrf?: string;
  isAdmin?: boolean;
  showNames?: boolean;
  sort?: string;
  dir?: string;
  access?: "public" | "dashboard";
  staffPath?: string;
}): string {
  const sort = parseStaffSort(opts.sort);
  const dir = parseStaffDir(opts.dir);
  const staffPath = opts.staffPath || "/staff";
  const body = `<div class="staff-page">
<h1>Staff and payroll</h1>
<p class="lede">Walton County budgeted staffing grew from ${formatFte(FIRST.fte)} FTE in FY2020 to ${formatFte(LAST.fte)} FTE in FY2027. Personal services, meaning salary plus benefits as carried in the county budget, grew from ${moneyWords(FIRST.personalServicesCents)} to ${moneyWords(LAST.personalServicesCents)}. The Sheriff went from ${formatFte(FIRST.sheriffFte)} staff and ${moneyWords(FIRST.sheriffPersonalServicesCents)} to ${formatFte(LAST.sheriffFte)} staff and ${moneyWords(LAST.sheriffPersonalServicesCents)}.</p>
${metricCards()}
${caveats()}
${fteLineChart()}
${payChart()}
${sheriffBars()}
${splitChart()}
${deptBarChart()}
${deptTable(sort, dir, staffPath)}
${sources()}
</div>`;
  if (opts.access === "public") return publicStaffPage(body);
  return page({
    title: "Staff and payroll. Budget Explorer",
    active: "staff",
    body,
    admin: Boolean(opts.isAdmin),
    csrf: opts.csrf || "",
    showNames: Boolean(opts.showNames),
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
