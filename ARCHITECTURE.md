# What's Happening: architecture

Last checked against the code and Cloudflare on Oct 8, 2026.

## What it does

The company site for What's Happening, a marketing and media company: one page with the work, current projects, team, and a contact form.

## Domains and Worker

- Worker: `whatshappening`
- Custom domains (attached in the Cloudflare dashboard): `whatshappeningnetwork.com`, `www.whatshappeningnetwork.com`
- workers.dev host is enabled.

## Data and images

- Pages and images are static files in this repo. The team list is `data/team.json` (photos in `photos/`), rendered by `team.js`.
- Bindings: `ASSETS` (static assets, directory `.`). No D1, R2, or KV.
- External services: Resend (contact mail).

## Secrets and env vars (names only)

Secrets set: `RESEND_API_KEY`, `CONTACT_EMAIL`.

## Cron and scheduled jobs

None. The Worker has only a fetch handler and no cron trigger.

## How it deploys

- Cloudflare Workers Builds, auto deploy on merge to `main`. Repo `marcongit850/whatshappening`, trigger `ff34b779-2d90-41ac-a417-99cc65329243`, build command empty, deploy command `npx wrangler deploy`, root `/`.
- If a merge does not deploy: `POST /accounts/f1c59948520f1ec39473238b621c7e24/builds/triggers/ff34b779-2d90-41ac-a417-99cc65329243/builds` with body `{"branch": "main", "commit_hash": "<full 40 character sha>"}`. Check builds with `GET /accounts/f1c59948520f1ec39473238b621c7e24/builds/workers/e36de431fbc1404a9c1bd19b072e003e/builds?per_page=2` and match `commit_hash`.

## Known gotchas

- The build command is empty, so `npm run build` (the `scripts/check.js` page check and contact tests) does not run on deploy. Run `npm test` before merging.
- Only `/api/contact` runs the Worker (`run_worker_first`). It has a short in-memory per-IP limit (5 per minute).
- Contact mail is sent from Resend's onboarding sender (`What's Happening <onboarding@resend.dev>`), hardcoded in the code. That sender only delivers to the email on the Resend account, so `CONTACT_EMAIL` must be that address until a domain is verified in Resend and the From line is changed.
- Stale docs: `README.md` says there is no form, and `README.md` and `wrangler.jsonc` say the domain is not attached. There is a contact form, and `whatshappeningnetwork.com` is attached in the dashboard.

## Standing rule

Any PR that changes architecture (new secret, cron, storage, binding, or deploy change) must update this file in the same PR.
