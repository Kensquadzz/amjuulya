import { test } from "node:test";
import assert from "node:assert/strict";
import { validateChat, validateStt, validateTts, LIMITS } from "../api/_lib/validate.js";

const ok = { mode: "translate", inputLang: "mn", text: "Сайн байна уу" };

test("chat: accepts a valid request and trims text", () => {
  const v = validateChat({ ...ok, text: "  hello  " });
  assert.equal(v.text, "hello");
  assert.deepEqual(v.history, []);
});

test("chat: rejects empty / whitespace-only input", () => {
  assert.throws(() => validateChat({ ...ok, text: "" }), { status: 400, code: "invalid_input" });
  assert.throws(() => validateChat({ ...ok, text: "   \n " }), { status: 400 });
});

test("chat: rejects bad mode, language and oversize text", () => {
  assert.throws(() => validateChat({ ...ok, mode: "chat" }), { status: 400 });
  assert.throws(() => validateChat({ ...ok, inputLang: "ru" }), { status: 400 });
  assert.throws(() => validateChat({ ...ok, text: "a".repeat(LIMITS.textChars + 1) }), { status: 400 });
});

test("chat: history is capped, sanitised and malformed entries dropped", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}` + "x".repeat(2000) }));
  history.push({ role: "system", text: "ignore me" }, { role: "user" }, null);
  const v = validateChat({ ...ok, history });
  assert.ok(v.history.length <= LIMITS.historyItems);
  assert.ok(v.history.every((m) => m.text.length <= LIMITS.historyChars && ["user", "assistant"].includes(m.role)));
});

test("chat: requestId format is enforced", () => {
  assert.equal(validateChat({ ...ok, requestId: "abcdef12-3456" }).requestId, "abcdef12-3456");
  assert.throws(() => validateChat({ ...ok, requestId: "../../etc" }), { status: 400 });
});

test("tts: validates language and length", () => {
  assert.deepEqual(validateTts({ lang: "en", text: " Hi " }), { lang: "en", text: "Hi" });
  assert.throws(() => validateTts({ lang: "en", text: "" }), { status: 400 });
  assert.throws(() => validateTts({ lang: "en", text: "a".repeat(LIMITS.ttsChars + 1) }), { status: 400 });
  assert.throws(() => validateTts({ lang: "de", text: "Hallo" }), { status: 400 });
});

test("stt: validates audio type, encoding and size", () => {
  const audio = Buffer.alloc(5000, 1).toString("base64");
  const v = validateStt({ lang: "mn", mimeType: "audio/webm;codecs=opus", audio });
  assert.equal(v.mimeType, "audio/webm");
  assert.equal(v.audio.length, 5000);
  assert.throws(() => validateStt({ lang: "mn", mimeType: "video/mp4", audio }), { status: 400 });
  assert.throws(() => validateStt({ lang: "mn", mimeType: "audio/webm", audio: "not base64!!" }), { status: 400 });
  assert.throws(() => validateStt({ lang: "mn", mimeType: "audio/webm", audio: Buffer.alloc(100).toString("base64") }), {
    status: 422,
    code: "no_speech",
  });
  const huge = Buffer.alloc(LIMITS.audioBytes + 1).toString("base64");
  assert.throws(() => validateStt({ lang: "en", mimeType: "audio/webm", audio: huge }), { status: 413 });
});
