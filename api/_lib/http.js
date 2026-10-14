// ==========================================
// Хэл сурах API-ийн нийтлэг туслахууд (Vercel болон локал dev server хоёуланд ажиллана)
// Файлын нэр "_"-ээр эхэлсэн тул Vercel үүнийг тусдаа endpoint болгохгүй.
// ==========================================

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export function sendError(res, err) {
  if (err instanceof HttpError) {
    if (err.extra.retryAfter) res.setHeader("Retry-After", String(err.extra.retryAfter));
    return sendJson(res, err.status, { error: { code: err.code, message: err.message } });
  }
  safeLog("unhandled error", err);
  return sendJson(res, 500, { error: { code: "internal", message: "Серверт алдаа гарлаа. Дахин оролдоно уу." } });
}

// Vercel req.body-г урьдчилж задалдаг; локал серверт stream-ээс уншина.
export async function readJsonBody(req, maxBytes) {
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) throw new HttpError(413, "too_large", "Хүсэлт хэт том байна.");
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > maxBytes) throw new HttpError(413, "too_large", "Хүсэлт хэт том байна.");
    try {
      body = body ? JSON.parse(body) : {};
    } catch {
      throw new HttpError(400, "bad_json", "JSON буруу байна.");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "bad_request", "Хүсэлтийн бие объект байх ёстой.");
  }
  return body;
}

export function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, "method_not_allowed", "Method Not Allowed");
}

// Ижил домэйноос ирсэн хүсэлтийг л зөвшөөрнө (өөр сайт манай API түлхүүрээр үнэгүй ашиглахаас сэргийлнэ).
// LEARN_ALLOWED_ORIGINS="https://amjuulya.mn,https://www.amjuulya.mn" гэж нэмэлтээр зааж болно.
export function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return; // same-origin GET/POST зарим хөтөч Origin илгээдэггүй
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "forbidden_origin", "Зөвшөөрөгдөөгүй эх сурвалж.");
  }
  if (originHost === host) return;
  const allowed = (process.env.LEARN_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return;
  throw new HttpError(403, "forbidden_origin", "Зөвшөөрөгдөөгүй эх сурвалж.");
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

// ==========================================
// Rate limit + давхар хүсэлт хориглох.
// UPSTASH_REDIS_REST_URL/TOKEN байвал Redis (бүх instance-д нэгдсэн), эс бөгөөс санах ой.
// ==========================================

const memoryCounters = new Map();
const memoryKeys = new Map();

function hasRedis() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redis(cmd) {
  const response = await fetchWithTimeout(
    process.env.UPSTASH_REDIS_REST_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      body: JSON.stringify(cmd),
    },
    3000
  );
  if (!response.ok) throw new Error(`redis ${response.status}`);
  return (await response.json()).result;
}

function sweep(map, now) {
  if (map.size < 5000) return;
  for (const [k, v] of map) if (v.expires <= now) map.delete(k);
}

export async function rateLimit(req, bucket, limit, windowSec) {
  const key = `rl:${bucket}:${clientIp(req)}`;
  let count;
  if (hasRedis()) {
    try {
      count = await redis(["INCR", key]);
      if (count === 1) await redis(["EXPIRE", key, String(windowSec)]);
    } catch (e) {
      safeLog("rate limit redis error", e);
    }
  }
  if (count === undefined) {
    const now = Date.now();
    sweep(memoryCounters, now);
    const entry = memoryCounters.get(key);
    if (!entry || entry.expires <= now) {
      memoryCounters.set(key, { count: 1, expires: now + windowSec * 1000 });
      count = 1;
    } else {
      count = ++entry.count;
    }
  }
  if (count > limit) {
    throw new HttpError(429, "rate_limited", "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.", {
      retryAfter: windowSec,
    });
  }
}

// Ижил requestId-тай хүсэлт ttl хугацаанд дахин ирвэл татгалзана.
export async function claimRequestId(scope, requestId, ttlSec = 120) {
  if (!requestId) return;
  const key = `dup:${scope}:${requestId}`;
  if (hasRedis()) {
    try {
      const ok = await redis(["SET", key, "1", "NX", "EX", String(ttlSec)]);
      if (ok !== "OK") throw new HttpError(409, "duplicate", "Энэ хүсэлт аль хэдийн илгээгдсэн байна.");
      return;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      safeLog("dedupe redis error", e);
    }
  }
  const now = Date.now();
  sweep(memoryKeys, now);
  const existing = memoryKeys.get(key);
  if (existing && existing.expires > now) {
    throw new HttpError(409, "duplicate", "Энэ хүсэлт аль хэдийн илгээгдсэн байна.");
  }
  memoryKeys.set(key, { expires: now + ttlSec * 1000 });
}

// Алдаа гарвал requestId-г чөлөөлж, хэрэглэгч "Дахин оролдох" дарж болно.
export async function releaseRequestId(scope, requestId) {
  if (!requestId) return;
  const key = `dup:${scope}:${requestId}`;
  memoryKeys.delete(key);
  if (hasRedis()) await redis(["DEL", key]).catch(() => {});
}

export async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isAbort(err) {
  return err?.name === "AbortError" || err?.name === "TimeoutError";
}

// Нууц мэдээлэл (API key, Bearer token) лог руу орохоос сэргийлнэ.
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /(xi-api-key|api[-_]?key|subscription-key|token)["'=:\s]+[A-Za-z0-9._-]{8,}/gi,
];

export function redact(value) {
  let text = typeof value === "string" ? value : value instanceof Error ? `${value.name}: ${value.message}` : JSON.stringify(value);
  for (const re of SECRET_PATTERNS) text = String(text).replace(re, "[redacted]");
  return text.slice(0, 500);
}

export function safeLog(label, value) {
  console.error(`[learn] ${label}:`, value === undefined ? "" : redact(value));
}
