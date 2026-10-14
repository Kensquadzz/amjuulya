// ==========================================
// Хөтөч талын дуу хоолойн хэрэгслүүд (солигдох боломжтой):
//  - startRecording: MediaRecorder-оор бичиж, серверийн STT руу илгээх аудио гаргана
//  - recognizeInBrowser: серверийн STT тохируулаагүй үед хөтчийн Web Speech API
//  - Player: нэг удаад зөвхөн нэг аудио тоглуулна
// ==========================================

export class SpeechError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MIC_MESSAGES = {
  insecure: "Микрофон ашиглахын тулд хуудсыг HTTPS-ээр нээх шаардлагатай.",
  unsupported: "Энэ хөтөч дуу бичихийг дэмжихгүй байна. Доорх талбарт бичиж болно.",
  denied: "Микрофоны зөвшөөрөл олгогдоогүй байна. Хөтчийн хаягийн мөрний 🔒 тэмдэг дээр дарж микрофоныг зөвшөөрөөд дахин оролдоно уу. Эсвэл доор бичиж болно.",
  no_device: "Микрофон олдсонгүй. Төхөөрөмжөө шалгах эсвэл доор бичнэ үү.",
  busy: "Микрофоныг өөр програм ашиглаж байна. Түүнийг хаагаад дахин оролдоно уу.",
  no_speech: "Дуу сонсогдсонгүй. Микрофонд ойртож, тод хэлээд дахин оролдоно уу.",
  network: "Сүлжээний алдаа гарлаа. Интернэтээ шалгаад дахин оролдоно уу.",
  lang_unsupported: "Энэ хөтөч сонгосон хэлийг таньж чадахгүй байна. Доор бичих эсвэл өөр хөтөч (Chrome) ашиглана уу.",
  failed: "Дуу бичих үед алдаа гарлаа. Дахин оролдоно уу.",
};

export function speechMessage(code) {
  return MIC_MESSAGES[code] || MIC_MESSAGES.failed;
}

function mapGetUserMediaError(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return new SpeechError("denied", MIC_MESSAGES.denied);
    case "NotFoundError":
    case "OverconstrainedError":
      return new SpeechError("no_device", MIC_MESSAGES.no_device);
    case "NotReadableError":
    case "AbortError":
      return new SpeechError("busy", MIC_MESSAGES.busy);
    default:
      return new SpeechError("failed", MIC_MESSAGES.failed);
  }
}

export function canRecord() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

/**
 * Бичлэг эхлүүлнэ. Чимээгүй болбол автоматаар зогсоно.
 * Буцаах: { stop(), cancel(), done: Promise<{ blob, mimeType, heardSpeech, cancelled }> }
 */
export async function startRecording({ onLevel = () => {}, maxMs = 30000, silenceMs = 1800, noSpeechMs = 7000 } = {}) {
  if (!window.isSecureContext) throw new SpeechError("insecure", MIC_MESSAGES.insecure);
  if (!canRecord()) throw new SpeechError("unsupported", MIC_MESSAGES.unsupported);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
  } catch (err) {
    throw mapGetUserMediaError(err);
  }

  const mimeType = pickMimeType();
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    throw new SpeechError("unsupported", MIC_MESSAGES.unsupported);
  }

  const chunks = [];
  let cancelled = false;
  let heardSpeech = false;
  let raf = 0;
  let audioCtx;

  // Дууны түвшин хэмжиж, анимэйшн болон чимээгүйг илрүүлэхэд ашиглана
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let lastLoud = started;
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      onLevel(Math.min(1, rms * 8));
      const now = performance.now();
      if (rms > 0.02) {
        heardSpeech = true;
        lastLoud = now;
      }
      const elapsed = now - started;
      if (elapsed > maxMs || (heardSpeech && now - lastLoud > silenceMs) || (!heardSpeech && elapsed > noSpeechMs)) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  } catch {
    // AudioContext байхгүй бол түвшин хэмжихгүй — хэрэглэгч гараар зогсооно, хамгийн ихдээ maxMs
    heardSpeech = true;
    setTimeout(() => stop(), maxMs);
  }

  const done = new Promise((resolve) => {
    recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      audioCtx?.close().catch(() => {});
      onLevel(0);
      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
      resolve({ blob: cancelled ? null : new Blob(chunks, { type }), mimeType: type, heardSpeech, cancelled });
    };
  });

  function stop() {
    if (recorder.state !== "inactive") recorder.stop();
  }
  function cancel() {
    cancelled = true;
    stop();
  }

  recorder.start(250);
  return { stop, cancel, done };
}

export function browserRecognitionAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Хөтчийн Web Speech API-аар таних (серверийн STT байхгүй үед).
 * Буцаах: { stop(), cancel(), done: Promise<{ text, cancelled }> }
 */
export function recognizeInBrowser(lang, { onInterim = () => {} } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new SpeechError("unsupported", MIC_MESSAGES.unsupported);
  if (!window.isSecureContext) throw new SpeechError("insecure", MIC_MESSAGES.insecure);

  const rec = new SR();
  rec.lang = lang === "mn" ? "mn-MN" : "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = "";
  let interimText = "";
  let error = null;
  let cancelled = false;

  const done = new Promise((resolve, reject) => {
    rec.onresult = (event) => {
      interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      onInterim((finalText + " " + interimText).trim());
    };
    rec.onerror = (event) => {
      const map = {
        "not-allowed": "denied",
        "service-not-allowed": "denied",
        "audio-capture": "no_device",
        "no-speech": "no_speech",
        network: "network",
        "language-not-supported": "lang_unsupported",
      };
      if (event.error === "aborted") return;
      const code = map[event.error] || "failed";
      error = new SpeechError(code, MIC_MESSAGES[code]);
    };
    rec.onend = () => {
      if (cancelled) return resolve({ text: "", cancelled: true });
      const text = (finalText || interimText).trim();
      if (error && !text) return reject(error);
      if (!text) return reject(new SpeechError("no_speech", MIC_MESSAGES.no_speech));
      resolve({ text, cancelled: false });
    };
  });

  rec.start();
  return {
    stop: () => rec.stop(),
    cancel: () => {
      cancelled = true;
      rec.abort();
    },
    done,
  };
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// iOS Safari: await-ын дараа play() блоклогдохоос сэргийлж, товч дарах үед аудиог "нээнэ"
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

export function browserVoiceFor(lang) {
  if (!("speechSynthesis" in window)) return null;
  const prefix = lang === "mn" ? "mn" : "en";
  return speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(prefix)) || null;
}

/** Нэг удаад нэг л аудио тоглуулна. onState(key, "loading" | "playing" | "idle" | "error", error) */
export class Player {
  constructor(onState) {
    this.onState = onState;
    this.audio = new Audio();
    this.current = null;
    this.audio.addEventListener("ended", () => this._finish());
    this.audio.addEventListener("error", () => {
      if (this.current && this.audio.src && this.audio.src !== SILENT_WAV) this._fail(new Error("playback"));
    });
  }

  unlock() {
    try {
      this.audio.src = SILENT_WAV;
      this.audio.play().catch(() => {});
    } catch {}
  }

  async playUrl(key, getUrl) {
    this.stop();
    this.current = key;
    this.onState(key, "loading");
    try {
      const url = await getUrl();
      if (this.current !== key) return; // хэрэглэгч хооронд нь өөр зүйл тоглуулсан
      this.audio.src = url;
      await this.audio.play();
      this.onState(key, "playing");
    } catch (err) {
      if (this.current === key) this._fail(err);
    }
  }

  speakWithBrowser(key, text, lang) {
    this.stop();
    const voice = browserVoiceFor(lang);
    if (!voice) return this.onState(key, "error", new Error("no_voice"));
    this.current = key;
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = voice;
    utter.lang = voice.lang;
    utter.rate = 0.95;
    utter.onend = () => this.current === key && this._finish();
    utter.onerror = (e) => this.current === key && e.error !== "interrupted" && e.error !== "canceled" && this._fail(new Error("playback"));
    this.onState(key, "playing");
    speechSynthesis.speak(utter);
  }

  stop() {
    const key = this.current;
    this.current = null;
    this.audio.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (key) this.onState(key, "idle");
  }

  _finish() {
    const key = this.current;
    this.current = null;
    if (key) this.onState(key, "idle");
  }

  _fail(err) {
    const key = this.current;
    this.current = null;
    this.audio.pause();
    if (key) this.onState(key, "error", err);
  }
}
