# What's Happening

Static company site for What's Happening. One page covers the work, two current projects, and the team.

What's Happening is a marketing and media company. The homepage uses that description, the current projects, and the team list.

Current projects, linked exactly and set to open in a new tab:

- Eating on 30A: https://eatingon30a.com/
- Eating in Destin: https://eatingindestin.com/

There is no database, login, or form. The public site name is [whatshappeningnetwork.com](https://whatshappeningnetwork.com/). Titles, canonical URLs, the footer, and meta tags use that name. This repo does not buy a domain or change DNS, and `wrangler.jsonc` does not attach the domain.

## Team

The team lives in one file, `data/team.json`. Each person has `name`, `title`, `bio`, and `photo`. The home page reads that list and builds the cards. The names are not copied into the page HTML.

To add, remove, or replace someone, edit `data/team.json` and put the photo in `photos/`. List order is the order on the page, left to right.

```json
{
  "name": "First Last",
  "title": "Title",
  "bio": "Short bio.",
  "photo": "photos/first-last.jpg"
}
```

## Preview locally

From the repository root:

```bash
npm install
npm run build
npx wrangler dev
```

Wrangler prints a local URL. Open that URL.

Without Wrangler:

```bash
python3 -m http.server 8080
```

Open http://localhost:8080/

## Deploy

The Cloudflare Worker name is `whatshappening`. `wrangler.jsonc` serves these static files. Do not add a custom domain in that file.

```bash
npx wrangler deploy
```

Cloudflare assigns the workers.dev hostname. That hostname is the preview. Leave the custom domain empty.

`npm run build` checks the page before you deploy: both project links, the team file, the contact route, and the copy rules.

## Contact

The footer link Contact Us opens the contact form. `POST /api/contact` sends the message through Resend. The Worker reads these secret names and no others:

- `RESEND_API_KEY`
- `CONTACT_EMAIL`

Set them in Cloudflare. Do not commit the values. If `CONTACT_EMAIL` is missing, the form says the message could not be sent.
