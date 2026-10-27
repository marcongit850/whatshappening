const textEncoder = new TextEncoder();

export const SESSION_COOKIE = "be_session";
export const FORM_COOKIE = "be_form";
export const SESSION_DAYS = 30;
export const LOGIN_LIMIT = 8;
export const LOGIN_WINDOW_SEC = 15 * 60;
export const QA_HOUR_LIMIT = 12;
export const QA_DAY_LIMIT = 40;
export const QA_MAX_CHARS = 500;

export interface SessionPayload {
  exp: number;
  sid: string;
  csrf: string;
  admin: boolean;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compare two strings without leaking which one is longer through an early return. */
export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(`v:${left.length}:${left}`)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(`v:${right.length}:${right}`)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return bytesToB64Url(new Uint8Array(sig));
}

export async function signSession(secret: string, payload: SessionPayload): Promise<string> {
  const body = bytesToB64Url(textEncoder.encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function readSession(secret: string, token: string | undefined | null): Promise<SessionPayload | null> {
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmac(secret, body);
  if (!(await constantTimeEqual(sig, expected))) return null;
  try {
    const json = new TextDecoder().decode(b64UrlToBytes(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.exp || !payload.sid || !payload.csrf) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newSession(admin: boolean): SessionPayload {
  const sid = crypto.randomUUID();
  const csrf = crypto.randomUUID().replace(/-/g, "");
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  return { exp, sid, csrf, admin };
}

export function sessionCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function formCookie(token: string): string {
  return `${FORM_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`;
}

export function readCookie(header: string | undefined, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return rest.join("=");
  }
  return "";
}

export async function passwordsMatch(provided: string, expected: string | undefined): Promise<boolean> {
  if (!expected) return false;
  return constantTimeEqual(provided, expected);
}

export function throttleDecision(attemptsAlready: number, limit = LOGIN_LIMIT): { allowed: boolean } {
  return { allowed: attemptsAlready < limit };
}

export function rateDecision(
  hourHits: number,
  dayHits: number,
  hourCap = QA_HOUR_LIMIT,
  dayCap = QA_DAY_LIMIT,
): { allowed: boolean; reason: "" | "hour" | "day" } {
  if (hourHits >= hourCap) return { allowed: false, reason: "hour" };
  if (dayHits >= dayCap) return { allowed: false, reason: "day" };
  return { allowed: true, reason: "" };
}

export async function csrfOk(expected: string, provided: string): Promise<boolean> {
  if (!expected || !provided) return false;
  return constantTimeEqual(expected, provided);
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

export function hourBucket(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  return `h:${y}${m}${d}${h}`;
}

export function dayBucket(now = new Date()): string {
  return `d:${hourBucket(now).slice(2, 10)}`;
}
