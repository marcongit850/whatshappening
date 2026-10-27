-- County requests and notes about the data.
-- Apply this file on the remote D1 database by hand.
-- Do not run: wrangler d1 migrations apply --remote
-- The Worker does not send email. Email addresses are stored here and are not rendered.

CREATE TABLE county_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  state_name TEXT NOT NULL,
  state_slug TEXT NOT NULL,
  county_name TEXT NOT NULL,
  county_slug TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL
);

CREATE INDEX idx_county_requests_ip ON county_requests (ip_hash, created_at);

CREATE TABLE data_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  county_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  correction TEXT NOT NULL DEFAULT '',
  source_note TEXT NOT NULL DEFAULT '',
  requester_name TEXT NOT NULL DEFAULT '',
  requester_email TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL
);

CREATE INDEX idx_data_reports_ip ON data_reports (ip_hash, created_at);
