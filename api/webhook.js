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
      "48 бэлэн тушаалын загвар (Word)",
      "Ажилд авах, томилох, чөлөөлөх, шилжүүлэх",
      "Амралт, чөлөө, тэтгэмж, нэмэгдэл, шагнал",
      "Сахилгын шийтгэл, гэрээ цуцлах/дуусгавар болгох",
    ],
    examples: [
      "Ажилд авах тухай (туршилтаар / хугацаатай)",
      "Ээлжийн амралт олгох тухай",
      "Хөдөлмөрийн гэрээг цуцлах тухай (6 төрөл)",
      "Сахилгын шийтгэл ногдуулах тухай (3 төрөл)",
      "Бүтэц, орон тоо батлах тухай",
    ],
  },
  HR: {
    emoji: "👥",
    name: "Хүний нөөцийн PACK",
    short: "Хүний нөөц",
    price: 19900,
    delivery: "Файлуудыг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "36 хүний нөөцийн маягт (Word 29, Excel 7)",
      "Ажилд авах: анкет, ярилцлагын тэмдэглэл, сонгон шалгаруулалт",
      "Ажилтны хувийн хэрэг, бүртгэл, үнэлгээ, сургалт",
      "Ажлаас гарах: тойрох хуудас, ажил хүлээлцэх акт",
    ],
    examples: [
      "Ажилд орохыг хүсэгчийн анкет",
      "Ээлжийн амралт тооцох загвар (Excel)",
      "Жинхлэх үнэлгээний хуудас (Excel)",
      "Тойрох хуудас, Чөлөөний хуудас",
      "Ажилласан туршлагын лавлагаа",
    ],
  },
  GEREE: {
    emoji: "📄",
    name: "Хөдөлмөрийн гэрээ PACK",
    short: "Гэрээ",
    price: 14900,
    delivery: "Файлуудыг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "9 гэрээний загвар (Word)",
      "Үндсэн, туршилтын, зайнаас ажиллах, хөлсөөр ажиллах гэрээ",
      "Нууцын болон эд хөрөнгийн хариуцлагын гэрээ",
    ],
    examples: [
      "Үндсэн хөдөлмөрийн гэрээ",
      "Туршилтаар ажиллуулах гэрээ",
      "Зайнаас ажиллах гэрээ",
      "Нууцын гэрээ",
      "Гэрээний сунгалтын загвар",
    ],
  },
  ALBAN: {
    emoji: "📝",
    name: "Албан бичгийн PACK",
    short: "Албан бичиг",
    price: 9900,
    delivery: "Файлуудыг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "17 албан бичгийн загвар (Word)",
      "Банк, даатгал, байгууллага руу илгээх албан хүсэлтүүд",
      "Итгэмжлэл, тодорхойлолт, зөвшөөрөл хүсэх бичиг",
    ],
    examples: [
      "Итгэмжлэл олгох тухай",
      "Данс нээлгэх тухай",
      "Цалингийн тодорхойлолт гаргах тухай",
      "Нийгмийн даатгал төлөгч болох хүсэлт",
      "Тамга хийлгэх тухай",
    ],
  },
  MASTER: {
    emoji: "🔥",
    name: "HR & OFFICE MASTER PACK",
    short: "MASTER PACK",
    price: 49900,
    // Үндсэн үнэ (зураасаар дарж харуулна)
    oldPrice: 79900,
    delivery: "Бүх файлыг нэг ZIP-ээр таны имэйл рүү илгээнэ",
    details: [
      "110 бэлэн загвар — 4 PACK бүгд нэг дор",
      "Тушаал (48), Хүний нөөц (36), Гэрээ (9), Албан бичиг (17)",
      "Word / Excel, шууд засварлана",
    ],
    examples: [],
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
    examples: [],
  },
};

// Хэнд тохирох вэ — AI болон картад ашиглана
const AUDIENCE =
  "Жижиг, дунд бизнесийн эзэд, хүний нөөцийн менежер, оффис менежер, захиргааны ажилтан, шинээр компани байгуулж буй хүмүүс";

// PACK бүрийн доторх файлууд (ZIP-ээс авсан жагсаалт)
const FILES = {
  TUSHAAL: [
    "Ажил хавсран гүйцэтгэх тухай",
    "Ажил хослон гүйцэтгэх тухай",
    "Ажил хүлээлцэх комисс томилох тухай",
    "Ажилд авах тухай-Туршилтаар",
    "Ажилд авах тухай-Хугацаатай",
    "Ажилд томилох тухай",
    "Ажилд үргэлжлүүлэн ажиллуулах тухай",
    "Ажилтнуудын ээлжийн амралтын хуваарь батлах тухай",
    "Ажлаас халах тухай-Ноцтой зөрчил гаргасан",
    "Ажлаас чөлөөлж, ажилд томилох тухай",
    "Актлах үндсэн хөрөнгийн жагсаалт батлах тухай",
    "Англи хэлний нэмэгдэл олгох тухай",
    "Бүтэц, орон тоо батлах тухай",
    "Гэрээтээр ажиллуулах тухай",
    "Дэвшүүлэн томилох тухай",
    "Жинхлэх тухай",
    "Жирэмсний амралт олгох тухай",
    "Журамд нэмэлт өөрчлөлт оруулах тухай",
    "Илүү цаг олгох тухай",
    "Мэдэгдэл",
    "Сахилгын шийтгэл ногдуулах тухай-Албан тушаал бууруулах",
    "Сахилгын шийтгэл ногдуулах тухай-Сануулах",
    "Сахилгын шийтгэл ногдуулах тухай-Цалин хувь бууруулах",
    "Сэлгэн ажиллуулах тухай",
    "Томилолтоор ажиллуулах тухай",
    "Тусламж тэтгэмж олгох тухай",
    "Тушаал хүчингүй болгох тухай",
    "Төслийн баг томилох тухай",
    "Удаан жилийн нэмэгдэл олгох тухай",
    "Хариуцлагатай эргүүл харуулын томилгоог батлах",
    "Хөдөлмөрийн гэрээг дуусгавар болгох тухай-Гэрээний хугацаа дууссан",
    "Хөдөлмөрийн гэрээг дуусгавар болгох тухай-Талууд харилцан тохиролцсон",
    "Хөдөлмөрийн гэрээг дуусгавар болгох тухай-Түр гэрээ",
    "Хөдөлмөрийн гэрээг цуцлах тухай-Ажилтан нас барсан",
    "Хөдөлмөрийн гэрээг цуцлах тухай-Ажилтан санаачилсан",
    "Хөдөлмөрийн гэрээг цуцлах тухай-Албан тушаалдаа тэнцээгүй",
    "Хөдөлмөрийн гэрээг цуцлах тухай-Орон тоо хассан",
    "Хөдөлмөрийн гэрээг цуцлах тухай-Эрүүл мэндийн хувьд тэнцээгүй",
    "Хөдөлмөрийн гэрээг цуцлах тухай-Өндөр насны тэтгэвэрт гарсан",
    "Хөдөлмөрийн дотоод журам батлах тухай",
    "Чөлөө олгох тухай",
    "Шагнах тухай",
    "Шилжүүлэн томилох тухай",
    "Эцгийн чөлөө олгох тухай",
    "Ээлжийн амралт олгох тухай",
    "Ээлжийн амралтын цалин олгох тухай",
    "Үндсэн цалинг шинэчлэн тогтоох тухай",
    "Үнэ тогтоох тухай",
  ],
  HR: [
    "Ажил горилогчийн тодорхойлолт",
    "Ажил хүлээлцэх акт",
    "Ажилд орохыг хүсэгчийн анкет",
    "Ажилласан туршлагын лавлагаа",
    "Ажлаас гарах үеийн ярилцлага",
    "Ажлын санал",
    "Ажлын тайлан бичих загвар",
    "Албан бичгийн загвар",
    "Албан томилолтын удирдамж",
    "Анхан шатны зааварчилгааны хуудас",
    "Гадуур ажлын хуудас",
    "Дадлагын оюутны хуудас",
    "Жинхлэх үнэлгээний хуудас",
    "Зөрчил бүртгэх хуудас",
    "Илтгэх хуудас",
    "Мэдэгдэл",
    "Сайшаах хуудас",
    "Сонгон шалгаруулалтын саналын хуудас",
    "Сургалтын хэрэгцээ тодорхойлох",
    "Сургалтын хэрэгцээний нэгтгэл",
    "Тойрох хуудас",
    "Тэмцээний удирдамж",
    "Төрийн албан хаагчийн анкет",
    "Хувийн хэрэг бүрдүүлэлтийн хуудас",
    "Хувь хүний хөгжлийн төлөвлөгөө",
    "Хурлын тэмдэглэл",
    "Хүний нөөцийн бүртгэл",
    "Хүний нөөцийн захиалгын хуудас",
    "Чөлөөний хуудас",
    "Шагналын анкет",
    "Шагналын тодорхойлолт",
    "Шийдвэрийн хуудас",
    "Шинэ санал санаачлагын аяны удирдамж",
    "Ээлжийн амралт тооцох загвар",
    "Ээлжийн амралтын мэдэгдэх хуудас",
    "Ярилцлагын тэмдэглэл хийх маягт",
  ],
  GEREE: [
    "Гэрээний сунгалтын загвар",
    "Зайнаас ажиллах гэрээ",
    "Зэрэгцсэн хөдөлмөрийн гэрээ",
    "Нууцын гэрээ",
    "Онцгой нөхцөл бүхий гэрээ",
    "Туршилтаар ажиллуулах гэрээ",
    "Хөлсөөр ажиллах гэрээ",
    "Эд хөрөнгийн хариуцлагын гэрээ",
    "Үндсэн хөдөлмөрийн гэрээ",
  ],
  ALBAN: [
    "Албан тоотод хариу өгөх тухай",
    "Гарын үсгийн баталгаа гаргах тухай",
    "Голомт банканд албан хүсэлт гаргах нь",
    "Гэрээ цуцлах тухай",
    "Данс нээлгэх тухай",
    "Зөвшөөрөл хүсэх тухай",
    "Итгэмжлэл олгох тухай",
    "Нийгмийн даатгал төлөгч болох хүсэлт",
    "Нөхөн төлбөрийн хүсэлт гаргах тухай",
    "Оршин суугаа нь үнэн тухай",
    "Пос төхөөрөмж авах тухай",
    "Тамга хийлгэх тухай",
    "Түрээсийн үнэ нэмэх тухай",
    "Хөрөнгө оруулалт хийх тухай",
    "Цалингийн тодорхойлолт гаргах тухай",
    "Шагналд нэр дэвшүүлэх тухай",
    "Эзэмших эрх шилжүүлэх тухай",
  ],
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
    // Оношилгоо: хөтчөөр /api/webhook?diag=1 нээхэд AI ажиллаж байгаа эсэхийг харуулна (нууц мэдээлэл харуулахгүй)
    if (req.query.diag) return res.status(200).json(await diagnose());

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

    if (fromBot || !customerId) return;

    // Админ гараар бичвэл тэр хүн дээр бот түр чимээгүй болно.
    // "#bot" → ботыг дахин асаана, "#stop" → 30 хоног зогсооно
    if (text.trim() === "#bot") return resumeUser(customerId);
    if (text.trim() === "#stop") return pauseUser(customerId, 24 * 30);
    await pauseUser(customerId, HUMAN_PAUSE_HOURS);

    if (isAdminConfirmation(text)) {
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

  // Админ энэ хүнтэй ярьж байгаа бол бот оролцохгүй
  if (await isPaused(senderId)) {
    console.log("Paused (admin handling):", senderId);
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
    await notifyAdmin(senderId, "Төлбөрийн баримт (зураг) ирлээ", "[зураг]");
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
  if (action === "LIST") return sendFileList(psid, id);

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
  const price =
    id === "MASTER"
      ? `🔥 ${discount(p)}% ХЯМДРАЛ\n💰 Үнэ: ~${fmt(p.oldPrice)}~ → ${fmt(p.price)}`
      : `💰 Үнэ: ${fmt(p.price)}`;

  const examples = p.examples?.length
    ? "\n\n📌 Жишээ нь:\n" + p.examples.map((e) => `• ${e}`).join("\n")
    : "";

  const audience = FILES[id] || id === "MASTER" ? `\n\n👤 Хэнд: ${AUDIENCE}.` : "";

  return (
    `${p.emoji} ${p.name.toUpperCase()}\n\n` +
    p.details.map((d) => `✅ ${d}`).join("\n") +
    examples +
    audience +
    `\n\n${price}\n📩 ${p.delivery}.` +
    "\n\nАвах бол доорх товчийг дарна уу 👇"
  );
}

function productQuickReplies(id) {
  const p = PRODUCTS[id];
  const qr = [
    { content_type: "text", title: qrTitle(`🟢 АВАХ — ${fmt(p.price)}`), payload: `BUY_${id}` },
  ];
  if (FILES[id] || id === "MASTER") {
    qr.push({ content_type: "text", title: qrTitle("📋 Бүх файлын нэр"), payload: `LIST_${id}` });
  }
  if (PACK_IDS.includes(id)) {
    qr.push({ content_type: "text", title: qrTitle("🔥 MASTER PACK"), payload: "VIEW_MASTER" });
  }
  qr.push({ content_type: "text", title: qrTitle("⬅️ Бусад"), payload: "MENU" });
  return qr;
}

// PACK доторх бүх файлын нэрийг илгээнэ (Messenger 2000 тэмдэгтийн хязгаартай)
async function sendFileList(psid, id) {
  const ids = id === "MASTER" ? PACK_IDS : FILES[id] ? [id] : [];
  if (!ids.length) return sendMenu(psid);

  for (const packId of ids) {
    const p = PRODUCTS[packId];
    const lines = FILES[packId].map((f, i) => `${i + 1}. ${f}`);
    let chunk = `${p.emoji} ${p.name} — ${lines.length} файл:\n`;
    for (const line of lines) {
      if ((chunk + line).length > 1800) {
        await sendText(psid, chunk.trim());
        chunk = "";
      }
      chunk += line + "\n";
    }
    await sendText(psid, chunk.trim());
  }

  const p = PRODUCTS[id];
  const qr = [{ content_type: "text", title: qrTitle(`🟢 АВАХ — ${fmt(p.price)}`), payload: `BUY_${id}` }];
  if (id !== "MASTER") {
    qr.push({ content_type: "text", title: qrTitle("🔥 MASTER PACK"), payload: "VIEW_MASTER" });
  }
  qr.push({ content_type: "text", title: qrTitle("⬅️ Бусад"), payload: "MENU" });
  return sendMessage(psid, {
    text: "Бүх файл Word/Excel форматтай, өөрийн байгууллагын мэдээллээр шууд засварлана ✍️",
    quick_replies: qr,
  });
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
        (p.oldPrice
          ? ` (үндсэн үнэ ${fmt(p.oldPrice)}, одоо ${discount(p)}% хямдралтай)`
          : "") +
        `. ${p.details.join("; ")}. Хүргэлт: ${p.delivery}.` +
        (FILES[id] ? `\n  Доторх файлууд: ${FILES[id].join("; ")}.` : "")
    )
    .join("\n");

  return `Чи бол "Mongol AI" Facebook Page-ийн Messenger дээрх борлуулалтын туслах.
Хэрэглэгчидтэй найрсаг, товч, Монгол хэлээр (кирилл үсгээр) ярь. Хэрэглэгч латин үсгээр монголоор бичсэн ч ойлгоод кириллээр хариул.

БҮТЭЭГДЭХҮҮН (зөвхөн эдгээрийг зарна, үнэ нь яг ийм):
${catalog}

OFFICE PACK-ИЙН ТУХАЙ:
- Байгууллагын өдөр тутмын ажилд хэрэгтэй тушаал, хүний нөөцийн маягт, хөдөлмөрийн гэрээ, албан бичгийн бэлэн загварууд. Бүгд монгол хэлээр.
- Хэнд: ${AUDIENCE}.
- Үнэ цэнэ: бичиг баримтыг эхнээс нь боловсруулах, хуучин загвар хайх, формат засахад цаг алдахгүй. Бэлэн загвараа өөрийн байгууллагын нэр, мэдээллээр засаад шууд ашиглана.
- Формат: Word (.docx, цөөн хэдэн .doc) ба Excel (.xlsx). Microsoft Word/Excel, Google Docs/Sheets, утсан дээр ч нээгдэнэ.
- Тодорхой нэг байгууллагад зориулсан файл ороогүй, зөвхөн нийтлэг хэрэглээний загварууд.
- MASTER PACK = 4 PACK-ийн 110 файл бүгд. Үндсэн үнэ ${fmt(PRODUCTS.MASTER.oldPrice)}, одоо ${fmt(PRODUCTS.MASTER.price)}. Хэрэв "тус тусад нь авбал хэд вэ" гэж асуувал PACK тус бүрийн үнийг жагсааж хэл (${PACK_IDS.map((id) => `${PRODUCTS[id].short} ${fmt(PRODUCTS[id].price)}`).join(", ")}). Нийлбэр дүн, хэмнэлтийн дүнг ХЭЗЭЭ Ч бүү тооцож хэл.

ТӨЛБӨРИЙН ЖУРАМ:
Хэрэглэгч данс руу шилжүүлж (гүйлгээний утгад нэр + утасны дугаар), баримтын screenshot-оо чатад илгээж, имэйл хаягаа бичнэ. Админ шалгаад файл/урилгыг имэйлээр илгээнэ. QPay зэрэг автомат төлбөрийн систем байхгүй.

ДҮРЭМ:
- Хариулт 1–4 өгүүлбэр. Emoji бага зэрэг ашиглаж болно. **тод** гэх мэт markdown бүү ашигла.
- PACK-д юу орсныг асуувал: хэрэгцээнд нь хамаарах файлуудын нэрийг (3–6 ширхэг) жагсаалтаас яг нэрээр нь хэл. Бүх жагсаалтыг харахыг хүсвэл [[LIST:ID]] ашигла.
- Тодорхой баримт байгаа эсэхийг асуувал (жишээ "ажлаас халах тушаал бий юу") — жагсаалтаас хайж, байгаа бол яг нэрийг нь, аль PACK-д байгааг хэл. Байхгүй бол үнэнээр нь хэл.
- Жагсаалтад байхгүй бүтээгдэхүүн, үнэ, хямдрал, урамшуулал, хугацааг ХЭЗЭЭ Ч зохиож болохгүй. Жагсаалтад байхгүй бүтээгдэхүүн асуувал (жишээ нь CapCut) "одоогоор байхгүй" гэж шууд хэлээд, байгаа бүтээгдэхүүнээс тохирохыг санал болго — үүнд [[HUMAN]] бүү бич.
- Файлыг өөрөө илгээж, жишээ файл хавсаргаж чадахгүй. Жишээ харахыг хүсвэл админ илгээнэ гэж хэл.
- Төлбөр баталгаажуулах, мөнгө буцаах, гомдол зэрэгт "админ удахгүй хариулна" гэж хэл.
- Бүтээгдэхүүнтэй холбоогүй сэдвээр бол эелдгээр товч хариулаад бүтээгдэхүүн рүү чиглүүл.
- Аль нь тохирохыг асуувал хэрэгцээг нь сонсоод тохирохыг санал болго. Олон PACK хэрэгтэй бол MASTER PACK-ийг санал болго.
- Хэрэглэгчийн ЯГ бичсэн зүйлд нь хариул. Яриан дээр цэс аль хэдийн илгээгдсэн бол цэсийг дахин бүү давт.
- Хэрэглэгч доромжилсон, уурласан ч тайван, эелдэг хэвээр бай.
- Canva урилга / файл имэйлээр ирээгүй гэвэл: уучлалт гуйж, Spam/Promotions хавтсаа шалгах, Canva урилгыг Accept дарах хэрэгтэйг хэлээд, ямар имэйл өгснийг асуу. Төгсгөлд [[HUMAN]] бич.
- Гомдол, уурласан, мөнгө буцаах, "хүнтэй ярья" гэвэл: уучлалт гуйж, админ удахгүй холбогдоно гэж хэлээд төгсгөлд [[HUMAN]] бич.

ТОВЧ ХАРУУЛАХ (хариултын хамгийн төгсгөлд дээд тал нь НЭГИЙГ бич, хэрэглэгчид харагдахгүй):
- [[HUMAN]] — админд мэдэгдэнэ. ЗӨВХӨН гомдол, эрх/файл ирээгүй, мөнгө буцаах, "хүнтэй ярья" гэсэн үед
- [[MENU]] — бүх бүтээгдэхүүний цэсийг харуулах (зөвхөн анхны мэндчилгээ эсвэл "юу байгаа вэ" гэж асуувал)
- [[PRODUCT:ID]] — нэг бүтээгдэхүүний карт (үнэ, агуулга, АВАХ товч). Карт өөрөө үнэ, агуулгыг харуулдаг тул энэ үед текстээ 1 өгүүлбэрээс хэтрүүлэхгүй, үнэ, дэлгэрэнгүйг бүү давт.
- [[LIST:ID]] — PACK-ийн бүх файлын нэрсийг илгээх (MASTER бол 4 PACK бүгд)
- [[BUY:ID]] — хэрэглэгч тодорхой бүтээгдэхүүнийг авахаар шийдсэн бол төлбөрийн мэдээлэл илгээх
Дансны дугаарыг өөрөө бүү бич — [[BUY:ID]] ашигла.`;
}

async function handleAI(psid, pageId, raw) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  await senderAction(psid, "typing_on");

  const history = await recentMessages(psid, 12);
  // Бот/админ энэ хүнд өмнө нь бичсэн эсэх — бичсэн бол цэсийг дахин бүү илгээ
  const talkedBefore = history.some((m) => m.fromPage);

  let reply = "";
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY тохируулаагүй байна");
  } else {
    reply = await askClaude(apiKey, buildMessages(history, raw));
  }

  // AI ажиллахгүй бол: анх удаа бичсэн хүнд цэс, бусад үед товч хариу + админд мэдэгдэл
  if (!reply) {
    if (!talkedBefore) return sendMenu(psid);
    await sendText(psid, "Уучлаарай, бичсэнийг тань хүлээн авлаа 🙏 Админ удахгүй хариулна.");
    // Ижил мессежийг давтахгүйн тулд 1 цаг чимээгүй
    await pauseUser(psid, 1);
    return notifyAdmin(psid, "AI хариулж чадсангүй", raw);
  }

  // Төгсгөлийн товчны тэмдэглэгээ
  const marker = reply.match(/\[\[(MENU|HUMAN|PRODUCT:(\w+)|BUY:(\w+)|LIST:(\w+))\]\]/);
  // Messenger markdown-ыг үргэлж зөв харуулдаггүй тул ** арилгана
  const text = reply.replace(/\[\[[^\]]*\]\]/g, "").replace(/\*\*/g, "").trim();

  if (marker?.[1] === "HUMAN") {
    // Бот ярилцсаар байна; админ гараар бичмэгц л бот зогсоно
    await sendText(psid, text || "Уучлаарай 🙏 Админ удахгүй холбогдоно.");
    return notifyAdmin(psid, "Хүн шаардлагатай (гомдол/асуудал)", raw);
  }

  if (marker?.[4] && PRODUCTS[marker[4]]) {
    if (text) await sendText(psid, text);
    return sendFileList(psid, marker[4]);
  }

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

async function diagnose() {
  const key = process.env.ANTHROPIC_API_KEY || "";
  const out = {
    time: new Date().toISOString(),
    anthropicKey: key ? `тохируулсан (${key.length} тэмдэгт, ${key.startsWith("sk-ant-") ? "sk-ant- эхлэлтэй" : "ЭХЛЭЛ БУРУУ"})` : "БАЙХГҮЙ",
    pageToken: process.env.META_PAGE_ACCESS_TOKEN ? "тохируулсан" : "БАЙХГҮЙ",
    systemPromptChars: systemPrompt().length,
    models: [],
  };
  if (!key) return out;
  const models = [process.env.ANTHROPIC_MODEL, "claude-haiku-5-5", "claude-haiku-4-5-20251001"].filter(
    (m, i, a) => m && a.indexOf(m) === i
  );
  for (const model of models) {
    const started = Date.now();
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 60,
          system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: "sain bnu" }],
        }),
      });
      const body = await r.text();
      let info = body.slice(0, 300);
      try {
        const j = JSON.parse(body);
        info = r.ok ? `stop=${j.stop_reason}; хариу="${(j.content || []).map((b) => b.text || "").join("").slice(0, 120)}"` : j.error?.message || info;
      } catch {}
      out.models.push({ model, status: r.status, ms: Date.now() - started, info });
    } catch (e) {
      out.models.push({ model, error: String(e), ms: Date.now() - started });
    }
  }
  return out;
}

// Claude руу хүсэлт. Тохируулсан model олдохгүй бол дараагийнхыг оролдоно.
async function askClaude(apiKey, messages) {
  const models = [
    process.env.ANTHROPIC_MODEL,
    "claude-haiku-5-5",
    "claude-haiku-4-5-20251001",
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          // Урт тул cache-лэнэ — дараагийн мессежүүд хямд, хурдан
          system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
          messages,
        }),
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        const text = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (!text) console.error(`Claude API empty reply (${model}):`, data.stop_reason, JSON.stringify(data.content));
        return text;
      }

      const errText = await response.text();
      console.error(`Claude API error (${model}):`, response.status, errText);
      // Model олдоогүй үед л дараагийн model-ийг оролдоно (key/кредитийн алдаа бол зогсоно)
      if (response.status !== 404 && !/model/i.test(errText)) return "";
    } catch (error) {
      console.error(`Claude API failed (${model}):`, error);
      return "";
    }
  }
  return "";
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
// АДМИН РУУ ШИЛЖҮҮЛЭХ (human takeover)
// Админ гараар бичих эсвэл AI [[HUMAN]] гэвэл тухайн хүн дээр бот түр зогсоно.
// UPSTASH_REDIS_REST_URL/TOKEN тохируулбал төлөв найдвартай хадгалагдана,
// эс бөгөөс зөвхөн серверийн санах ойд (заримдаа мартагдаж болно).
// ==========================================

const HUMAN_PAUSE_HOURS = Number(process.env.HUMAN_PAUSE_HOURS || 6);
const pausedUntil = new Map();
const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function redis(cmd) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(cmd),
  });
  return (await response.json()).result;
}

async function pauseUser(psid, hours) {
  const until = Date.now() + hours * 3600 * 1000;
  pausedUntil.set(psid, until);
  if (hasRedis) {
    await redis(["SET", `pause:${psid}`, String(until), "EX", String(Math.ceil(hours * 3600))]).catch((e) =>
      console.error("Redis error:", e)
    );
  }
}

async function resumeUser(psid) {
  pausedUntil.delete(psid);
  if (hasRedis) await redis(["DEL", `pause:${psid}`]).catch((e) => console.error("Redis error:", e));
}

async function isPaused(psid) {
  if (hasRedis) {
    const value = await redis(["GET", `pause:${psid}`]).catch(() => null);
    if (value) return Number(value) > Date.now();
  }
  return (pausedUntil.get(psid) || 0) > Date.now();
}

// ADMIN_PSID тохируулбал админд Messenger-ээр мэдэгдэнэ
async function notifyAdmin(psid, reason, userText) {
  const admin = process.env.ADMIN_PSID;
  console.log("ADMIN NEEDED:", psid, reason, userText);
  if (!admin || admin === psid) return;
  await sendText(
    admin,
    `🔔 Анхаарах чат\nШалтгаан: ${reason}\nХэрэглэгч: "${String(userText).slice(0, 300)}"\nPSID: ${psid}\n\n` +
      `Page Inbox-оос хариулна уу. Ботыг дахин асаах бол тэр чатад "#bot" гэж бичнэ.`
  );
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
