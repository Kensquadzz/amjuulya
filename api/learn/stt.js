// POST /api/learn/stt — бичлэгийг текст болгоно. Аудиог хадгалахгүй, логлохгүй.
import {
  checkOrigin,
  claimRequestId,
  HttpError,
  rateLimit,
  readJsonBody,
  releaseRequestId,
  requireMethod,
  sendError,
  sendJson,
} from "../_lib/http.js";
import { transcribe } from "../_lib/speech.js";
import { LIMITS, validateStt } from "../_lib/validate.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  let requestId = null;
  try {
    requireMethod(req, "POST");
    checkOrigin(req);
    await rateLimit(req, "stt", Number(process.env.LEARN_STT_PER_MIN || 15), 60);
    const input = validateStt(await readJsonBody(req, LIMITS.sttBodyBytes));

    requestId = input.requestId;
    await claimRequestId("stt", requestId);

    const result = await transcribe(input);
    if (!result.text) throw new HttpError(422, "no_speech", "Яриа танигдсангүй. Илүү ойроос, тод хэлээд дахин оролдоно уу.");
    console.log(`[learn] stt ok lang=${input.lang} provider=${result.provider} bytes=${input.audio.length}`);
    return sendJson(res, 200, { text: result.text, lang: input.lang });
  } catch (err) {
    if (requestId && err?.code !== "duplicate") await releaseRequestId("stt", requestId);
    return sendError(res, err);
  }
}
