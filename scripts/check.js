import { existsSync, readFileSync } from "node:fs";

const copyFiles = [
  "index.html",
  "404.html",
  "styles.css",
  "robots.txt",
  "_headers",
  "wrangler.jsonc",
  "worker.js",
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
const worker = readFileSync("worker.js", "utf8");

if (!html.includes("<title>whatshappeningnetwork.com</title>")) {
  fail("Home title must be whatshappeningnetwork.com");
}
if (!html.includes('content="Sandbox, new project coming soon."')) {
  fail("Home page needs the sandbox meta description");
}
if (!html.includes(">whatshappeningnetwork.com</p>")) fail("Home page needs the domain line");
if (!html.includes("<h1>Sandbox, new project coming soon.</h1>")) fail("Home page needs the sandbox heading");
if (!html.includes('href="styles.css"')) fail("Home page must link styles.css");
if (/<form\b/i.test(html) || /<form\b/i.test(missing)) fail("Placeholder pages must not include a form");
if (worker.includes("/api/contact") || worker.includes("handleContact") || worker.includes("RESEND")) {
  fail("Worker must not expose the contact API");
}
if (!/"name": "whatshappening"/.test(wrangler)) fail("Worker name must be whatshappening");
if (!/"previews"\s*:\s*\{\s*\}/.test(wrangler)) fail("wrangler.jsonc must include an empty previews object");
if (/"pattern"\s*:/.test(wrangler) || /custom_domain/i.test(wrangler) || /routes/i.test(wrangler)) {
  fail("Do not configure a custom domain in wrangler.jsonc");
}
if (!wrangler.includes('"/dash"') || !wrangler.includes('"/dash/*"')) fail("wrangler.jsonc must keep /dash routing");
if (!missing.includes("<h1>Page not found.</h1>")) fail("404 page needs a simple not-found heading");

for (const path of ["images", "photos", "videos", "data", "contact.js", "team.js", "sitemap.xml"]) {
  if (existsSync(path)) fail(`Remove old site path: ${path}`);
}

console.log("Site check passed.");
