// Хэл сурах API-ийн оролтын шалгалт. Буруу оролтыг AI/дуу хоолойн үйлчилгээ рүү илгээхээс өмнө зогсооно.
import { HttpError } from "./http.js";

export const LANGS = ["mn", "en"];
export const MODES = ["translate", "conversation"];

export const LIMITS = {
  textChars: 1000, // нэг мессежийн дээд урт
  historyItems: 8, // AI руу илгээх өмнөх мессежийн тоо
  historyChars: 800, // түүхийн нэг мессежийн дээд урт
  ttsChars: 600,
  audioBytes: 2_500_000, // ~2.5MB (≈ 60 сек opus) — Vercel-ийн 4.5MB биеийн хязгаараас бага
  chatBodyBytes: 32_000,
  sttBodyBytes: 3_500_000,
};

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

function fail(message) {
  throw new HttpError(400, "invalid_input", message);
}

function cleanText(value) {
  // Удирдлагын тэмдэгтүүдийг (шинэ мөрөөс бусад) арилгана
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function validateRequestId(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !REQUEST_ID.test(value)) fail("requestId буруу байна.");
  return value;
}

export function validateChat(body) {
  const mode = body.mode;
  if (!MODES.includes(mode)) fail("mode нь 'translate' эсвэл 'conversation' байх ёстой.");

  const inputLang = body.inputLang;
  if (!LANGS.includes(inputLang)) fail("inputLang нь 'mn' эсвэл 'en' байх ёстой.");

  if (typeof body.text !== "string") fail("text заавал байх ёстой.");
  const text = cleanText(body.text);
  if (!text) fail("Хоосон мессеж илгээх боломжгүй.");
  if (text.length > LIMITS.textChars) fail(`Мессеж ${LIMITS.textChars} тэмдэгтээс хэтрэхгүй байх ёстой.`);

  const rawHistory = body.history ?? [];
  if (!Array.isArray(rawHistory)) fail("history массив байх ёстой.");
  const history = rawHistory
    .slice(-LIMITS.historyItems)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
    .map((m) => ({ role: m.role, text: cleanText(m.text).slice(0, LIMITS.historyChars) }))
    .filter((m) => m.text);

  return { mode, inputLang, text, history, requestId: validateRequestId(body.requestId) };
}

export function validateTts(body) {
  if (!LANGS.includes(body.lang)) fail("lang нь 'mn' эсвэл 'en' байх ёстой.");
  if (typeof body.text !== "string") fail("text заавал байх ёстой.");
  const text = cleanText(body.text);
  if (!text) fail("Унших текст хоосон байна.");
  if (text.length > LIMITS.ttsChars) fail(`Текст ${LIMITS.ttsChars} тэмдэгтээс хэтрэхгүй байх ёстой.`);
  return { lang: body.lang, text };
}

const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac"];

export function validateStt(body) {
  if (!LANGS.includes(body.lang)) fail("lang нь 'mn' эсвэл 'en' байх ёстой.");
  const mimeType = String(body.mimeType || "").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.includes(mimeType)) fail("Дэмжигдээгүй аудио формат.");
  if (typeof body.audio !== "string" || !body.audio) fail("audio (base64) заавал байх ёстой.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) fail("audio base64 буруу байна.");
  const audio = Buffer.from(body.audio, "base64");
  if (audio.length > LIMITS.audioBytes) throw new HttpError(413, "too_large", "Бичлэг хэт урт байна. Богино хэлж үзнэ үү.");
  if (audio.length < 1200) throw new HttpError(422, "no_speech", "Бичлэг хэт богино байна. Дахин хэлж үзнэ үү.");
  return { lang: body.lang, mimeType, audio, requestId: validateRequestId(body.requestId) };
}
