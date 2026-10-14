// /api/learn/chat — жинхэнэ Anthropic SDK-г локал mock Messages API руу чиглүүлж шалгана
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mockReq, mockRes, nextIp, rid } from "./helpers.js";

let server;
let replies = [];
let requests = [];

function tutor(overrides = {}) {
  return {
    intent: "translate",
    detected_language: "mn",
    reply: "",
    translation: { source_lang: "mn", target_lang: "en", text: "I am learning English every day." },
    explanation: "",
    correction: { has_correction: false, original: "", corrected: "", note: "" },
    repeat_prompt: "",
    speak_text: "I am learning English every day.",
    speak_lang: "en",
    ...overrides,
  };
}

const message = (text, stop_reason = "end_turn") => ({
  status: 200,
  body: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: text === null ? [] : [{ type: "text", text }],
    stop_reason,
    usage: { input_tokens: 10, output_tokens: 10 },
  },
});

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      requests.push({ url: req.url, headers: req.headers, body: JSON.parse(raw || "{}") });
      const next = replies.shift() || message(JSON.stringify(tutor()));
      setTimeout(() => {
        res.writeHead(next.status, { "content-type": "application/json", "retry-after-ms": "1", ...(next.headers || {}) });
        res.end(JSON.stringify(next.body));
      }, next.delay || 0);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  process.env.LEARN_LLM_TIMEOUT_MS = "800";
  delete process.env.LEARN_ANTHROPIC_MODEL;
  delete process.env.UPSTASH_REDIS_REST_URL;
});
after(() => server.close());

const { default: handler } = await import("../api/learn/chat.js");

async function call(body, opts = {}) {
  const res = mockRes();
  await handler(mockReq({ body, ip: opts.ip || nextIp(), headers: opts.headers }), res);
  return { status: res.statusCode, data: res.json() };
}

const base = (extra = {}) => ({ requestId: rid(), mode: "translate", inputLang: "mn", text: "Би өдөр бүр англи хэл сурч байна", ...extra });

test("Mongolian → English translation succeeds and request is well-formed", async () => {
  requests = [];
  const { status, data } = await call(base());
  assert.equal(status, 200);
  assert.equal(data.intent, "translate");
  assert.equal(data.translation.text, "I am learning English every day.");
  assert.deepEqual(data.speak, { text: "I am learning English every day.", lang: "en" });

  const r = requests[0];
  assert.equal(r.url.split("?")[0], "/v1/messages");
  assert.equal(r.headers["x-api-key"], "sk-ant-test-key");
  assert.match(r.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.equal(r.body.model, "claude-opus-5-5");
  assert.equal(r.body.fallbacks, "default");
  assert.equal(r.body.output_config.format.type, "json_schema");
  assert.equal(r.body.output_config.effort, "low");
  assert.equal(r.body.system[0].cache_control.type, "ephemeral");
  assert.match(r.body.messages.at(-1).content, /^\[mode=translate; input_language=mn\]\nБи өдөр бүр/);
});

test("English → Mongolian translation", async () => {
  replies.push(
    message(JSON.stringify(tutor({
      detected_language: "en",
      translation: { source_lang: "en", target_lang: "mn", text: "Амжилт хүсье!" },
      explanation: "\"Break a leg\" нь шууд утгаараа биш, амжилт хүсэх хэлц.",
      speak_text: "Амжилт хүсье!",
      speak_lang: "mn",
    })))
  );
  const { status, data } = await call(base({ inputLang: "en", text: "Break a leg!" }));
  assert.equal(status, 200);
  assert.equal(data.translation.targetLang, "mn");
  assert.equal(data.speak.lang, "mn");
  assert.match(data.explanation, /хэлц/);
});

test("conversation with grammar correction keeps context from history", async () => {
  requests = [];
  replies.push(
    message(JSON.stringify(tutor({
      intent: "conversation",
      detected_language: "en",
      reply: "Nice! What did you eat for breakfast?",
      translation: { source_lang: "", target_lang: "", text: "" },
      correction: { has_correction: true, original: "I go to school yesterday", corrected: "I went to school yesterday", note: "Өнгөрсөн цаг тул went." },
      repeat_prompt: "Зөв хувилбарыг давтаад хэлээрэй: I went to school yesterday.",
      speak_text: "Nice! What did you eat for breakfast?",
    })))
  );
  const history = [
    { role: "user", text: "Hi Bibi" },
    { role: "assistant", text: "Hi! What did you do yesterday?" },
  ];
  const { status, data } = await call(base({ mode: "conversation", inputLang: "en", text: "I go to school yesterday", history }));
  assert.equal(status, 200);
  assert.equal(data.correction.corrected, "I went to school yesterday");
  assert.match(data.repeatPrompt, /давтаад/);
  const msgs = requests[0].body.messages;
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs[1].content, "Hi! What did you do yesterday?");
});

test("empty input is rejected without calling the AI", async () => {
  requests = [];
  const { status, data } = await call(base({ text: "   " }));
  assert.equal(status, 400);
  assert.equal(data.error.code, "invalid_input");
  assert.equal(requests.length, 0);
});

test("duplicate requestId is rejected", async () => {
  const body = base();
  assert.equal((await call(body)).status, 200);
  const dup = await call(body);
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.code, "duplicate");
});

test("missing API key → 503 without calling provider", async () => {
  requests = [];
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const { status, data } = await call(base());
    assert.equal(status, 503);
    assert.equal(data.error.code, "ai_not_configured");
    assert.equal(requests.length, 0);
  } finally {
    process.env.ANTHROPIC_API_KEY = key;
  }
});

test("LEARN_ANTHROPIC_API_KEY takes priority and works without ANTHROPIC_API_KEY", async () => {
  requests = [];
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.LEARN_ANTHROPIC_API_KEY = "sk-ant-test-key";
  try {
    const { status } = await call(base());
    assert.equal(status, 200);
    assert.equal(requests.length, 1);
  } finally {
    process.env.ANTHROPIC_API_KEY = key;
    delete process.env.LEARN_ANTHROPIC_API_KEY;
  }
});

test("provider auth failure → 503, and the failed requestId can be retried", async () => {
  replies.push({ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
  const body = base();
  const first = await call(body);
  assert.equal(first.status, 503);
  assert.equal(first.data.error.code, "ai_not_configured");
  assert.ok(!JSON.stringify(first.data).includes("sk-ant"));
  const retry = await call(body);
  assert.equal(retry.status, 200);
});

test("provider rate limit → 429 with Retry-After", async () => {
  const err = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } };
  replies.push(err, err);
  const { status, data } = await call(base());
  assert.equal(status, 429);
  assert.equal(data.error.code, "ai_busy");
});

test("provider 5xx → 502 friendly error", async () => {
  const err = { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "overloaded" } } };
  replies.push(err, err);
  const { status, data } = await call(base());
  assert.equal(status, 502);
  assert.equal(data.error.code, "ai_unavailable");
});

test("provider timeout → 504", async () => {
  replies.push({ ...message(JSON.stringify(tutor())), delay: 2000 }, { ...message(JSON.stringify(tutor())), delay: 2000 });
  const { status, data } = await call(base());
  assert.equal(status, 504);
  assert.equal(data.error.code, "ai_timeout");
});

test("refusal stop reason → 422", async () => {
  replies.push(message(null, "refusal"));
  const { status, data } = await call(base());
  assert.equal(status, 422);
  assert.equal(data.error.code, "refused");
});

test("malformed model output → 502", async () => {
  replies.push(message("not json"));
  const { status, data } = await call(base());
  assert.equal(status, 502);
  assert.equal(data.error.code, "ai_bad_output");
});

test("rate limit per IP on the chat endpoint", async () => {
  process.env.LEARN_CHAT_PER_MIN = "2";
  try {
    const ip = nextIp();
    assert.equal((await call(base(), { ip })).status, 200);
    assert.equal((await call(base(), { ip })).status, 200);
    const blocked = await call(base(), { ip });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.data.error.code, "rate_limited");
  } finally {
    delete process.env.LEARN_CHAT_PER_MIN;
  }
});

test("cross-origin requests are rejected", async () => {
  const { status } = await call(base(), { headers: { origin: "https://evil.example" } });
  assert.equal(status, 403);
});
