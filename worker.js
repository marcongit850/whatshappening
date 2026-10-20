// POST /api/contact
// The destination inbox is CONTACT_EMAIL, a Worker secret.
// Delivery uses the Resend HTTP API with RESEND_API_KEY.
// Neither value belongs in this repo.
// FROM is Resend's free onboarding sender, the same sender used by the other Workers.
// It can deliver only to the Resend account address until a domain is verified.
// If CONTACT_EMAIL or RESEND_API_KEY is missing, the response says the message could not be sent.

const MAX_BODY = 20000;
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;
const RESEND_URL = "https://api.resend.com/emails";
const FROM = "What's Happening <onboarding@resend.dev>";
const NOT_SENT = "Your message could not be sent.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recentHits = new Map();

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(body, status) {
  const heading = body.ok ? "Message sent" : "Message not sent";
  const text = body.ok ? "Your message was sent." : body.error || NOT_SENT;
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(heading)} | whatshappeningnetwork.com</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(text)}</p>
    <p><a href="/#contact">Back to Contact Us</a></p>
  </main>
</body>
</html>`;
  return new Response(page, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const stamps = (recentHits.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  if (stamps.length >= MAX_PER_WINDOW) {
    recentHits.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  recentHits.set(ip, stamps);
  return false;
}

function singleLine(value) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function resendApiKey(env) {
  const key = typeof env.RESEND_API_KEY === "string" ? env.RESEND_API_KEY.trim() : "";
  if (!key || /\s/.test(key)) return "";
  return key;
}

function contactEmail(env) {
  const to = typeof env.CONTACT_EMAIL === "string" ? env.CONTACT_EMAIL.trim() : "";
  if (!to || !EMAIL_RE.test(to)) return "";
  return to;
}

export function parseContact(data) {
  if (!data || typeof data !== "object") return { error: "Could not read that message." };
  if (singleLine(data.website)) return { error: NOT_SENT };
  const name = singleLine(data.name);
  const email = singleLine(data.email);
  const message = String(data.message ?? "").replace(/\u0000/g, "").trim();
  if (!name) return { error: "Enter your name." };
  if (name.length > 200) return { error: "That name is too long." };
  if (!EMAIL_RE.test(email) || email.length > 200) return { error: "Enter a valid email." };
  if (!message) return { error: "Enter a message." };
  if (message.length > 5000) return { error: "That message is too long." };
  return { value: { name, email, message } };
}

export async function handleContact(request, env = {}, fetchImpl = fetch) {
  const accept = (request.headers.get("accept") || "").toLowerCase();
  const type = (request.headers.get("content-type") || "").toLowerCase();
  const asJson = type.includes("application/json") || accept.includes("application/json");
  const reply = (body, status) => (asJson ? json(body, status) : html(body, status));

  if (request.method !== "POST") {
    return reply({ ok: false, error: "Use the contact form to send a message." }, 405);
  }

  const lengthHeader = Number(request.headers.get("content-length") || 0);
  if (lengthHeader > MAX_BODY) {
    return reply({ ok: false, error: "That message is too long." }, 413);
  }

  if (rateLimited(clientIp(request))) {
    return reply({ ok: false, error: "Please wait a minute and try again." }, 429);
  }

  const isJson = type.includes("application/json");
  const isForm = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
  let data;
  try {
    if (isJson) data = await request.json();
    else if (isForm) data = Object.fromEntries(await request.formData());
    else return reply({ ok: false, error: "Could not read that message." }, 415);
  } catch {
    return reply({ ok: false, error: "Could not read that message." }, 400);
  }

  const parsed = parseContact(data);
  if (parsed.error) return reply({ ok: false, error: parsed.error }, 400);

  const to = contactEmail(env);
  const apiKey = resendApiKey(env);
  if (!to || !apiKey) {
    return reply({ ok: false, sent: false, error: NOT_SENT }, 503);
  }

  const { name, email, message } = parsed.value;
  let upstream;
  try {
    upstream = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: email,
        subject: `What's Happening contact from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      }),
    });
  } catch {
    return reply({ ok: false, sent: false, error: NOT_SENT }, 502);
  }

  let result = null;
  try {
    result = await upstream.json();
  } catch {
    result = null;
  }

  const delivered = upstream.ok && result && typeof result.id === "string" && result.id.trim().length > 0;
  if (!delivered) {
    return reply({ ok: false, sent: false, error: NOT_SENT }, 502);
  }

  return reply({ ok: true, sent: true }, 200);
}

function isContactPath(pathname) {
  return pathname === "/api/contact" || pathname === "/api/contact/";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isContactPath(url.pathname)) return handleContact(request, env);
    if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
