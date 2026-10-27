import { ledgerFromRows, type PublishedLedger, type PublishedRow } from "./published";

export async function loadPublishedLedger(db: D1Database): Promise<PublishedLedger | null> {
  const snap = await db.prepare("SELECT id, as_of FROM published_snapshots ORDER BY id DESC LIMIT 1").first<{ id: number; as_of: string }>();
  if (!snap) return null;
  const result = await db
    .prepare(
      `SELECT section, item_key AS itemKey, parent_key AS parentKey, label, amount_cents AS amountCents,
        sort_order AS sortOrder, basis, fiscal_year AS fiscalYear, fund_code AS fundCode, status,
        source_url AS sourceUrl, source_pages AS sourcePages, detail
       FROM published_amounts WHERE snapshot_id = ? ORDER BY sort_order, item_key`,
    )
    .bind(snap.id)
    .all<PublishedRow>();
  return ledgerFromRows(snap.as_of, result.results || []);
}
