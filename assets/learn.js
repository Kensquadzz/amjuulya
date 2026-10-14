// AMJUULYA — Bibi AI хэлний туслах (Монгол ⇄ Англи)
import {
  Player,
  SpeechError,
  blobToBase64,
  browserRecognitionAvailable,
  browserVoiceFor,
  canRecord,
  recognizeInBrowser,
  speechMessage,
  startRecording,
} from "./learn-speech.js";

const $ = (id) => document.getElementById(id);
const els = {
  app: document.querySelector(".app"),
  chat: $("chat"),
  messages: $("messages"),
  mascot: $("mascot"),
  stageStatus: $("stageStatus"),
  stageHint: $("stageHint"),
  direction: $("direction"),
  notice: $("notice"),
  review: $("review"),
  reviewText: $("reviewText"),
  reviewSend: $("reviewSend"),
  reviewRetry: $("reviewRetry"),
  reviewCancel: $("reviewCancel"),
  mic: $("mic"),
  micLevel: $("micLevel"),
  micCaption: $("micCaption"),
  live: $("liveTranscript"),
  composer: $("composer"),
  textInput: $("textInput"),
  sendBtn: $("sendBtn"),
  newChat: $("newChat"),
  aiTemplate: $("aiTemplate"),
};

const HISTORY_ITEMS = 8;
const CHAT_TIMEOUT_MS = 40000;
const STT_TIMEOUT_MS = 30000;
const TTS_TIMEOUT_MS = 30000;

const state = {
  mode: "translate",
  lang: "mn",
  config: { ai: false, stt: { mn: false, en: false }, tts: { mn: false, en: false }, limits: { textChars: 1000, ttsChars: 600 } },
  configLoaded: false,
  messages: [], // { id, role: "user"|"ai", text, via, data }
  chatBusy: false,
  mic: "idle", // idle | recording | processing
  session: null, // идэвхтэй бичлэг/танилт
  lastRecording: null, // STT алдаа гарвал дахин илгээхэд (зөвхөн санах ойд)
  reviewVia: "voice",
  audioCache: new Map(),
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

// ---------- Тохиргоо хадгалах (localStorage байхгүй байж болно) ----------
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("amjuulya-learn") || "{}");
    if (p.mode === "translate" || p.mode === "conversation") state.mode = p.mode;
    if (p.lang === "mn" || p.lang === "en") state.lang = p.lang;
  } catch {}
}
function savePrefs() {
  try {
    localStorage.setItem("amjuulya-learn", JSON.stringify({ mode: state.mode, lang: state.lang }));
  } catch {}
}

// ---------- Мэдэгдэл ----------
function showNotice(text, { type = "error", action } = {}) {
  els.notice.replaceChildren();
  els.notice.className = `notice ${type === "info" ? "info" : ""}`;
  const span = document.createElement("span");
  span.className = "notice-text";
  span.textContent = text;
  els.notice.append(span);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      hideNotice();
      action.fn();
    });
    els.notice.append(btn);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Хаах");
  close.textContent = "✕";
  close.addEventListener("click", hideNotice);
  els.notice.append(close);
  els.notice.hidden = false;
}
function hideNotice() {
  els.notice.hidden = true;
}

// ---------- UI төлөв ----------
const HINTS = {
  translate: "Монгол эсвэл англи өгүүлбэр хэлэхэд Bibi орчуулж, утгыг нь тайлбарлана.",
  conversation: "Bibi-тэй англиар ярилцаж дасгал хийгээрэй. Чухал алдаа гарвал зөөлөн засна.",
};

function renderControls() {
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === state.lang)));
  els.direction.textContent =
    state.mode === "conversation"
      ? state.lang === "mn"
        ? "Монголоор асуух · англиар хариулна"
        : "Англиар ярих дасгал"
      : state.lang === "mn"
        ? "Монгол → English"
        : "English → Монгол";
  els.textInput.placeholder =
    state.mode === "conversation" ? "Эсвэл англиар бичнэ үү…" : state.lang === "mn" ? "Орчуулах монгол текст…" : "Text to translate…";
  els.stageHint.textContent = HINTS[state.mode];
  renderStage();
  renderInputs();
}

function setMascot(s) {
  els.mascot.dataset.state = s;
}

function renderStage() {
  els.app.classList.toggle("has-messages", state.messages.length > 0);
  let status;
  if (state.mic === "recording") status = "Сонсож байна…";
  else if (state.mic === "processing") status = "Яриаг таньж байна…";
  else if (state.chatBusy) status = "Bibi бодож байна…";
  else if (!state.configLoaded) status = "Ачаалж байна…";
  else if (!state.config.ai) status = "AI одоогоор тохируулагдаагүй байна";
  else status = state.messages.length ? "Үргэлжлүүлэн ярих бол микрофон дээр дарна уу." : "Сайн уу! Микрофон дээр дараад ярина уу.";
  els.stageStatus.textContent = status;
  if (state.mic === "recording") setMascot("listening");
  else if (state.mic === "processing" || state.chatBusy) setMascot("thinking");
  else if (els.mascot.dataset.state !== "speaking") setMascot("idle");
}

function sttEngine(lang) {
  if (state.config.stt[lang] && canRecord()) return "server";
  if (browserRecognitionAvailable()) return "browser";
  return null;
}

function renderInputs() {
  const aiReady = state.configLoaded && state.config.ai;
  const engine = sttEngine(state.lang);
  els.mic.dataset.state = state.mic;
  els.mic.disabled = !aiReady || !engine || state.mic === "processing";
  els.mic.setAttribute("aria-label", state.mic === "recording" ? "Бичлэгийг зогсоох" : "Ярьж эхлэх");
  if (!state.configLoaded) els.micCaption.textContent = "";
  else if (!aiReady) els.micCaption.textContent = "AI тохируулаагүй тул ашиглах боломжгүй";
  else if (!engine) els.micCaption.textContent = "Энэ хөтөч дуу танихгүй — доор бичнэ үү";
  else if (state.mic === "recording") els.micCaption.textContent = "Ярьж дуусаад дахин дарна уу";
  else if (state.mic === "processing") els.micCaption.textContent = "Таньж байна…";
  else els.micCaption.textContent = state.lang === "mn" ? "Дарж монголоор ярих" : "Tap to speak English";
  const text = els.textInput.value.trim();
  els.sendBtn.disabled = !aiReady || state.chatBusy || !text;
  els.reviewSend.disabled = !aiReady || state.chatBusy || !els.reviewText.value.trim();
}

function scrollToBottom() {
  requestAnimationFrame(() => (els.chat.scrollTop = els.chat.scrollHeight));
}

// ---------- Сервертэй харилцах ----------
async function postJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Хариу ирэхгүй удаж байна. Интернэтээ шалгаад дахин оролдоно уу.");
    throw new Error("Сервертэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.");
  } finally {
    clearTimeout(timer);
  }
  return response;
}

async function errorFrom(response) {
  try {
    const data = await response.json();
    const err = new Error(data?.error?.message || `Алдаа (${response.status})`);
    err.code = data?.error?.code;
    return err;
  } catch {
    return new Error(`Серверийн алдаа (${response.status}). Дахин оролдоно уу.`);
  }
}

async function loadConfig() {
  try {
    const response = await fetch("/api/learn/config", { cache: "no-store" });
    if (!response.ok) throw await errorFrom(response);
    state.config = await response.json();
  } catch {
    showNotice("Сервертэй холбогдож чадсангүй. Хуудсыг дахин ачаална уу.", { action: { label: "Дахин", fn: () => location.reload() } });
  }
  state.configLoaded = true;
  if (state.configLoaded && !state.config.ai) {
    showNotice("AI үйлчилгээ серверт тохируулаагүй байна (ANTHROPIC_API_KEY). Админ тохируулсны дараа ажиллана.", { type: "info" });
  }
  renderStage();
  renderInputs();
}

// ---------- Мессеж ----------
function compactAi(data) {
  const parts = [];
  if (data.translation?.text) parts.push(`Translation (${data.translation.targetLang || "?"}): ${data.translation.text}`);
  if (data.reply) parts.push(data.reply);
  if (data.correction) parts.push(`Correction: "${data.correction.original}" → "${data.correction.corrected}"`);
  return parts.join("\n");
}

function historyBefore(index) {
  return state.messages
    .slice(0, index)
    .filter((m) => !m.failed)
    .slice(-HISTORY_ITEMS)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.role === "user" ? m.text : compactAi(m.data) }))
    .filter((m) => m.text);
}

function addUserMessage(text, via) {
  const msg = { id: uid(), role: "user", text, via, mode: state.mode, lang: state.lang };
  state.messages.push(msg);
  const row = document.createElement("div");
  row.className = "msg user";
  row.id = `m-${msg.id}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const p = document.createElement("p");
  p.textContent = text;
  const small = document.createElement("span");
  small.className = "via";
  small.textContent = via === "voice" ? "🎤 дуугаар" : "⌨️ бичгээр";
  bubble.append(p, small);
  row.append(bubble);
  els.messages.append(row);
  renderStage();
  scrollToBottom();
  return msg;
}

function addTyping() {
  const row = document.createElement("div");
  row.className = "msg ai";
  row.id = "typing";
  const img = document.createElement("img");
  img.className = "avatar";
  img.src = "assets/mascot.webp";
  img.alt = "";
  const bubble = document.createElement("div");
  bubble.className = "bubble typing";
  bubble.setAttribute("aria-label", "Bibi бичиж байна");
  bubble.innerHTML = "<span></span><span></span><span></span>";
  row.append(img, bubble);
  els.messages.append(row);
  scrollToBottom();
}
function removeTyping() {
  $("typing")?.remove();
}

const LANG_NAME = { mn: "Монгол", en: "English" };
const INTENT_LABEL = { translate: "Орчуулга", conversation: "Яриа", clarify: "Тодруулга" };

function ttsAvailable(lang) {
  return state.config.tts[lang] ? "server" : browserVoiceFor(lang) ? "browser" : null;
}

function addAiMessage(data) {
  const msg = { id: uid(), role: "ai", data };
  state.messages.push(msg);
  const node = els.aiTemplate.content.firstElementChild.cloneNode(true);
  node.id = `m-${msg.id}`;
  node.querySelector(".chip").textContent = INTENT_LABEL[data.intent] || "Bibi";

  if (data.translation?.text) {
    const box = node.querySelector(".translation");
    box.hidden = false;
    box.querySelector(".t-lang").textContent = LANG_NAME[data.translation.targetLang] || "Орчуулга";
    box.querySelector(".t-text").textContent = data.translation.text;
  }
  if (data.reply) {
    const p = node.querySelector(".reply");
    p.hidden = false;
    p.textContent = data.reply;
  }
  if (data.correction) {
    const c = node.querySelector(".correction");
    c.hidden = false;
    c.querySelector(".c-orig").textContent = data.correction.original;
    c.querySelector(".c-fixed").textContent = data.correction.corrected;
    c.querySelector(".c-note").textContent = data.correction.note;
  }
  if (data.explanation) {
    const e = node.querySelector(".explanation");
    e.hidden = false;
    e.textContent = data.explanation;
  }
  if (data.repeatPrompt) {
    const r = node.querySelector(".repeat");
    r.hidden = false;
    r.querySelector(".r-text").textContent = data.repeatPrompt;
    r.querySelector(".repeat-btn").addEventListener("click", () => {
      setLang("en");
      toggleMic();
    });
  }

  const play = node.querySelector(".play");
  play.dataset.key = msg.id;
  const speak = data.speak;
  const how = speak?.text ? ttsAvailable(speak.lang) : null;
  if (!how) {
    play.disabled = true;
    play.querySelector(".play-label").textContent = speak?.text ? `${LANG_NAME[speak.lang]} дуу тохируулаагүй` : "Сонсох боломжгүй";
    play.title = "Энэ хэлний дуу үүсгэх үйлчилгээ серверт тохируулаагүй, хөтөчид ч энэ хэлний хоолой алга.";
  } else {
    play.addEventListener("click", () => onPlay(msg, play));
  }

  els.messages.append(node);
  renderStage();
  scrollToBottom();
  return msg;
}

function addErrorMessage(text, retry) {
  const row = document.createElement("div");
  row.className = "msg ai error";
  const img = document.createElement("img");
  img.className = "avatar";
  img.src = "assets/mascot.webp";
  img.alt = "";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const p = document.createElement("p");
  p.className = "error-text";
  p.textContent = text;
  bubble.append(p);
  if (retry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn small";
    btn.textContent = "↻ Дахин оролдох";
    btn.addEventListener("click", () => {
      if (state.chatBusy) return;
      row.remove();
      retry();
    });
    bubble.append(btn);
  }
  row.append(img, bubble);
  els.messages.append(row);
  scrollToBottom();
}

async function sendMessage(rawText, via) {
  const text = rawText.trim();
  if (!text || state.chatBusy) return false; // давхар илгээхээс сэргийлнэ
  if (!state.config.ai) {
    showNotice("AI үйлчилгээ тохируулаагүй байна.");
    return false;
  }
  const max = state.config.limits?.textChars || 1000;
  if (text.length > max) {
    showNotice(`Мессеж хэт урт байна (${max} тэмдэгтээс ихгүй).`);
    return false;
  }
  hideNotice();
  const userMsg = addUserMessage(text, via);
  await requestAi(userMsg);
  return true;
}

async function requestAi(userMsg) {
  state.chatBusy = true;
  renderStage();
  renderInputs();
  addTyping();
  const index = state.messages.indexOf(userMsg);
  try {
    const response = await postJson(
      "/api/learn/chat",
      {
        requestId: uid(),
        mode: userMsg.mode,
        inputLang: userMsg.lang,
        text: userMsg.text,
        history: historyBefore(index),
      },
      CHAT_TIMEOUT_MS
    );
    if (!response.ok) throw await errorFrom(response);
    const data = await response.json();
    removeTyping();
    userMsg.failed = false;
    addAiMessage(data);
  } catch (err) {
    removeTyping();
    userMsg.failed = true; // амжилтгүй мессежийг түүхэнд оруулахгүй
    const retryable = err.code !== "invalid_input" && err.code !== "refused";
    addErrorMessage(err.message || "Алдаа гарлаа.", retryable ? () => requestAi(userMsg) : null);
  } finally {
    state.chatBusy = false;
    renderStage();
    renderInputs();
  }
}

// ---------- Аудио тоглуулах ----------
const player = new Player((key, s, err) => {
  const btn = document.querySelector(`.play[data-key="${key}"]`);
  if (btn) {
    btn.dataset.state = s;
    btn.querySelector(".play-icon").textContent = s === "playing" ? "■" : s === "loading" ? "◌" : "▶";
    btn.querySelector(".play-label").textContent =
      s === "playing" ? "Зогсоох" : s === "loading" ? "Ачаалж байна…" : s === "error" ? "Дахин сонсох" : "Сонсох";
    btn.setAttribute("aria-label", s === "playing" ? "Тоглуулахыг зогсоох" : "Хариултыг сонсох");
    const errEl = btn.parentElement.querySelector(".play-error");
    errEl.hidden = s !== "error";
    if (s === "error") errEl.textContent = err?.message && !/^(playback|no_voice)$/.test(err.message) ? err.message : "Дуу тоглуулж чадсангүй.";
  }
  setMascot(s === "playing" ? "speaking" : "idle");
  renderStage();
});

async function fetchTts(text, lang) {
  const response = await postJson("/api/learn/tts", { text, lang }, TTS_TIMEOUT_MS);
  if (!response.ok) throw await errorFrom(response);
  const blob = await response.blob();
  if (!blob.size) throw new Error("Хоосон аудио ирлээ.");
  return URL.createObjectURL(blob);
}

function onPlay(msg, btn) {
  if (btn.dataset.state === "playing" || btn.dataset.state === "loading") {
    player.stop();
    return;
  }
  // Бичиж байх үед тоглуулахгүй (микрофон өөрийн дууг бичихээс сэргийлнэ)
  if (state.mic !== "idle") return;
  const { text, lang } = msg.data.speak;
  const max = state.config.limits?.ttsChars || 600;
  const clipped = text.slice(0, max);
  if (ttsAvailable(lang) === "browser") {
    player.speakWithBrowser(msg.id, clipped, lang);
    return;
  }
  player.unlock();
  player.playUrl(msg.id, async () => {
    if (!state.audioCache.has(msg.id)) state.audioCache.set(msg.id, fetchTts(clipped, lang));
    try {
      return await state.audioCache.get(msg.id);
    } catch (err) {
      state.audioCache.delete(msg.id); // алдаа гарсан бол дараагийн дарахад дахин татна
      throw err;
    }
  });
}

// ---------- Микрофон ----------
function setLive(text) {
  els.live.textContent = text ? `“${text}”` : "";
  els.live.hidden = !text;
}

function setMic(s) {
  state.mic = s;
  if (s !== "recording") els.micLevel.style.transform = "scale(1)";
  renderStage();
  renderInputs();
}

function showReview(text, via = "voice") {
  state.reviewVia = via;
  els.reviewText.value = text;
  els.review.hidden = false;
  renderInputs();
  els.reviewText.focus({ preventScroll: true });
}
function hideReview() {
  els.review.hidden = true;
  els.reviewText.value = "";
  renderInputs();
}

async function toggleMic() {
  if (state.mic === "recording") {
    state.session?.stop();
    return;
  }
  if (state.mic !== "idle") return;
  const engine = sttEngine(state.lang);
  if (!engine) {
    showNotice(speechMessage("unsupported"));
    return;
  }
  hideNotice();
  hideReview();
  player.stop();
  state.lastRecording = null;
  if (engine === "server") await recordForServer(state.lang);
  else await recognizeWithBrowser(state.lang);
}

async function recordForServer(lang) {
  setMic("recording");
  let session;
  try {
    session = await startRecording({
      onLevel: (level) => (els.micLevel.style.transform = `scale(${1 + level * 0.6})`),
    });
  } catch (err) {
    setMic("idle");
    showNotice(err instanceof SpeechError ? err.message : speechMessage("failed"));
    return;
  }
  state.session = session;
  const result = await session.done;
  state.session = null;
  if (result.cancelled) return setMic("idle");
  if (!result.heardSpeech || !result.blob || result.blob.size < 1200) {
    setMic("idle");
    showNotice(speechMessage("no_speech"), { action: { label: "Дахин ярих", fn: toggleMic } });
    return;
  }
  state.lastRecording = { blob: result.blob, mimeType: result.mimeType, lang };
  await transcribeLast();
}

async function transcribeLast() {
  const rec = state.lastRecording;
  if (!rec) return;
  setMic("processing");
  try {
    const audio = await blobToBase64(rec.blob);
    const response = await postJson(
      "/api/learn/stt",
      { requestId: uid(), lang: rec.lang, mimeType: rec.mimeType, audio },
      STT_TIMEOUT_MS
    );
    if (!response.ok) throw await errorFrom(response);
    const data = await response.json();
    state.lastRecording = null; // бичлэгийг хадгалахгүй
    setMic("idle");
    showReview(data.text, "voice");
  } catch (err) {
    setMic("idle");
    if (err.code === "no_speech") {
      state.lastRecording = null;
      showNotice(err.message, { action: { label: "Дахин ярих", fn: toggleMic } });
    } else {
      showNotice(err.message || speechMessage("failed"), { action: { label: "Дахин оролдох", fn: transcribeLast } });
    }
  }
}

async function recognizeWithBrowser(lang) {
  let session;
  try {
    session = recognizeInBrowser(lang, {
      onInterim: (text) => setLive(text),
    });
  } catch (err) {
    showNotice(err instanceof SpeechError ? err.message : speechMessage("failed"));
    return;
  }
  state.session = session;
  setMic("recording");
  try {
    const { text, cancelled } = await session.done;
    if (!cancelled) showReview(text, "voice");
  } catch (err) {
    showNotice(err instanceof SpeechError ? err.message : speechMessage("failed"), { action: { label: "Дахин ярих", fn: toggleMic } });
  } finally {
    state.session = null;
    setLive("");
    setMic("idle");
  }
}

// ---------- Үйлдлүүд ----------
function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  savePrefs();
  renderControls();
}
function setLang(lang) {
  if (state.lang === lang) return;
  if (state.mic === "recording") state.session?.cancel();
  state.lang = lang;
  savePrefs();
  renderControls();
}

document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));

els.mic.addEventListener("click", toggleMic);

els.reviewSend.addEventListener("click", async () => {
  const text = els.reviewText.value;
  if (!text.trim() || state.chatBusy) return;
  hideReview();
  await sendMessage(text, state.reviewVia);
});
els.reviewRetry.addEventListener("click", () => {
  hideReview();
  toggleMic();
});
els.reviewCancel.addEventListener("click", hideReview);
els.reviewText.addEventListener("input", renderInputs);

function autosize() {
  els.textInput.style.height = "auto";
  els.textInput.style.height = `${Math.min(els.textInput.scrollHeight, 120)}px`;
}
els.textInput.addEventListener("input", () => {
  autosize();
  renderInputs();
});
els.textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    els.composer.requestSubmit();
  }
});
els.composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = els.textInput.value;
  if (!text.trim() || state.chatBusy) return;
  els.textInput.value = "";
  autosize();
  renderInputs();
  const sent = await sendMessage(text, "text");
  if (!sent) els.textInput.value = text;
  renderInputs();
});

els.newChat.addEventListener("click", () => {
  if (state.chatBusy) return;
  player.stop();
  state.session?.cancel();
  for (const p of state.audioCache.values()) p.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  state.audioCache.clear();
  state.messages = [];
  els.messages.replaceChildren();
  hideReview();
  hideNotice();
  renderStage();
});

// Хөтчийн хоолойнууд асинхрон ачаалагддаг — эртнээс ачаалж эхлүүлнэ
if ("speechSynthesis" in window) speechSynthesis.getVoices();

loadPrefs();
renderControls();
loadConfig();
