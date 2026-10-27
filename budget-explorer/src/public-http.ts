import { CSP } from "./headers";

export function applyPublicHeaders(headers: Headers, index: boolean): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Robots-Tag", index ? "index, follow" : "noindex, nofollow, noarchive");
}

export function publicHtml(body: string, status: number, index: boolean): Response {
  const headers = new Headers();
  applyPublicHeaders(headers, index);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", index ? "public, max-age=300" : "private, no-store");
  return new Response(body, { status, headers });
}

export function publicRedirect(location: string, status: 301 | 303 = 303): Response {
  const headers = new Headers();
  applyPublicHeaders(headers, false);
  headers.set("Location", location);
  headers.set("Cache-Control", "private, no-store");
  return new Response(null, { status, headers });
}

export function publicText(body: string, status = 404): Response {
  const headers = new Headers();
  applyPublicHeaders(headers, false);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  return new Response(body, { status, headers });
}
