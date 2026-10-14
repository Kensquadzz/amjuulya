// POST /api/learn/chat — орчуулга / ярианы дасгалын AI хариулт
import {
  checkOrigin,
  claimRequestId,
  rateLimit,
  readJsonBody,
  releaseRequestId,
  requireMethod,
  sendError,
  sendJson,
} from "../_lib/http.js";
import { buildMessages, llmProvider } from "../_lib/llm.js";
import { LIMITS, validateChat } from "../_lib/validate.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  let requestId = null;
  try {
    requireMethod(req, "POST");
    checkOrigin(req);
    await rateLimit(req, "chat", Number(process.env.LEARN_CHAT_PER_MIN || 20), 60);
    const input = validateChat(await readJsonBody(req, LIMITS.chatBodyBytes));

    const provider = llmProvider();
    if (!provider.configured()) {
      return sendJson(res, 503, {
        error: { code: "ai_not_configured", message: "AI үйлчилгээ тохируулаагүй байна (ANTHROPIC_API_KEY)." },
      });
    }

    requestId = input.requestId;
    await claimRequestId("chat", requestId);

    const started = Date.now();
    const result = await provider.generate(buildMessages(input.history, input.mode, input.inputLang, input.text));
    // Хэрэглэгчийн текстийг логлохгүй — зөвхөн мета мэдээлэл
    console.log(`[learn] chat ok mode=${input.mode} lang=${input.inputLang} intent=${result.intent} ms=${Date.now() - started}`);
    return sendJson(res, 200, { mode: input.mode, ...result });
  } catch (err) {
    if (requestId && err?.code !== "duplicate") await releaseRequestId("chat", requestId);
    return sendError(res, err);
  }
}
