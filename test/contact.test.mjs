import assert from "node:assert/strict";
import test from "node:test";
import { handleContact } from "../worker.js";

function post(body, headers = {}) {
  return new Request("https://whatshappeningnetwork.com/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const message = {
  name: "Ada",
  email: "ada@example.com",
  message: "Hello from the form.",
};

test("missing CONTACT_EMAIL does not pretend the message was sent", async () => {
  let called = false;
  const response = await handleContact(post(message), { RESEND_API_KEY: "re_test" }, async () => {
    called = true;
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.sent, false);
  assert.equal(body.error, "Your message could not be sent.");
  assert.equal(called, false);
});

test("missing RESEND_API_KEY does not pretend the message was sent", async () => {
  const response = await handleContact(post(message), { CONTACT_EMAIL: "inbox@example.com" }, async () => {
    throw new Error("should not send");
  });
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.sent, false);
  assert.equal(body.error, "Your message could not be sent.");
});

test("a delivered Resend message is reported as sent", async () => {
  let payload;
  const response = await handleContact(
    post(message),
    { CONTACT_EMAIL: "inbox@example.com", RESEND_API_KEY: "re_test" },
    async (_url, options) => {
      payload = JSON.parse(options.body);
      assert.equal(options.headers.authorization, "Bearer re_test");
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.sent, true);
  assert.deepEqual(payload.to, ["inbox@example.com"]);
  assert.equal(payload.reply_to, "ada@example.com");
  assert.equal(payload.from.includes("onboarding@resend.dev"), true);
});

test("a Resend rejection is not reported as sent", async () => {
  const response = await handleContact(
    post(message),
    { CONTACT_EMAIL: "inbox@example.com", RESEND_API_KEY: "re_test" },
    async () => new Response(JSON.stringify({ name: "validation_error" }), { status: 422 }),
  );
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.sent, false);
  assert.equal(body.error, "Your message could not be sent.");
});
