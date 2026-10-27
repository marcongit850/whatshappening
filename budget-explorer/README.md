# Budget Explorer

Private prototype for reading a Walton County year to date budget report. It is a Cloudflare Worker, separate from the placeholder site in the repository root. It does not use the county seal and it does not present itself as an official county system.

The site is not indexed. Every response sends `X-Robots-Tag: noindex, nofollow, noarchive`, pages include a robots meta tag, and `robots.txt` disallows all crawlers. Every page except the sign-in screen requires the shared site password.

## Architecture

- TypeScript Worker on [Hono](https://hono.dev), server-rendered HTML.
- D1 binding `DB`. Migrations live in `migrations/`.
- Workers AI binding `AI`. Questions use the model id in `src/qa.ts` (`AI_MODEL`). The model only sees rows retrieved from D1 for that question. If nothing matches, it is not called.
- Links are relative. An optional `PUBLIC_BASE_URL` is shown on About when it is an http(s) URL. The app does not hardcode a hostname, so the Worker can move to another custom domain later.
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

The D1 database name is `budget-explorer`. Its id is in `wrangler.jsonc`. Migration `0001_init.sql` is already applied on the remote database. Apply `0002_settings.sql` remotely before deploying the names switch. Apply both locally before seeding:

```bash
npx wrangler d1 migrations apply budget-explorer --local
```

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

Do not put a hostname in application code. After deploy, attach whatever custom domain you want in the Cloudflare dashboard (Workers, Settings, Domains), or add a route in `wrangler.jsonc` at that time. Set `PUBLIC_BASE_URL` only if you want About to display it. Relative links keep working if the hostname changes.

## Checks

```bash
npm test
npm run typecheck
```
