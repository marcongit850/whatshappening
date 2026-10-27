# Architecture

This repository holds two Cloudflare Workers. They do not share config, bindings, or a hostname.

## What's Happening

Static company site for What's Happening, a marketing and media company. One page covers the work, the current projects, and the team.

- Worker name: `whatshappening`
- Config: root `wrangler.jsonc` and `worker.js`
- Public site name: whatshappeningnetwork.com
- The root Worker config does not attach a custom domain. DNS stays unset in that file.
- There is no database. The team list is `data/team.json`, with photos in `photos/`.
- Contact form: `POST /api/contact` sends mail through Resend. Secret names only: `RESEND_API_KEY`, `CONTACT_EMAIL`. Do not commit the values.
- Deploy from the repository root: `npm run build`, then `npx wrangler deploy`.

## Budget Explorer

Private prototype for reading a Walton County year to date budget report. It is budget software only. It is unofficial, it does not use the county seal, and it is not indexed.

- Purpose: show each fund and department budget next to what has actually been spent. Pages also include payment search, a recreation plat fee history, and questions answered only from imported rows.
- Worker name: `budget-explorer`
- Project directory: `budget-explorer/`
- Domain: budget.whatshappeningnetwork.com
- workers.dev hostname: budget-explorer.352marc.workers.dev
- D1 database: `budget-explorer` (binding `DB`). The id is in `budget-explorer/wrangler.jsonc`. Migration `0001_init.sql` is already applied remotely. Migration `0002_settings.sql` adds the names switch and payroll line storage. Apply it remotely before deploying this change.
- Workers AI binding: `AI`. The model id is the constant `AI_MODEL` in `budget-explorer/src/qa.ts`. The model only sees rows retrieved for that question. Vendor totals, a named fund, the county budget, and transfer questions are answered from SQL in `budget-explorer/src/answers.ts` and do not call the model.
- Public totals leave out object code `591000` (money moved from one county fund to another). Adopted, current, and spent figures on the site are the report columns minus those transfer rows. The transfer amount is shown on its own. The admin import preview still shows the printed report totals so an import can be checked. Default answers do not quote the raw report totals. A question about transfers may.
- `/funds` and `/funds/:code` are fund pages. `/departments` and `/departments/:dept` stay the department drill-down. Each of those pages leads with budgeted, money spent so far, and money left, then where the money went.
- Vendor names on public pages are title case. A name cut off at 20 characters is expanded when a longer stored name has the same start. Questions match vendor names with punctuation and apostrophes removed, then a prefix check, before any model call.
- Content Security Policy allows the Cloudflare Web Analytics script at `https://static.cloudflareinsights.com` and its beacon at `https://cloudflareinsights.com`. No other third-party script or connect hosts are allowed.
- Secret names only. Do not commit values.
  - `SITE_PASSWORD` (required): shared site password
  - `SESSION_SECRET` (required): HMAC key for the session cookie
  - `ADMIN_PASSWORD` (required): Admin pages stay off until this is set. Unlock failures are throttled per IP and for all visitors together. The field is only on `/admin/unlock`
  - `PUBLIC_BASE_URL` (optional): shown on About when it is an http(s) URL. Links in the app stay relative.
- Deploy: Cloudflare Workers Builds from `main`, root directory `budget-explorer`, deploy command `npx wrangler deploy`.
- Data import: an administrator uploads a text report on the Admin Import page, reviews the preview, and publishes it. CSV or Excel can supply chart of accounts names. PDF uploads are refused. County reports, parsed JSON, and payment extracts stay out of git. `budget-explorer/data/` and `seed.sql` are gitignored. The seed script writes its SQL file outside the repository, in the system temp directory. The root `.assetsignore` excludes `budget-explorer` and `seed.sql`, so a deploy of the placeholder Worker cannot publish them. For a full year file that is too large for one Worker request, `budget-explorer/scripts/seed-local.sh` loads a local D1 copy only.

Gotchas:

- The GitHub repository is public. Do not commit county payment rows, payroll detail, or secret values.
- Payroll employee names and individual pay are stored on every import. One admin switch, "Show person names and individual pay", controls whether they are shown. The default is on, from `SHOW_PERSON_NAMES_DEFAULT` in `budget-explorer/src/access.ts`. The switch lives in D1 (`settings`) and is changed only by `POST /admin/settings` after the admin unlock, with CSRF. Each change is written to `settings_log` with a timestamp. Turning it off does not require a re-import.
- When the switch is off, `budget-explorer/src/access.ts` is the only reader for payments, payroll lines, search, drill-down, plat lines, CSV export, and question context. Hidden queries do not select employee names. Whether a vendor is a person is decided when the row is read, not from the stored `is_person_name` flag. A vendor is treated as a person unless it is clearly an organization. Description text in Last, First form is scrubbed on those same reads, including question context and the model answer. Payroll groups of at least 3 lines and at least $1,000 are returned as "Payroll (batch total)". Smaller groups are rolled into "Other payroll" only when that rollup clears the same bar, and omitted otherwise. The model answer and its citations are filtered again before the page is rendered. There is no JSON API for these rows.
- A payroll batch with fewer than 3 lines is folded into a combined monthly total and flagged `below_minimum`. The folded batch is still stored, so those dollars stay reachable. Hidden mode does not show a stored group that is still under 3 lines or under $1,000 as its own total.
- Non-vendor detail lines keep coded fields only. Raw narrative text from those lines is not stored.
- Vendor payments that look like a person stay in the import. The import preview does not list those names. When the switch is off, the row remains and the name is shown as "Name withheld". Description names in Last, First form are removed even when the vendor is an organization.
- Plat fee history shows published imports. Draft imports show there only after an admin unlock, and they remain on the admin import list.
- An import can be published only when the stored fund, department, account, payment, payroll batch, and payroll line counts match the parse.
- Lines dated after the report date (for the current file, after 9/15/2026) are stored and flagged. Search, account payment lists, plat activity, questions, the monthly spending chart, and vendor totals exclude them.
- The overview at `/` is calculated from the published import on each request. Headline, KPI cards, fund bars, the share donut, department pace, monthly columns, organization vendors, the worth a look panel, and the fund 114 card are server-rendered HTML and inline SVG. No chart library is shipped. Interfund transfer departments are left out of the pace chart. The vendor chart lists outside organizations only, in both positions of the names switch. It leaves out object `591000` and payments whose vendor is a Walton County office (names starting with Walton County for the sheriff, property appraiser, tax collector, clerk, supervisor of elections, or the board, including names cut off at 20 characters). Those office payments are one labeled row, with no office names from the payment rows. Money moved between funds is a separate labeled amount. Person names and individual pay are not selected for this page. Pace compares money spent with the year percent shown on the page, rounded to a whole number: in line, under, or spending more than the year's progress.
- A question that names a payee is answered from vendor payments when one matches. If none matches, the question continues to fund, department, and account facts, then the model. "Who is paid the most?" uses the largest outside vendor.
- Fund detail is `GET /funds` and `GET /funds/:code`. Payment search accepts `fund`, `from`, and `to` as well as the older filters. Bars, months, vendors, funds, departments, and KPI cards link to those views.
- The overview question box posts to `POST /ask` with the same CSRF check, rate limit, and sign-in requirement as the Ask page.
- Fund, department, object, and vendor totals in a question are summed in SQL before the model runs. The prompt tells the model to copy those figures and not to do arithmetic. Names match whole words, so a short word does not match inside a longer one. A fund match is used unless the question says department or contains an 8 digit department code. Each fact includes the account count and account keys.
