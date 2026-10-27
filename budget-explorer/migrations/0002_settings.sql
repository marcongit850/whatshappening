-- Admin switch for person names and individual pay.
-- No default row is inserted. The application constant SHOW_PERSON_NAMES_DEFAULT
-- in src/access.ts is the default when this table has no row (names shown).

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE payroll_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  fund_code TEXT NOT NULL,
  dept_code TEXT NOT NULL,
  object_code TEXT NOT NULL,
  project_code TEXT NOT NULL DEFAULT '',
  journal TEXT,
  pay_date TEXT,
  source TEXT,
  amount_cents INTEGER NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  batch_key TEXT NOT NULL,
  description TEXT,
  after_cutoff INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL
);

CREATE INDEX idx_payroll_lines_account ON payroll_lines (import_id, dept_code, object_code, project_code, after_cutoff);
CREATE INDEX idx_payroll_lines_name ON payroll_lines (import_id, employee_name);
CREATE INDEX idx_payroll_lines_batch ON payroll_lines (import_id, batch_key, pay_date);

ALTER TABLE imports ADD COLUMN payroll_line_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN is_person_name INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_batches ADD COLUMN below_minimum INTEGER NOT NULL DEFAULT 0;
