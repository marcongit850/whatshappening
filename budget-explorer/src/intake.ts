import { FORM_COOKIE, csrfOk, formCookie, readCookie, sha256Hex } from "./auth";
import type { AppEnv } from "./env";
import { isTaxesHost } from "./host";
import { COUNTIES, type CountyPlace, type UsState } from "./places";
import { publicHtml, publicRedirect, publicText } from "./public-http";
import { renderCountyRequest, renderReportForm, renderThanks } from "./public-page";

export const INTAKE_HOUR_LIMIT = 5;
export const INTAKE_GLOBAL_HOUR_LIMIT = 200;
export const INTAKE_GLOBAL_DAY_LIMIT = 1_000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTY_NAME = /^[A-Za-z0-9][A-Za-z0-9 .'-]{1,70}$/;

export interface CountyFormSpec {
  action: string;
  state: UsState;
  county: CountyPlace | null;
}

export function safeFrom(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().slice(0, 300);
  if (!trimmed || trimmed.includes("@") || trimmed.includes("\\")) return "";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    const host = url.hostname.toLowerCase();
    const known =
      host === "howtheyspendmytaxes.com" ||
      host === "www.howtheyspendmytaxes.com" ||
      host === "budget.whatshappeningnetwork.com" ||
      host === "localhost" ||
      host.endsWith(".workers.dev");
    if (!known) return "";
    return `${url.pathname}${url.search}`.slice(0, 300);
  } catch {
    return "";
  }
}

export function slugifyCounty(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function field(form: FormData, name: string, max: number): string {
  const value = form.get(name);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function echo(value: string, max: number): string {
  const trimmed = value.trim().slice(0, max);
  if (trimmed.includes("@")) return "";
  return trimmed;
}

/** Accept a same-origin post. `Origin: null` is what browsers send under a no-referrer policy, and only with `Sec-Fetch-Site: same-origin`. */
export function originOk(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin === "null") return request.headers.get("sec-fetch-site") === "same-origin";
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

/** Compare a typed county with a live slug. Drops the word County, case, and punctuation. */
export function countyMatchKey(name: string): string {
  return name.toLowerCase().replace(/\bcounty\b/g, " ").replace(/[^a-z0-9]+/g, "");
}

function matchingLiveCounty(stateSlug: string, typed: string): CountyPlace | undefined {
  const key = countyMatchKey(typed);
  if (!key) return undefined;
  return COUNTIES.find((county) => county.live && county.stateSlug === stateSlug && (county.slug === key || countyMatchKey(county.name) === key));
}

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function withCookie(response: Response, value: string): Response {
  response.headers.append("Set-Cookie", formCookie(value));
  return response;
}

/**
 * Public forms trust only CF-Connecting-IP, which Cloudflare sets.
 * There is no X-Forwarded-For fallback and no stand-in address.
 * Tests inject this header. A missing or unusable value is a 503.
 */
export function readConnectingIp(request: Request): string | null {
  const value = request.headers.get("cf-connecting-ip");
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || /[\u0000-\u001F\u007F,\s]/.test(trimmed)) return null;
  return trimmed;
}

function canonicalIPv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n > 255) return null;
    nums.push(n);
  }
  return nums.join(".");
}

/** Eight 16-bit groups, or null when the text is not an IPv6 address. */
function parseIPv6(value: string): number[] | null {
  let input = value;
  const lastColon = input.lastIndexOf(":");
  if (lastColon >= 0 && input.slice(lastColon + 1).includes(".")) {
    const v4 = canonicalIPv4(input.slice(lastColon + 1));
    if (!v4) return null;
    const [a, b, c, d] = v4.split(".").map(Number);
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    input = `${input.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 2 && missing === 0)) return null;
  const groups = [...head, ...Array.from({ length: Math.max(missing, 0) }, () => "0"), ...tail];
  if (groups.length !== 8) return null;
  const nums: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    nums.push(Number.parseInt(group, 16));
  }
  return nums;
}

function ipv4FromMapped(groups: number[]): string | null {
  const mapped = groups.slice(0, 5).every((part) => part === 0) && groups[5] === 0xffff;
  if (!mapped) return null;
  const hi = groups[6];
  const lo = groups[7];
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Full IPv4 address, or the IPv6 /64 prefix. Null when the text is not an IP address. */
export function intakeNetworkKey(ip: string): string | null {
  const trimmed = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!trimmed || trimmed.length > 80 || /[\s%]/.test(trimmed)) return null;
  if (!trimmed.includes(":")) {
    const v4 = canonicalIPv4(trimmed);
    return v4 ? `4:${v4}` : null;
  }
  const groups = parseIPv6(trimmed);
  if (!groups) return null;
  const mapped = ipv4FromMapped(groups);
  if (mapped) return `4:${mapped}`;
  return `6:${groups.slice(0, 4).map((part) => part.toString(16)).join(":")}`;
}

async function recentCount(db: D1Database, table: "county_requests" | "data_reports", hash: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ip_hash = ? AND created_at >= ?`)
    .bind(hash, since)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

async function countFormsSince(db: D1Database, since: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM county_requests WHERE created_at >= ?) +
         (SELECT COUNT(*) FROM data_reports WHERE created_at >= ?) AS n`,
    )
    .bind(since, since)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

async function globalCapHit(db: D1Database): Promise<boolean> {
  const now = Date.now();
  const hour = await countFormsSince(db, new Date(now - HOUR_MS).toISOString());
  if (hour >= INTAKE_GLOBAL_HOUR_LIMIT) return true;
  const day = await countFormsSince(db, new Date(now - DAY_MS).toISOString());
  return day >= INTAKE_GLOBAL_DAY_LIMIT;
}

function holdPage(opts: { title: string; message: string; path: string; backHref: string; backLabel: string }): Response {
  return publicHtml(
    renderThanks({
      title: opts.title,
      message: opts.message,
      path: opts.path,
      backHref: opts.backHref,
      backLabel: opts.backLabel,
      eyebrow: "Please wait",
      closeNote: null,
    }),
    503,
    false,
  );
}

type SubmissionPage = { path: string; backHref: string; backLabel: string };

function requireNetwork(request: Request, page: SubmissionPage): { ok: true; key: string } | { ok: false; response: Response } {
  const key = intakeNetworkKey(readConnectingIp(request) || "");
  if (!key) {
    return {
      ok: false,
      response: holdPage({
        title: "Form unavailable",
        message: "This form is not available right now. Please try again later.",
        ...page,
      }),
    };
  }
  return { ok: true, key };
}

async function allowSubmission(
  env: AppEnv,
  kind: "county" | "report",
  table: "county_requests" | "data_reports",
  key: string,
  page: SubmissionPage,
  tooMany: () => Response,
): Promise<{ ok: true; hash: string } | { ok: false; response: Response }> {
  if (!env.SESSION_SECRET) {
    return {
      ok: false,
      response: publicHtml(
        renderThanks({
          title: "Form unavailable",
          message: "This form is not available right now.",
          path: page.path,
          backHref: page.backHref,
          backLabel: page.backLabel,
          eyebrow: "Please wait",
          closeNote: null,
        }),
        500,
        false,
      ),
    };
  }
  const hash = await sha256Hex(`${env.SESSION_SECRET}:${kind}:${key}`);
  if (await globalCapHit(env.DB)) {
    return {
      ok: false,
      response: holdPage({
        title: "Please try again later",
        message: "We have had a lot of notes in a short time. Please wait and send yours again later.",
        ...page,
      }),
    };
  }
  if ((await recentCount(env.DB, table, hash)) >= INTAKE_HOUR_LIMIT) return { ok: false, response: tooMany() };
  return { ok: true, hash };
}

function tooLarge(request: Request): boolean {
  const length = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(length) && length > 20_000;
}

export async function handleCountyForm(request: Request, env: AppEnv, spec: CountyFormSpec): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" || request.method === "HEAD") {
    if (url.searchParams.get("thanks") === "1") {
      return publicHtml(
        renderThanks({
          title: "Request received",
          message: "Thank you. We saved your request. This page does not send email.",
          path: spec.action,
          backHref: spec.state.slug === "florida" ? "/florida" : `/states/${spec.state.slug}`,
          backLabel: `Back to ${spec.state.name}`,
        }),
        200,
        false,
      );
    }
    const formToken = newToken();
    return withCookie(publicHtml(renderCountyRequest({ ...spec, token: formToken, error: "", name: "", note: "", countyName: "" }), 200, false), formToken);
  }
  if (request.method !== "POST") return publicText("Not found");
  if (tooLarge(request)) return publicText("That form is too large.", 413);
  if (!env.SESSION_SECRET) return publicHtml(renderThanks({ title: "Form unavailable", message: "This form is not available right now.", path: spec.action, backHref: "/", backLabel: "Back to the start" }), 500, false);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return publicText("That form could not be read.", 400);
  }
  if (field(form, "company_website", 200)) {
    return publicRedirect(`${spec.action}?thanks=1`);
  }
  if (!originOk(request)) {
    return countyError(spec, "That form could not be sent from this page.", "", "", "", 403);
  }
  const provided = field(form, "form_token", 80);
  const expected = readCookie(request.headers.get("cookie") || undefined, FORM_COOKIE);
  if (!(await csrfOk(expected, provided))) {
    return countyError(spec, "That form expired. Reload the page and try again.", "", "", "", 400);
  }
  const page = { path: spec.action, backHref: spec.action, backLabel: "Back to the form" };
  const network = requireNetwork(request, page);
  if (!network.ok) return network.response;

  const name = field(form, "name", 80);
  const email = field(form, "email", 120);
  const note = field(form, "note", 1000);
  const typedCounty = field(form, "county_name", 80);
  if (!name || name.includes("@") || !EMAIL.test(email) || email.length > 120) {
    return countyError(spec, "Enter your name and a real email address.", echo(name, 80), echo(note, 1000), echo(typedCounty, 80), 400);
  }

  let countyName = spec.county?.name || "";
  let countySlug = spec.county?.slug || "";
  if (!spec.county) {
    if (!COUNTY_NAME.test(typedCounty)) {
      return countyError(spec, "Enter the county name.", echo(name, 80), echo(note, 1000), echo(typedCounty, 80), 400);
    }
    countyName = typedCounty;
    countySlug = slugifyCounty(typedCounty);
    if (!countySlug) return countyError(spec, "Enter the county name.", echo(name, 80), echo(note, 1000), echo(typedCounty, 80), 400);
    const existing = matchingLiveCounty(spec.state.slug, typedCounty);
    if (existing?.href) {
      return publicHtml(
        renderThanks({
          title: `${existing.name} is already live`,
          message: `${existing.name} is already live, open it.`,
          path: spec.action,
          backHref: existing.href,
          backLabel: `Open ${existing.name}`,
          eyebrow: "Already live",
          closeNote: null,
        }),
        200,
        false,
      );
    }
  }

  try {
    const gate = await allowSubmission(env, "county", "county_requests", network.key, page, () =>
      countyError(spec, "Too many requests from this network. Please wait an hour and try again.", echo(name, 80), echo(note, 1000), echo(typedCounty, 80), 429),
    );
    if (!gate.ok) return gate.response;
    const hash = gate.hash;
    await env.DB.prepare(
      `INSERT INTO county_requests (created_at, state_name, state_slug, county_name, county_slug, requester_name, requester_email, note, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(new Date().toISOString(), spec.state.name, spec.state.slug, countyName, countySlug, name, email, note, hash)
      .run();
  } catch {
    return countyError(spec, "We could not save that yet. Please try again later.", echo(name, 80), echo(note, 1000), echo(typedCounty, 80), 503);
  }
  return publicRedirect(`${spec.action}?thanks=1`);
}

function countyError(spec: CountyFormSpec, error: string, name: string, note: string, countyName: string, status: number): Response {
  const formToken = newToken();
  return withCookie(
    publicHtml(renderCountyRequest({ ...spec, token: formToken, error, name, note, countyName }), status, false),
    formToken,
  );
}

function preferredCounty(from: string, taxes: boolean): string {
  if (from === "/walton" || from.startsWith("/walton/") || from.startsWith("/walton?")) return "walton";
  if (!taxes) return "walton";
  return "";
}

export async function handleReport(request: Request, env: AppEnv, action: string): Promise<Response> {
  const url = new URL(request.url);
  const taxes = isTaxesHost(url.hostname);
  if (request.method === "GET" || request.method === "HEAD") {
    const thanks = url.searchParams.get("thanks");
    if (thanks === "problem" || thanks === "idea") {
      const message = thanks === "idea" ? "Thank you. We saved your idea. This page does not send email." : "Thank you. We saved your note. This page does not send email.";
      return publicHtml(
        renderThanks({
          title: "Note received",
          message,
          path: action,
          backHref: taxes ? "/" : "/",
          backLabel: taxes ? "Back to the start" : "Back to the start",
        }),
        200,
        false,
      );
    }
    const from = safeFrom(url.searchParams.get("from") || "");
    const formToken = newToken();
    return withCookie(
      publicHtml(
        renderReportForm({
          token: formToken,
          action,
          error: "",
          kind: "problem",
          pageRef: from,
          correction: "",
          idea: "",
          source: "",
          name: "",
          county: preferredCounty(from, taxes),
        }),
        200,
        false,
      ),
      formToken,
    );
  }
  if (request.method !== "POST") return publicText("Not found");
  if (tooLarge(request)) return publicText("That form is too large.", 413);
  if (!env.SESSION_SECRET) {
    return publicHtml(renderThanks({ title: "Form unavailable", message: "This form is not available right now.", path: action, backHref: "/", backLabel: "Back to the start" }), 500, false);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return publicText("That form could not be read.", 400);
  }
  if (field(form, "company_website", 200)) return publicRedirect(`${action}?thanks=problem`);

  const kindRaw = field(form, "kind", 20);
  const kind = kindRaw === "idea" ? "idea" : kindRaw === "problem" ? "problem" : "";
  const pageRef = field(form, "page_ref", 300);
  const correction = field(form, "correction", 2000);
  const idea = field(form, "idea", 2000);
  const source = field(form, "source", 300);
  const name = field(form, "name", 80);
  const email = field(form, "email", 120);
  const countySlug = field(form, "county", 80);
  const posted = { kind: kind === "idea" ? "idea" : "problem", pageRef, correction, idea, source, name, county: countySlug } as const;

  if (!originOk(request)) return reportError(action, "That form could not be sent from this page.", posted, 403);
  const provided = field(form, "form_token", 80);
  const expected = readCookie(request.headers.get("cookie") || undefined, FORM_COOKIE);
  if (!(await csrfOk(expected, provided))) return reportError(action, "That form expired. Reload the page and try again.", posted, 400);
  const page = { path: action, backHref: action, backLabel: "Back to the form" };
  const network = requireNetwork(request, page);
  if (!network.ok) return network.response;
  if (!kind) return reportError(action, "Choose what this is about.", posted, 400);
  if (email && !EMAIL.test(email)) return reportError(action, "The email address does not look complete. You can leave it blank.", posted, 400);

  const county = reportCountyName(countySlug);
  if (!county) return reportError(action, "Choose a county.", posted, 400);
  if (kind === "problem" && (pageRef.length < 2 || correction.length < 2)) {
    return reportError(action, "Say what page or number looks wrong, and what you think is correct.", posted, 400);
  }
  if (kind === "idea" && idea.length < 2) return reportError(action, "Write your idea. You do not need to name a page.", posted, 400);

  const subject = kind === "idea" ? idea : pageRef;
  const fix = kind === "idea" ? "" : correction;
  try {
    const gate = await allowSubmission(env, "report", "data_reports", network.key, page, () =>
      reportError(action, "Too many notes from this network. Please wait an hour and try again.", posted, 429),
    );
    if (!gate.ok) return gate.response;
    const hash = gate.hash;
    await env.DB.prepare(
      `INSERT INTO data_reports (created_at, kind, county_name, subject, correction, source_note, requester_name, requester_email, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(new Date().toISOString(), kind, county, subject, fix, source, name, email, hash)
      .run();
  } catch {
    return reportError(action, "We could not save that yet. Please try again later.", posted, 503);
  }
  return publicRedirect(`${action}?thanks=${kind}`);
}

function reportCountyName(slug: string): string {
  if (slug === "not-sure") return "Not sure";
  return COUNTIES.find((county) => county.slug === slug)?.name || "";
}

function reportError(
  action: string,
  error: string,
  posted: { kind: "problem" | "idea"; pageRef: string; correction: string; idea: string; source: string; name: string; county: string },
  status: number,
): Response {
  const formToken = newToken();
  return withCookie(
    publicHtml(
      renderReportForm({
        token: formToken,
        action,
        error,
        kind: posted.kind,
        pageRef: echo(posted.pageRef, 300),
        correction: echo(posted.correction, 2000),
        idea: echo(posted.idea, 2000),
        source: echo(posted.source, 300),
        name: echo(posted.name, 80),
        county: posted.county,
      }),
      status,
      false,
    ),
    formToken,
  );
}
