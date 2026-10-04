import { existsSync, readFileSync } from "node:fs";

const copyFiles = [
  "index.html",
  "404.html",
  "README.md",
  "styles.css",
  "robots.txt",
  "_headers",
  "wrangler.jsonc",
  "team.js",
  "contact.js",
  "worker.js",
  "data/team.json",
  "sitemap.xml",
  "robots.txt",
];

const dash = /[\u2013\u2014]|&mdash;|&ndash;|&#8211;|&#8212;|&#x2013;|&#x2014;/i;

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const file of copyFiles) {
  if (!existsSync(file)) fail(`Missing ${file}`);
  const text = readFileSync(file, "utf8");
  if (dash.test(text)) fail(`${file} contains an en dash or em dash`);
}

const html = readFileSync("index.html", "utf8");
const missing = readFileSync("404.html", "utf8");
const wrangler = readFileSync("wrangler.jsonc", "utf8");
const css = readFileSync("styles.css", "utf8");
const renderer = readFileSync("team.js", "utf8");

if (!/<form\b[^>]*action="\/api\/contact"/i.test(html)) fail("Home page needs the contact form");
if (/<form\b/i.test(missing)) fail("404 page must not include a form");
if (/avatar|portrait|headshot|placeholder|unsplash|pravatar|thispersondoesnotexist|randomuser|gravatar/i.test(html)) {
  fail("Home page must not use portrait placeholders");
}
if (/url\s*\(/i.test(css)) fail("Styles must not load image placeholders");

const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);
for (const href of ["https://eatingon30a.com/", "https://eatingindestin.com/"]) {
  const tags = anchors.filter((tag) => tag.includes(`href="${href}"`));
  if (tags.length !== 1) fail(`${href} should appear once as a link`);
  if (!/target="_blank"/i.test(tags[0])) fail(`${href} must open in a new tab`);
  if (!/rel="noopener noreferrer"/i.test(tags[0])) fail(`${href} must set rel="noopener noreferrer"`);
}

for (const id of ["work", "projects", "team", "team-list"]) {
  if (!html.includes(`id="${id}"`)) fail(`Missing #${id}`);
}
if (!/<h1\b/i.test(html)) fail("Missing h1");
if (!html.includes('src="/team.js"')) fail("Home page must load team.js");
if (!html.includes('src="/images/logo.png"')) fail("Header must use the logo file");
if (!renderer.includes('fetch("/data/team.json")')) fail("team.js must read data/team.json");
if (!renderer.includes("createElement")) fail("team.js must render the list");

const people = JSON.parse(readFileSync("data/team.json", "utf8"));
if (!Array.isArray(people)) fail("data/team.json must be a list");
for (const person of people) {
  for (const field of ["name", "title", "bio", "photo"]) {
    if (!person || typeof person[field] !== "string" || !person[field].trim()) {
      fail(`Each person needs a ${field}`);
    }
  }
  if (html.includes(person.name)) fail(`${person.name} is hard-coded in the page HTML`);
  if (renderer.includes(person.name)) fail(`${person.name} is hard-coded in team.js`);
  const photo = person.photo.replace(/^\/+/, "");
  if (photo.includes("..") || !photo.startsWith("photos/")) fail(`Photo path must stay in photos/: ${person.photo}`);
  if (!existsSync(photo)) fail(`Missing ${photo}`);
}

const homeImages = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
for (const src of [
  'src="/images/logo.png"',
  'src="/images/look-back.png"',
  'src="/images/eating-on-30a.png"',
  'src="/images/eating-in-destin.png"',
]) {
  if (!homeImages.some((tag) => tag.includes(src))) fail(`Missing image ${src}`);
}
if (homeImages.length !== 4) fail("Home page images should be the logo, the look-back collage, and the two project logos");
const videoTag = html.match(/<video\b[^>]*>/i);
if (!videoTag) fail("Missing hero video");
if (!/controls/i.test(videoTag[0])) fail("Hero video needs play controls");
if (/autoplay/i.test(videoTag[0])) fail("Hero video must not autoplay");
if (!html.includes('poster="/images/whatshappening-hero-poster.jpg"')) fail("Missing hero poster");
if (!html.includes('src="/videos/whatshappening-hero.mp4"')) fail("Missing hero video file");
if (html.includes(">Stop</button>") || html.includes("hero-video-stop")) fail("Hero video should not have a stop button");
if (!html.includes("A Look Back at What We Built")) fail("Missing look-back heading");
if (!html.includes("Collage of magazines, maps, and branded promotional products")) {
  fail("Look-back image needs alt text");
}
if (!html.includes("<h2 id=\"team-title\">Meet the Team</h2>")) fail("Team heading must be Meet the Team");
if (!html.includes(">Contact Us</a>")) fail("Footer must link Contact Us");
if (!html.includes('href="/#contact"')) fail("Contact Us must link to the contact section");
for (const [name, source] of [["index.html", html], ["404.html", missing]]) {
  const start = source.indexOf("<footer");
  const footer = start === -1 ? "" : source.slice(start);
  if (!footer.includes("whatshappeningnetwork.com")) fail(`${name} footer must keep the domain`);
  if (!footer.includes(">Contact Us</a>")) fail(`${name} footer must keep Contact Us`);
  if (footer.includes("What's Happening")) fail(`${name} footer must not include the company name`);
}
if (!css.includes(".project-card") || !/\.project-card\s*\{[^}]*background:\s*#fff/s.test(css)) {
  fail("Project logos must sit on a white background");
}
if (!/\.project-logo\s*\{[^}]*background:\s*#fff/s.test(css)) fail("Project logo images must use a white background");
if (!/\.project-card\s*\{[^}]*width:\s*50%/s.test(css)) fail("Project logos must be about half the previous size");
if (html.includes("across the country") || missing.includes("across the country")) {
  fail("Remove the old footer sentence");
}
if (!html.includes("Marketing, media, and brand development")) fail("Missing hero line");
if (!html.includes("What We Do")) fail("Missing What We Do");
if (!html.includes("Built on decades of experience")) fail("Missing background heading");
if (!html.includes("Our work includes:")) fail("Missing What We Build intro");
const worker = readFileSync("worker.js", "utf8");
if (!worker.includes("env.RESEND_API_KEY")) fail("Worker must read RESEND_API_KEY");
if (!worker.includes("env.CONTACT_EMAIL")) fail("Worker must read CONTACT_EMAIL");
if (!worker.includes("Your message could not be sent.")) fail("Missing not-sent message");
const emails = worker.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
if (emails.some((address) => address.toLowerCase() !== "onboarding@resend.dev")) {
  fail(`Worker has an unexpected email address: ${emails.join(", ")}`);
}
const favicon = readFileSync("favicon.png");
const touch = readFileSync("apple-touch-icon.png");
if (!favicon.equals(touch)) fail("Favicon and apple touch icon must be the same image");
const banned = [
  "marc",
  "douglass",
  "phil",
  "lindsay",
  "jennifer",
  "deanna",
  "gainesville",
  "sterling",
  "halo",
  "award",
  "founded",
  "headquarters",
  "testimonial",
  "since 19",
  "since 20",
];
const visible = `${html}\n${missing}`.toLowerCase();
for (const word of banned) {
  if (visible.includes(word)) fail(`Unexpected claim or contact detail: ${word}`);
}
if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(`${visible}\n${JSON.stringify(people)}`)) {
  fail("Unexpected email");
}
if (/\b\d{3}[-.)\s]\d{3}[-.\s]\d{4}\b/.test(visible)) fail("Unexpected phone number");

if (!/"name": "whatshappening"/.test(wrangler)) fail("Worker name must be whatshappening");
if (!/"previews"\s*:\s*\{\s*\}/.test(wrangler)) fail("wrangler.jsonc must include an empty previews object");
if (/"pattern"\s*:/.test(wrangler) || /custom_domain/i.test(wrangler) || /routes/i.test(wrangler)) {
  fail("Do not configure a custom domain in wrangler.jsonc");
}
if (!html.includes('<link rel="canonical" href="https://whatshappeningnetwork.com/">')) {
  fail("Home page needs the public canonical URL");
}
if (!html.includes("<title>What's Happening | whatshappeningnetwork.com</title>")) {
  fail("Home title must use the public site name");
}
if (!html.includes('property="og:url" content="https://whatshappeningnetwork.com/"')) fail("Home og:url");
if (!html.includes('property="og:site_name" content="whatshappeningnetwork.com"')) fail("Home og:site_name");
if (!html.includes('href="https://whatshappeningnetwork.com/">whatshappeningnetwork.com</a>')) {
  fail("Footer must show the public site name");
}
if (!missing.includes('<link rel="canonical" href="https://whatshappeningnetwork.com/404.html">')) {
  fail("404 page needs the public canonical URL");
}
if (!missing.includes("<title>Page not found | whatshappeningnetwork.com</title>")) {
  fail("404 title must use the public site name");
}
const sitemap = readFileSync("sitemap.xml", "utf8");
if (!sitemap.includes("<loc>https://whatshappeningnetwork.com/</loc>")) fail("Sitemap loc");
if (!readFileSync("robots.txt", "utf8").includes("Sitemap: https://whatshappeningnetwork.com/sitemap.xml")) {
  fail("robots.txt sitemap");
}
if (!missing.includes('href="/"')) fail("404 page needs a link home");
if (!missing.includes('src="/images/logo.png"')) fail("404 header must use the logo file");
for (const icon of [
  "favicon.png",
  "apple-touch-icon.png",
  "images/logo.png",
  "images/eating-on-30a.png",
  "images/eating-in-destin.png",
]) {
  if (!existsSync(icon)) fail(`Missing ${icon}`);
}

console.log("Site check passed.");
