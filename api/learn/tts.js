// POST /api/learn/tts — AI хариултыг дуу (audio/mpeg) болгоно
import { checkOrigin, rateLimit, readJsonBody, requireMethod, sendError } from "../_lib/http.js";
import { synthesize } from "../_lib/speech.js";
import { validateTts } from "../_lib/validate.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  try {
    requireMethod(req, "POST");
    checkOrigin(req);
    await rateLimit(req, "tts", Number(process.env.LEARN_TTS_PER_MIN || 30), 60);
    const input = validateTts(await readJsonBody(req, 8000));
    const { audio } = await synthesize(input);
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.end(audio);
  } catch (err) {
    return sendError(res, err);
  }
}
