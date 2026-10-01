// ==========================================
// MONGOL AI — Messenger bot
// - Бүтээгдэхүүний цэс (Canva Pro + Office загварын PACK-ууд)
// - Comment бичсэн хүнд Messenger-ээр автоматаар цэс илгээнэ
// - Чөлөөт асуултад AI (Claude) хариулна
// - Meta Conversions API-д ViewContent / InitiateCheckout / Purchase илгээнэ
// ==========================================

export const config = { maxDuration: 30 };

const GRAPH = "https://graph.facebook.com/v24.0";

// Ботын өөрийн мессежийг админых гэж андуурахгүйн тулд
const BOT_TAG = "MONGOL_AI_BOT";

// ==========================================
// БҮТЭЭГДЭХҮҮН — шинээр нэмэх бол энд нэг блок нэмэхэд болно
// ==========================================

const PRODUCTS = {
  TUSHAAL: {
    emoji: "📁",
    name: "Тушаалын загвар PACK",
    short: "Тушаал",
    price: 14900,
    delivery: "Файлуудыг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "48+ бэлэн тушаалын загвар",
      "Word форматаар, шууд засварлана",
    ],
  },
  HR: {
    emoji: "👥",
    name: "Хүний нөөцийн PACK",
    short: "Хүний нөөц",
    price: 19900,
    delivery: "Файлуудыг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "36+ хүний нөөцийн загвар",
      "Ажлын байрны тодорхойлолт зэрэг HR баримтууд",
      "Word / Excel, шууд засварлана",
    ],
  },
  GEREE: {
    emoji: "📄",
    name: "Хөдөлмөрийн гэрээ PACK",
    short: "Гэрээ",
    price: 14900,
    delivery: "Файлуудыг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "9+ хөдөлмөрийн гэрээний загвар",
      "Word форматаар, шууд засварлана",
    ],
  },
  ALBAN: {
    emoji: "📝",
    name: "Албан бичгийн PACK",
    short: "Албан бичиг",
    price: 9900,
    delivery: "Файлуудыг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "17+ албан бичгийн загвар",
      "Word форматаар, шууд засварлана",
    ],
  },
  MASTER: {
    emoji: "🔥",
    name: "HR & OFFICE MASTER PACK",
    short: "MASTER PACK",
    price: 39900,
    oldPrice: 79900,
    delivery: "Бүх файлыг нэг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "110+ бэлэн загвар — бүх 4 PACK нэг дор",
      "Тушаал (48+), Хүний нөөц (36+), Гэрээ (9+), Албан бичиг (17+)",
      "Word / Excel, шууд засварлана",
    ],
  },
  CANVA: {
    emoji: "🎨",
    name: "Canva Pro — 1 жил",
    short: "Canva Pro",
    price: 15000,
    delivery: "Canva Pro урилгыг таны имэйл рүү илгээнэ",
    details: [
      "Бүх premium загвар, элемент",
      "AI зураг, бичвэр үүсгэгч",
      "Background remover, Magic resize",
      "Premium зураг, видео, фонт",
    ],
  },
};

const PACK_IDS = ["TUSHAAL", "HR", "GEREE", "ALBAN"];

// "50%" гэх мэт хямдралын хувь
const discount = (p) =>
  p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;

const BANK = {
  name: "Khan Bank",
  account: "5037598829",
  iban: "MN890005005037598829",
};

const fmt = (n) => n.toLocaleString("en-US") + "₮";

// Хэрэглэгч бичгээр бүтээгдэхүүн нэрлэвэл таних түлхүүр үгс
const KEYWORDS = {
  MASTER: ["master", "мастер", "110"],
  CANVA: ["canva", "канва"],
  TUSHAAL: ["тушаал", "tushaal"],
  HR: ["хүний нөөц", "hunii nuuts", "huni nuuts", "hr pack"],
  GEREE: ["гэрээ", "geree"],
  ALBAN: ["албан бичиг", "alban bichig"],
};

// ==========================================
// WEBHOOK
// ==========================================

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const body = req.body || {};
  if (body.object !== "page") {
    return res.status(404).send("Not a page event");
  }

  for (const entry of body.entry || []) {
    const pageId = entry.id;

    // ---------- COMMENT ----------
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const isNewComment =
        change.field === "feed" &&
        value.item === "comment" &&
        value.verb === "add";

      // Page өөрөө бичсэн comment-д хариулахгүй
      if (!isNewComment || value.from?.id === pageId) continue;

      console.log("Comment:", value.comment_id, value.message);
      await safe(() => handleComment(value.comment_id));
    }

    // ---------- MESSENGER ----------
    for (const event of entry.messaging || []) {
      await safe(() => handleMessagingEvent(event, pageId));
    }
  }

  return res.status(200).send("EVENT_RECEIVED");
}

async function safe(fn) {
  try {
    await fn();
  } catch (error) {
    console.error("Handler error:", error);
  }
}

async function handleMessagingEvent(event, pageId) {
  const senderId = event.sender?.id;
  if (!senderId) return;

  // ---------- Админ/ботын илгээсэн мессеж (echo) ----------
  if (event.message?.is_echo) {
    const fromBot = event.message.metadata === BOT_TAG;
    const text = (event.message.text || "").toLowerCase();
    const customerId = event.recipient?.id;

    if (!fromBot && customerId && isAdminConfirmation(text)) {
      const value =
        extractAmount(text) || (await lastQuotedPrice(customerId)) || 0;

      console.log("Purchase confirmed:", customerId, value);

      await sendConversionEvent({
        eventName: "Purchase",
        pageId,
        psid: customerId,
        value,
        eventId: `purchase_${event.message.mid}`,
      });
    }
    return;
  }

  // ---------- Товч (postback) ----------
  if (event.postback?.payload) {
    console.log("Postback:", senderId, event.postback.payload);
    await handlePayload(senderId, pageId, event.postback.payload);
    return;
  }

  // ---------- Quick reply ----------
  if (event.message?.quick_reply?.payload) {
    console.log("Quick reply:", senderId, event.message.quick_reply.payload);
    await handlePayload(senderId, pageId, event.message.quick_reply.payload);
    return;
  }

  // ---------- Зураг (төлбөрийн баримт) ----------
  const attachments = event.message?.attachments || [];
  if (attachments.some((a) => a.type === "image") && !event.message?.text) {
    console.log("Payment screenshot received from:", senderId);
    await sendText(
      senderId,
      "✅ Төлбөрийн баримтыг хүлээн авлаа. Баярлалаа!\n\n" +
        "📧 Файл хүлээн авах ИМЭЙЛ хаягаа илгээгээгүй бол энд бичээрэй.\n\n" +
        "⏳ Админ баталгаажуулсны дараа танд мэдэгдэх болно."
    );
    return;
  }

  // ---------- Текст ----------
  const raw = event.message?.text?.trim();
  if (!raw) return;

  console.log("Messenger:", senderId, raw);
  await handleText(senderId, pageId, raw);
}

// ==========================================
// PAYLOAD (товч, quick reply)
// ==========================================

async function handlePayload(psid, pageId, payload) {
  if (payload === "MENU" || payload === "GET_STARTED") {
    return sendMenu(psid);
  }

  // Хуучин товчтой нийцүүлэх
  if (payload === "BUY_CANVA_PRO") payload = "BUY_CANVA";

  const [action, id] = payload.split("_");
  if (!PRODUCTS[id]) return sendMenu(psid);

  if (action === "VIEW") return showProduct(psid, pageId, id);
  if (action === "BUY") return handleBuy(psid, pageId, id);

  return sendMenu(psid);
}

// ==========================================
// ТЕКСТ
// ==========================================

async function handleText(psid, pageId, raw) {
  const text = raw.toLowerCase();

  // Имэйл илгээсэн
  const email = raw.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i);
  if (email) {
    return sendText(
      psid,
      `📧 Имэйл хүлээн авлаа: ${email[0]}\n\n` +
        "Төлбөрийн баримтын screenshot-оо илгээсэн бол болоо. " +
        "Админ төлбөрийг шалгаад энэ имэйл рүү илгээнэ ✅"
    );
  }

  // Богино мессежээр бүтээгдэхүүн нэрлэсэн бол шууд карт харуулна
  const wordCount = text.split(/\s+/).length;
  const productId = detectProduct(text);
  if (productId && wordCount <= 4) {
    return showProduct(psid, pageId, productId);
  }

  // Бусад бүх мессежийг AI-д
  return handleAI(psid, pageId, raw);
}

function detectProduct(text) {
  for (const [id, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => text.includes(w))) return id;
  }
  return null;
}

// ==========================================
// ЦЭС, БҮТЭЭГДЭХҮҮН, ХУДАЛДАН АВАЛТ
// ==========================================

function menuText(intro) {
  const line = (p) =>
    `${p.emoji} ${p.name} — ${fmt(p.price)}` +
    (p.oldPrice ? ` (${discount(p)}% хямдрал)` : "");

  const packs = [...PACK_IDS, "MASTER"].map((id) => line(PRODUCTS[id]));
  const others = Object.keys(PRODUCTS)
    .filter((id) => !PACK_IDS.includes(id) && id !== "MASTER")
    .map((id) => line(PRODUCTS[id]));

  return (
    (intro ? intro + "\n\n" : "") +
    "📂 OFFICE ЗАГВАРЫН PACK-УУД:\n" +
    packs.join("\n") +
    (others.length ? "\n\n✨ МӨН:\n" + others.join("\n") : "") +
    "\n\nТа алийг нь авах вэ? 👇"
  );
}

function menuQuickReplies() {
  return Object.entries(PRODUCTS).map(([id, p]) => ({
    content_type: "text",
    title: qrTitle(`${p.emoji} ${p.short}`),
    payload: `VIEW_${id}`,
  }));
}

async function sendMenu(psid, intro = "Сайн байна уу 👋 Mongol AI-д тавтай морил!") {
  return sendMessage(psid, {
    text: menuText(intro),
    quick_replies: menuQuickReplies(),
  });
}

function productText(id) {
  const p = PRODUCTS[id];
  const price = p.oldPrice
    ? `🔥 ${discount(p)}% ХЯМДРАЛ\n💰 Үнэ: ~${fmt(p.oldPrice)}~ → ${fmt(p.price)}`
    : `💰 Үнэ: ${fmt(p.price)}`;

  return (
    `${p.emoji} ${p.name.toUpperCase()}\n\n` +
    p.details.map((d) => `✅ ${d}`).join("\n") +
    `\n\n${price}\n📩 ${p.delivery}.` +
    "\n\nАвах бол доорх товчийг дарна уу 👇"
  );
}

function productQuickReplies(id) {
  const p = PRODUCTS[id];
  const qr = [
    { content_type: "text", title: qrTitle(`🟢 АВАХ — ${fmt(p.price)}`), payload: `BUY_${id}` },
  ];
  if (PACK_IDS.includes(id)) {
    qr.push({ content_type: "text", title: qrTitle("🔥 MASTER PACK"), payload: "VIEW_MASTER" });
  }
  qr.push({ content_type: "text", title: qrTitle("⬅️ Бусад"), payload: "MENU" });
  return qr;
}

async function showProduct(psid, pageId, id) {
  await sendMessage(psid, {
    text: productText(id),
    quick_replies: productQuickReplies(id),
  });

  await sendConversionEvent({
    eventName: "ViewContent",
    pageId,
    psid,
    value: PRODUCTS[id].price,
  });
}

function paymentText(id) {
  const p = PRODUCTS[id];
  const delivery = p.delivery.charAt(0).toLowerCase() + p.delivery.slice(1);
  return (
    "💳 ТӨЛБӨРИЙН МЭДЭЭЛЭЛ\n\n" +
    `${p.emoji} ${p.name}\n` +
    `💰 Төлбөр: ${fmt(p.price)}\n\n` +
    `🏦 Банк: ${BANK.name}\n` +
    `💳 Данс: ${BANK.account}\n\n` +
    "📋 IBAN:\n" +
    `${BANK.iban}\n\n` +
    "✍️ ГҮЙЛГЭЭНИЙ УТГА:\n" +
    "Өөрийн НЭР + УТАСНЫ ДУГААР-аа заавал бичнэ үү.\n" +
    "Жишээ: Бат 99112233\n\n" +
    "📌 ДАРААГИЙН АЛХАМ:\n" +
    "1️⃣ Төлбөрөө шилжүүлнэ\n" +
    "2️⃣ Баримтын SCREENSHOT-оо энд илгээнэ\n" +
    "3️⃣ Файл хүлээн авах ИМЭЙЛ хаягаа бичнэ\n\n" +
    `✅ Админ баталгаажуулсны дараа ${delivery}.`
  );
}

async function handleBuy(psid, pageId, id) {
  await sendText(psid, paymentText(id));

  await sendConversionEvent({
    eventName: "InitiateCheckout",
    pageId,
    psid,
    value: PRODUCTS[id].price,
  });
}

// ==========================================
// COMMENT → Messenger (private reply) + comment дор хариу
// ==========================================

async function handleComment(commentId) {
  if (!commentId) return;

  const intro = "Сайн байна уу 👋 Comment бичсэнд баярлалаа!";

  const sent = await sendPrivateReply(commentId, {
    text: menuText(intro),
    metadata: BOT_TAG,
    quick_replies: menuQuickReplies(),
  });

  // Товчтой хувилбар орохгүй бол энгийн текстээр
  if (!sent) {
    await sendPrivateReply(commentId, {
      text: menuText(intro).replace(
        "Та алийг нь авах вэ? 👇",
        "Сонирхсон бүтээгдэхүүнийхээ нэрийг энд бичээрэй 👇"
      ),
      metadata: BOT_TAG,
    });
  }

  await replyToComment(commentId, "Танд Messenger-ээр мэдээлэл илгээлээ 📩");
}

// ==========================================
// AI (Claude)
// ==========================================

function systemPrompt() {
  const catalog = Object.entries(PRODUCTS)
    .map(
      ([id, p]) =>
        `- [${id}] ${p.name} — ${fmt(p.price)}` +
        (p.oldPrice ? ` (үндсэн үнэ ${fmt(p.oldPrice)}, ${discount(p)}% хямдрал)` : "") +
        `. ${p.details.join("; ")}. Хүргэлт: ${p.delivery}.`
    )
    .join("\n");

  return `Чи бол "Mongol AI" Facebook Page-ийн Messenger дээрх борлуулалтын туслах.
Хэрэглэгчидтэй найрсаг, товч, Монгол хэлээр (кирилл үсгээр) ярь. Хэрэглэгч латин үсгээр монголоор бичсэн ч ойлгоод кириллээр хариул.

БҮТЭЭГДЭХҮҮН (зөвхөн эдгээрийг зарна, үнэ нь яг ийм):
${catalog}

ТӨЛБӨРИЙН ЖУРАМ:
Хэрэглэгч данс руу шилжүүлж (гүйлгээний утгад нэр + утасны дугаар), баримтын screenshot-оо чатад илгээж, имэйл хаягаа бичнэ. Админ шалгаад файл/урилгыг имэйлээр илгээнэ. QPay зэрэг автомат төлбөрийн систем байхгүй.

ДҮРЭМ:
- Хариулт 1–4 өгүүлбэр. Emoji бага зэрэг ашиглаж болно.
- Жагсаалтад байхгүй бүтээгдэхүүн, үнэ, хямдрал, урамшуулал, хугацааг ХЭЗЭЭ Ч зохиож болохгүй. Мэдэхгүй зүйлийг "админ тодруулж хариулна" гэж хэл.
- Файлыг өөрөө илгээж, жишээ файл хавсаргаж чадахгүй. Жишээ харахыг хүсвэл админ илгээнэ гэж хэл.
- Төлбөр баталгаажуулах, мөнгө буцаах, гомдол зэрэгт "админ удахгүй хариулна" гэж хэл.
- Бүтээгдэхүүнтэй холбоогүй сэдвээр бол эелдгээр товч хариулаад бүтээгдэхүүн рүү чиглүүл.
- Аль нь тохирохыг асуувал хэрэгцээг нь сонсоод тохирохыг санал болго. Олон PACK хэрэгтэй бол MASTER PACK-ийг санал болго.

ТОВЧ ХАРУУЛАХ (хариултын хамгийн төгсгөлд дээд тал нь НЭГИЙГ бич, хэрэглэгчид харагдахгүй):
- [[MENU]] — бүх бүтээгдэхүүний цэсийг харуулах (мэндчилгээ, "юу байгаа вэ" г.м.)
- [[PRODUCT:ID]] — нэг бүтээгдэхүүний дэлгэрэнгүй, АВАХ товч (жишээ [[PRODUCT:HR]])
- [[BUY:ID]] — хэрэглэгч тодорхой бүтээгдэхүүнийг авахаар шийдсэн бол төлбөрийн мэдээлэл илгээх
Дансны дугаарыг өөрөө бүү бич — [[BUY:ID]] ашигла.`;
}

async function handleAI(psid, pageId, raw) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // AI тохируулаагүй бол цэс харуулна
  if (!apiKey) return sendMenu(psid);

  await senderAction(psid, "typing_on");

  const history = await recentMessages(psid, 12);
  const messages = buildMessages(history, raw);

  let reply = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt(),
        messages,
      }),
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.error("Claude API error:", response.status, await response.text());
    } else {
      const data = await response.json();
      reply = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    }
  } catch (error) {
    console.error("Claude API failed:", error);
  }

  if (!reply) return sendMenu(psid);

  // Төгсгөлийн товчны тэмдэглэгээ
  const marker = reply.match(/\[\[(MENU|PRODUCT:(\w+)|BUY:(\w+))\]\]/);
  const text = reply.replace(/\[\[[^\]]*\]\]/g, "").trim();

  if (marker?.[3] && PRODUCTS[marker[3]]) {
    if (text) await sendText(psid, text);
    return handleBuy(psid, pageId, marker[3]);
  }

  if (marker?.[2] && PRODUCTS[marker[2]]) {
    if (text) await sendText(psid, text);
    return showProduct(psid, pageId, marker[2]);
  }

  if (marker?.[1] === "MENU") {
    return sendMessage(psid, {
      text: menuText(text),
      quick_replies: menuQuickReplies(),
    });
  }

  return sendText(psid, text || "Админ удахгүй хариулна 🙏");
}

// Messenger-ийн түүхийг Claude-ийн формат руу хөрвүүлэх
function buildMessages(history, current) {
  const msgs = [];
  for (const m of history) {
    const role = m.fromPage ? "assistant" : "user";
    const text = (m.text || "").trim();
    if (!text) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n" + text;
    else msgs.push({ role, content: text });
  }

  // Одоогийн мессеж түүхэнд аль хэдийн орсон бол давхардуулахгүй
  const last = msgs[msgs.length - 1];
  if (last && last.role === "user") {
    if (!last.content.endsWith(current)) last.content += "\n" + current;
  } else {
    msgs.push({ role: "user", content: current });
  }

  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs.length ? msgs : [{ role: "user", content: current }];
}

// Хэрэглэгчтэй хийсэн сүүлийн мессежүүд (хуучнаас шинэ рүү)
async function recentMessages(psid, limit) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  try {
    const url =
      `${GRAPH}/me/conversations?platform=messenger&user_id=${psid}` +
      `&fields=messages.limit(${limit}){message,from}&access_token=${token}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Conversation fetch error:", await response.text());
      return [];
    }
    const data = await response.json();
    const items = data.data?.[0]?.messages?.data || [];
    return items
      .reverse()
      .map((m) => ({ text: m.message, fromPage: m.from?.id !== psid }));
  } catch (error) {
    console.error("Conversation fetch failed:", error);
    return [];
  }
}

// Ботын хамгийн сүүлд хэлсэн үнэ ("Төлбөр: 14,900₮")
async function lastQuotedPrice(psid) {
  const history = await recentMessages(psid, 20);
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (!m.fromPage) continue;
    const match = (m.text || "").match(/Төлбөр:\s*([\d,]+)\s*₮/);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return null;
}

// ==========================================
// АДМИН БАТАЛГААЖУУЛАЛТ
// Админ чатад "Төлбөр баталгаажлаа" гэж бичихэд Meta руу Purchase илгээнэ
// ==========================================

function isAdminConfirmation(text) {
  return text.includes("баталгаажлаа") || text.includes("batalgaajlaa");
}

function extractAmount(text) {
  const match = text.match(/(\d[\d,.\s]*)\s*₮/);
  if (!match) return null;
  const amount = Number(match[1].replace(/[^\d]/g, ""));
  return amount > 0 ? amount : null;
}

// ==========================================
// META CONVERSIONS API (Business Messaging)
// ==========================================

async function sendConversionEvent({ eventName, pageId, psid, value, eventId }) {
  const datasetId = process.env.META_DATASET_ID;
  const token = process.env.META_CAPI_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

  // Dataset тохируулаагүй бол алгасна — бот хэвийн ажилласаар
  if (!datasetId || !token || !pageId || !psid) return;

  try {
    const response = await fetch(`${GRAPH}/${datasetId}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId || `${eventName}_${psid}_${Date.now()}`,
            action_source: "business_messaging",
            messaging_channel: "messenger",
            user_data: { page_id: pageId, page_scoped_user_id: psid },
            custom_data: {
              currency: process.env.META_CURRENCY || "MNT",
              value,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Conversions API error (${eventName}):`, await response.text());
    }
  } catch (error) {
    console.error(`Conversions API failed (${eventName}):`, error);
  }
}

// ==========================================
// MESSENGER SEND API
// ==========================================

// Quick reply гарчиг 20 тэмдэгтээс хэтрэхгүй
function qrTitle(title) {
  const chars = Array.from(title);
  return chars.length <= 20 ? title : chars.slice(0, 20).join("");
}

async function graphPost(path, payload) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const response = await fetch(`${GRAPH}/${path}?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error(`Graph API error (${path}):`, await response.text());
    return false;
  }
  return true;
}

async function sendMessage(recipientId, message) {
  return graphPost("me/messages", {
    recipient: { id: recipientId },
    message: { ...message, metadata: BOT_TAG },
  });
}

async function sendText(recipientId, text) {
  return sendMessage(recipientId, { text });
}

async function senderAction(recipientId, action) {
  return graphPost("me/messages", {
    recipient: { id: recipientId },
    sender_action: action,
  });
}

async function sendPrivateReply(commentId, message) {
  return graphPost("me/messages", {
    recipient: { comment_id: commentId },
    message,
  });
}

async function replyToComment(commentId, message) {
  return graphPost(`${commentId}/comments`, { message });
}
