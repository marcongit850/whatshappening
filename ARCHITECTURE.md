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

- Purpose: show budget to actual spending from an imported Clerk report, with department burn rates, payment search, a recreation plat fee history, and questions answered only from imported rows.
- Worker name: `budget-explorer`
- Project directory: `budget-explorer/`
- Domain: budget.whatshappeningnetwork.com
- workers.dev hostname: budget-explorer.352marc.workers.dev
- D1 database: `budget-explorer` (binding `DB`). The id is in `budget-explorer/wrangler.jsonc`. Migration `0001_init.sql` is already applied remotely.
- Workers AI binding: `AI`. The model id is the constant `AI_MODEL` in `budget-explorer/src/qa.ts`. The model only sees rows retrieved for that question.
- Secret names only. Do not commit values.
  - `SITE_PASSWORD` (required): shared site password
  - `SESSION_SECRET` (required): HMAC key for the session cookie
  - `ADMIN_PASSWORD` (optional): when set, Admin pages require it in addition to the site password
  - `PUBLIC_BASE_URL` (optional): shown on About when it is an http(s) URL. Links in the app stay relative.
- Deploy: Cloudflare Workers Builds from `main`, root directory `budget-explorer`, deploy command `npx wrangler deploy`.
- Data import: an administrator uploads a text report on the Admin Import page, reviews the preview, and publishes it. CSV or Excel can supply chart of accounts names. PDF uploads are refused. County reports, parsed JSON, and payment extracts stay out of git. `budget-explorer/data/` is gitignored. For a full year file that is too large for one Worker request, `budget-explorer/scripts/seed-local.sh` loads a local D1 copy only.

Gotchas:

- The GitHub repository is public. Do not commit county payment rows, payroll detail, or secret values.
- Payroll is stored and shown as batch totals only. Employee names and individual pay lines are not stored.
- Lines dated after the report date (for the current file, after 9/15/2026) are stored and flagged. Search, account payment lists, plat activity, and questions exclude them.
