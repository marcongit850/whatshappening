CREATE TABLE imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  data_as_of TEXT,
  filename TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  note TEXT,
  fund_count INTEGER NOT NULL DEFAULT 0,
  department_count INTEGER NOT NULL DEFAULT 0,
  account_count INTEGER NOT NULL DEFAULT 0,
  payment_count INTEGER NOT NULL DEFAULT 0,
  payroll_batch_count INTEGER NOT NULL DEFAULT 0,
  after_cutoff_count INTEGER NOT NULL DEFAULT 0,
  recon_mismatch_count INTEGER NOT NULL DEFAULT 0,
  orig_cents INTEGER NOT NULL DEFAULT 0,
  adj_cents INTEGER NOT NULL DEFAULT 0,
  rev_cents INTEGER NOT NULL DEFAULT 0,
  ytd_cents INTEGER NOT NULL DEFAULT 0,
  enc_cents INTEGER NOT NULL DEFAULT 0,
  avail_cents INTEGER NOT NULL DEFAULT 0,
  printed_orig_cents INTEGER,
  printed_rev_cents INTEGER,
  printed_ytd_cents INTEGER
);

CREATE TABLE funds (
  import_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  report_name TEXT,
  PRIMARY KEY (import_id, code)
);

CREATE TABLE departments (
  import_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  fund_code TEXT,
  report_name TEXT,
  PRIMARY KEY (import_id, code)
);

CREATE TABLE accounts (
  import_id INTEGER NOT NULL,
  fund_code TEXT NOT NULL,
  dept_code TEXT NOT NULL,
  object_code TEXT NOT NULL,
  project_code TEXT NOT NULL DEFAULT '',
  title TEXT,
  orig_cents INTEGER NOT NULL DEFAULT 0,
  adj_cents INTEGER NOT NULL DEFAULT 0,
  rev_cents INTEGER NOT NULL DEFAULT 0,
  ytd_cents INTEGER NOT NULL DEFAULT 0,
  enc_cents INTEGER NOT NULL DEFAULT 0,
  avail_cents INTEGER NOT NULL DEFAULT 0,
  payment_sum_cents INTEGER NOT NULL DEFAULT 0,
  recon_diff_cents INTEGER NOT NULL DEFAULT 0,
  is_payroll INTEGER NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (import_id, fund_code, dept_code, object_code, project_code)
);

CREATE INDEX idx_accounts_dept ON accounts (import_id, dept_code);

CREATE TABLE payments (
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
  vendor_number TEXT,
  vendor_name TEXT,
  invoice TEXT,
  check_number TEXT,
  description TEXT,
  after_cutoff INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL
);

CREATE INDEX idx_pay_dept ON payments (import_id, dept_code, after_cutoff, pay_date);
CREATE INDEX idx_pay_vendor ON payments (import_id, vendor_name);
CREATE INDEX idx_pay_invoice ON payments (import_id, invoice);
CREATE INDEX idx_pay_check ON payments (import_id, check_number);
CREATE INDEX idx_pay_date ON payments (import_id, pay_date);
CREATE INDEX idx_pay_dedupe ON payments (dedupe_key);
CREATE INDEX idx_pay_amount ON payments (import_id, after_cutoff, amount_cents);

CREATE TABLE payroll_batches (
  import_id INTEGER NOT NULL,
  fund_code TEXT NOT NULL,
  dept_code TEXT NOT NULL,
  object_code TEXT NOT NULL,
  project_code TEXT NOT NULL DEFAULT '',
  batch_key TEXT NOT NULL,
  pay_date TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  PRIMARY KEY (import_id, fund_code, dept_code, object_code, project_code, batch_key, pay_date)
);

CREATE TABLE chart_names (
  kind TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (kind, code)
);

CREATE TABLE login_attempts (
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, window_start)
);

CREATE TABLE qa_usage (
  session_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (session_id, bucket)
);
