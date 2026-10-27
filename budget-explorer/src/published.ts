import { parseCsv } from "./csv";

/** A published total failed to add up, or a budget line has no category rule. */
export class ReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconciliationError";
  }
}

export interface AmountItem {
  key: string;
  label: string;
  cents: number;
  pct: number;
  basis: string;
  fiscalYear: number;
  status: string;
  sourceUrl: string;
  sourcePages: string;
  detail: string;
  fundCode: string;
  sort: number;
}

export interface ReserveClass {
  key: string;
  label: string;
  plain: string;
  cents: number;
  pct: number;
  detail: string;
}

export interface ReserveFundClass {
  key: string;
  label: string;
  cents: number;
  purpose: string;
}

export interface ReserveFund {
  key: string;
  label: string;
  fundCode: string;
  cents: number;
  priorCents: number;
  detail: string;
  classes: ReserveFundClass[];
}

export interface BudgetYear {
  fiscalYear: number;
  basisLabel: string;
  totalCents: number;
  adoptedCents: number;
  sourceUrl: string;
  sourcePages: string;
  detail: string;
  items: AmountItem[];
  aside: AmountItem[];
}

export interface PublishedLedger {
  asOf: string;
  incomeTotalCents: number;
  income: AmountItem[];
  notIncome: AmountItem[];
  budgets: BudgetYear[];
  beach: AmountItem[];
  beachNote: string;
  beachSources: string[];
  bedTax: {
    ytdCents: number;
    priorCents: number;
    changePct: number;
    actualCents: number;
    budgetCents: number;
    sourceUrl: string;
    detail: string;
  };
  property: {
    sharePct: number;
    values: { year: string; dollars: number; approx: boolean; sourceUrl: string; pages: string }[];
    millage: { year: string; rate: string; sourceUrl: string }[];
    detail: string;
  };
  reserves: {
    asOf: string;
    totalCents: number;
    priorCents: number;
    changeCents: number;
    sourceUrl: string;
    sourcePages: string;
    detail: string;
    classes: ReserveClass[];
    funds: ReserveFund[];
    policy: {
      name: string;
      unrestrictedCents: number;
      months: number;
      twoMonthsCents: number;
      spendingCents: number;
      sourceUrl: string;
      detail: string;
    };
    sheriff: {
      dueCents: number;
      ownRestrictedCents: number;
      sourceUrl: string;
      detail: string;
    };
    cashCents: number;
    investmentsCents: number;
    cashDetail: string;
    cashSourceUrl: string;
    cashPages: string;
  };
  trend: { year: number; cents: number }[];
  trendSourceUrl: string;
  trendPages: string;
}

export interface PublishedRow {
  section: string;
  itemKey: string;
  parentKey: string;
  label: string;
  amountCents: number;
  sortOrder: number;
  basis: string;
  fiscalYear: number;
  fundCode: string;
  status: string;
  sourceUrl: string;
  sourcePages: string;
  detail: string;
}

interface BudgetLine {
  fund: string;
  code: string;
  name: string;
  amountCents: number;
  note: string;
  department: string;
}

interface CategoryRule {
  category: string;
  income: boolean;
}

const ACFR_2025 = "https://www.flauditor.gov/pages/county_efile%20rpts/2025%20walton%20county.pdf";
const ACFR_2024 = "https://www.flauditor.gov/pages/county_efile%20rpts/2024%20walton%20county.pdf";

const FUND_CODE: Record<string, string> = {
  General: "001",
  "County Transportation": "101",
  "Fine and Forfeiture (Sheriff funding)": "107",
  "Fine and Forfeiture (funds the Sheriff; budget fund 107)": "107",
  "Tourist Development": "111",
  "Solid Waste Landfill": "112",
  "Capital Projects": "300",
};

const CLASS_ORDER: { key: string; source: string; label: string; plain: string }[] = [
  {
    key: "committed",
    source: "Committed",
    label: "Committed by the commissioners",
    plain: "The commissioners voted to use this for a stated purpose.",
  },
  {
    key: "assigned",
    source: "Assigned",
    label: "Assigned to planned uses",
    plain: "The county plans to use this. That plan is not the stricter vote that committed money needs.",
  },
  {
    key: "restricted",
    source: "Restricted",
    label: "Restricted by law or outside rules",
    plain: "A law or an outside rule says what this money is for. A vote cannot move it to something else.",
  },
  {
    key: "unassigned",
    source: "Unassigned",
    label: "Free to spend",
    plain: "No purpose has been set. Only the General Fund has this, and it can be used for any county purpose.",
  },
  {
    key: "nonspendable",
    source: "Nonspendable",
    label: "Tied up",
    plain: "Tied up in supplies, bills paid ahead, or a loan. It is not free cash.",
  },
];

const FY2026_TITLES: Record<string, CategoryRule> = {
  "Ad Valorem Taxes": { category: "Property taxes", income: true },
  "Tourist Development Taxes": { category: "Tourist development (bed) tax", income: true },
  "Local Discretionary Sales Surtax": { category: "Sales taxes", income: true },
  "Local Government Half-Cent Sales Tax": { category: "Sales taxes", income: true },
  "Local Option Fuel Tax": { category: "Gas taxes", income: true },
  "State Fuel Taxes": { category: "Gas taxes", income: true },
  "State Revenue Share Proceeds": { category: "State shared money and grants", income: true },
  "Section 8 Housing Choice Voucher Program": { category: "State shared money and grants", income: true },
  "Intergovernmental Revenue": { category: "State shared money and grants", income: true },
  "Planning Fees": { category: "Fees and charges for services", income: true },
  "Eagle Springs Golf and Recreation": { category: "Fees and charges for services", income: true },
  "Ambulance Fees": { category: "Fees and charges for services", income: true },
  "Fire Rescue MSBU": { category: "Fees and charges for services", income: true },
  "Charges for Services": { category: "Fees and charges for services", income: true },
  "Permits, Fees, and Special Assessments": { category: "Permits and special assessments", income: true },
  "Judgements, Fines and Forefeits": { category: "Fines and forfeits", income: true },
  "Miscellaneous Revenue": { category: "Interest and other miscellaneous", income: true },
  "Other Sources": { category: "Balance brought forward and other sources", income: false },
};

/** Percents with one decimal. The returned numbers add to 100. */
export function percentTenths(amounts: number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total === 0) return amounts.map(() => 0);
  const exact = amounts.map((amount) => (amount * 1000) / total);
  const floors = exact.map((value) => Math.floor(value + 1e-8));
  let leftover = 1000 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value + 1e-8) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = floors.slice();
  if (leftover < 0) throw new ReconciliationError("Percent rounding went past 100.");
  for (let i = 0; i < leftover; i += 1) out[order[i % order.length].index] += 1;
  const percents = out.map((value) => value / 10);
  const summed = Math.round(percents.reduce((sum, value) => sum + value, 0) * 10);
  if (summed !== 1000) throw new ReconciliationError(`Pie percents add to ${(summed / 10).toFixed(1)}, not 100.`);
  return percents;
}

export function classifyRevenueCode(code: string, name: string): CategoryRule {
  const digits = code.replace(/\D/g, "");
  const title = name.toLowerCase();
  if (!digits) throw new ReconciliationError(`Revenue line "${name}" has no account code to classify.`);
  if (digits.startsWith("381") || title.includes("transfer in")) return { category: "Transfers in", income: false };
  if (digits.startsWith("389") || digits.startsWith("386")) return { category: "Balance brought forward and other sources", income: false };
  if (digits.startsWith("311")) return { category: "Property taxes", income: true };
  if (digits.startsWith("3121")) return { category: "Tourist development (bed) tax", income: true };
  if (digits === "312600" || digits === "335180") return { category: "Sales taxes", income: true };
  if (digits === "312300" || digits.startsWith("3124") || ["335420", "335421", "335422", "335490"].includes(digits)) {
    return { category: "Gas taxes", income: true };
  }
  if (digits.startsWith("315")) return { category: "Communications services tax", income: true };
  if (digits.startsWith("32")) return { category: "Permits and special assessments", income: true };
  if (digits.startsWith("33")) return { category: "State shared money and grants", income: true };
  if (digits.startsWith("34")) return { category: "Fees and charges for services", income: true };
  if (digits.startsWith("35")) return { category: "Fines and forfeits", income: true };
  if (digits.startsWith("361")) return { category: "Interest earned", income: true };
  if (digits.startsWith("36")) return { category: "Other miscellaneous", income: true };
  throw new ReconciliationError(`No category rule for revenue code ${digits} (${name}). The import stops instead of guessing a category.`);
}

export function classifyBudgetTitle(name: string): CategoryRule {
  const rule = FY2026_TITLES[name.trim()];
  if (!rule) throw new ReconciliationError(`No category rule for budget line "${name}". The import stops instead of guessing a category.`);
  return rule;
}

export function parseBudgetCsv(text: string): BudgetLine[] {
  const table = parseCsv(text);
  if (table.length < 2) throw new ReconciliationError("The budget CSV has no data rows.");
  const headers = table[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const at = (...names: string[]) => {
    for (const name of names) {
      const index = headers.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const fundAt = at("fund", "fundcode", "fundnumber");
  const codeAt = at("revenuecode", "code", "account", "object", "objectcode");
  const nameAt = at("name", "revenuename", "description", "accountname", "title");
  const amountAt = at("amount", "adopted", "budget", "total", "revenue");
  const noteAt = at("note", "notes");
  const deptAt = at("department", "dept", "deptname", "departmentname");
  if (codeAt < 0 || amountAt < 0) {
    throw new ReconciliationError(`The budget CSV needs a revenue code column and an amount column. Headers found: ${table[0].join(", ")}`);
  }
  const lines: BudgetLine[] = [];
  for (let i = 1; i < table.length; i += 1) {
    const row = table[i];
    const rawAmount = (row[amountAt] || "").trim();
    if (!rawAmount) continue;
    const amount = Number(rawAmount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amount)) throw new ReconciliationError(`Budget CSV row ${i + 1} has an amount that is not a number.`);
    lines.push({
      fund: fundAt >= 0 ? (row[fundAt] || "").trim() : "",
      code: (row[codeAt] || "").trim(),
      name: nameAt >= 0 ? (row[nameAt] || "").trim() : "",
      amountCents: Math.round(amount * 100),
      note: noteAt >= 0 ? (row[noteAt] || "").trim() : "",
      department: deptAt >= 0 ? (row[deptAt] || "").trim() : "",
    });
  }
  if (!lines.length) throw new ReconciliationError("The budget CSV has no amount rows.");
  return lines;
}

export interface BudgetRollup {
  income: { key: string; label: string; cents: number }[];
  notIncome: { key: string; label: string; cents: number }[];
  transferCents: number;
  excludedCents: number;
  keptCents: number;
}

/** Group a budget file by account code. Unknown codes throw. Shares must add to adoptedTotalCents when that total is passed. */
export function rollupBudget(lines: BudgetLine[], opts: { excludeFunds?: string[]; adoptedTotalCents?: number | null } = {}): BudgetRollup {
  const exclude = new Set((opts.excludeFunds || []).map((fund) => fund.trim()));
  const income = new Map<string, number>();
  const aside = new Map<string, number>();
  let transferCents = 0;
  let excludedCents = 0;
  for (const line of lines) {
    if (line.fund && exclude.has(line.fund)) {
      excludedCents += line.amountCents;
      continue;
    }
    const rule = classifyRevenueCode(line.code, line.name);
    if (rule.category === "Transfers in") {
      transferCents += line.amountCents;
      continue;
    }
    const bucket = rule.income ? income : aside;
    bucket.set(rule.category, (bucket.get(rule.category) || 0) + line.amountCents);
  }
  const toList = (bucket: Map<string, number>) =>
    [...bucket.entries()]
      .map(([label, cents]) => ({ key: slug(label), label, cents }))
      .sort((a, b) => b.cents - a.cents);
  const incomeRows = toList(income);
  const notIncome = toList(aside);
  const keptCents = sum(incomeRows.map((row) => row.cents)) + sum(notIncome.map((row) => row.cents));
  if (opts.adoptedTotalCents != null && keptCents !== opts.adoptedTotalCents) {
    throw new ReconciliationError(
      `Budget lines add to ${keptCents} cents after removing transfers and excluded funds, not the adopted total of ${opts.adoptedTotalCents} cents.`,
    );
  }
  return { income: incomeRows, notIncome, transferCents, excludedCents, keptCents };
}

export function buildLedger(revenue: unknown, reserves: unknown, beach: unknown): PublishedLedger {
  const incomePack = buildIncome(revenue);
  const budgets = buildBudgets(revenue);
  const beachPack = buildBeach(beach, revenue);
  const reservesPack = buildReserves(reserves, revenue);
  const bedTax = buildBedTax(revenue);
  const property = buildProperty(revenue, incomePack);
  const trend = buildTrend(revenue);
  return {
    asOf: reservesPack.asOf,
    incomeTotalCents: incomePack.totalCents,
    income: incomePack.income,
    notIncome: incomePack.notIncome,
    budgets,
    beach: beachPack.lines,
    beachNote: beachPack.note,
    beachSources: beachPack.sources,
    bedTax,
    property,
    reserves: reservesPack,
    trend: trend.years,
    trendSourceUrl: trend.sourceUrl,
    trendPages: trend.pages,
  };
}

export function rowsFromLedger(ledger: PublishedLedger): PublishedRow[] {
  const rows: PublishedRow[] = [];
  const push = (row: PublishedRow) => rows.push(row);
  for (const item of ledger.income) push(amountRow("income", item, ""));
  for (const item of ledger.notIncome) push(amountRow("not_income", item, ""));
  for (const year of ledger.budgets) {
    push({
      section: "budget_meta",
      itemKey: "total",
      parentKey: String(year.fiscalYear),
      label: year.basisLabel,
      amountCents: year.adoptedCents,
      sortOrder: year.fiscalYear,
      basis: "budget",
      fiscalYear: year.fiscalYear,
      fundCode: "",
      status: "Budget",
      sourceUrl: year.sourceUrl,
      sourcePages: year.sourcePages,
      detail: year.detail,
    });
    push({
      section: "budget_meta",
      itemKey: "table_total",
      parentKey: String(year.fiscalYear),
      label: "Table total",
      amountCents: year.totalCents,
      sortOrder: year.fiscalYear,
      basis: "budget",
      fiscalYear: year.fiscalYear,
      fundCode: "",
      status: "Budget",
      sourceUrl: year.sourceUrl,
      sourcePages: year.sourcePages,
      detail: "",
    });
    for (const item of year.items) push(amountRow("budget", item, String(year.fiscalYear)));
    for (const item of year.aside) push(amountRow("budget_aside", item, String(year.fiscalYear)));
  }
  for (const item of ledger.beach) push(amountRow("beach", item, String(item.fiscalYear)));
  push({
    section: "beach_note",
    itemKey: "fy2025-amendment",
    parentKey: "",
    label: "FY2025 budget amendment",
    amountCents: 0,
    sortOrder: 0,
    basis: "budget",
    fiscalYear: 2025,
    fundCode: "001",
    status: "Budget amendment",
    sourceUrl: ledger.beachSources[0] || "",
    sourcePages: "",
    detail: ledger.beachNote,
  });
  push({
    section: "bed_tax",
    itemKey: "ytd",
    parentKey: "",
    label: "Bed tax collected October 2025 through August 2026",
    amountCents: ledger.bedTax.ytdCents,
    sortOrder: 1,
    basis: "collections",
    fiscalYear: 2026,
    fundCode: "111",
    status: "Clerk report",
    sourceUrl: ledger.bedTax.sourceUrl,
    sourcePages: "",
    detail: ledger.bedTax.detail,
  });
  push({
    section: "bed_tax",
    itemKey: "prior",
    parentKey: "",
    label: "Same months a year earlier",
    amountCents: ledger.bedTax.priorCents,
    sortOrder: 2,
    basis: "collections",
    fiscalYear: 2025,
    fundCode: "111",
    status: "Clerk report",
    sourceUrl: ledger.bedTax.sourceUrl,
    sourcePages: "",
    detail: "",
  });
  push({
    section: "bed_tax",
    itemKey: "actual",
    parentKey: "",
    label: "FY2025 audited bed tax",
    amountCents: ledger.bedTax.actualCents,
    sortOrder: 3,
    basis: "audited_actual",
    fiscalYear: 2025,
    fundCode: "111",
    status: "Audited actual",
    sourceUrl: ACFR_2025,
    sourcePages: "PDF pp.41, 47",
    detail: "",
  });
  push({
    section: "bed_tax",
    itemKey: "budget",
    parentKey: "",
    label: "FY2026 tentative bed tax budget",
    amountCents: ledger.bedTax.budgetCents,
    sortOrder: 4,
    basis: "budget",
    fiscalYear: 2026,
    fundCode: "111",
    status: "Budget",
    sourceUrl: ledger.budgets.find((year) => year.fiscalYear === 2026)?.sourceUrl || "",
    sourcePages: "",
    detail: "",
  });
  ledger.property.values.forEach((value, index) => {
    push({
      section: "property_value",
      itemKey: value.year,
      parentKey: value.approx ? "approx" : "",
      label: value.year,
      amountCents: value.dollars,
      sortOrder: index,
      basis: "dollars",
      fiscalYear: Number(value.year.replace(/\D/g, "")) || 0,
      fundCode: "",
      status: value.approx ? "Approximate" : "Verified",
      sourceUrl: value.sourceUrl,
      sourcePages: value.pages,
      detail: ledger.property.detail,
    });
  });
  ledger.property.millage.forEach((rate, index) => {
    push({
      section: "millage",
      itemKey: rate.year,
      parentKey: "",
      label: rate.year,
      amountCents: Math.round(Number(rate.rate) * 1000),
      sortOrder: index,
      basis: "millage",
      fiscalYear: Number(rate.year.replace(/\D/g, "")) || 0,
      fundCode: "",
      status: "Verified",
      sourceUrl: rate.sourceUrl,
      sourcePages: "",
      detail: rate.rate,
    });
  });
  push({
    section: "reserve_total",
    itemKey: "total",
    parentKey: "",
    label: "Savings at year end",
    amountCents: ledger.reserves.totalCents,
    sortOrder: 1,
    basis: "audited_actual",
    fiscalYear: 2025,
    fundCode: "",
    status: "Audited year-end balance",
    sourceUrl: ledger.reserves.sourceUrl,
    sourcePages: ledger.reserves.sourcePages,
    detail: ledger.reserves.detail,
  });
  push({
    section: "reserve_total",
    itemKey: "prior",
    parentKey: "",
    label: "Savings a year earlier",
    amountCents: ledger.reserves.priorCents,
    sortOrder: 2,
    basis: "audited_actual",
    fiscalYear: 2024,
    fundCode: "",
    status: "Audited year-end balance",
    sourceUrl: ACFR_2024,
    sourcePages: "PDF pp.43-44",
    detail: "",
  });
  ledger.reserves.classes.forEach((item, index) => {
    push({
      section: "reserve_class",
      itemKey: item.key,
      parentKey: "",
      label: item.label,
      amountCents: item.cents,
      sortOrder: index,
      basis: "audited_actual",
      fiscalYear: 2025,
      fundCode: "",
      status: "Audited year-end balance",
      sourceUrl: ledger.reserves.sourceUrl,
      sourcePages: ledger.reserves.sourcePages,
      detail: `${item.plain} ${item.detail}`.trim(),
    });
  });
  ledger.reserves.funds.forEach((fund, index) => {
    push({
      section: "reserve_fund",
      itemKey: "total",
      parentKey: fund.key,
      label: fund.label,
      amountCents: fund.cents,
      sortOrder: index,
      basis: "audited_actual",
      fiscalYear: 2025,
      fundCode: fund.fundCode,
      status: "Audited year-end balance",
      sourceUrl: ledger.reserves.sourceUrl,
      sourcePages: ledger.reserves.sourcePages,
      detail: fund.detail,
    });
    push({
      section: "reserve_fund_prior",
      itemKey: "total",
      parentKey: fund.key,
      label: fund.label,
      amountCents: fund.priorCents,
      sortOrder: index,
      basis: "audited_actual",
      fiscalYear: 2024,
      fundCode: fund.fundCode,
      status: "Audited year-end balance",
      sourceUrl: ACFR_2024,
      sourcePages: "",
      detail: "",
    });
    fund.classes.forEach((item, classIndex) => {
      push({
        section: "reserve_fund_class",
        itemKey: item.key,
        parentKey: fund.key,
        label: item.label,
        amountCents: item.cents,
        sortOrder: classIndex,
        basis: "audited_actual",
        fiscalYear: 2025,
        fundCode: fund.fundCode,
        status: "Audited year-end balance",
        sourceUrl: ledger.reserves.sourceUrl,
        sourcePages: ledger.reserves.sourcePages,
        detail: item.purpose,
      });
    });
  });
  push({
    section: "policy",
    itemKey: "unrestricted",
    parentKey: "",
    label: ledger.reserves.policy.name,
    amountCents: ledger.reserves.policy.unrestrictedCents,
    sortOrder: 1,
    basis: "calculation",
    fiscalYear: 2025,
    fundCode: "001",
    status: "Project calculation",
    sourceUrl: ledger.reserves.policy.sourceUrl,
    sourcePages: "",
    detail: ledger.reserves.policy.detail,
  });
  push({
    section: "policy",
    itemKey: "two_months",
    parentKey: "",
    label: "Two months of spending",
    amountCents: ledger.reserves.policy.twoMonthsCents,
    sortOrder: 2,
    basis: "calculation",
    fiscalYear: 2025,
    fundCode: "001",
    status: "Project calculation",
    sourceUrl: ledger.reserves.policy.sourceUrl,
    sourcePages: "",
    detail: "",
  });
  push({
    section: "policy",
    itemKey: "spending",
    parentKey: "",
    label: "General Fund spending plus transfers out",
    amountCents: ledger.reserves.policy.spendingCents,
    sortOrder: 3,
    basis: "audited_actual",
    fiscalYear: 2025,
    fundCode: "001",
    status: "Audited actual",
    sourceUrl: ACFR_2025,
    sourcePages: "",
    detail: "",
  });
  push({
    section: "sheriff",
    itemKey: "due",
    parentKey: "",
    label: "Owed back to the Board",
    amountCents: ledger.reserves.sheriff.dueCents,
    sortOrder: 1,
    basis: "audited_actual",
    fiscalYear: 2025,
    fundCode: "107",
    status: "Audited actual",
    sourceUrl: ledger.reserves.sheriff.sourceUrl,
    sourcePages: "PDF p.365",
    detail: ledger.reserves.sheriff.detail,
  });
  push({
    section: "sheriff",
    itemKey: "own",
    parentKey: "",
    label: "Restricted on the Sheriff's own books",
    amountCents: ledger.reserves.sheriff.ownRestrictedCents,
    sortOrder: 2,
    basis: "audited_actual",
    fiscalYear: 2025,
    fundCode: "",
    status: "Audited actual",
    sourceUrl: ledger.reserves.sheriff.sourceUrl,
    sourcePages: "PDF p.365",
    detail: "",
  });
  push({
    section: "cash",
    itemKey: "cash",
    parentKey: "",
    label: "Cash and equivalents",
    amountCents: ledger.reserves.cashCents,
    sortOrder: 1,
    basis: "audited_actual",
    fiscalYear: 2025,
    fundCode: "",
    status: "Audited actual",
    sourceUrl: ledger.reserves.cashSourceUrl,
    sourcePages: ledger.reserves.cashPages,
    detail: ledger.reserves.cashDetail,
  });
  push({
    section: "cash",
    itemKey: "investments",
    parentKey: "",
    label: "Investments",
    amountCents: ledger.reserves.investmentsCents,
    sortOrder: 2,
    basis: "audited_actual",
    fiscalYear: 2025,
    fundCode: "",
    status: "Audited actual",
    sourceUrl: ledger.reserves.cashSourceUrl,
    sourcePages: ledger.reserves.cashPages,
    detail: "",
  });
  ledger.trend.forEach((point, index) => {
    push({
      section: "trend",
      itemKey: String(point.year),
      parentKey: "",
      label: String(point.year),
      amountCents: point.cents,
      sortOrder: index,
      basis: "audited_actual",
      fiscalYear: point.year,
      fundCode: "",
      status: "Audited actual",
      sourceUrl: point.year === 2025 ? ACFR_2025 : ledger.trendSourceUrl,
      sourcePages: point.year === 2025 ? "PDF p.47" : ledger.trendPages,
      detail: "",
    });
  });
  return rows;
}

export function ledgerFromRows(asOf: string, rows: PublishedRow[]): PublishedLedger {
  const of = (section: string, parent = "") => rows.filter((row) => row.section === section && (parent === "" || row.parentKey === parent));
  const one = (section: string, key: string) => {
    const row = rows.find((item) => item.section === section && item.itemKey === key);
    if (!row) throw new ReconciliationError(`Stored figures are missing ${section} ${key}.`);
    return row;
  };
  const income = of("income").map(rowToAmount);
  const incomeTotal = sum(income.map((item) => item.cents));
  const percents = percentTenths(income.map((item) => item.cents));
  income.forEach((item, index) => {
    item.pct = percents[index];
  });
  const classes = of("reserve_class").map((row) => ({
    key: row.itemKey,
    label: row.label,
    plain: row.detail,
    cents: row.amountCents,
    pct: 0,
    detail: "",
  }));
  const classPercents = percentTenths(classes.map((item) => item.cents));
  classes.forEach((item, index) => {
    item.pct = classPercents[index];
  });
  const fundTotals = of("reserve_fund").filter((row) => row.itemKey === "total");
  const funds: ReserveFund[] = fundTotals.map((row) => ({
    key: row.parentKey,
    label: row.label,
    fundCode: row.fundCode,
    cents: row.amountCents,
    priorCents: of("reserve_fund_prior").find((prior) => prior.parentKey === row.parentKey)?.amountCents || 0,
    detail: row.detail,
    classes: of("reserve_fund_class", row.parentKey).map((item) => ({
      key: item.itemKey,
      label: item.label,
      cents: item.amountCents,
      purpose: item.detail,
    })),
  }));
  const budgetYears = [...new Set(of("budget_meta").map((row) => row.parentKey))].map((year) => Number(year)).sort();
  const budgets: BudgetYear[] = budgetYears.map((year) => {
    const meta = oneParent("budget_meta", "total", String(year), rows);
    const table = oneParent("budget_meta", "table_total", String(year), rows);
    return {
      fiscalYear: year,
      basisLabel: meta.label,
      totalCents: table.amountCents,
      adoptedCents: meta.amountCents,
      sourceUrl: meta.sourceUrl,
      sourcePages: meta.sourcePages,
      detail: meta.detail,
      items: of("budget", String(year)).map(rowToAmount),
      aside: of("budget_aside", String(year)).map(rowToAmount),
    };
  });
  const ytd = one("bed_tax", "ytd");
  const priorBed = one("bed_tax", "prior");
  const propertyValues = of("property_value").map((row) => ({
    year: row.label,
    dollars: row.amountCents,
    approx: row.parentKey === "approx",
    sourceUrl: row.sourceUrl,
    pages: row.sourcePages,
  }));
  const propertyShare = income.find((item) => item.key === "property-taxes");
  return {
    asOf,
    incomeTotalCents: incomeTotal,
    income,
    notIncome: of("not_income").map(rowToAmount),
    budgets,
    beach: of("beach").map(rowToAmount),
    beachNote: one("beach_note", "fy2025-amendment").detail,
    beachSources: [...new Set(of("beach").map((row) => row.sourceUrl).filter(Boolean))],
    bedTax: {
      ytdCents: ytd.amountCents,
      priorCents: priorBed.amountCents,
      changePct: priorBed.amountCents ? ((ytd.amountCents - priorBed.amountCents) / priorBed.amountCents) * 100 : 0,
      actualCents: one("bed_tax", "actual").amountCents,
      budgetCents: one("bed_tax", "budget").amountCents,
      sourceUrl: ytd.sourceUrl,
      detail: ytd.detail,
    },
    property: {
      sharePct: propertyShare?.pct || 0,
      values: propertyValues,
      millage: of("millage").map((row) => ({
        year: row.label,
        rate: row.detail,
        sourceUrl: row.sourceUrl,
      })),
      detail: propertyValues[0]?.sourceUrl ? of("property_value")[0].detail : "",
    },
    reserves: {
      asOf,
      totalCents: one("reserve_total", "total").amountCents,
      priorCents: one("reserve_total", "prior").amountCents,
      changeCents: one("reserve_total", "total").amountCents - one("reserve_total", "prior").amountCents,
      sourceUrl: one("reserve_total", "total").sourceUrl,
      sourcePages: one("reserve_total", "total").sourcePages,
      detail: one("reserve_total", "total").detail,
      classes,
      funds,
      policy: {
        name: one("policy", "unrestricted").label,
        unrestrictedCents: one("policy", "unrestricted").amountCents,
        twoMonthsCents: one("policy", "two_months").amountCents,
        spendingCents: one("policy", "spending").amountCents,
        months: one("policy", "spending").amountCents ? one("policy", "unrestricted").amountCents / (one("policy", "spending").amountCents / 12) : 0,
        sourceUrl: one("policy", "unrestricted").sourceUrl,
        detail: one("policy", "unrestricted").detail,
      },
      sheriff: {
        dueCents: one("sheriff", "due").amountCents,
        ownRestrictedCents: one("sheriff", "own").amountCents,
        sourceUrl: one("sheriff", "due").sourceUrl,
        detail: one("sheriff", "due").detail,
      },
      cashCents: one("cash", "cash").amountCents,
      investmentsCents: one("cash", "investments").amountCents,
      cashDetail: one("cash", "cash").detail,
      cashSourceUrl: one("cash", "cash").sourceUrl,
      cashPages: one("cash", "cash").sourcePages,
    },
    trend: of("trend").map((row) => ({ year: row.fiscalYear, cents: row.amountCents })),
    trendSourceUrl: of("trend")[0]?.sourceUrl || "",
    trendPages: of("trend")[0]?.sourcePages || "",
  };
}

export function ledgerToSql(ledger: PublishedLedger, createdAt = new Date().toISOString()): string {
  const rows = rowsFromLedger(ledger);
  const header = `INSERT INTO published_snapshots (created_at, as_of, note) VALUES (${q(createdAt)}, ${q(ledger.asOf)}, ${q("Aggregate totals from the audited ACFR and the county budget files.")});`;
  const id = "(SELECT MAX(id) FROM published_snapshots)";
  const values = rows
    .map(
      (row) =>
        `(${id}, ${q(row.section)}, ${q(row.itemKey)}, ${q(row.parentKey)}, ${q(row.label)}, ${row.amountCents}, ${row.sortOrder}, ${q(row.basis)}, ${row.fiscalYear}, ${q(row.fundCode)}, ${q(row.status)}, ${q(row.sourceUrl)}, ${q(row.sourcePages)}, ${q(row.detail)})`,
    )
    .join(",\n");
  return `DELETE FROM published_amounts;\nDELETE FROM published_snapshots;\n${header}\nINSERT INTO published_amounts (\n  snapshot_id, section, item_key, parent_key, label, amount_cents, sort_order, basis, fiscal_year, fund_code, status, source_url, source_pages, detail\n) VALUES\n${values};\n`;
}

function buildIncome(revenue: unknown): { totalCents: number; income: AmountItem[]; notIncome: AmountItem[] } {
  const file = asRecord(revenue, "revenue file");
  const bottom = asRecord(file.bottom_line, "bottom_line");
  const received = amountOf(bottom.fy2025_actual_total_received, "FY2025 total revenue");
  const fund = asRecord(file.fy2025_actual_by_fund_and_source, "FY2025 fund statement");
  const matrix = asRecord(fund.revenue, "FY2025 revenue matrix");
  const funds = stringList(fund.funds, "FY2025 funds");
  const totalRow = vector(matrix["Total revenue"], "Total revenue", funds.length);
  assertParts(totalRow.slice(0, -1), totalRow[totalRow.length - 1], "Total revenue");
  if (totalRow[totalRow.length - 1] !== received.amount) {
    throw new ReconciliationError(`Fund revenue total ${totalRow[totalRow.length - 1]} does not match the published total ${received.amount}.`);
  }
  const rows = ["Taxes", "Licenses and permits", "Intergovernmental", "Charges for services", "Fines and forfeitures", "Investment earnings", "Miscellaneous"].map(
    (name) => vector(matrix[name], name, funds.length),
  );
  for (const row of rows) assertParts(row.slice(0, -1), row[row.length - 1], "a FY2025 revenue row");
  assertParts(
    rows.map((row) => row[row.length - 1]),
    received.amount,
    "FY2025 revenue rows",
  );
  const wide = asRecord(asRecord(file.fy2025_government_wide_general_revenue, "government-wide revenue").items, "government-wide items");
  const property = num(wide["Property taxes"], "Property taxes");
  const gas = num(wide["Gasoline taxes"], "Gasoline taxes");
  const sales = num(wide["Sales tax"], "Sales tax");
  const bed = num(wide["Tourist development tax"], "Tourist development tax");
  const otherTax = num(wide["Other taxes"], "Other taxes");
  const accrualTaxes = property + gas + sales + bed + otherTax;
  const fundTaxes = rows[0][rows[0].length - 1];
  const intergov = rows[2][rows[2].length - 1];
  const moved = accrualTaxes - fundTaxes;
  if (moved <= 0 || intergov - moved < 0) {
    throw new ReconciliationError("The grants line cannot be split from intergovernmental revenue because the tax figures do not line up.");
  }
  const grants = intergov - moved;
  const fees = rows[3][rows[3].length - 1];
  const permits = rows[1][rows[1].length - 1];
  const fines = rows[4][rows[4].length - 1];
  const interest = rows[5][rows[5].length - 1];
  const misc = rows[6][rows[6].length - 1];
  const derived = [property, bed, sales, grants, fees, interest, misc, gas, permits, otherTax, fines];
  assertParts(derived, received.amount, "FY2025 income sources");
  const plain = asRecord(file.fy2025_plain_language_by_source, "plain-language sources");
  const plainItems = asList(plain.items, "plain-language items").map((item) => asRecord(item, "plain-language item"));
  const plainTotal = num(plain.total, "plain-language total");
  if (plainTotal !== received.amount) throw new ReconciliationError("Published plain-language total does not match audited total revenue.");
  assertParts(
    plainItems.map((item) => num(item.amount, "plain-language amount")),
    plainTotal,
    "Published source shares",
  );
  if (plainItems.length !== derived.length) throw new ReconciliationError("Published source list does not have one row per derived source.");
  for (const amount of derived) {
    if (!plainItems.some((item) => num(item.amount, "plain amount") === amount)) {
      throw new ReconciliationError(`Derived income amount ${amount} is not in the published source list.`);
    }
  }
  const solid = funds.indexOf("Solid Waste Landfill");
  const tourist = funds.indexOf("Tourist Development");
  const general = funds.indexOf("General");
  const nonmajor = funds.indexOf("Nonmajor governmental");
  const transport = funds.indexOf("County Transportation");
  if ([solid, tourist, general, nonmajor, transport].some((index) => index < 0)) {
    throw new ReconciliationError("The FY2025 fund list is missing a fund the income notes rely on.");
  }
  const surtax = rows[0][solid];
  const halfCent = sales - surtax;
  if (halfCent <= 0) throw new ReconciliationError("Sales tax is smaller than the Solid Waste surtax, so the split does not work.");
  const bedInFund = rows[0][tourist];
  if (bedInFund !== bed) throw new ReconciliationError("Bed tax on the Tourist Development fund does not match the government-wide bed tax.");
  const touristInterest = rows[5][tourist];
  const buildingPermits = rows[1][nonmajor];
  const notes = asRecord(fund.fund_notes, "fund notes");
  const pages = str(fund.pages, "FY2025 pages");
  const source = str(fund.source, "FY2025 source");
  const specs: { key: string; label: string; dollars: number; status: string; detail: string }[] = [
    {
      key: "property-taxes",
      label: "Property taxes",
      dollars: property,
      status: "Audited actual",
      detail: `Property tax is a tax on the value of property. Most of it is recorded in the General Fund, whose tax line is ${dollars(rows[0][general])}. The smaller funds' tax line is ${dollars(rows[0][nonmajor])}. The audit's note on those smaller funds says: ${str(notes["Nonmajor governmental"], "nonmajor note")} This property tax total is from the accrual statement, so it can differ slightly from the fund statements.`,
    },
    {
      key: "bed-tax",
      label: "Tourist (bed) tax",
      dollars: bed,
      status: "Audited actual",
      detail: `This is the tourist development tax on short stays, often called the bed tax. The whole amount is the tax revenue of the Tourist Development fund (fund 111). State law limits that fund to tourism purposes.`,
    },
    {
      key: "sales-taxes",
      label: "Sales taxes",
      dollars: sales,
      status: "Audited actual",
      detail: `Sales taxes total ${dollars(sales)}. The one-cent county sales surtax, ${dollars(surtax)}, is recorded in the Solid Waste fund. The other ${dollars(halfCent)} is the presumed state half-cent share. The audit does not print that half-cent amount on its own line. That split is the project's grouping.`,
    },
    {
      key: "grants",
      label: "Grants and other state or federal money",
      dollars: grants,
      status: "Project grouping",
      detail: `The fund statements show ${dollars(intergov)} of money from other governments. The accrual statement counts ${dollars(moved)} of state-shared sales and fuel taxes as taxes instead. This line is what remains, ${dollars(grants)}. It is the project's grouping, not a line the audit prints by itself.`,
    },
    {
      key: "fees",
      label: "Fees and charges",
      dollars: fees,
      status: "Audited actual",
      detail: "Fees and charges are money paid for county services. The figure is the fund statement total for charges for services.",
    },
    {
      key: "interest",
      label: "Interest earned",
      dollars: interest,
      status: "Audited actual",
      detail: `Interest is earnings on investments. The Tourist Development fund earned ${dollars(touristInterest)} of it.`,
    },
    {
      key: "other",
      label: "Other",
      dollars: misc,
      status: "Audited actual",
      detail: "Other is miscellaneous revenue on the fund statements. The audit does not itemize it further.",
    },
    {
      key: "gas-taxes",
      label: "Gas taxes",
      dollars: gas,
      status: "Audited actual",
      detail: `Gas taxes total ${dollars(gas)}. The audit does not split local option fuel tax from the state share. County Transportation tax revenue is ${dollars(rows[0][transport])}, and the audit describes that fund's taxes as local option and voted fuel taxes.`,
    },
    {
      key: "permits",
      label: "Permits and licenses",
      dollars: permits,
      status: "Audited actual",
      detail: `Permits and licenses total ${dollars(permits)}. Building Department permits are ${dollars(buildingPermits)} of that, in the smaller funds. Beach vending is not its own line in the audit. The FY2027 budget lists it separately below.`,
    },
    {
      key: "other-taxes",
      label: "Other taxes",
      dollars: otherTax,
      status: "Audited actual",
      detail: "Other taxes are a verified total. The audit does not itemize them. A communications services tax is presumed and is not confirmed.",
    },
    {
      key: "fines",
      label: "Fines",
      dollars: fines,
      status: "Audited actual",
      detail: "Fines and forfeitures are penalties. The figure is the fund statement total.",
    },
  ];
  const ordered = [...specs].sort((a, b) => b.dollars - a.dollars);
  const cents = ordered.map((item) => item.dollars * 100);
  const pcts = percentTenths(cents);
  const income = ordered.map((item, index) =>
    makeAmount({
      key: item.key,
      label: item.label,
      cents: item.dollars * 100,
      pct: pcts[index],
      basis: "audited_actual",
      fiscalYear: 2025,
      status: item.status,
      sourceUrl: source,
      sourcePages: pages,
      detail: item.detail,
      fundCode: "",
      sort: index,
    }),
  );
  const other = asRecord(fund.other_financing, "other financing");
  const transfers = vector(other["Transfers in"], "Transfers in", funds.length);
  const transfersOut = vector(other["Transfers out"], "Transfers out", funds.length);
  assertParts(transfers.slice(0, -1), transfers[transfers.length - 1], "Transfers in");
  assertParts(transfersOut.slice(0, -1), transfersOut[transfersOut.length - 1], "Transfers out");
  if (transfers[transfers.length - 1] !== transfersOut[transfersOut.length - 1]) {
    throw new ReconciliationError("Transfers in do not equal transfers out.");
  }
  const transferPublished = amountOf(bottom.fy2025_transfers_in_between_funds, "transfers");
  if (transfers[transfers.length - 1] !== transferPublished.amount) {
    throw new ReconciliationError("Transfers in do not match the published transfer total.");
  }
  const begin = vector(other["Fund balance, beginning of year"], "beginning balance", funds.length);
  const end = vector(other["Fund balance, end of year"], "ending balance", funds.length);
  assertParts(begin.slice(0, -1), begin[begin.length - 1], "Beginning savings");
  assertParts(end.slice(0, -1), end[end.length - 1], "Ending savings");
  const sale = vector(other["Proceeds from sale of equipment"], "equipment sales", funds.length);
  const debt = vector(other["Issuance of debt"], "debt", funds.length);
  assertParts(sale.slice(0, -1), sale[sale.length - 1], "Equipment sales");
  assertParts(debt.slice(0, -1), debt[debt.length - 1], "Debt issued");
  const sheriffIn = transfers[funds.indexOf("Fine and Forfeiture (Sheriff funding)")];
  const transportIn = transfers[transport];
  const notIncome: AmountItem[] = [
    makeAmount({
      key: "transfers",
      label: "Transfers between county funds",
      cents: transfers[transfers.length - 1] * 100,
      pct: 0,
      basis: "audited_actual",
      fiscalYear: 2025,
      status: "Not income",
      sourceUrl: transferPublished.source,
      sourcePages: str(asRecord(bottom.fy2025_transfers_in_between_funds, "transfers").pages, "") || pages,
      detail: `A transfer moves money from one county fund to another. It is not new income. Counting it as income would count the same dollars twice. The largest moves were ${dollars(sheriffIn)} into the Fine and Forfeiture fund, which pays the Sheriff, and ${dollars(transportIn)} into Transportation.`,
      fundCode: "",
      sort: 0,
    }),
    makeAmount({
      key: "savings-forward",
      label: "Savings brought forward",
      cents: begin[begin.length - 1] * 100,
      pct: 0,
      basis: "audited_actual",
      fiscalYear: 2025,
      status: "Not income",
      sourceUrl: source,
      sourcePages: pages,
      detail: "This is the savings each governmental fund already held at the start of the year. It is last year's ending balance, not income received during the year.",
      fundCode: "",
      sort: 1,
    }),
    makeAmount({
      key: "equipment-sales",
      label: "Sales of equipment",
      cents: sale[sale.length - 1] * 100,
      pct: 0,
      basis: "audited_actual",
      fiscalYear: 2025,
      status: "Not counted in the income total",
      sourceUrl: source,
      sourcePages: pages,
      detail: `The audit lists ${dollars(sale[sale.length - 1])} from selling equipment below total revenue. Those dollars are not part of the income total on this page.`,
      fundCode: "",
      sort: 2,
    }),
    makeAmount({
      key: "debt",
      label: "Money borrowed",
      cents: debt[debt.length - 1] * 100,
      pct: 0,
      basis: "audited_actual",
      fiscalYear: 2025,
      status: "Not counted in the income total",
      sourceUrl: source,
      sourcePages: pages,
      detail: "The audit lists new borrowing below total revenue. Borrowing is not income.",
      fundCode: "",
      sort: 3,
    }),
  ];
  return { totalCents: received.amount * 100, income, notIncome };
}

function buildBudgets(revenue: unknown): BudgetYear[] {
  const file = asRecord(revenue, "revenue file");
  const bottom = asRecord(file.bottom_line, "bottom_line");
  const fy2026 = asRecord(file.fy2026_budget_by_source, "FY2026 budget");
  const lines = asList(fy2026.lines, "FY2026 lines").map((line) => asRecord(line, "FY2026 line"));
  const tentative = num(fy2026.tentative_total, "FY2026 tentative total");
  const finalTotal = num(fy2026.final_total, "FY2026 final total");
  const adopted2026 = amountOf(bottom.fy2026_adopted_total_budget, "FY2026 adopted");
  if (finalTotal !== adopted2026.amount) throw new ReconciliationError("FY2026 final budget total does not match the adopted total.");
  assertParts(
    lines.map((line) => num(line.fy2026_tentative, "FY2026 line")),
    tentative,
    "FY2026 budget lines",
  );
  const grouped = new Map<string, { cents: number; income: boolean }>();
  for (const line of lines) {
    const name = str(line.name, "FY2026 line name");
    const rule = classifyBudgetTitle(name);
    const cents = num(line.fy2026_tentative, name) * 100;
    const current = grouped.get(rule.category) || { cents: 0, income: rule.income };
    current.cents += cents;
    grouped.set(rule.category, current);
  }
  const categories = asList(fy2026.by_category, "FY2026 categories").map((item) => asRecord(item, "FY2026 category"));
  assertParts(
    categories.map((item) => num(item.fy2026_tentative, "FY2026 category")),
    tentative,
    "FY2026 categories",
  );
  for (const category of categories) {
    const label = str(category.category, "category");
    const got = grouped.get(label);
    const expected = num(category.fy2026_tentative, label) * 100;
    if (!got || got.cents !== expected) {
      throw new ReconciliationError(`FY2026 category ${label} does not match the sum of its budget lines.`);
    }
    const named = stringList(category.lines, label);
    const namedSum = named.map((name) => {
      const line = lines.find((item) => str(item.name, "line") === name);
      if (!line) throw new ReconciliationError(`FY2026 category ${label} names a missing line ${name}.`);
      return num(line.fy2026_tentative, name);
    });
    assertParts(namedSum, num(category.fy2026_tentative, label), `FY2026 ${label}`);
  }
  const fy2027 = asRecord(file.fy2027_adopted_by_source, "FY2027 budget");
  const adopted2027 = amountOf(bottom.fy2027_adopted_total_budget, "FY2027 adopted");
  const recon = asRecord(fy2027.reconciliation, "FY2027 reconciliation");
  const fileTotal = num(recon.file_total_all_lines, "FY2027 file total");
  const lessTransfers = num(recon.less_transfers_in_381000, "FY2027 transfers");
  const lessInsurance = num(recon.less_fund_503_self_insurance, "FY2027 self insurance");
  const equals = num(recon.equals_adopted_budget, "FY2027 equals");
  const adoptedPer = num(recon.adopted_per_resolution, "FY2027 resolution");
  if (fileTotal - lessTransfers - lessInsurance !== equals || equals !== adoptedPer || equals !== adopted2027.amount) {
    throw new ReconciliationError("FY2027 budget file does not reconcile to the adopted total.");
  }
  const codeLines = asList(fy2027.lines, "FY2027 lines").map((line) => asRecord(line, "FY2027 line"));
  const budgetLines: BudgetLine[] = codeLines.map((line) => ({
    fund: "",
    code: str(line.code, "code"),
    name: str(line.name, "name"),
    amountCents: num(line.amount, "amount") * 100,
    note: "",
    department: "",
  }));
  const rollup = rollupBudget(budgetLines, { adoptedTotalCents: adopted2027.amount * 100 });
  const publishedCategories = asList(fy2027.by_category, "FY2027 categories").map((item) => asRecord(item, "FY2027 category"));
  assertParts(
    publishedCategories.map((item) => num(item.fy2027_adopted, "FY2027 category")),
    adopted2027.amount,
    "FY2027 categories",
  );
  const byFund = asList(fy2027.by_fund, "FY2027 funds").map((item) => asRecord(item, "FY2027 fund"));
  assertParts(
    byFund.map((item) => num(item.amount, "FY2027 fund amount")),
    adopted2027.amount,
    "FY2027 funds",
  );
  for (const category of publishedCategories) {
    const label = str(category.category, "FY2027 category");
    const cents = num(category.fy2027_adopted, label) * 100;
    const fromCodes = [...rollup.income, ...rollup.notIncome].find((item) => item.label === label);
    if (!fromCodes || fromCodes.cents !== cents) {
      throw new ReconciliationError(`FY2027 category ${label} does not match the account-code grouping.`);
    }
  }
  const year2026 = budgetYear(2026, "Budget", tentative * 100, finalTotal * 100, str(fy2026.source, "FY2026 source"), str(fy2026.pages, "FY2026 pages"), grouped, "The by-source lines are the tentative budget from the September 8, 2025 hearing. The adopted total is lower. At the final hearing the property tax rate was cut and the gap was filled with savings and other revenue, so the property tax line in this table is higher than the final mix. These figures are a budget, not money already collected.");
  const grouped2027 = new Map<string, { cents: number; income: boolean }>();
  for (const item of rollup.income) grouped2027.set(item.label, { cents: item.cents, income: true });
  for (const item of rollup.notIncome) grouped2027.set(item.label, { cents: item.cents, income: false });
  const year2027 = budgetYear(2027, "Budget", adopted2027.amount * 100, adopted2027.amount * 100, str(fy2027.source, "FY2027 source"), "", grouped2027, "This is the adopted FY2027 budget, built from the county revenue file. Transfers between funds and the self-insurance fund are left out. The file then matches the adopted total to the dollar. These figures are a budget, not money already collected. Savings brought forward are shown apart from income.");
  return [year2026, year2027];
}

function budgetYear(
  year: number,
  basisLabel: string,
  tableCents: number,
  adoptedCents: number,
  sourceUrl: string,
  sourcePages: string,
  grouped: Map<string, { cents: number; income: boolean }>,
  detail: string,
): BudgetYear {
  const entries = [...grouped.entries()].sort((a, b) => b[1].cents - a[1].cents);
  const incomeEntries = entries.filter((entry) => entry[1].income);
  const asideEntries = entries.filter((entry) => !entry[1].income);
  const incomePct = percentTenths(incomeEntries.map((entry) => entry[1].cents));
  const items = incomeEntries.map((entry, index) =>
    makeAmount({
      key: slug(entry[0]),
      label: entry[0],
      cents: entry[1].cents,
      pct: incomePct[index],
      basis: "budget",
      fiscalYear: year,
      status: "Budget",
      sourceUrl,
      sourcePages,
      detail: "",
      fundCode: "",
      sort: index,
    }),
  );
  const aside = asideEntries.map((entry, index) =>
    makeAmount({
      key: slug(entry[0]),
      label: entry[0],
      cents: entry[1].cents,
      pct: 0,
      basis: "budget",
      fiscalYear: year,
      status: "Not income",
      sourceUrl,
      sourcePages,
      detail: "Savings brought forward, or other sources that are not new income. Shown apart from the income lines.",
      fundCode: "",
      sort: index,
    }),
  );
  return { fiscalYear: year, basisLabel, totalCents: tableCents, adoptedCents, sourceUrl, sourcePages, detail, items, aside };
}

function buildBeach(beach: unknown, revenue: unknown): { lines: AmountItem[]; note: string; sources: string[] } {
  const file = asRecord(beach, "beach file");
  const lines = asList(file.lines, "beach lines").map((line) => asRecord(line, "beach line"));
  const account = str(file.account, "beach account");
  const fy2027 = asRecord(asRecord(revenue, "revenue").fy2027_adopted_by_source, "FY2027");
  const codeLines = asList(fy2027.lines, "FY2027 lines").map((line) => asRecord(line, "line"));
  const match = codeLines.find((line) => str(line.code, "code") === account);
  if (!match) throw new ReconciliationError(`Account ${account} is not in the FY2027 revenue file.`);
  const expected = num(match.amount, account);
  assertParts(
    lines.map((line) => num(line.amount, "beach line")),
    expected,
    "Beach vending lines",
  );
  const sources = lines.flatMap((line) => stringList(line.sources, "beach source"));
  const amendment = asRecord(file.fy2025_budget_amendment, "beach amendment");
  const note = str(amendment.detail, "beach amendment detail");
  const built = lines.map((line, index) =>
    makeAmount({
      key: str(line.key, "beach key"),
      label: str(line.label, "beach label"),
      cents: num(line.amount, "beach amount") * 100,
      pct: 0,
      basis: "budget",
      fiscalYear: num(file.fiscal_year, "beach year"),
      status: "Budget",
      sourceUrl: sources[0] || str(file.source, "beach source"),
      sourcePages: "",
      detail: beachDetail(line),
      fundCode: str(file.fund_code, "beach fund"),
      sort: index,
    }),
  );
  return { lines: built, note, sources: [...new Set([...sources, ...stringList(amendment.sources, "amendment sources")])] };
}

function beachDetail(line: Record<string, unknown>): string {
  const payer = str(line.payer, "").replace(/\.+$/, "");
  let detail = str(line.detail, "beach detail").trim().replace(/\.+$/, "");
  detail = detail.replace(/\s*General Fund account 329004$/i, "").trim().replace(/\.+$/, "");
  const account = "General Fund account 329004";
  const receipt = "This is a budget amount, not an audited receipt";
  if (payer) return `${detail}. Paid by ${payer}. ${account}. ${receipt}.`;
  return `${detail}. ${account}. ${receipt}.`;
}

function buildBedTax(revenue: unknown): PublishedLedger["bedTax"] {
  const tourist = asRecord(asRecord(revenue, "revenue").tourist_tax_collections, "bed tax");
  const block = asRecord(tourist.fy2026_collections_oct_through_aug, "bed tax ytd");
  const ytd = num(block.computed_total_all_rates, "bed tax ytd");
  const prior = num(tourist.fy2025_same_period_computed_total, "bed tax prior");
  const actual = num(tourist.fy2025_acfr_actual, "bed tax actual");
  const budget = num(tourist.fy2026_budget_tentative, "bed tax budget");
  if (prior <= 0) throw new ReconciliationError("Bed tax comparison period is zero.");
  const changePct = ((ytd - prior) / prior) * 100;
  return {
    ytdCents: ytd * 100,
    priorCents: prior * 100,
    changePct,
    actualCents: actual * 100,
    budgetCents: budget * 100,
    sourceUrl: str(tourist.source, "bed tax source"),
    detail: `From October 2025 through August 2026 the county collected ${dollars(ytd)} in tourist (bed) tax. That is ${changePct.toFixed(1)}% more than the same months a year earlier (${dollars(prior)}). The Clerk report shows a 2% base and this total converts it to the full rate. The September 2026 report was not posted when this figure was gathered. This is collections, not the audit.`,
  };
}

function buildProperty(revenue: unknown, income: { income: AmountItem[]; totalCents: number }): PublishedLedger["property"] {
  const base = asRecord(asRecord(revenue, "revenue").property_tax_base, "property tax base");
  const millage = asRecord(base.millage, "millage");
  const sources = stringList(base.millage_sources, "millage sources");
  const property = income.income.find((item) => item.key === "property-taxes");
  if (!property) throw new ReconciliationError("Property tax slice is missing.");
  return {
    sharePct: property.pct,
    values: [
      {
        year: "FY2025",
        dollars: num(base.fy2025_taxable_value, "FY2025 taxable value"),
        approx: false,
        sourceUrl: str(base.source, "taxable value source"),
        pages: str(base.pages, "taxable value pages"),
      },
      {
        year: "FY2026",
        dollars: num(base.fy2026_certified_taxable_value_approx, "FY2026 taxable value"),
        approx: true,
        sourceUrl: str(base.fy2026_source, "FY2026 value source"),
        pages: "",
      },
      {
        year: "FY2027",
        dollars: num(base.fy2027_taxable_value, "FY2027 taxable value"),
        approx: false,
        sourceUrl: str(base.fy2027_source, "FY2027 value source"),
        pages: "",
      },
    ],
    millage: [
      { year: "FY2025", rate: num(millage.FY2025, "FY2025 millage").toFixed(3), sourceUrl: sources[0] || ACFR_2025 },
      { year: "FY2026", rate: num(millage.FY2026_final, "FY2026 millage").toFixed(3), sourceUrl: sources[1] || sources[0] || "" },
      { year: "FY2027", rate: num(millage.FY2027_final, "FY2027 millage").toFixed(3), sourceUrl: sources[2] || str(base.fy2027_source, "fy2027") },
    ],
    detail: "Property tax share is property tax divided by audited governmental fund income. The later years are budget shares of the adopted budget, which also contains savings brought forward.",
  };
}

function buildTrend(revenue: unknown): { years: { year: number; cents: number }[]; sourceUrl: string; pages: string } {
  const trend = asRecord(asRecord(revenue, "revenue").ten_year_trend, "trend");
  const years = asList(trend.years, "trend years").map((year) => num(year, "year"));
  const series = asRecord(trend.series, "trend series");
  const totals = vector(series.Total, "trend total", years.length);
  if (totals.length !== years.length) throw new ReconciliationError("The revenue trend is missing a year.");
  const names = ["Taxes", "Licenses and permits", "Intergovernmental", "Charges for services", "Fines and forfeitures", "Investment earnings", "Miscellaneous"];
  for (let index = 0; index < years.length; index += 1) {
    if (years[index] < 2020) continue;
    const parts = names.map((name) => vector(series[name], name, years.length)[index]);
    assertParts(parts, totals[index], `FY${years[index]} trend`);
  }
  const fy2025 = num(trend.fy2025_total, "trend fy2025");
  return {
    years: [...years.map((year, index) => ({ year, cents: totals[index] * 100 })), { year: 2025, cents: fy2025 * 100 }],
    sourceUrl: str(trend.source, "trend source"),
    pages: str(trend.pages, "trend pages"),
  };
}

function buildReserves(reserves: unknown, revenue: unknown): PublishedLedger["reserves"] {
  const file = asRecord(reserves, "reserves file");
  const headline = asRecord(file.headline, "reserves headline");
  const total = amountOf(headline.total_fund_balances_all_governmental_funds, "reserve total");
  const change = asRecord(headline.change_from_fy2024, "reserve change");
  const prior = num(change.fy2024, "FY2024 reserves");
  const delta = num(change.amount, "reserve change amount");
  if (prior + delta !== total.amount) throw new ReconciliationError("FY2024 savings plus the change do not equal FY2025 savings.");
  const block = asRecord(file.fy2025_by_fund_and_classification, "FY2025 reserves");
  const priorBlock = asRecord(file.fy2024_by_fund_and_classification, "FY2024 reserves");
  const funds = stringList(block.funds, "reserve funds");
  const classes = asRecord(block.classification, "reserve classes");
  const classRows = CLASS_ORDER.map((item) => vector(classes[item.source], item.source, funds.length));
  const totalRow = vector(classes["Total fund balance"], "Total fund balance", funds.length);
  for (const row of classRows) assertParts(row.slice(0, -1), row[row.length - 1], "a reserve class");
  assertParts(totalRow.slice(0, -1), totalRow[totalRow.length - 1], "reserve funds");
  assertParts(
    classRows.map((row) => row[row.length - 1]),
    total.amount,
    "Reserve classes",
  );
  if (totalRow[totalRow.length - 1] !== total.amount) throw new ReconciliationError("Reserve fund totals do not match the headline savings.");
  for (let index = 0; index < funds.length; index += 1) {
    assertParts(
      classRows.map((row) => row[index]),
      totalRow[index],
      funds[index],
    );
  }
  const priorClasses = asRecord(priorBlock.classification, "FY2024 classes");
  const priorFunds = stringList(priorBlock.funds, "FY2024 funds");
  if (priorFunds.join("|") !== funds.join("|")) throw new ReconciliationError("FY2024 and FY2025 reserve funds are not the same list.");
  const priorTotal = vector(priorClasses["Total fund balance"], "FY2024 total", funds.length);
  assertParts(priorTotal.slice(0, -1), priorTotal[priorTotal.length - 1], "FY2024 reserve funds");
  if (priorTotal[priorTotal.length - 1] !== prior) throw new ReconciliationError("FY2024 reserve total does not match the headline.");
  const revenueFile = asRecord(revenue, "revenue");
  const other = asRecord(asRecord(revenueFile.fy2025_actual_by_fund_and_source, "fund statement").other_financing, "other financing");
  const revenueFunds = stringList(asRecord(revenueFile.fy2025_actual_by_fund_and_source, "fund statement").funds, "revenue funds");
  const begin = vector(other["Fund balance, beginning of year"], "begin", revenueFunds.length);
  const end = vector(other["Fund balance, end of year"], "end", revenueFunds.length);
  if (begin[begin.length - 1] !== prior || end[end.length - 1] !== total.amount) {
    throw new ReconciliationError("Revenue statement balances do not match the reserve totals.");
  }
  const purposes = asRecord(block.purposes_by_fund, "purposes");
  const free = amountOf(headline.free_to_spend_any_purpose_unassigned, "free to spend");
  const generalIndex = funds.indexOf("General");
  const unassigned = classRows[CLASS_ORDER.findIndex((item) => item.key === "unassigned")][generalIndex];
  if (unassigned !== free.amount) throw new ReconciliationError("Free-to-spend amount does not match unassigned General Fund savings.");
  const policy = asRecord(file.policy, "policy");
  const compliance = asRecord(policy.compliance_fy2025, "policy check");
  const unrestricted = num(compliance.unrestricted_general_fund_balance_committed_assigned_unassigned, "unrestricted");
  const spending = num(compliance.general_fund_expenditures_plus_transfers_out_actual, "policy spending");
  const twoMonths = num(compliance.two_months_of_that, "two months");
  const months = num(compliance.months_of_cushion, "months");
  const committed = classRows[0][generalIndex];
  const assigned = classRows[1][generalIndex];
  if (committed + assigned + unassigned !== unrestricted) {
    throw new ReconciliationError("General Fund committed, assigned, and unassigned do not equal the policy's unrestricted total.");
  }
  if (Math.round(spending / 6) !== twoMonths && Math.abs(spending / 6 - twoMonths) > 1) {
    throw new ReconciliationError("Two months of spending does not match one sixth of General Fund spending and transfers out.");
  }
  const computedMonths = unrestricted / (spending / 12);
  if (Math.abs(computedMonths - months) > 0.05) {
    throw new ReconciliationError(`Months of cushion compute to ${computedMonths.toFixed(2)}, not ${months}.`);
  }
  const sheriff = asRecord(file.sheriff, "sheriff");
  const sheriffNote = str(sheriff.note, "sheriff note");
  const due = numberInText(sheriffNote, /Due to BCC'\s*([\d,]+)/);
  const own = numberInText(sheriffNote, /([\d,]+)\s+restricted for law enforcement/);
  const cash = asRecord(block.cash_and_investments_total_sept30_2025, "cash");
  const labels: Record<string, string> = {
    General: "General Fund",
    "County Transportation": "Transportation",
    "Fine and Forfeiture (funds the Sheriff; budget fund 107)": "Fine and Forfeiture fund",
    "Tourist Development": "Tourist Development",
    "Solid Waste Landfill": "Solid Waste",
    "Capital Projects": "Capital Projects",
    "Nonmajor governmental": "Other funds",
  };
  const builtFunds: ReserveFund[] = funds
    .map((name, index) => ({ name, index }))
    .filter((item) => item.name !== "Total")
    .map((item) => {
      const purpose = asRecord(purposes[item.name] || {}, "purpose");
      const purposeText = Object.entries(purpose)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" ");
      let detail = purposeText ? `The audit describes it this way: ${purposeText}` : "";
      if (item.name.startsWith("Fine and Forfeiture")) {
        detail = `${detail} This fund pays the Sheriff. It is county money restricted for public safety. The Sheriff's own books hold almost no general savings and owe ${dollars(due)} back to the Board. Do not read this row as the Sheriff's own savings.`.trim();
      }
      return {
        key: slug(labels[item.name] || item.name),
        label: labels[item.name] || item.name,
        fundCode: FUND_CODE[item.name] || "",
        cents: totalRow[item.index] * 100,
        priorCents: priorTotal[item.index] * 100,
        detail,
        classes: CLASS_ORDER.map((cls, classIndex) => ({
          key: cls.key,
          label: cls.label,
          cents: classRows[classIndex][item.index] * 100,
          purpose: str(purpose[cls.source], ""),
        })),
      };
    })
    .sort((a, b) => b.cents - a.cents);
  const classPercents = percentTenths(classRows.map((row) => row[row.length - 1]));
  return {
    asOf: str(file.date_of_balances, "reserve date"),
    totalCents: total.amount * 100,
    priorCents: prior * 100,
    changeCents: delta * 100,
    sourceUrl: total.source,
    sourcePages: total.pages,
    detail: "Audited year-end balance, not a live balance. The FY2026 year-end balance will exist after the spring 2027 audit.",
    classes: CLASS_ORDER.map((cls, index) => ({
      key: cls.key,
      label: cls.label,
      plain: cls.plain,
      cents: classRows[index][classRows[index].length - 1] * 100,
      pct: classPercents[index],
      detail: "",
    })),
    funds: builtFunds,
    policy: {
      name: "General Fund reserve policy, Resolution 2012-59",
      unrestrictedCents: unrestricted * 100,
      months: computedMonths,
      twoMonthsCents: twoMonths * 100,
      spendingCents: spending * 100,
      sourceUrl: str(policy.source, "policy source"),
      detail: `Resolution 2012-59 says the General Fund should hold at least two months of that fund's budgeted spending and transfers out. Unrestricted, in that policy, means committed plus assigned plus free to spend. That was ${dollars(unrestricted)}, about ${computedMonths.toFixed(1)} months of actual spending and transfers out. The months figure is the project's calculation. The policy says to use the budget, and this calculation uses actual spending.`,
    },
    sheriff: {
      dueCents: due * 100,
      ownRestrictedCents: own * 100,
      sourceUrl: str(sheriff.source, "sheriff source"),
      detail: `The Fine and Forfeiture fund pays the Sheriff. The Sheriff's own books show almost no general savings. They owe ${dollars(due)} back to the Board, and ${dollars(own)} is restricted for law enforcement in the Sheriff's smaller funds.`,
    },
    cashCents: num(cash.cash_and_equivalents, "cash") * 100,
    investmentsCents: num(cash.investments, "investments") * 100,
    cashDetail: str(cash.note, "cash note"),
    cashSourceUrl: str(cash.source, "cash source"),
    cashPages: str(cash.pages, "cash pages"),
  };
}

function numberInText(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  if (!match) throw new ReconciliationError(`A required amount is missing from: ${text.slice(0, 180)}`);
  return Number(match[1].replace(/,/g, ""));
}

function amountRow(section: string, item: AmountItem, parentKey: string): PublishedRow {
  return {
    section,
    itemKey: item.key,
    parentKey,
    label: item.label,
    amountCents: item.cents,
    sortOrder: item.sort,
    basis: item.basis,
    fiscalYear: item.fiscalYear,
    fundCode: item.fundCode,
    status: item.status,
    sourceUrl: item.sourceUrl,
    sourcePages: item.sourcePages,
    detail: item.detail,
  };
}

function rowToAmount(row: PublishedRow): AmountItem {
  return {
    key: row.itemKey,
    label: row.label,
    cents: row.amountCents,
    pct: 0,
    basis: row.basis,
    fiscalYear: row.fiscalYear,
    status: row.status,
    sourceUrl: row.sourceUrl,
    sourcePages: row.sourcePages,
    detail: row.detail,
    fundCode: row.fundCode,
    sort: row.sortOrder,
  };
}

function oneParent(section: string, key: string, parent: string, rows: PublishedRow[]): PublishedRow {
  const row = rows.find((item) => item.section === section && item.itemKey === key && item.parentKey === parent);
  if (!row) throw new ReconciliationError(`Stored figures are missing ${section} ${parent} ${key}.`);
  return row;
}

function makeAmount(item: AmountItem): AmountItem {
  return item;
}

function assertParts(parts: number[], total: number, label: string): void {
  const got = parts.reduce((sum, value) => sum + value, 0);
  if (got !== total) throw new ReconciliationError(`${label} add to ${got}, not ${total}.`);
}

function vector(value: unknown, label: string, length: number): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new ReconciliationError(`${label} should have ${length} amounts.`);
  }
  return value.map((item, index) => num(item, `${label} column ${index + 1}`));
}

function amountOf(value: unknown, label: string): { amount: number; source: string; pages: string } {
  const record = asRecord(value, label);
  return { amount: num(record.amount, label), source: str(record.source, `${label} source`), pages: str(record.pages, "") };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReconciliationError(`${label} is missing.`);
  return value as Record<string, unknown>;
}

function asList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ReconciliationError(`${label} is missing.`);
  return value;
}

function stringList(value: unknown, label: string): string[] {
  return asList(value, label).map((item, index) => str(item, `${label} ${index + 1}`));
}

function num(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ReconciliationError(`${label} is missing or not a number.`);
  return value;
}

function str(value: unknown, label: string): string {
  if (typeof value === "string") return value;
  if (!label) return "";
  if (value == null) return "";
  throw new ReconciliationError(`${label} is not text.`);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
