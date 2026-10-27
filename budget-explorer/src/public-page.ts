import { esc } from "./format";
import { canonicalUrl } from "./host";
import { COUNTIES, countiesIn, countyHref, isLiveState, liveCounties, US_STATES, type CountyPlace, type UsState } from "./places";

const SITE_NAME = "How They Spend My Taxes";

const HOME_DESCRIPTION = "Pick a state, then a county, and see how county tax dollars are spent. Florida is open. Walton County is the one live county.";
const FLORIDA_DESCRIPTION = "Walton County, Florida is live. Request a county that is not listed yet.";
const WALTON_DESCRIPTION = "An unofficial Walton County budget page built from public records provided by the Walton County Clerk and Comptroller. Access is currently private.";

const FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap";

export interface PublicDoc {
  title: string;
  description: string;
  path: string;
  index: boolean;
  body: string;
  jsonLd: Record<string, unknown> | null;
  canonical?: boolean;
}

export function renderPublicHome(): string {
  return document({
    title: "See how your county spends your tax dollars",
    description: HOME_DESCRIPTION,
    path: "/",
    index: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: canonicalUrl("/"),
      description: HOME_DESCRIPTION,
    },
    body: `<section class="door-hero"><div class="door-wrap door-hero-grid">
<div>
<p class="eyebrow">County budgets, in plain words</p>
<h1>See how your county spends your tax dollars</h1>
<p class="explainer">Pick a state. Then pick a county. You can read the budget the county passed and the money it has paid out, without a stack of reports.</p>
<p class="caption">One county at a time. Florida is first.</p>
<div class="door-actions">
<a class="btn gold" href="/florida">Open Florida</a>
<a class="btn line" href="/walton">Walton County</a>
</div>
</div>
<aside class="feature-panel">
<p class="eyebrow">Live now</p>
<h2>Florida is live</h2>
<p>Walton County is the first county on this site. Open it to read the budget, the spending, the income, and the savings.</p>
<a class="btn gold" href="/florida">Open Florida</a>
</aside>
</div></section>
<main><div class="door-wrap">
<section class="door-section" id="map">
<h2>Pick your state</h2>
<p class="caption">Florida is live. Every other state is marked coming soon.</p>
<div class="map-card">
${stateMap()}
<div class="map-legend"><span class="swatch live"></span> Live <span class="swatch soon"></span> Coming soon</div>
</div>
<p class="caption">Gray states are coming soon. They do not have county pages yet.</p>
</section>
<section class="door-section" id="browse">
<h2>Browse by name</h2>
<p class="caption">One list. Type a state, then press the button. Florida is live.</p>
<div class="state-finder">
<label for="state-filter">Find a state</label>
<input id="state-filter" data-state-filter type="search" placeholder="Type a state name" autocomplete="off">
</div>
<ul class="state-pills" data-state-list>
${statePills()}
</ul>
<p class="state-empty" data-state-empty hidden>No state matches that name.</p>
</section>
<section class="door-section">
<h2>How to use this site</h2>
<p class="caption">Three steps. No special words.</p>
<div class="steps">
<article class="step"><b>1. Pick a state</b><p class="caption">Florida is the only open state today.</p></article>
<article class="step"><b>2. Pick a county</b><p class="caption">${esc(liveCountyLine())}</p></article>
<article class="step"><b>3. Read the budget</b><p class="caption">Walton County is private until you sign in.</p></article>
</div>
</section>
<section class="door-section">
<h2>Walton County is live</h2>
<p class="caption">The first county on this site.</p>
<p class="body-copy">${esc(liveCountyLine())} The figures come from public records provided by the Walton County Clerk and Comptroller. The page is unofficial. Access is currently private.</p>
<p><a class="btn gold" href="/walton">Open Walton County</a></p>
</section>
</div></main>`,
  });
}

export function renderFlorida(): string {
  return document({
    title: "Florida counties",
    description: FLORIDA_DESCRIPTION,
    path: "/florida",
    index: true,
    jsonLd: webPage("Florida counties", FLORIDA_DESCRIPTION, "/florida"),
    body: `<section class="door-hero"><div class="door-wrap">
<p class="eyebrow">Florida</p>
<h1>Florida counties</h1>
<p class="explainer">Open a county to see the budget it passed, the money it has spent, the income it took in, and what it holds in savings.</p>
<p class="caption">${esc(liveCountyLine())} The pages use plain words and large type.</p>
</div></section>
<main><div class="door-wrap">
<div class="card-row">
<article class="info-card">
<p class="eyebrow">Live now</p>
<h2>Walton County</h2>
<p>The dashboard shows the budget, spending, income, and savings. It is unofficial. Access is currently private.</p>
<a class="btn gold" href="/walton">Open Walton County</a>
</article>
<article class="info-card">
<p class="eyebrow">Not listed yet</p>
<h2>Request your county</h2>
<p>Ask for a Florida county that is not on this page. The form does not show your email.</p>
<a class="btn gold" href="/florida/request">Request your county</a>
</article>
</div>
<section class="door-section">
<h2>Counties</h2>
<p class="caption">The list comes from one catalog. A county is added there when its page is ready.</p>
${countyItems("florida")}
<p><a class="btn secondary" href="/">Back to the United States</a></p>
</section>
</div></main>`,
  });
}

export function renderStateHub(state: UsState): string {
  const description = `Counties listed for ${state.name}. A live county opens its budget page.`;
  const live = countiesIn(state.slug).some((county) => county.live);
  return document({
    title: `${state.name} counties`,
    description,
    path: `/states/${state.slug}`,
    index: live,
    jsonLd: webPage(`${state.name} counties`, description, `/states/${state.slug}`),
    body: `<section class="door-hero"><div class="door-wrap">
<p class="eyebrow">${esc(state.name)}</p>
<h1>${esc(state.name)} counties</h1>
<p class="explainer">Pick a county. A live county opens its budget page. Any other county on the list is coming soon.</p>
</div></section>
<main><div class="door-wrap"><section class="door-section">
<h2>Counties</h2>
${countyItems(state.slug)}
<p><a class="btn secondary" href="/">Back to the United States</a></p>
</section></div></main>`,
  });
}

export function renderWaltonLanding(formToken: string): string {
  return document({
    title: "Walton County, Florida",
    description: WALTON_DESCRIPTION,
    path: "/walton",
    index: true,
    jsonLd: webPage("Walton County, Florida", WALTON_DESCRIPTION, "/walton"),
    body: `<section class="door-hero"><div class="door-wrap">
<p class="eyebrow">Walton County, Florida</p>
<h1>Walton County budget</h1>
<p class="explainer">This is an unofficial look at how Walton County spends county money. It is built from public records provided by the Walton County Clerk and Comptroller. It is not a county website. Access is currently private.</p>
<p class="caption">A password is required before any county figures are shown.</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<h2>Sign in</h2>
<p class="caption">One shared password opens the Walton County pages.</p>
<form class="door-login" method="post" action="/walton/login" data-busy>
<input type="hidden" name="next" value="/walton">
<input type="hidden" name="form_token" value="${esc(formToken)}">
<div><label for="password">Site password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
<button class="btn gold" type="submit">Continue</button>
</form>
</section>
</div></main>`,
  });
}

export function renderPublicMissing(): string {
  return document({
    title: "Page not found",
    description: "That page is not on this site.",
    path: "/",
    index: false,
    jsonLd: null,
    canonical: false,
    body: `<section class="door-hero"><div class="door-wrap">
<h1>That page is not here</h1>
<p class="explainer">The address does not match a page on this site.</p>
<p class="caption">You can return to the state map.</p>
<div class="door-actions"><a class="btn gold" href="/">Back to the start</a></div>
</div></section>`,
  });
}

function liveCountyLine(): string {
  const live = liveCounties();
  if (live.length === 1) return `${live[0].name} is the one live county.`;
  if (!live.length) return "No county is live yet.";
  return `Live counties: ${live.map((county) => county.name).join(", ")}.`;
}

function reportHref(path: string): string {
  return `/report?from=${encodeURIComponent(path || "/")}`;
}

function countyItems(stateSlug: string): string {
  const counties = countiesIn(stateSlug);
  if (!counties.length) return `<p>No counties are listed.</p>`;
  const items = counties
    .map((county) => {
      const label = county.live ? `${county.name}, live` : `${county.name}, coming soon`;
      const cls = county.live ? "" : ` class="soon"`;
      return `<li><a${cls} href="${esc(countyHref(county))}">${esc(label)}</a></li>`;
    })
    .join("");
  return `<ul class="county-list">${items}</ul>`;
}

function honeypot(): string {
  return `<div class="hp" aria-hidden="true"><label for="company_website">Company website</label><input id="company_website" name="company_website" type="text" tabindex="-1" autocomplete="off" value=""></div>`;
}

function formError(error: string): string {
  return error ? `<p class="warning">${esc(error)}</p>` : "";
}

export function renderCountyRequest(opts: {
  token: string;
  action: string;
  state: UsState;
  county: CountyPlace | null;
  error: string;
  name: string;
  note: string;
  countyName: string;
}): string {
  const locked = Boolean(opts.county);
  const stateEmpty = !locked && countiesIn(opts.state.slug).length === 0;
  const title = locked ? `${opts.county?.name} is coming soon` : stateEmpty ? `${opts.state.name} is coming soon` : `Request a county in ${opts.state.name}`;
  const description = locked
    ? `${opts.county?.name} does not have budget pages yet. You can ask for them.`
    : stateEmpty
      ? `Coming soon. We do not have county budget pages for ${opts.state.name} yet.`
      : `Ask for a county in ${opts.state.name}. The state is filled in.`;
  const countyField = locked
    ? `<p class="locked">County</p><p class="locked-value">${esc(opts.county?.name || "")}</p>`
    : `<div><label for="county_name">County</label><input id="county_name" name="county_name" type="text" autocomplete="organization" required value="${esc(opts.countyName)}"></div>`;
  return document({
    title,
    description,
    path: opts.action,
    index: false,
    jsonLd: webPage(title, description, opts.action),
    body: `<section class="door-hero"><div class="door-wrap">
<p class="eyebrow">${locked || stateEmpty ? "Coming soon" : esc(opts.state.name)}</p>
<h1>${esc(title)}</h1>
<p class="explainer">${esc(description)} Ask with the form below. We never publish your email.</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<h2>Request this county</h2>
<p class="caption">Name, email, and the county. A note is optional.</p>
<form class="door-login" method="post" action="${esc(opts.action)}" data-busy>
<input type="hidden" name="form_token" value="${esc(opts.token)}">
${honeypot()}
${formError(opts.error)}
<div><label for="requester_name">Your name</label><input id="requester_name" name="name" type="text" autocomplete="name" required value="${esc(opts.name)}"></div>
<div><label for="requester_email">Email</label><input id="requester_email" name="email" type="email" autocomplete="email" required></div>
<p class="locked">State</p><p class="locked-value">${esc(opts.state.name)}</p>
${countyField}
<div><label for="note">Note, if you want to add one</label><textarea id="note" name="note">${esc(opts.note)}</textarea></div>
<button class="btn gold" type="submit">Send this request</button>
</form>
</section>
</div></main>`,
  });
}

export function renderReportForm(opts: {
  token: string;
  action: string;
  error: string;
  kind: "problem" | "idea";
  pageRef: string;
  correction: string;
  idea: string;
  source: string;
  name: string;
  county: string;
}): string {
  const title = "Report a problem or share an idea";
  const description = "Tell us if a number looks wrong, or share an idea for using this county budget data.";
  const problemChecked = opts.kind === "idea" ? "" : " checked";
  const ideaChecked = opts.kind === "idea" ? " checked" : "";
  const options = [`<option value="">Choose a county</option>`]
    .concat(COUNTIES.map((county) => `<option value="${esc(county.slug)}"${county.slug === opts.county ? " selected" : ""}>${esc(county.name)}</option>`))
    .concat(`<option value="not-sure"${opts.county === "not-sure" ? " selected" : ""}>Not sure</option>`)
    .join("");
  return document({
    title,
    description,
    path: opts.action === "/walton/report" ? "/report" : opts.action,
    index: false,
    jsonLd: webPage(title, description, "/report"),
    body: `<section class="door-hero"><div class="door-wrap">
<p class="eyebrow">A note about the data</p>
<h1>${esc(title)}</h1>
<p class="explainer">Tell us if something looks wrong, or share an idea for using this data better.</p>
<p class="caption">Plain words are enough. We do not send email from this site.</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<h2>Your note</h2>
<p class="caption">We never publish your email.</p>
<form class="door-login report-form" method="post" action="${esc(opts.action)}" data-busy>
<input type="hidden" name="form_token" value="${esc(opts.token)}">
${honeypot()}
${formError(opts.error)}
<fieldset>
<legend>What is this about?</legend>
<p class="caption">Pick one.</p>
<div class="choice">
<label><input type="radio" name="kind" value="problem"${problemChecked}> Something looks wrong</label>
<label><input type="radio" name="kind" value="idea"${ideaChecked}> An idea for using this data better</label>
</div>
</fieldset>
<div class="problem-fields">
<div><label for="page_ref">What page or number looks wrong</label>
<p class="caption">The page you came from is filled in when we know it. You can change it.</p>
<input id="page_ref" name="page_ref" type="text" value="${esc(opts.pageRef)}"></div>
<div><label for="correction">What do you think is correct?</label>
<textarea id="correction" name="correction">${esc(opts.correction)}</textarea></div>
</div>
<div class="idea-fields">
<div><label for="idea">Your idea</label>
<p class="caption">You do not need to name a page.</p>
<textarea id="idea" name="idea">${esc(opts.idea)}</textarea></div>
</div>
<div><label for="source">Source or link, if you have one</label><input id="source" name="source" type="text" value="${esc(opts.source)}"></div>
<div><label for="county">County</label>
<p class="caption">Required. Choose the county this note is about.</p>
<select id="county" name="county" required>${options}</select></div>
<div><label for="report_name">Your name, if you want a follow-up</label><input id="report_name" name="name" type="text" autocomplete="name" value="${esc(opts.name)}"></div>
<div><label for="report_email">Your email, if you want a follow-up</label>
<p class="caption">Leave this blank if you want. It is saved and it is not shown on the page.</p>
<input id="report_email" name="email" type="email" autocomplete="email"></div>
<button class="btn gold" type="submit">Send</button>
</form>
</section>
</div></main>`,
  });
}

export function renderThanks(opts: {
  title: string;
  message: string;
  path: string;
  backHref: string;
  backLabel: string;
  eyebrow?: string;
  closeNote?: string | null;
}): string {
  const close = opts.closeNote === null ? "" : `<p class="caption">${esc(opts.closeNote ?? "You can close this page.")}</p>`;
  return document({
    title: opts.title,
    description: opts.message,
    path: opts.path,
    index: false,
    jsonLd: null,
    body: `<section class="door-hero"><div class="door-wrap">
<p class="eyebrow">${esc(opts.eyebrow ?? "Received")}</p>
<h1>${esc(opts.title)}</h1>
<p class="explainer">${esc(opts.message)}</p>
${close}
<div class="door-actions"><a class="btn gold" href="${esc(opts.backHref)}">${esc(opts.backLabel)}</a></div>
</div></section>`,
  });
}

function webPage(name: string, description: string, path: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url: canonicalUrl(path),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: canonicalUrl("/") },
  };
}

function document(opts: PublicDoc): string {
  const robots = opts.index ? "index, follow" : "noindex, nofollow";
  const canonical = opts.canonical === false ? "" : canonicalUrl(opts.path);
  const json = opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd).replace(/</g, "\\u003c")}</script>` : "";
  const fullTitle = `${opts.title} | ${SITE_NAME}`;
  const canonicalLink = canonical ? `<link rel="canonical" href="${esc(canonical)}">` : "";
  const ogUrl = canonical ? `<meta property="og:url" content="${esc(canonical)}">` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(opts.description)}">
<meta name="robots" content="${robots}">
<title>${esc(fullTitle)}</title>
${canonicalLink}
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="website">
${ogUrl}
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="/assets/app.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${json}
</head>
<body class="door">
<div class="door-note">Unofficial. Not a county website.</div>
<header class="door-bar"><div class="door-wrap bar-inner">
<a class="door-brand" href="/">How They Spend My Taxes</a>
<a class="door-bar-link" href="/florida">Florida</a>
</div></header>
${opts.body}
<footer class="door-foot"><div class="door-wrap">
<p class="door-foot-link"><a data-report href="${esc(reportHref(opts.path))}">Report a problem or share an idea</a></p>
<p>Unofficial. Not affiliated with or endorsed by any county government. No county seal is used. A county appears here only when its page is live.</p>
</div></footer>
<script src="/assets/app.js" defer></script>
</body></html>`;
}

function stateMap(): string {
  const size = 104;
  const gap = 12;
  const cols = 12;
  const rows = 8;
  const width = cols * (size + gap) + gap;
  const height = rows * (size + gap) + gap;
  const tiles = US_STATES.map((state) => {
    const live = isLiveState(state);
    const x = gap + state.col * (size + gap);
    const y = gap + state.row * (size + gap);
    const href = live ? "/florida" : `/states/${state.slug}`;
    const status = live ? "Live" : "Soon";
    return `<a class="tile ${live ? "live" : "soon"}" tabindex="-1" href="${href}" aria-label="${esc(state.name)}, ${live ? "live" : "coming soon"}"><title>${esc(state.name)}. ${esc(status)}.</title><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="16"></rect><text x="${x + size / 2}" y="${y + 46}" text-anchor="middle" font-size="30">${esc(state.abbr)}</text><text class="tile-note" x="${x + size / 2}" y="${y + 78}" text-anchor="middle" font-size="20">${esc(status)}</text></a>`;
  }).join("");
  return `<svg class="us-map" viewBox="0 0 ${width} ${height}" role="group" aria-label="United States. Pick a state. Florida is live. Other states are coming soon.">${tiles}</svg>`;
}

function statePills(): string {
  const ordered = [...US_STATES].sort((a, b) => a.name.localeCompare(b.name));
  return ordered
    .map((state) => {
      const live = isLiveState(state);
      const href = live ? "/florida" : `/states/${state.slug}`;
      const label = live ? `${state.name}, live` : `${state.name}, coming soon`;
      return `<li data-state-name="${esc(state.name)}"><a class="${live ? "open" : "soon"}" href="${href}">${esc(label)}</a></li>`;
    })
    .join("");
}
