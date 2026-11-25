import { FY2027_ADOPTED_CENTS } from "./answers";
import { loadBudgetFacts } from "./budget";
import { fundNameMap, fundRollups, latestPublished, organizationVendors } from "./db";

export interface HomeListItem {
  label: string;
  href: string;
  cents: number;
}

export interface HomeHighlights {
  adoptedCents: number;
  spentCents: number | null;
  dataAsOf: string;
  funds: HomeListItem[];
  vendors: HomeListItem[];
}

/**
 * Figures for the public Walton intro page.
 * Adopted FY2027 is the September 28, 2026 resolution total used on the overview.
 * Spent, the as-of date, funds, and vendors come from the published import only.
 * Vendor names use the hidden-names directory, so Last, First person names stay off this public page.
 */
export async function loadHomeHighlights(db: D1Database): Promise<HomeHighlights> {
  const adoptedCents = FY2027_ADOPTED_CENTS;
  const current = await latestPublished(db);
  if (!current) {
    return { adoptedCents, spentCents: null, dataAsOf: "", funds: [], vendors: [] };
  }
  const asOf = current.data_as_of || "";
  const [facts, funds, names, vendors] = await Promise.all([
    loadBudgetFacts(db, current.id),
    fundRollups(db, current.id),
    fundNameMap(db, current.id),
    organizationVendors(db, current.id, asOf, false, 5),
  ]);
  const fundItems = [...funds]
    .map((fund) => {
      const cents = fund.ytd_cents - (fund.transfer_ytd_cents || 0);
      const label = (names.get(fund.code) || fund.report_name || "").trim();
      return { label: label || `Fund ${fund.code}`, href: `/walton/funds/${fund.code}`, cents };
    })
    .filter((item) => item.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);
  const vendorItems = vendors
    .filter((row) => row.cents > 0 && row.vendor_name.trim())
    .slice(0, 5)
    .map((row) => ({
      label: row.vendor_name.trim(),
      href: row.vendor_number ? `/walton/vendors/${encodeURIComponent(row.vendor_number)}` : "/walton/vendors",
      cents: row.cents,
    }));
  return {
    adoptedCents,
    spentCents: facts.spent,
    dataAsOf: asOf,
    funds: fundItems,
    vendors: vendorItems,
  };
}
