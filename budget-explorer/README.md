# Budget Explorer

Private prototype for reading a Walton County year to date budget report. It is a Cloudflare Worker, separate from the placeholder site in the repository root. It does not use the county seal and it does not present itself as an official county system.

The Walton County pages are not indexed. On budget.whatshappeningnetwork.com and the workers.dev host, every response sends `X-Robots-Tag: noindex, nofollow, noarchive`, pages include a robots meta tag, and `robots.txt` disallows all crawlers. Every page except the sign-in screen and `/report` requires the shared site password. `/report` is how a visitor flags a number or shares an idea. It stays `noindex`.

howtheyspendmytaxes.com and www.howtheyspendmytaxes.com use this same Worker as a public front door. `/` is a state map, `/florida` lists Walton County, and the dashboard moves to `/walton` behind the same password. Search engines may index `/`, `/florida`, and the logged-out `/walton` page. County figures stay noindex. See `ARCHITECTURE.md` in this folder.

## Architecture

- TypeScript Worker on [Hono](https://hono.dev), server-rendered HTML.
- D1 binding `DB`. Migrations live in `migrations/`.
- Workers AI binding `AI`. Questions use the model id in `src/qa.ts` (`AI_MODEL`). Fund, department, object, and vendor totals are summed in SQL first. The model is told to quote those figures and not to do arithmetic. If nothing matches, it is not called. A vendor payment, the county budget, or a transfer question can be answered from SQL without the model. A question such as "spent on" a fund or department still uses the fund and department totals.
- The overview is drawn from the published import on each request (inline SVG and CSS, no chart library). The question box on that page posts to `/ask`. Fund pages are `/funds` and `/funds/:code`. Search accepts a fund code and a date range.
- Public totals leave out object code `591000`, money moved between county funds, and payments to other county offices are kept out of the outside-vendor chart. The admin import preview still prints the report's own totals.
- Links inside the dashboard stay root-relative. On howtheyspendmytaxes.com the Worker prefixes them with `/walton` in the HTML it sends. An optional `PUBLIC_BASE_URL` is shown on About when it is an http(s) URL. Other hosts keep the dashboard at `/`.
- Money is stored as integer cents. The published pages read the latest import whose status is `published`. Older imports are kept.

Payroll lines (payroll journals, warrant or direct deposit text, and salary or benefit object codes) are stored with the employee name and the individual amount. Folded batch totals are stored too. The admin switch "Show person names and individual pay" decides what readers see. It defaults to on. When it is off, search, drill-down, plat, CSV export, and questions show payroll only as grouped totals: a group needs at least 3 lines and a $1,000 total to appear as "Payroll (batch total)". Smaller groups are rolled into "Other payroll" when that rollup clears the same bar, and left off the line list otherwise. Person names, including Last, First names in descriptions, and individual pay are not shown. The person check is made when the row is read. Lines dated after the report's "data as of" date are stored, flagged, and left out of search, account payments, plat activity, and questions.

## Secrets

Set these with `wrangler secret put` for a deployed Worker, and in `.dev.vars` for local development (see `.dev.vars.example`). Do not commit real values.

| Name | Required | Purpose |
| --- | --- | --- |
| `SITE_PASSWORD` | yes | Shared password for the site |
| `SESSION_SECRET` | yes | HMAC key for the session cookie |
| `ADMIN_PASSWORD` | yes | Required for Admin. If it is unset, every admin route stays off |
| `PUBLIC_BASE_URL` | no | Optional public base URL. Leave empty to stay host-agnostic |

The session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and expires after about 30 days. Passwords are compared with a hash so the check does not return early. Sign-in attempts are throttled. Admin unlock failures use the same limit, once per IP and once for all visitors together. The admin password field is only on `/admin/unlock`. Questions are limited per signed-in visitor, per hour and per day. If `ADMIN_PASSWORD` is unset, admin routes respond that admin is off.

## D1

The D1 database name is `budget-explorer`. Its id is in `wrangler.jsonc`. Migration `0001_init.sql` is already applied on the remote database. Migration `0002_settings.sql` is the names switch. Migration `0003_revenue_reserves.sql` is the income and savings tables. Migration `0004_county_requests.sql` stores county requests and notes about the data. Apply `0003` and `0004` on the remote database by hand. Do not run `wrangler d1 migrations apply --remote`. Apply the local copies before seeding:

```bash
npx wrangler d1 migrations apply budget-explorer --local
```

Income and savings totals live in `sources/`. They are published aggregates with source URLs, not payment rows. After `0003` is on the database:

```bash
npx tsx scripts/import-published.ts
npx tsx scripts/import-published.ts --apply
```

`--apply` loads the generated SQL into the local D1 file. The SQL file is written in the system temp directory. To check a later budget CSV with the same account-code rules:

```bash
npx tsx scripts/import-published.ts --budget-csv /path/to/revenues.csv --adopted-total 345223508 --exclude-fund 503
```

The import stops if a source list does not add to its published total, or if a budget line has no category rule.

## Local data

Do not commit the county report, parsed JSON, PDFs, or payment extracts. `data/` is gitignored. Tests use a small synthetic report.

To load the attached text report into local D1:

```bash
cd budget-explorer
npm install
cp .dev.vars.example .dev.vars
# edit .dev.vars and set SITE_PASSWORD and SESSION_SECRET
chmod +x scripts/seed-local.sh
./scripts/seed-local.sh /path/to/report.txt
npx wrangler dev
```

The seed script parses the text report, checks parsed totals against the printed grand total, and tries to fetch the public chart of accounts CSVs. If those files are unreachable, department and object codes stay unmatched until you upload a chart on the Admin page. After migrations, sqlite3 loads the rows into the local D1 file wrangler created. The generated SQL is written in the operating system temp directory, outside this repository.

`npm run dev` serves the Worker locally. Sign in with `SITE_PASSWORD`.

## Importing

Admin, Import accepts:

- `.txt`, the year to date budget report. This is the primary format.
- `.csv` and `.xlsx` for a chart of accounts (fund, department, and object codes and names). The first worksheet is read from Excel files.
- `.pdf` is rejected with an explanation. Reliable PDF text extraction is not available inside the Worker. Export the report as text and upload that file.

The preview shows fund, account, and payment counts, a comparison with the printed grand total when that line is present, unmatched codes, and any account whose payment lines do not sum to year to date spending. It also warns when payroll batches under 3 lines were folded into a combined monthly total. Those folded batches are flagged and still stored. Names and individual pay are stored with the import. The admin switch controls whether they are shown, so the preview does not list person names. Publish is refused when the stored row counts do not match the parse. Publish keeps the import and makes it the one the site reads. Draft imports stay off the plat fee history until an admin has unlocked the session. Re-importing does not delete older imports. Payment lines are keyed by fund, account, check number, and amount (journal id when the check number is blank) so overlapping snapshots can be compared without treating them as one combined ledger.

A full year file is large. If the Admin upload cannot finish inside Worker limits, use `scripts/seed-local.sh`.

## Deploy and a custom domain

```bash
npx wrangler secret put SITE_PASSWORD
npx wrangler secret put SESSION_SECRET
# optional
npx wrangler secret put ADMIN_PASSWORD
npx wrangler deploy
```

The public hosts howtheyspendmytaxes.com and www.howtheyspendmytaxes.com are recognized in application code so the front door and the `/walton` prefix can be chosen from the request host. Every other host, including budget.whatshappeningnetwork.com and the workers.dev hostname, keeps the dashboard at `/`. After deploy, attach a custom domain in the Cloudflare dashboard (Workers, Settings, Domains). Set `PUBLIC_BASE_URL` only if you want About to display it. Dashboard links stay root-relative in the source. On the taxes host they are prefixed when the response is sent.

## Checks

```bash
npm test
npm run typecheck
```
