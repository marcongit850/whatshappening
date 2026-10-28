import { esc } from "./format";
import { COUNTY_MAPS, STATE_MAP } from "./geo/registry";
import { canonicalUrl } from "./host";
import { COUNTIES, countiesIn, isLiveState, liveCounties, stateBySlug, US_STATES, type CountyPlace, type UsState } from "./places";

const SITE_NAME = "How They Spend My Taxes";

const HOME_DESCRIPTION = "Pick a state, then a county, and see how county tax dollars are spent. Florida is open. Walton County is the one live county.";
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
  requestHref?: string;
  footerRequest?: boolean;
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
    body: `<section class="door-hero" id="content"><div class="door-wrap hero-grid">
<div class="hero-copy">
<p class="eyebrow">County budgets, in plain words</p>
<h1>See how your county spends your tax dollars</h1>
<p class="explainer">Pick a state. Then pick a county. When a county is live, you can read the budget it passed and the money it has paid out.</p>
${pickerForm()}
</div>
${stateMap()}
</div></section>
<main><div class="door-wrap">
<section class="door-section" id="what">
<h2>What you can see</h2>
<div class="see-grid">
<article class="info-card">
<h3>Budget and spending</h3>
<p>The budget the county passed, next to the money it has actually paid out.</p>
<p class="caption">What was planned, and what was spent.</p>
</article>
<article class="info-card">
<h3>Where the money comes from</h3>
<p>Income, grouped by where it came from.</p>
<p class="caption">Taxes and other money that came in.</p>
</article>
<article class="info-card">
<h3>Savings held in reserve</h3>
<p>Money the county holds in reserve, set aside from day to day spending.</p>
<p class="caption">Savings, shown apart from spending.</p>
</article>
<article class="info-card">
<h3>Search payments</h3>
<p>Look up payments in the public records for a live county.</p>
<p class="caption">A search box, in plain words.</p>
</article>
</div>
</section>
<section class="door-section" id="how">
<h2>How it works</h2>
<div class="steps">
<article class="step"><b>1. Public records</b><p class="caption">A live page is built from budget records the county has already published.</p></article>
<article class="step"><b>2. Plain words</b><p class="caption">The same records are shown in large type, with short labels.</p></article>
<article class="step"><b>3. One county at a time</b><p class="caption">${esc(liveCountyLine())} Access to that page is currently private.</p></article>
</div>
</section>
<section class="door-section" id="trust">
<h2>Built from public records</h2>
<p class="caption">This is not a county website and it is not endorsed by a county government. Walton County figures come from public records provided by the Walton County Clerk and Comptroller.</p>
</section>
<section class="door-section" id="coming">
<h2>Coming to your county</h2>
<p class="coming-cta"><a class="btn gold" href="/request">Request your county</a></p>
</section>
</div></main>`,
  });
}

export function renderStatePage(state: UsState): string {
  const title = stateTitle(state);
  const description = stateDescription(state);
  return document({
    title,
    description,
    path: `/${state.slug}`,
    index: true,
    jsonLd: webPage(title, description, `/${state.slug}`),
    requestHref: `/${state.slug}/request`,
    body: `<section class="door-hero florida-hero" id="content"><div class="door-wrap florida-wrap">
<p class="eyebrow">${esc(state.name)}</p>
<h1>${esc(title)}</h1>
${stateIntro(state) ? `<p class="explainer">${esc(stateIntro(state))}</p>` : ""}
<div class="map-card florida-map">
${countyMap(state)}
<p class="caption map-note">Walton County is marked. The other counties are outlines.</p>
<div class="map-legend"><span class="swatch live"></span> Live <span class="swatch soon"></span> Coming soon</div>
</div>
<p class="map-action"><a class="btn gold" href="/${esc(state.slug)}/request">Request your county</a></p>
</div></section>`,
  });
}

export function renderAboutSite(): string {
  const title = "About this site";
  const description = "An unofficial site that shows a county budget from public records. Walton County, Florida is the only live county. No county seal is used.";
  return document({
    title,
    description,
    path: "/about-this-site",
    index: true,
    jsonLd: webPage(title, description, "/about-this-site"),
    body: `<section class="door-hero" id="content"><div class="door-wrap">
<p class="eyebrow">About</p>
<h1>About this site</h1>
<p class="explainer">How They Spend My Taxes shows a county budget in plain words. It is unofficial. It is not a county website.</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<h2>What is live</h2>
<p class="body-copy">${esc(liveCountyLine())} The Walton County pages use public records provided by the Walton County Clerk and Comptroller. Access is currently private. No other county has budget pages yet.</p>
</section>
<section class="door-section">
<h2>What a live county shows</h2>
<p class="caption">The budget next to spending, where the money comes from, savings held in reserve, and a search of payments.</p>
<p><a class="btn gold" href="/florida">Open Florida</a></p>
</section>
<section class="door-section">
<h2>A problem or an idea</h2>
<p class="caption">Use the link in the footer. This site does not show an email address.</p>
</section>
</div></main>`,
  });
}

export function renderRequestStart(): string {
  const title = "Request your county";
  const description = "Ask for a county that is not live yet. Pick a state. The next page asks for the county name.";
  return document({
    title,
    description,
    path: "/request",
    index: false,
    jsonLd: null,
    canonical: true,
    body: `<section class="door-hero" id="content"><div class="door-wrap">
<p class="eyebrow">Coming to your county</p>
<h1>Request your county</h1>
<p class="explainer">Pick a state. The next page asks for the county. Walton County is already live.</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<form class="picker" method="get" action="/pick">
<input type="hidden" name="to" value="request">
<label for="request-state">State</label>
<select id="request-state" name="state" required>
<option value="">Choose a state</option>
${stateOptions()}
</select>
<button class="btn gold" type="submit">Continue</button>
</form>
</section>
</div></main>`,
  });
}

export function renderWaltonLanding(formToken: string): string {
  return document({
    title: "Walton County, Florida",
    description: WALTON_DESCRIPTION,
    path: "/walton",
    index: true,
    jsonLd: webPage("Walton County, Florida", WALTON_DESCRIPTION, "/walton"),
    body: `<section class="door-hero" id="content"><div class="door-wrap">
<p class="eyebrow">Walton County, Florida</p>
<h1>Walton County budget</h1>
<p class="explainer">It is built from public records provided by the Walton County Clerk and Comptroller.</p>
<p class="caption">A password is required before any county figures are shown.</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<h2>Sign in</h2>
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
    body: `<section class="door-hero" id="content"><div class="door-wrap">
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

function stateTitle(state: UsState): string {
  if (state.slug === "florida") return "Florida counties";
  return state.name;
}

function stateDescription(state: UsState): string {
  if (state.slug === "florida") {
    return "Map of Florida counties. Walton County is live. Open it for the budget, the spending, the income, and the savings. Other counties are coming soon.";
  }
  return `${state.name} is coming soon. Ask for a budget page built from public records.`;
}

function stateIntro(state: UsState): string {
  if (state.slug === "florida") return "";
  return `${state.name} does not have county budget pages yet.`;
}

function reportHref(path: string): string {
  return `/report?from=${encodeURIComponent(path || "/")}`;
}

function stateOptions(): string {
  return [...US_STATES]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((state) => {
      const label = isLiveState(state) ? `${state.name}, live` : `${state.name}, coming soon`;
      return `<option value="${esc(state.slug)}">${esc(label)}</option>`;
    })
    .join("");
}

function pickerForm(): string {
  return `<form class="picker" id="picker" method="get" action="/pick">
<h2>Pick a state</h2>
<div>
<label for="pick-state">State</label>
<select id="pick-state" name="state" required>
<option value="">Choose a state</option>
${stateOptions()}
</select>
</div>
<div id="pick-county-wrap">
<label for="pick-county">Florida county</label>
<select id="pick-county" name="county">
<option value="">Open the Florida page</option>
<option value="walton">Walton County, live</option>
<option value="request">Request your county</option>
</select>
</div>
<button class="btn gold" type="submit">Go</button>
</form>`;
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
  const stateRequest = !locked && countiesIn(opts.state.slug).length === 0;
  const title = locked ? `${opts.county?.name} is coming soon` : stateRequest ? `${opts.state.name} is coming soon` : `Request a county in ${opts.state.name}`;
  const description = locked
    ? `${opts.county?.name} does not have budget pages yet. You can ask for them.`
    : stateRequest
      ? `${opts.state.name} does not have county budget pages yet. You can ask for one.`
      : `Ask for a county in ${opts.state.name}. The state is filled in.`;
  const heading = stateRequest ? "Request this state" : "Request this county";
  const eyebrow = stateRequest ? opts.state.name : locked ? "Coming soon" : opts.state.name;
  const explainer = stateRequest
    ? `We do not have county budget pages for ${opts.state.name} yet. Ask with the form below. We never publish your email.`
    : `${description} Ask with the form below. We never publish your email.`;
  const countyField = locked
    ? `<p class="locked">County</p><p class="locked-value">${esc(opts.county?.name || "")}</p>`
    : `<div><label for="county_name">County</label><input id="county_name" name="county_name" type="text" autocomplete="organization" required value="${esc(opts.countyName)}"></div>`;
  return document({
    title,
    description,
    path: opts.action,
    index: false,
    jsonLd: webPage(title, description, opts.action),
    requestHref: `/${opts.state.slug}/request`,
    footerRequest: !stateRequest,
    body: `<section class="door-hero" id="content"><div class="door-wrap">
${stateSilhouette(opts.state)}
<p class="eyebrow">${esc(eyebrow)}</p>
<h1>${esc(title)}</h1>
<p class="explainer">${esc(explainer)}</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<h2>${heading}</h2>
<p class="caption">${stateRequest ? "Name, email, and the county you want in this state. A note is optional." : "Name, email, and the county. A note is optional."}</p>
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
    body: `<section class="door-hero" id="content"><div class="door-wrap">
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
    body: `<section class="door-hero" id="content"><div class="door-wrap">
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
  const requestHref = opts.requestHref || "/request";
  const requestLink = opts.footerRequest === false ? "" : `<a href="${esc(requestHref)}">Request your county</a>`;
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
<a class="skip" href="#content">Skip to content</a>
<header class="door-bar"><div class="door-wrap bar-inner">
<a class="door-brand" href="/">How They Spend My Taxes</a>
<nav class="door-nav" aria-label="Primary">
<a class="door-bar-link" href="/#picker">Pick a state</a>
<a class="door-bar-link" href="/about-this-site">About</a>
</nav>
</div></header>
${opts.body}
<footer class="door-foot"><div class="door-wrap">
<nav class="door-foot-nav" aria-label="Footer">
<a href="/about-this-site">About</a>
<a data-report href="${esc(reportHref(opts.path))}">Report a problem or share an idea</a>
${requestLink}
</nav>
<p>Not a county website. Not affiliated with or endorsed by any county government.</p>
</div></footer>
<script src="/assets/app.js" defer></script>
</body></html>`;
}

function stateMap(): string {
  const shapes = [...STATE_MAP.states].sort((a, b) => {
    const aLive = stateBySlug(a.slug) ? isLiveState(stateBySlug(a.slug) as UsState) : false;
    const bLive = stateBySlug(b.slug) ? isLiveState(stateBySlug(b.slug) as UsState) : false;
    return Number(aLive) - Number(bLive);
  });
  const links = shapes
    .map((shape) => {
      const state = stateBySlug(shape.slug);
      if (!state) return "";
      const live = isLiveState(state);
      const label = `${state.name}, ${live ? "live" : "coming soon"}`;
      const hit = shape.hit ? `<circle class="hit" cx="${shape.hit.cx}" cy="${shape.hit.cy}" r="${shape.hit.r}"></circle>` : "";
      return `<a class="${live ? "live" : "soon"}" href="/${state.slug}" data-name="${esc(label)}" aria-label="${esc(label)}"><title>${esc(label)}</title><path fill-rule="evenodd" d="${shape.d}"></path>${hit}</a>`;
    })
    .join("");
  const frames = STATE_MAP.insets
    .map(
      (inset) =>
        `<rect class="inset-frame" x="${inset.x}" y="${inset.y}" width="${inset.w}" height="${inset.h}" rx="10"></rect><text class="inset-label" x="${inset.x + inset.w / 2}" y="${inset.y + 24}" text-anchor="middle">${esc(inset.label)}</text>`,
    )
    .join("");
  return `<div class="map-card">
<a class="skip" href="#picker">Skip to the state picker</a>
<svg class="us-map" viewBox="${STATE_MAP.viewBox}" role="group" aria-label="United States. Pick a state. Florida is live. Other states are coming soon." data-us-map>${frames}${links}</svg>
<div class="map-legend"><span class="swatch live"></span> Live <span class="swatch soon"></span> Coming soon</div>
<p class="map-label" data-map-label data-default="Florida is live. Other states are coming soon.">Florida is live. Other states are coming soon.</p>
<p class="map-action"><a class="btn gold" id="map-open" href="/florida">Open Florida</a></p>
</div>`;
}

function stateSilhouette(state: UsState): string {
  const shape = STATE_MAP.states.find((item) => item.slug === state.slug);
  if (!shape) return "";
  const pad = 10;
  const x = shape.box.x - pad;
  const y = shape.box.y - pad;
  const w = shape.box.w + pad * 2;
  const h = shape.box.h + pad * 2;
  return `<div class="state-mark"><svg viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="${esc(state.name)}"><path fill-rule="evenodd" d="${shape.d}"></path></svg></div>`;
}

function countyMap(state: UsState): string {
  const file = COUNTY_MAPS[state.slug];
  if (!file) return "";
  const meta = new Map(countiesIn(state.slug).map((county) => [county.slug, county]));
  const shapes = [...file.counties].sort((a, b) => Number(Boolean(meta.get(a.slug)?.live)) - Number(Boolean(meta.get(b.slug)?.live)));
  const marks = shapes
    .map((shape) => {
      const county = meta.get(shape.slug);
      const live = Boolean(county?.live && county.href);
      if (!live) return `<g class="soon"><title>Coming soon</title><path fill-rule="evenodd" d="${shape.d}"></path></g>`;
      const name = county?.name || shape.name;
      const hit = shape.hit ? `<circle class="hit" cx="${shape.hit.cx}" cy="${shape.hit.cy}" r="${shape.hit.r}"></circle>` : "";
      const label = shape.label
        ? `${shape.label.ax != null && shape.label.ay != null ? `<line class="place-leader" x1="${shape.label.x}" y1="${shape.label.y + 4}" x2="${shape.label.ax}" y2="${shape.label.ay}"></line>` : ""}<text class="place-label" font-size="18" x="${shape.label.x}" y="${shape.label.y}" text-anchor="middle">Walton</text>`
        : "";
      return `<a class="live" href="${esc(county?.href || "/walton")}" aria-label="${esc(name)}, live"><title>${esc(name)}, live</title><path fill-rule="evenodd" d="${shape.d}"></path>${hit}${label}</a>`;
    })
    .join("");
  return `<svg class="county-map" viewBox="${esc(file.viewBox)}" role="group" aria-label="${esc(state.name)}. Walton County is a link. Other counties are coming soon.">${marks}</svg>`;
}
