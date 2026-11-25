import { FY2027_ADOPTED_URL } from "./answers";
import { headAssets, siteFooter, siteHeader } from "./chrome";
import { esc, moneyCompact, moneyExact, shortDate } from "./format";
import { STATE_MAP } from "./geo/registry";
import type { HomeHighlights } from "./home-data";
import { canonicalUrl } from "./host";
import { COUNTIES, countiesIn, type CountyPlace, type UsState } from "./places";

const SITE_NAME = "How They Spend My Taxes";

const HOME_DESCRIPTION = "See how Walton County spends your tax dollars in FY2027. Figures come from public records provided by the Walton County Clerk and Comptroller.";
const WALTON_DESCRIPTION = "A Walton County budget page built from public records provided by the Walton County Clerk and Comptroller. A password is required before any county figures are shown.";

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

export function renderPublicHome(highlights: HomeHighlights): string {
  const adopted = highlights.adoptedCents > 0
    ? `<article class="info-card stat-card"><p class="stat-label">FY2027 adopted budget</p><p class="stat-value">${esc(moneyCompact(highlights.adoptedCents))}</p><p class="stat-exact">${esc(moneyExact(highlights.adoptedCents))}</p><p>Commissioners adopted this budget on September 28, 2026.</p></article>`
    : "";
  const asOf = highlights.dataAsOf ? shortDate(highlights.dataAsOf) : "";
  const spent = highlights.spentCents != null
    ? `<article class="info-card stat-card"><p class="stat-label">Paid so far</p><p class="stat-value">${esc(moneyCompact(highlights.spentCents))}</p><p class="stat-exact">${esc(moneyExact(highlights.spentCents))}</p><p>From the county's books, not counting money moved between county funds.${asOf ? ` Data as of ${esc(asOf)}.` : ""}</p></article>`
    : asOf
      ? `<article class="info-card stat-card"><p class="stat-label">Data as of</p><p class="stat-value stat-date">${esc(asOf)}</p><p>The latest date on the published Clerk account detail.</p></article>`
      : "";
  const fundItems = highlights.funds
    .map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a><span>${esc(moneyCompact(item.cents))}</span></li>`)
    .join("");
  const funds = fundItems
    ? `<section class="door-section" id="funds"><h2>Top spending areas</h2><p class="caption">Funds with the most spent so far, not counting money moved between county funds.</p><ol class="home-list">${fundItems}</ol></section>`
    : "";
  const vendorItems = highlights.vendors
    .map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a><span>${esc(moneyCompact(item.cents))}</span></li>`)
    .join("");
  const vendors = vendorItems
    ? `<section class="door-section" id="vendors"><h2>Top vendors</h2><p class="caption">Outside vendors paid the most so far. County offices and person names are left out.</p><ol class="home-list">${vendorItems}</ol></section>`
    : "";
  const sources = [
    highlights.adoptedCents > 0
      ? `Commissioners adopted ${moneyExact(highlights.adoptedCents)} on September 28, 2026. <a href="${FY2027_ADOPTED_URL}">Final budget resolution</a>.`
      : "",
    highlights.spentCents != null
      ? `Spent figures come from the Clerk's FY2027 account detail${asOf ? `, through ${asOf}` : ""}. Money moved between county funds is left out.`
      : "",
  ].filter(Boolean).join(" ");
  const sourceBlock = sources ? `<section class="door-section" id="sources"><h2>Sources</h2><p class="caption">${sources}</p></section>` : "";
  return document({
    title: "See how Walton County spends your tax dollars",
    description: HOME_DESCRIPTION,
    path: "/",
    index: true,
    footerRequest: false,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: canonicalUrl("/"),
      description: HOME_DESCRIPTION,
    },
    body: `<section class="door-hero" id="content"><div class="door-wrap">
<p class="eyebrow">Walton County, Florida · FY2027</p>
<h1>See how Walton County spends your tax dollars</h1>
<p class="explainer">This site uses public records from the Walton County Clerk and Comptroller to show the budget the county adopted and the money it has paid out.</p>
<p class="door-actions"><a class="btn gold" href="/walton">Explore the Walton County budget</a></p>
</div></section>
<main><div class="door-wrap">
${adopted || spent ? `<section class="door-section" id="figures"><h2>At a glance</h2><div class="see-grid">${adopted}${spent}</div></section>` : ""}
${funds}
${vendors}
<section class="door-section" id="staff">
<h2>Staff and payroll</h2>
<p class="caption">Budgeted positions and personal services from FY2020 to FY2027. This page is open to everyone. No site password.</p>
<a class="info-card staff-entry" href="/walton/staff">
<p class="eyebrow">No password</p>
<p class="staff-entry-title">County staffing and payroll</p>
<p>See budgeted FTE and personal services for the whole county, the Sheriff, and each department.</p>
</a>
<p class="door-actions"><a class="btn gold" href="/walton/staff">View staff and payroll</a></p>
</section>
<section class="door-section" id="explore">
<h2>Explore the records</h2>
<p class="caption">The dashboard is built from the same public records. A site password is required.</p>
<ul class="home-links">
<li><a href="/walton">Overview</a></li>
<li><a href="/walton/vendors">Vendors</a></li>
<li><a href="/walton/revenue">Revenue</a></li>
<li><a href="/walton/search">Payments</a></li>
<li><a href="/walton/reserves">Savings</a></li>
</ul>
</section>
<section class="door-section" id="trust">
<h2>Built from public records</h2>
<p class="caption">Walton County figures come from public records provided by the Walton County Clerk and Comptroller.</p>
</section>
${sourceBlock}
</div></main>`,
  });
}

export function renderAboutSite(): string {
  const title = "About this site";
  const description = "A site that shows the Walton County, Florida budget from public records.";
  return document({
    title,
    description,
    path: "/about-this-site",
    index: true,
    jsonLd: webPage(title, description, "/about-this-site"),
    body: `<section class="door-hero" id="content"><div class="door-wrap">
<p class="eyebrow">About</p>
<h1>About this site</h1>
<p class="explainer">How They Spend My Taxes shows a county budget in plain words.</p>
</div></section>
<main><div class="door-wrap">
<section class="door-section">
<h2>What is live</h2>
<p class="body-copy">How They Spend My Taxes shows the Walton County, Florida budget in FY2027. The Walton County pages use public records provided by the Walton County Clerk and Comptroller. A site password is required before the full dashboard is shown.</p>
</section>
<section class="door-section">
<h2>What you can see</h2>
<p class="caption">The budget next to spending, where the money comes from, savings held in reserve, and a search of payments.</p>
<p><a class="btn gold" href="/walton">Explore the Walton County budget</a></p>
</section>
<section class="door-section">
<h2>A problem or an idea</h2>
<p class="caption">Use the link in the footer. This site does not show an email address.</p>
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
<p class="caption">You can return to the start.</p>
<div class="door-actions"><a class="btn gold" href="/">Back to the start</a></div>
</div></section>`,
  });
}

function reportHref(path: string): string {
  return `/report?from=${encodeURIComponent(path || "/")}`;
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

function publicActive(path: string): string {
  if (path === "/walton") return "walton";
  if (path === "/") return "home";
  return "";
}

function document(opts: PublicDoc): string {
  const robots = opts.index ? "index, follow" : "noindex, nofollow";
  const canonical = opts.canonical === false ? "" : canonicalUrl(opts.path);
  const json = opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd).replace(/</g, "\\u003c")}</script>` : "";
  const fullTitle = `${opts.title} | ${SITE_NAME}`;
  const canonicalLink = canonical ? `<link rel="canonical" href="${esc(canonical)}">` : "";
  const ogUrl = canonical ? `<meta property="og:url" content="${esc(canonical)}">` : "";
  const chrome = {
    mode: "public" as const,
    active: publicActive(opts.path),
    reportHref: reportHref(opts.path),
    showRequest: opts.footerRequest === true,
  };
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
${headAssets()}
${json}
</head>
<body class="door">
<a class="skip" href="#content">Skip to content</a>
${siteHeader(chrome)}
${opts.body}
${siteFooter(chrome)}
<script src="/assets/app.js" defer></script>
</body></html>`;
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

