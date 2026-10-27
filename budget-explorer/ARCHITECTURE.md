# Budget Explorer architecture

This Worker serves two kinds of sites from one codebase. The request host decides which one.

Data rules, payroll, the names switch, imports, and the D1 migrations stay in the repository root `ARCHITECTURE.md`. This file is the host routing and the public door. Do not apply migrations on the remote database from here. Do not change the admin names switch or hidden-mode reads for this front door.

## Hosts

| Host | What `/` is | County pages |
| --- | --- | --- |
| howtheyspendmytaxes.com | Public state map | Under `/walton`, password required |
| www.howtheyspendmytaxes.com | Same public map. Canonical links use the apex host. | Same `/walton` prefix |
| budget.whatshappeningnetwork.com | Walton dashboard, unchanged | At `/`, `/funds`, `/revenue`, and the rest |
| budget-explorer.352marc.workers.dev | Walton dashboard, unchanged | Same as the budget host |
| Any other host, including localhost | Walton dashboard, unchanged | Same as the budget host |

`isTaxesHost` in `src/host.ts` is the check. Only the two taxes hostnames match. A lookalike hostname does not.

## Public door

These pages are server-rendered HTML. The map is an inline SVG. There is no map library and no extra third-party request beyond the Fraunces and IBM Plex Sans stylesheets the dashboard already uses.

- `GET /` explains the site in plain words and lets a visitor pick a state.
- Florida is the only open state. It links to `GET /florida`.
- Other states are on the map and in one "Browse by name" list. Map tiles are not in the tab order, so a keyboard user meets each state once. On a narrow screen the map is hidden and that list is the way to pick a state. Each state links to `GET /states/:slug`. A state with no counties shows one coming soon message and the request form on that same page. Those pages are `noindex` and are not in the sitemap.
- `GET /florida` lists counties from `src/places.ts`. Walton County is the only live county, and it links to `/walton`. A county with `live: false` is one new line in that file. It shows on the state list as coming soon and opens a request form with the state and county filled in. No other county is named until that line exists.
- `GET /florida/request` and `GET /states/:slug/request` ask for a county that is not in the catalog. The state is filled in. The visitor types the county name. A typed name that matches a live county, after dropping the word County and punctuation, says that county is already live and does not save a row. The form is a normal POST with a CSRF cookie, an origin check, a honeypot field, and a limit of 5 saves an hour for each network. Public pages send `Referrer-Policy: same-origin`. A post whose `Origin` is the string `null` is accepted only when `Sec-Fetch-Site` is `same-origin`. Rows go in `county_requests`. The page never prints an email address. The thank-you page says the request was saved. The Worker does not send email.
- Logged-out `GET /walton` is a public landing with a short explanation and the password form. The explanation says the page is unofficial, that the figures come from public records provided by the Walton County Clerk and Comptroller, and that access is currently private. The page is indexable. The form posts to `/walton/login`.
- Logged-in `GET /walton` is the same dashboard other hosts serve at `/`.
- `GET /walton/login` and every other county page are `noindex`. The login page repeats the unofficial explanation.

The public homepage does not print county dollar figures. The existing unofficial banner, including the data-as-of line, stays on pages that show county data. No county seal is used.

## Prefix and bookmarks

On a taxes host, dashboard routes are mounted by rewriting `/walton/...` to the existing route and then prefixing root-relative links and `Location` headers in the response. Shared files stay at `/assets/*` and `/favicon.svg`.

Nav targets come from `PUBLIC_PATHS` in `src/view.ts`. `DASHBOARD_PREFIXES` in `src/host.ts` must cover that list, plus login, logout, and admin. Tests check the nav list.

`GET` and `HEAD` to an old unprefixed path redirect `301` to `/walton/...`, including the query string. Examples: `/funds/001` to `/walton/funds/001`, `/revenue` to `/walton/revenue`, `/search?fund=114` to `/walton/search?fund=114`. A signed-out deep link such as `/walton/funds/001` still redirects to `/walton/login` with `next` set to the prefixed path. `POST` to an old path is forwarded, not redirected, so a password form still works.

## Search

Canonical URLs, Open Graph tags, and JSON-LD use `https://howtheyspendmytaxes.com`. The homepage JSON-LD type is `WebSite`. Florida and the Walton landing use `WebPage`. There is no `Organization` node: the site is not a county agency, and the copy does not name a publisher.

`GET /sitemap.xml` on a taxes host lists only `/`, `/florida`, and `/walton`. `GET /robots.txt` on a taxes host allows those pages and disallows the county sections, including `/walton/`, `/florida/`, `/states/`, and `/report`. On every other host, `robots.txt` is still `Disallow: /` and responses stay `noindex, nofollow, noarchive`.

## Notes from visitors

Every page footer links to "Report a problem or share an idea".

- On the taxes host the form is `GET /report`, and the Walton dashboard link is rewritten to `GET /walton/report`. Both work without the site password. They are `noindex` and they are not in the sitemap.
- On budget.whatshappeningnetwork.com and the workers.dev host the form is `GET /report`, also without the site password.
- The first field is "What is this about?" with two choices: "Something looks wrong" or "An idea for using this data better". The choice is stored in `data_reports.kind`.
- A problem asks what page or number looks wrong (filled in from the page the visitor left, when that page is known) and what they think is correct. An idea asks for "Your idea" and does not need a page.
- Source, name, and email are optional. The county is required. Email is stored and is never printed. The thank-you page says the note was saved. The Worker does not send email.
- The form uses the same CSRF cookie, origin check, honeypot, and 5-an-hour limit as a county request.

Migration `migrations/0004_county_requests.sql` creates `county_requests` and `data_reports`. Apply it on the remote database by hand. Do not run `wrangler d1 migrations apply --remote`.

## What this change does not do

It does not deploy. It does not run remote migrations. It does not change how person names are stored or hidden. It does not add a contact email and it does not send mail.
