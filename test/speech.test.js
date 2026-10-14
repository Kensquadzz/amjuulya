// STT/TTS provider-ууд — гадаад API-г fetch stub-аар орлуулж шалгана
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveStt, resolveTts, synthesize, transcribe } from "../api/_lib/speech.js";
import { mockReq, mockRes, nextIp, rid } from "./helpers.js";

const SPEECH_VARS = [
  "STT_PROVIDER", "STT_PROVIDER_MN", "STT_PROVIDER_EN", "TTS_PROVIDER", "TTS_PROVIDER_MN", "TTS_PROVIDER_EN",
  "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID_MN", "ELEVENLABS_VOICE_ID_EN", "OPENAI_API_KEY",
  "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "AZURE_TTS_VOICE_MN",
];
const realFetch = globalThis.fetch;
let calls;

beforeEach(() => {
  for (const v of SPEECH_VARS) delete process.env[v];
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler) {
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  };
}

test("nothing configured → no providers (UI falls back / disables)", () => {
  assert.equal(resolveStt("mn"), null);
  assert.equal(resolveTts("mn"), null);
  assert.equal(resolveTts("en"), null);
});

test("auto selection prefers providers with documented Mongolian support", () => {
  process.env.OPENAI_API_KEY = "sk-openai-test";
  assert.equal(resolveTts("en").name, "openai");
  assert.equal(resolveTts("mn"), null, "OpenAI TTS is not auto-selected for Mongolian");
  process.env.AZURE_SPEECH_KEY = "k";
  process.env.AZURE_SPEECH_REGION = "eastasia";
  assert.equal(resolveTts("mn").name, "azure");
  process.env.ELEVENLABS_API_KEY = "el";
  assert.equal(resolveStt("mn").name, "elevenlabs");
  assert.equal(resolveTts("mn").name, "azure");
  process.env.TTS_PROVIDER_MN = "none";
  assert.equal(resolveTts("mn"), null);
});

test("explicit provider without credentials is treated as not configured", () => {
  process.env.TTS_PROVIDER = "elevenlabs";
  process.env.ELEVENLABS_API_KEY = "el";
  assert.equal(resolveTts("mn"), null, "voice id missing");
  process.env.ELEVENLABS_VOICE_ID_MN = "voice-mn";
  assert.equal(resolveTts("mn").name, "elevenlabs");
});

test("ElevenLabs STT sends Mongolian language code and returns text", async () => {
  process.env.ELEVENLABS_API_KEY = "el-key";
  stubFetch(() => new Response(JSON.stringify({ text: " Сайн байна уу ", language_code: "mon" }), { status: 200 }));
  const out = await transcribe({ audio: Buffer.alloc(3000), mimeType: "audio/webm", lang: "mn" });
  assert.equal(out.text, "Сайн байна уу");
  const { url, options } = calls[0];
  assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(options.headers["xi-api-key"], "el-key");
  assert.equal(options.body.get("language_code"), "mon");
  assert.equal(options.body.get("model_id"), "scribe_v1");
  assert.equal(options.body.get("file").name, "speech.webm");
});

test("OpenAI STT for English", async () => {
  process.env.OPENAI_API_KEY = "sk-openai";
  stubFetch(() => new Response(JSON.stringify({ text: "I went to school" }), { status: 200 }));
  const out = await transcribe({ audio: Buffer.alloc(3000), mimeType: "audio/mp4", lang: "en" });
  assert.equal(out.text, "I went to school");
  assert.equal(calls[0].options.body.get("language"), "en");
  assert.equal(calls[0].options.body.get("file").name, "speech.mp4");
});

test("Azure TTS builds escaped SSML with the Mongolian neural voice", async () => {
  process.env.AZURE_SPEECH_KEY = "az";
  process.env.AZURE_SPEECH_REGION = "eastasia";
  stubFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  const out = await synthesize({ text: "Сайн <уу> & баяртай", lang: "mn" });
  assert.equal(out.audio.length, 3);
  const { url, options } = calls[0];
  assert.equal(url, "https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.match(options.body, /xml:lang="mn-MN"/);
  assert.match(options.body, /name="mn-MN-YesuiNeural"/);
  assert.match(options.body, /Сайн &lt;уу&gt; &amp; баяртай/);
});

test("provider auth/5xx/timeout errors map to safe HTTP errors", async () => {
  process.env.ELEVENLABS_API_KEY = "el";
  process.env.ELEVENLABS_VOICE_ID_EN = "v";
  stubFetch(() => new Response("bad key el", { status: 401 }));
  await assert.rejects(synthesize({ text: "hi", lang: "en" }), { status: 503, code: "tts_not_configured" });
  stubFetch(() => new Response("oops", { status: 500 }));
  await assert.rejects(synthesize({ text: "hi", lang: "en" }), { status: 502, code: "tts_error" });
  stubFetch(() => {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  });
  await assert.rejects(transcribe({ audio: Buffer.alloc(3000), mimeType: "audio/webm", lang: "en" }), { status: 504, code: "stt_timeout" });
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(transcribe({ audio: Buffer.alloc(3000), mimeType: "audio/webm", lang: "en" }), { status: 502 });
});

test("STT endpoint: empty transcript → 422 no_speech; success returns text", async () => {
  const { default: stt } = await import("../api/learn/stt.js");
  process.env.ELEVENLABS_API_KEY = "el";
  const audio = Buffer.alloc(4000, 7).toString("base64");

  stubFetch(() => new Response(JSON.stringify({ text: "   " }), { status: 200 }));
  let res = mockRes();
  await stt(mockReq({ body: { requestId: rid(), lang: "mn", mimeType: "audio/webm", audio }, ip: nextIp() }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "no_speech");

  stubFetch(() => new Response(JSON.stringify({ text: "Сайн уу" }), { status: 200 }));
  res = mockRes();
  await stt(mockReq({ body: { requestId: rid(), lang: "mn", mimeType: "audio/webm", audio }, ip: nextIp() }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { text: "Сайн уу", lang: "mn" });
});

test("TTS endpoint returns audio/mpeg; unconfigured language → 503", async () => {
  const { default: tts } = await import("../api/learn/tts.js");
  let res = mockRes();
  await tts(mockReq({ body: { lang: "mn", text: "Сайн уу" }, ip: nextIp() }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error.code, "tts_not_configured");

  process.env.OPENAI_API_KEY = "sk-openai";
  stubFetch(() => new Response(new Uint8Array([9, 9]), { status: 200 }));
  res = mockRes();
  await tts(mockReq({ body: { lang: "en", text: "Hello" }, ip: nextIp() }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "audio/mpeg");
  assert.equal(res.body.length, 2);
});

test("config endpoint exposes only booleans, never secrets", async () => {
  const { default: config } = await import("../api/learn/config.js");
  process.env.ELEVENLABS_API_KEY = "el-secret-value";
  process.env.ELEVENLABS_VOICE_ID_EN = "voice";
  const res = mockRes();
  await config(mockReq({ method: "GET" }), res);
  const body = res.json();
  assert.equal(body.stt.mn, true);
  assert.equal(body.tts.en, true);
  assert.equal(body.tts.mn, false);
  assert.ok(!res.body.includes("el-secret-value"));
});

test("config ?diag=1 reports variable presence and near-miss names, never values", async () => {
  const { default: config } = await import("../api/learn/config.js");
  process.env.ELEVENLABS_API_KEY = "el-secret-value";
  process.env.ELEVEN_LABS_VOICE_ID_MN = "typo-secret";
  try {
    const res = mockRes();
    const req = mockReq({ method: "GET" });
    req.url = "/api/learn/config?diag=1";
    await config(req, res);
    const body = res.json();
    assert.equal(body.diag.present.ELEVENLABS_API_KEY, true);
    assert.equal(body.diag.present.ELEVENLABS_VOICE_ID_MN, false);
    assert.ok(body.diag.nearMisses.includes("ELEVEN_LABS_VOICE_ID_MN"));
    assert.ok(!res.body.includes("el-secret-value") && !res.body.includes("typo-secret"));

    const plain = mockRes();
    await config(mockReq({ method: "GET" }), plain);
    assert.equal(plain.json().diag, undefined);
  } finally {
    delete process.env.ELEVEN_LABS_VOICE_ID_MN;
  }
});

test("provider error code is surfaced safely in the message", async () => {
  process.env.ELEVENLABS_API_KEY = "el";
  process.env.ELEVENLABS_VOICE_ID_MN = "v";
  stubFetch(() => new Response(JSON.stringify({ detail: { status: "voice_not_found", message: "secret-ish text el" } }), { status: 404 }));
  await assert.rejects(synthesize({ text: "Сайн уу", lang: "mn" }), (err) => {
    assert.equal(err.status, 502);
    assert.match(err.message, /\(ElevenLabs 404: voice_not_found\)/);
    assert.ok(!err.message.includes("secret-ish"));
    return true;
  });
  stubFetch(() => new Response("<html>oops</html>", { status: 500 }));
  await assert.rejects(synthesize({ text: "Сайн уу", lang: "mn" }), /\(ElevenLabs 500\)/);
});
