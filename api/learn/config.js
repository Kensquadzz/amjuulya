// GET /api/learn/config — аль боломжууд серверт тохируулагдсаныг UI-д хэлнэ (нууц мэдээлэлгүй)
import { sendError, sendJson } from "../_lib/http.js";
import { llmProvider } from "../_lib/llm.js";
import { resolveStt, resolveTts } from "../_lib/speech.js";
import { LIMITS } from "../_lib/validate.js";

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
    });
  } catch (err) {
    return sendError(res, err);
  }
}
