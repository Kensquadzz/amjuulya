// ==========================================
// Хэлний загвар (LLM) — солигдох боломжтой давхарга.
// Одоогоор Anthropic Claude (энэ репо messenger bot-доо аль хэдийн ашигладаг).
// Өөр үйлчилгээ нэмэх бол PROVIDERS-д { configured(), generate() } хэлбэрээр нэмнэ.
// ==========================================
import Anthropic from "@anthropic-ai/sdk";
import { HttpError, safeLog } from "./http.js";
import { TUTOR_SCHEMA, TUTOR_SYSTEM_PROMPT, userTurn } from "./tutor-prompt.js";

const DEFAULT_MODEL = "claude-opus-5-5";
// Server-side refusal fallback дэмждэг model-ууд (Claude API дээр)
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-fable-5"]);

// Bibi-д тусдаа түлхүүр өгч болно; эс бөгөөс Messenger ботынхтой ижил ANTHROPIC_API_KEY-г ашиглана
const apiKey = () => process.env.LEARN_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

let client;
function anthropic() {
  if (!client) {
    client = new Anthropic({
      apiKey: apiKey(),
      timeout: Number(process.env.LEARN_LLM_TIMEOUT_MS || 25000),
      maxRetries: 1,
    });
  }
  return client;
}

// Түүхийг Claude-ийн user/assistant ээлжлэх формат руу хөрвүүлнэ
export function buildMessages(history, mode, inputLang, text) {
  const msgs = [];
  for (const m of history) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.text;
    else msgs.push({ role: m.role, content: m.text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const current = userTurn(mode, inputLang, text);
  const last = msgs[msgs.length - 1];
  if (last && last.role === "user") last.content += "\n" + current;
  else msgs.push({ role: "user", content: current });
  return msgs;
}

const anthropicProvider = {
  name: "anthropic",
  configured: () => !!apiKey(),
  async generate(messages) {
    const model = process.env.LEARN_ANTHROPIC_MODEL || DEFAULT_MODEL;
    const params = {
      model,
      max_tokens: 4000,
      // Дуут чат тул хурд чухал: бодолтыг бага effort-оор
      output_config: {
        effort: process.env.LEARN_ANTHROPIC_EFFORT || "low",
        format: { type: "json_schema", schema: TUTOR_SCHEMA },
      },
      system: [{ type: "text", text: TUTOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
    };
    if (FALLBACK_MODELS.has(model)) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }

    let response;
    try {
      response = await anthropic().beta.messages.create(params);
    } catch (err) {
      throw mapAnthropicError(err);
    }

    if (response.stop_reason === "refusal") {
      throw new HttpError(422, "refused", "Энэ хүсэлтэд AI хариулах боломжгүй байна. Өөрөөр асууж үзнэ үү.");
    }
    if (response.stop_reason === "max_tokens") {
      safeLog("llm max_tokens", { model, usage: response.usage });
      throw new HttpError(502, "ai_incomplete", "AI-ийн хариулт дутуу ирлээ. Дахин оролдоно уу.");
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return parseTutorJson(text);
  },
};

function mapAnthropicError(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    safeLog("llm auth error", err);
    return new HttpError(503, "ai_not_configured", "AI үйлчилгээний тохиргоо буруу байна (API түлхүүр).");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "ai_busy", "AI үйлчилгээ одоогоор ачаалалтай байна. Түр хүлээгээд дахин оролдоно уу.", { retryAfter: 10 });
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new HttpError(504, "ai_timeout", "AI хариулахад хэт удлаа. Дахин оролдоно уу.");
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    safeLog("llm bad request", err);
    return new HttpError(502, "ai_error", "AI үйлчилгээ хүсэлтийг хүлээж авсангүй. Дахин оролдоно уу.");
  }
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIError) {
    safeLog("llm api error", err);
    return new HttpError(502, "ai_unavailable", "AI үйлчилгээтэй холбогдож чадсангүй. Дахин оролдоно уу.");
  }
  return err;
}

const str = (v) => (typeof v === "string" ? v.trim() : "");
const lang = (v, allowed) => (allowed.includes(v) ? v : allowed[allowed.length - 1]);

// Structured output-ыг шалгаж, UI-д найдвартай хэлбэр рүү оруулна
export function parseTutorJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    safeLog("llm invalid json", text.slice(0, 200));
    throw new HttpError(502, "ai_bad_output", "AI-ийн хариултыг уншиж чадсангүй. Дахин оролдоно уу.");
  }
  const intent = ["translate", "conversation", "clarify"].includes(data.intent) ? data.intent : "conversation";
  const t = data.translation || {};
  const c = data.correction || {};
  const result = {
    intent,
    detectedLanguage: lang(data.detected_language, ["mn", "en", "mixed", "unknown"]),
    reply: str(data.reply),
    translation: {
      sourceLang: lang(t.source_lang, ["mn", "en", ""]),
      targetLang: lang(t.target_lang, ["mn", "en", ""]),
      text: str(t.text),
    },
    explanation: str(data.explanation),
    correction:
      c.has_correction && str(c.corrected)
        ? { original: str(c.original), corrected: str(c.corrected), note: str(c.note) }
        : null,
    repeatPrompt: str(data.repeat_prompt),
    speak: { text: str(data.speak_text), lang: lang(data.speak_lang, ["mn", "en"]) },
  };
  if (!result.reply && !result.translation.text) {
    throw new HttpError(502, "ai_bad_output", "AI хоосон хариулт өглөө. Дахин оролдоно уу.");
  }
  if (!result.speak.text) {
    result.speak = result.translation.text
      ? { text: result.translation.text, lang: result.translation.targetLang || "en" }
      : { text: result.reply, lang: result.detectedLanguage === "mn" ? "mn" : "en" };
  }
  return result;
}

const PROVIDERS = { anthropic: anthropicProvider };

export function llmProvider() {
  const name = process.env.LEARN_LLM_PROVIDER || "anthropic";
  const provider = PROVIDERS[name];
  if (!provider) throw new HttpError(503, "ai_not_configured", `LLM provider "${name}" дэмжигдээгүй.`);
  return provider;
}

// Тестэд provider-ийг солих боломж
export function _setProviderForTests(name, provider) {
  PROVIDERS[name] = provider;
}
