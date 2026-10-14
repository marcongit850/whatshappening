# What's Happening: architecture

Last checked against the code on Oct 14, 2026. Domains, secrets, and the deploy trigger were last checked in Cloudflare on Oct 8, 2026.

## What it does

The company site for What's Happening, a marketing and media company: one page with the work, current projects, team, and a contact form. `/dash` is forwarded to a separate Worker.

## Domains and Worker

- Worker: `whatshappening`
- Custom domains (attached in the Cloudflare dashboard): `whatshappeningnetwork.com`, `www.whatshappeningnetwork.com`
- workers.dev host is enabled.
- `whatshappeningnetwork.com/dash` and `www.whatshappeningnetwork.com/dash`, including every path under `/dash/`, are served by the separate Worker `dashboard`.

## Data and images

- Pages and images are static files in this repo. The team list is `data/team.json` (photos in `photos/`), rendered by `team.js`.
- Bindings: `ASSETS` (static assets, directory `.`). Service binding `DASH` to the `dashboard` Worker. No D1, R2, or KV.
- External services: Resend (contact mail). The `dashboard` Worker is deployed on its own and is reached only through the `DASH` binding.

## Request path

- The fetch handler checks `/dash` before contact routing, caching, or redirects. `url.pathname === "/dash"` or `url.pathname.startsWith("/dash/")` returns `env.DASH.fetch(request)`. The request is not rewritten. The `dashboard` Worker handles the `/dash` prefix.
- `assets.run_worker_first` includes `/dash` and `/dash/*`, plus `/api/contact` and `/api/contact/`. Those paths must be listed there: `not_found_handling` is `404-page`, and this compatibility date serves navigation requests from assets unless the path is listed.
- Every other path is unchanged: the contact route, then static assets.

## Secrets and env vars (names only)

Secrets set: `RESEND_API_KEY`, `CONTACT_EMAIL`.

## Cron and scheduled jobs

None. The Worker has only a fetch handler and no cron trigger.

## How it deploys

- Cloudflare Workers Builds, auto deploy on merge to `main`. Repo `marcongit850/whatshappening`, trigger `ff34b779-2d90-41ac-a417-99cc65329243`, build command empty, deploy command `npx wrangler deploy`, root `/`.
- If a merge does not deploy: `POST /accounts/f1c59948520f1ec39473238b621c7e24/builds/triggers/ff34b779-2d90-41ac-a417-99cc65329243/builds` with body `{"branch": "main", "commit_hash": "<full 40 character sha>"}`. Check builds with `GET /accounts/f1c59948520f1ec39473238b621c7e24/builds/workers/e36de431fbc1404a9c1bd19b072e003e/builds?per_page=2` and match `commit_hash`.

## Known gotchas

- The build command is empty, so `npm run build` (the `scripts/check.js` page check and contact tests) does not run on deploy. Run `npm test` before merging.
- `/api/contact` and `/dash` (including every path under `/dash/`) run the Worker (`run_worker_first`). Contact has a short in-memory per-IP limit (5 per minute). `/dash` is forwarded before that limit.
- Contact mail is sent from Resend's onboarding sender (`What's Happening <onboarding@resend.dev>`), hardcoded in the code. That sender only delivers to the email on the Resend account, so `CONTACT_EMAIL` must be that address until a domain is verified in Resend and the From line is changed.
- Stale docs: `README.md` says there is no form, and `README.md` and `wrangler.jsonc` say the domain is not attached. There is a contact form, and `whatshappeningnetwork.com` is attached in the dashboard.

## Standing rule

Any PR that changes architecture (new secret, cron, storage, binding, or deploy change) must update this file in the same PR.
