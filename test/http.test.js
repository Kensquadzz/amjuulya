import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOrigin, claimRequestId, rateLimit, readJsonBody, redact, releaseRequestId } from "../api/_lib/http.js";
import { mockReq, nextIp } from "./helpers.js";

test("redact removes API keys and bearer tokens from logs", () => {
  const out = redact("key sk-ant-api03-abcdefghijklmnop and Bearer abc.def.ghi and xi-api-key: 1234567890abcdef");
  assert.ok(!out.includes("sk-ant-api03"));
  assert.ok(!out.includes("abc.def.ghi"));
  assert.ok(!out.includes("1234567890abcdef"));
});

test("rate limit blocks after the limit within the window", async () => {
  const req = mockReq({ ip: nextIp() });
  for (let i = 0; i < 3; i++) await rateLimit(req, "t", 3, 60);
  await assert.rejects(rateLimit(req, "t", 3, 60), { status: 429, code: "rate_limited" });
  // өөр IP нөлөөлөхгүй
  await rateLimit(mockReq({ ip: nextIp() }), "t", 3, 60);
});

test("duplicate request ids are rejected until released", async () => {
  await claimRequestId("s", "dup-test-1");
  await assert.rejects(claimRequestId("s", "dup-test-1"), { status: 409, code: "duplicate" });
  await releaseRequestId("s", "dup-test-1");
  await claimRequestId("s", "dup-test-1");
});

test("origin check allows same-host and rejects foreign origins", () => {
  checkOrigin(mockReq({ headers: { origin: "http://localhost:3000" } }));
  checkOrigin(mockReq({}));
  assert.throws(() => checkOrigin(mockReq({ headers: { origin: "https://evil.example" } })), { status: 403 });
});

test("readJsonBody enforces size and JSON validity", async () => {
  assert.deepEqual(await readJsonBody(mockReq({ body: '{"a":1}' }), 100), { a: 1 });
  assert.deepEqual(await readJsonBody(mockReq({ body: { a: 2 } }), 100), { a: 2 });
  await assert.rejects(readJsonBody(mockReq({ body: "{bad" }), 100), { status: 400 });
  await assert.rejects(readJsonBody(mockReq({ body: "x".repeat(200) }), 100), { status: 413 });
  await assert.rejects(readJsonBody(mockReq({ body: "[1,2]" }), 100), { status: 400 });
});
