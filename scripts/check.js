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

if (/<form\b/i.test(html) || /<form\b/i.test(missing)) fail("Pages must not include a form");
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
if (homeImages.length !== 1) fail("The page HTML should only include the logo image");
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
for (const icon of ["favicon.png", "apple-touch-icon.png", "images/logo.png"]) {
  if (!existsSync(icon)) fail(`Missing ${icon}`);
}

console.log("Site check passed.");
