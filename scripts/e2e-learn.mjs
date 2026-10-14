// Хөтөч дээрх бүрэн урсгалын тест (Chromium, гар утасны дэлгэц, хуурамч микрофон).
// AI/STT/TTS API-г сүлжээний түвшинд mock хийнэ — бодит түлхүүр шаардлагагүй.
// Ажиллуулах: npm run test:e2e   (SCREENSHOT_DIR=... гэж зааж зураг хадгалж болно)
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const PORT = 3000 + Math.floor(Math.random() * 2000);
const BASE = `http://localhost:${PORT}`;
const shots = process.env.SCREENSHOT_DIR;
if (shots) mkdirSync(shots, { recursive: true });

// 0.4 сек чимээгүй WAV — TTS хариу болгон ашиглана
function silentWav(seconds = 0.4, rate = 8000) {
  const samples = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples * 2, 40);
  return b;
}

const server = spawn(process.execPath, ["scripts/dev-server.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "pipe" });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("dev server") && resolve());
  server.on("exit", (c) => reject(new Error(`server exited ${c}`)));
});

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", name, err.message.split("\n").slice(0, 6).join(" | ")]);
  }
}

function tutor(o = {}) {
  return {
    mode: "translate", intent: "translate", detectedLanguage: "mn", reply: "",
    translation: { sourceLang: "mn", targetLang: "en", text: "I am learning English every day." },
    explanation: "", correction: null, repeatPrompt: "",
    speak: { text: "I am learning English every day.", lang: "en" }, ...o,
  };
}

async function newPage({ config, initScript } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["microphone"],
  });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const api = { chat: [], stt: [], tts: [], chatReplies: [] };
  await page.route("**/api/learn/config", (r) =>
    r.fulfill({ json: config || { ai: true, stt: { mn: true, en: true }, tts: { mn: true, en: true }, limits: { textChars: 1000, ttsChars: 600 } } })
  );
  await page.route("**/api/learn/chat", async (r) => {
    api.chat.push(r.request().postDataJSON());
    const next = api.chatReplies.shift() || { status: 200, json: tutor() };
    await new Promise((res) => setTimeout(res, 300));
    await r.fulfill(next);
  });
  await page.route("**/api/learn/stt", async (r) => {
    api.stt.push(r.request().postDataJSON());
    await r.fulfill({ json: { text: api.sttText || "I go to school yesterday", lang: "en" } });
  });
  await page.route("**/api/learn/tts", (r) => {
    api.tts.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() });
  });
  page.on("pageerror", (e) => results.push(["FAIL", "page error", e.message]));
  await page.goto(`${BASE}/learn.html`);
  await page.waitForFunction(() => document.getElementById("stageStatus").textContent !== "Ачаалж байна…");
  return { page, api, context };
}

try {
  // ---------- Үндсэн урсгал ----------
  const { page, api, context } = await newPage();

  await step("mobile layout: mascot + mic visible, no horizontal scroll, empty send disabled", async () => {
    assert.ok(await page.locator("#mascot img").isVisible());
    assert.ok(await page.locator("#mic").isEnabled());
    assert.ok(await page.locator("#sendBtn").isDisabled());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `overflow ${overflow}px`);
    const mic = await page.locator("#mic").boundingBox();
    assert.ok(mic.width >= 60 && mic.y + mic.height <= 844, "mic large and on screen");
    if (shots) await page.screenshot({ path: join(shots, "1-empty.png") });
  });

  await step("Mongolian → English translation via text input", async () => {
    await page.fill("#textInput", "Би өдөр бүр англи хэл сурч байна");
    await page.click("#sendBtn");
    await page.locator(".msg.ai .t-text").first().waitFor();
    assert.equal(await page.locator(".msg.ai .t-text").first().textContent(), "I am learning English every day.");
    const req = api.chat[0];
    assert.equal(req.mode, "translate");
    assert.equal(req.inputLang, "mn");
    assert.deepEqual(req.history, []);
    assert.ok(/^[\w-]{8,64}$/.test(req.requestId));
  });

  await step("audio playback: loads once, plays, then re-plays from cache", async () => {
    const play = page.locator(".msg.ai .play").first();
    await play.click();
    await page.waitForFunction(() => document.querySelector(".msg.ai .play").dataset.state === "idle", null, { timeout: 5000 });
    assert.equal(api.tts.length, 1);
    assert.deepEqual(api.tts[0], { text: "I am learning English every day.", lang: "en" });
    await play.click();
    await page.waitForTimeout(800);
    assert.equal(api.tts.length, 1, "second play uses cached audio");
  });

  await step("English → Mongolian translation", async () => {
    await page.click('[data-lang="en"]');
    assert.equal(await page.locator("#direction").textContent(), "English → Монгол");
    api.chatReplies.push({
      status: 200,
      json: tutor({ translation: { sourceLang: "en", targetLang: "mn", text: "Амжилт хүсье!" }, explanation: "Хэлц үг.", speak: { text: "Амжилт хүсье!", lang: "mn" } }),
    });
    await page.fill("#textInput", "Break a leg!");
    await page.press("#textInput", "Enter");
    await page.locator(".msg.ai").nth(1).locator(".explanation").waitFor();
    assert.equal(await page.locator(".msg.ai").nth(1).locator(".t-lang").textContent(), "Монгол");
    assert.equal(api.chat[1].inputLang, "en");
    assert.equal(api.chat[1].history.length, 2, "previous turn sent as context");
  });

  await step("voice input: record → processing → editable transcript → send (conversation + correction)", async () => {
    await page.click('[data-mode="conversation"]');
    await page.click("#mic");
    await page.waitForFunction(() => document.getElementById("mic").dataset.state === "recording");
    assert.equal(await page.locator("#stageStatus").textContent(), "Сонсож байна…");
    if (shots) await page.screenshot({ path: join(shots, "2-recording.png") });
    await page.waitForTimeout(1200);
    await page.click("#mic");
    await page.locator("#review").waitFor({ state: "visible" });
    assert.equal(api.stt.length, 1);
    assert.equal(api.stt[0].lang, "en");
    assert.ok(api.stt[0].audio.length > 1000, "audio uploaded");
    assert.equal(await page.inputValue("#reviewText"), "I go to school yesterday");
    await page.fill("#reviewText", "I go to school yesterday with my friend");
    api.chatReplies.push({
      status: 200,
      json: tutor({
        mode: "conversation", intent: "conversation", detectedLanguage: "en", reply: "That sounds fun! What did you study?",
        translation: { sourceLang: "", targetLang: "", text: "" },
        correction: { original: "I go to school yesterday", corrected: "I went to school yesterday", note: "Өнгөрсөн цаг тул went." },
        repeatPrompt: "Зөв хувилбарыг давтаад хэлээрэй.", speak: { text: "That sounds fun! What did you study?", lang: "en" },
      }),
    });
    await page.click("#reviewSend");
    await page.locator(".msg.ai").nth(2).locator(".correction").waitFor();
    assert.equal(api.chat[2].text, "I go to school yesterday with my friend");
    assert.equal(api.chat[2].mode, "conversation");
    assert.equal(api.chat[2].history.length, 4);
    if (shots) await page.screenshot({ path: join(shots, "3-correction.png") });
  });

  await step("repeat-after-me button starts an English recording", async () => {
    await page.locator(".msg.ai").nth(2).locator(".repeat-btn").click();
    await page.waitForFunction(() => document.getElementById("mic").dataset.state === "recording");
    await page.waitForTimeout(600);
    await page.click("#mic");
    await page.locator("#review").waitFor({ state: "visible" });
    await page.click("#reviewCancel");
    assert.ok(await page.locator("#review").isHidden());
  });

  await step("API failure shows error with working retry", async () => {
    api.chatReplies.push({ status: 502, json: { error: { code: "ai_unavailable", message: "AI үйлчилгээтэй холбогдож чадсангүй." } } });
    const before = api.chat.length;
    await page.fill("#textInput", "How are you?");
    await page.click("#sendBtn");
    await page.locator(".msg.error").waitFor();
    assert.match(await page.locator(".msg.error .error-text").textContent(), /холбогдож чадсангүй/);
    await page.locator(".msg.error button").click();
    await page.waitForFunction((n) => document.querySelectorAll(".msg.ai:not(.error):not(#typing)").length === n, 4);
    assert.equal(api.chat.length, before + 2);
    assert.equal(api.chat.at(-1).text, "How are you?");
    assert.notEqual(api.chat.at(-1).requestId, api.chat.at(-2).requestId);
  });

  await step("duplicate submission prevented (rapid double send)", async () => {
    const before = api.chat.length;
    await page.fill("#textInput", "Hello");
    await page.evaluate(() => {
      const f = document.getElementById("composer");
      f.requestSubmit();
      f.requestSubmit();
    });
    await page.waitForTimeout(900);
    assert.equal(api.chat.length, before + 1);
    if (shots) await page.screenshot({ path: join(shots, "4-conversation.png"), fullPage: false });
  });
  await context.close();

  // ---------- Микрофоны зөвшөөрөл татгалзсан ----------
  await step("microphone permission denied → clear message, text input still works", async () => {
    const { page: p, context: c } = await newPage({
      initScript: () => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
      },
    });
    await p.click("#mic");
    await p.locator("#notice").waitFor({ state: "visible" });
    assert.match(await p.locator("#notice").textContent(), /зөвшөөрөл олгогдоогүй/);
    assert.equal(await p.locator("#mic").getAttribute("data-state"), "idle");
    await p.fill("#textInput", "Сайн уу");
    assert.ok(await p.locator("#sendBtn").isEnabled());
    if (shots) await p.screenshot({ path: join(shots, "5-denied.png") });
    await c.close();
  });

  // ---------- AI тохируулаагүй ----------
  await step("AI not configured → controls disabled with explanation (no fake buttons)", async () => {
    const { page: p, context: c } = await newPage({ config: { ai: false, stt: { mn: false, en: false }, tts: { mn: false, en: false } } });
    assert.ok(await p.locator("#mic").isDisabled());
    await p.fill("#textInput", "test");
    assert.ok(await p.locator("#sendBtn").isDisabled());
    assert.match(await p.locator("#notice").textContent(), /ANTHROPIC_API_KEY/);
    await c.close();
  });

  // ---------- TTS тохируулаагүй хэл ----------
  await step("language without TTS → play button disabled and labelled", async () => {
    const { page: p, api: a, context: c } = await newPage({
      config: { ai: true, stt: { mn: true, en: true }, tts: { mn: false, en: true } },
      initScript: () => {
        Object.defineProperty(window, "speechSynthesis", { value: undefined });
        delete window.speechSynthesis;
      },
    });
    a.chatReplies.push({ status: 200, json: tutor({ translation: { sourceLang: "en", targetLang: "mn", text: "Сайн уу" }, speak: { text: "Сайн уу", lang: "mn" } }) });
    await p.fill("#textInput", "Hello");
    await p.click("#sendBtn");
    await p.locator(".msg.ai .play").waitFor();
    assert.ok(await p.locator(".msg.ai .play").isDisabled());
    assert.match(await p.locator(".msg.ai .play-label").textContent(), /тохируулаагүй/);
    await c.close();
  });
} finally {
  await browser.close();
  server.kill();
}

for (const r of results) console.log(r.join(" — "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
