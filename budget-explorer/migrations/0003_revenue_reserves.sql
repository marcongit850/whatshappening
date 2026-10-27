-- Revenue and reserves published totals.
-- Apply this file on the remote D1 database by hand.
-- Do not run: wrangler d1 migrations apply --remote
-- Load the figures with scripts/import-published.ts after the tables exist.
-- The rows are aggregate totals from public documents, with source URLs.
-- They are not payment lines, payroll, or person names.

CREATE TABLE published_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  as_of TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE published_amounts (
  snapshot_id INTEGER NOT NULL,
  section TEXT NOT NULL,
  item_key TEXT NOT NULL,
  parent_key TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  basis TEXT NOT NULL DEFAULT '',
  fiscal_year INTEGER NOT NULL DEFAULT 0,
  fund_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_pages TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (snapshot_id, section, item_key, parent_key)
);

CREATE INDEX idx_published_amounts_section ON published_amounts (snapshot_id, section, sort_order);
