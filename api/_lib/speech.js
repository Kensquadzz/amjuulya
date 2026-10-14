// ==========================================
// Яриа → текст (STT) ба текст → яриа (TTS) — солигдох боломжтой provider-ууд.
//
// Хэл тус бүрд өөр provider сонгож болно (Монгол хэлний дэмжлэг provider бүрт өөр):
//   STT_PROVIDER, STT_PROVIDER_MN, STT_PROVIDER_EN   = elevenlabs | openai | none
//   TTS_PROVIDER, TTS_PROVIDER_MN, TTS_PROVIDER_EN   = azure | elevenlabs | openai | none
// Заагаагүй бол тохируулсан API түлхүүрээс автоматаар сонгоно (resolve* функцуудыг үз).
// Шинэ provider нэмэх бол STT_PROVIDERS / TTS_PROVIDERS-д { configured(lang), run() } нэмнэ.
// ==========================================
import { HttpError, fetchWithTimeout, isAbort, safeLog } from "./http.js";

const STT_TIMEOUT = Number(process.env.LEARN_STT_TIMEOUT_MS || 20000);
const TTS_TIMEOUT = Number(process.env.LEARN_TTS_TIMEOUT_MS || 20000);

const EXT = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
};

const env = (name) => (process.env[name] || "").trim();

function audioForm(audio, mimeType, fields) {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mimeType }), `speech.${EXT[mimeType] || "webm"}`);
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") form.append(k, v);
  return form;
}

const PROVIDER_NAMES = { elevenlabs: "ElevenLabs", openai: "OpenAI", azure: "Azure" };

// Provider-ийн алдааны кодыг (жишээ нь "voice_not_found") хэрэглэгчид харуулж, тохиргоог засахад тусална.
// Зөвхөн богино, тэмдэгтийн шалгалт давсан кодыг буцаана — мессеж, нууц мэдээллийг биш.
export function providerErrorCode(detail) {
  try {
    const data = JSON.parse(detail);
    const d = data?.detail ?? data?.error ?? data;
    const code = typeof d === "string" ? null : d?.status ?? d?.code ?? d?.type;
    return typeof code === "string" && /^[A-Za-z0-9_.-]{1,48}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

async function providerFetch(kind, provider, url, options, timeout) {
  let response;
  try {
    response = await fetchWithTimeout(url, options, timeout);
  } catch (err) {
    if (isAbort(err)) throw new HttpError(504, `${kind}_timeout`, kind === "stt" ? "Яриа таних үйлчилгээ хэт удлаа. Дахин оролдоно уу." : "Дуу үүсгэх үйлчилгээ хэт удлаа. Дахин оролдоно уу.");
    safeLog(`${kind} ${provider} network`, err);
    throw new HttpError(502, `${kind}_unavailable`, "Дуу хоолойн үйлчилгээтэй холбогдож чадсангүй.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    safeLog(`${kind} ${provider} ${response.status}`, detail);
    const code = providerErrorCode(detail);
    const ref = ` (${PROVIDER_NAMES[provider] || provider} ${response.status}${code ? `: ${code}` : ""})`;
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(503, `${kind}_not_configured`, `Дуу хоолойн үйлчилгээний API түлхүүр буруу эсвэл эрхгүй байна.${ref}`);
    }
    if (response.status === 429) {
      throw new HttpError(429, `${kind}_busy`, `Дуу хоолойн үйлчилгээ ачаалалтай байна. Түр хүлээнэ үү.${ref}`, { retryAfter: 10 });
    }
    throw new HttpError(502, `${kind}_error`, `Дуу хоолойн үйлчилгээ алдаа заалаа.${ref}`);
  }
  return response;
}

// ------------------------------------------
// STT providers
// ------------------------------------------

const STT_PROVIDERS = {
  // ElevenLabs Scribe — Монгол хэлийг дэмжинэ гэж баримтжуулсан (99 хэл)
  elevenlabs: {
    configured: () => !!env("ELEVENLABS_API_KEY"),
    async run({ audio, mimeType, lang }) {
      const form = audioForm(audio, mimeType, {
        model_id: env("ELEVENLABS_STT_MODEL") || "scribe_v1",
        language_code: lang === "mn" ? "mon" : "eng",
        tag_audio_events: "false",
      });
      const response = await providerFetch(
        "stt",
        "elevenlabs",
        "https://api.elevenlabs.io/v1/speech-to-text",
        { method: "POST", headers: { "xi-api-key": env("ELEVENLABS_API_KEY") }, body: form },
        STT_TIMEOUT
      );
      const data = await response.json();
      return { text: String(data.text || ""), detectedLang: data.language_code || null };
    },
  },

  // OpenAI transcription — Англид маш сайн; Монгол хэл дэмжигдэх боловч чанарыг өөрөө шалгаарай
  openai: {
    configured: () => !!env("OPENAI_API_KEY"),
    async run({ audio, mimeType, lang }) {
      const form = audioForm(audio, mimeType, {
        model: env("OPENAI_STT_MODEL") || "gpt-4o-transcribe",
        language: lang,
        response_format: "json",
      });
      const response = await providerFetch(
        "stt",
        "openai",
        "https://api.openai.com/v1/audio/transcriptions",
        { method: "POST", headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}` }, body: form },
        STT_TIMEOUT
      );
      const data = await response.json();
      return { text: String(data.text || ""), detectedLang: null };
    },
  },
};

// ------------------------------------------
// TTS providers — бүгд audio/mpeg буцаана
// ------------------------------------------

function escapeXml(text) {
  return text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
}

const AZURE_DEFAULT_VOICES = { mn: "mn-MN-YesuiNeural", en: "en-US-JennyNeural" };
const AZURE_LOCALES = { mn: "mn-MN", en: "en-US" };

const TTS_PROVIDERS = {
  // Azure Neural TTS — mn-MN-YesuiNeural / mn-MN-BataaNeural гэсэн албан ёсны Монгол хоолойтой
  azure: {
    configured: () => !!(env("AZURE_SPEECH_KEY") && env("AZURE_SPEECH_REGION")),
    async run({ text, lang }) {
      const voice = env(`AZURE_TTS_VOICE_${lang.toUpperCase()}`) || AZURE_DEFAULT_VOICES[lang];
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${AZURE_LOCALES[lang]}">` +
        `<voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`;
      const response = await providerFetch(
        "tts",
        "azure",
        `https://${encodeURIComponent(env("AZURE_SPEECH_REGION"))}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": env("AZURE_SPEECH_KEY"),
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "amjuulya-learn",
          },
          body: ssml,
        },
        TTS_TIMEOUT
      );
      return Buffer.from(await response.arrayBuffer());
    },
  },

  // ElevenLabs — хэл тус бүрд voice ID заавал (ELEVENLABS_VOICE_ID_MN / _EN)
  elevenlabs: {
    configured: (lang) => !!(env("ELEVENLABS_API_KEY") && env(`ELEVENLABS_VOICE_ID_${lang.toUpperCase()}`)),
    async run({ text, lang }) {
      const voiceId = env(`ELEVENLABS_VOICE_ID_${lang.toUpperCase()}`);
      const response = await providerFetch(
        "tts",
        "elevenlabs",
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: env("ELEVENLABS_TTS_MODEL") || "eleven_v3" }),
        },
        TTS_TIMEOUT
      );
      return Buffer.from(await response.arrayBuffer());
    },
  },

  // OpenAI TTS — Англи хэлэнд байгалийн. Монгол хэлийг албан ёсоор чанартай гэж баталгаажуулаагүй тул
  // автоматаар зөвхөн Англид сонгогдоно (TTS_PROVIDER_MN=openai гэж гараар зааж болно).
  openai: {
    configured: () => !!env("OPENAI_API_KEY"),
    async run({ text }) {
      const response = await providerFetch(
        "tts",
        "openai",
        "https://api.openai.com/v1/audio/speech",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: env("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts",
            voice: env("OPENAI_TTS_VOICE") || "alloy",
            input: text,
            response_format: "mp3",
          }),
        },
        TTS_TIMEOUT
      );
      return Buffer.from(await response.arrayBuffer());
    },
  },
};

// Автомат сонголтын дараалал — Монгол хэлэнд баримтжуулсан дэмжлэгтэйг нь түрүүлж
const AUTO_ORDER = {
  stt: { mn: ["elevenlabs", "openai"], en: ["elevenlabs", "openai"] },
  tts: { mn: ["azure", "elevenlabs"], en: ["elevenlabs", "azure", "openai"] },
};

function resolve(kind, lang) {
  const providers = kind === "stt" ? STT_PROVIDERS : TTS_PROVIDERS;
  const prefix = kind.toUpperCase();
  const explicit = env(`${prefix}_PROVIDER_${lang.toUpperCase()}`) || env(`${prefix}_PROVIDER`);
  if (explicit) {
    if (explicit === "none") return null;
    const provider = providers[explicit];
    if (!provider) {
      safeLog(`${kind} unknown provider`, explicit);
      return null;
    }
    return provider.configured(lang) ? { name: explicit, ...provider } : null;
  }
  for (const name of AUTO_ORDER[kind][lang]) {
    if (providers[name].configured(lang)) return { name, ...providers[name] };
  }
  return null;
}

export const resolveStt = (lang) => resolve("stt", lang);
export const resolveTts = (lang) => resolve("tts", lang);

export async function transcribe({ audio, mimeType, lang }) {
  const provider = resolveStt(lang);
  if (!provider) throw new HttpError(503, "stt_not_configured", "Серверийн яриа таних үйлчилгээ тохируулаагүй байна.");
  const result = await provider.run({ audio, mimeType, lang });
  return { ...result, text: result.text.trim(), provider: provider.name };
}

export async function synthesize({ text, lang }) {
  const provider = resolveTts(lang);
  if (!provider) throw new HttpError(503, "tts_not_configured", "Энэ хэлний дуу үүсгэх үйлчилгээ тохируулаагүй байна.");
  const audio = await provider.run({ text, lang });
  if (!audio.length) throw new HttpError(502, "tts_error", "Дуу үүсгэж чадсангүй. Дахин оролдоно уу.");
  return { audio, provider: provider.name };
}

export function _setSpeechProvidersForTests(kind, name, provider) {
  (kind === "stt" ? STT_PROVIDERS : TTS_PROVIDERS)[name] = provider;
}
