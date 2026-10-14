// GET /api/learn/config — аль боломжууд серверт тохируулагдсаныг UI-д хэлнэ (нууц мэдээлэлгүй)
import { sendError, sendJson } from "../_lib/http.js";
import { llmProvider } from "../_lib/llm.js";
import { resolveStt, resolveTts } from "../_lib/speech.js";
import { LIMITS } from "../_lib/validate.js";

const DIAG_VARS = [
  "LEARN_ANTHROPIC_API_KEY",
  "ANTHROPIC_API_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID_MN",
  "ELEVENLABS_VOICE_ID_EN",
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_REGION",
  "OPENAI_API_KEY",
  "STT_PROVIDER",
  "STT_PROVIDER_MN",
  "STT_PROVIDER_EN",
  "TTS_PROVIDER",
  "TTS_PROVIDER_MN",
  "TTS_PROVIDER_EN",
];

// ?diag=1 — тохиргооны алдааг олоход: хувьсагч БАЙГАА ЭСЭХ (утга биш), аль deploy хариулж байгаа,
// нэр нь бага зэрэг зөрсөн хувьсагчид (жишээ нь ELEVEN_LABS_API_KEY). Нууц утгыг хэзээ ч буцаахгүй.
function diagnostics() {
  const present = Object.fromEntries(DIAG_VARS.map((name) => [name, !!(process.env[name] || "").trim()]));
  const nearMisses = Object.keys(process.env).filter(
    (name) => /eleven|anthropic|azure|openai|(stt|tts)_provider/i.test(name) && !DIAG_VARS.includes(name)
  );
  return {
    deployment: {
      env: process.env.VERCEL_ENV || "local",
      id: process.env.VERCEL_DEPLOYMENT_ID || null,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    },
    present,
    nearMisses,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return sendJson(res, 405, { error: { code: "method_not_allowed", message: "GET only" } });
    let aiReady = false;
    try {
      aiReady = llmProvider().configured();
    } catch {}
    return sendJson(res, 200, {
      ai: aiReady,
      stt: { mn: !!resolveStt("mn"), en: !!resolveStt("en") },
      tts: { mn: !!resolveTts("mn"), en: !!resolveTts("en") },
      limits: { textChars: LIMITS.textChars, ttsChars: LIMITS.ttsChars, maxRecordSec: 30 },
      ...(req.query?.diag || new URL(req.url || "/", "http://x").searchParams.get("diag") ? { diag: diagnostics() } : {}),
    });
  } catch (err) {
    return sendError(res, err);
  }
}
