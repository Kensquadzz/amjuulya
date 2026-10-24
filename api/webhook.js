import { AsyncLocalStorage } from "node:async_hooks";

// ==========================================
// MONGOL AI + ULAAN CREATIVE — Messenger bot (олон пэйж)
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
// ОЛОН ПЭЙЖ — нэг бот, пэйж бүр өөрийн мэдээлэлтэй
// Пэйж бүрийн токеныг Vercel-ийн тусдаа хувьсагчид хадгална.
// Пэйжийн ID-г токеноос нь автоматаар таньна (гараар оруулах хэрэггүй).
// ==========================================


const PAGES = [
  // Анхны пэйж — хуучин тохиргооны нэрс хэвээр (kv түлхүүрт угтвар байхгүй)
  { key: "mongolai", name: "Mongol AI", tokenEnv: "META_PAGE_ACCESS_TOKEN", kind: "shop" },
  { key: "uc", name: "Ulaan Creative", tokenEnv: "UC_PAGE_ACCESS_TOKEN", kind: "agency" },
];
const DEFAULT_PAGE = PAGES[0];
const pageStore = new AsyncLocalStorage();

const page = () => pageStore.getStore() || DEFAULT_PAGE;
const pageToken = () => process.env[page().tokenEnv] || "";
const isAgency = () => page().kind === "agency";
// Пэйж тус бүрийн тохиргоо (асаах/унтраах, админ, жагсаалт) тусдаа хадгалагдана
const pk = (k) => (page().key === DEFAULT_PAGE.key ? k : `${page().key}:${k}`);

async function pageIdOf(p) {
  const token = process.env[p.tokenEnv];
  if (!token) return "";
  const cached = await kvGet(`pageid:${p.key}`);
  if (cached) return cached;
  try {
    const j = await (await fetch(`${GRAPH}/me?fields=id&access_token=${token}`)).json();
    if (j.id) await kvSet(`pageid:${p.key}`, j.id, 30 * 24 * 3600);
    return j.id || "";
  } catch {
    return "";
  }
}

// Webhook-ийн entry.id-аар аль пэйж болохыг олно
async function resolvePage(pageId) {
  for (const p of PAGES.slice(1)) {
    if (pageId && pageId === (await pageIdOf(p))) return p;
  }
  return DEFAULT_PAGE;
}

const withPage = (p, fn) => pageStore.run(p, fn);

// ==========================================
// ULAAN CREATIVE — маркетингийн агентлаг (uc.squadzz.com)
// ==========================================

const UC = {
  site: "https://uc.squadzz.com",
  phone: "8005-3358",
  email: "erdenebaatarbubu@gmail.com",
  address: "Сөүлийн гудамж, Twin Tower, 402 тоот",
  instagram: "instagram.com/ulaan.creative",
  packages: [
    {
      name: "Creative Starter",
      price: "₮1,500,000 / сар",
      items: "5 Reels видео, 5 постер/дизайн, контент төлөвлөгөө, caption, үндсэн эвлүүлэг ба өнгө засвар, 1 удаагийн засвар",
    },
    {
      name: "Creative Growth",
      price: "₮2,500,000 / сар",
      items: "7 Reels видео, 8 постер/дизайн, контент стратеги ба календарь, caption, видео зураг авалт ба эвлүүлэг, boost тохируулга ба кампанит ажлын удирдлага, үр дүнгийн тайлан, 2 удаагийн засвар",
    },
    {
      name: "Creative Premium (бүрэн үйлчилгээ)",
      price: "₮3,500,000+ / сар",
      items: "10 Reels видео, 10 постер/дизайн, AI болон UGC маягийн видео, дэлгэрэнгүй стратеги ба календарь, зураг авалт ба эвлүүлэг, boost тохируулга ба кампанит ажлын удирдлага, үр дүнгийн тайлан, 2 удаагийн засвар",
    },
  ],
};

function ucPrompt() {
  return `Чи бол "Ulaan Creative" маркетингийн агентлагийн Facebook пэйжийн Messenger дээрх туслах. Найрсаг, мэргэжлийн, товч ярь. Монгол хэлээр (кирилл) хариул; хэрэглэгч латинаар бичсэн ч ойлгоод кириллээр хариул.

КОМПАНИ:
Ulaan Creative — Монголын бүтээлч маркетингийн агентлаг, 5+ жилийн туршлагатай. Бүтээлч стратеги, AI-д суурилсан контент үйлдвэрлэл, видео продакшн, инфлюенсер кампанит ажил, брэнд ба дижитал маркетингийг нэг дор хийдэг. 30+ концертын маркетинг, 30+ брэнд, компани, төсөлтэй хамтарч ажилласан.
Уриа: "Creative thinking. AI-powered production. Influencer-driven reach."

ҮЙЛЧИЛГЭЭ:
1. AI Creative Production — AI-д суурилсан видео концепт, бүтээгдэхүүний зураг, зар сурталчилгааны креатив; санаанаас бэлэн бүтээл хүртэлх хугацааг богиносгоно.
2. Influencer Marketing — брэнд, үзэгчдэд тохирох инфлюенсер сонгох, кампанит ажил төлөвлөх, ивээн тэтгэсэн контент, хамтын ажиллагааг зохицуулах.
3. Video & Content Production — Reels, богино видео, бүтээгдэхүүний зар; зураг авалт, эвлүүлэг, бүтээлч удирдлагыг нэг баг хийнэ.
4. Brand & Digital Marketing — брэндийн мессеж, харилцааны стратеги, сошиал медиа стратеги, контент төлөвлөгөө, дижитал кампанит ажил.

САРЫН БАГЦ:
${UC.packages.map((p) => `- ${p.name} — ${p.price}: ${p.items}`).join("\n")}
Тэмдэглэл: Зар сурталчилгааны (boost) төсөв, инфлюенсерийн хөлс, нэмэлт продакшны зардал багцын үнэд ОРООГҮЙ, тусад нь тооцно (өөрөөр тохироогүй бол). Ажлын хамрах хүрээ, хугацааг гэрээнд баталгаажуулна.

АЖЛЫН ЯВЦ: 1) Стратеги → 2) Бүтээлч концепт → 3) Продакшн → 4) Түгээлт.

ИНФЛЮЕНСЕРИЙН АНГИЛАЛ: Nano (1K–9,999 дагагч), Micro (10K–49,999), Mid-tier (50K–99,999), Macro (100K–499,999), Mega (500K+). Тодорхой инфлюенсерийн нэр, хөлсийг бүү амла — менежер санал болгоно.

ПОРТФОЛИО: Mongol GrandPrix Season 1, Гинжин концерт, Anir Paradiso, Чойжоо "Unplugged" концерт, Encanto Centro Mall (брэнд кампанит ажил), CS2 Pick'em г.м.

ХОЛБОО БАРИХ: утас ${UC.phone}, имэйл ${UC.email}, хаяг ${UC.address}, Instagram ${UC.instagram}, вэбсайт ${UC.site} (тэнд багц сонгож, төслийн хүсэлт илгээж болно).

ЗОРИЛГО:
- Харилцагчийн хэрэгцээг ойлгож (ямар брэнд/бизнес, юу хэрэгтэй, зорилго), тохирох үйлчилгээ, багцыг санал болго.
- Яриа хооронд аажмаар (нэг удаад 1–2 асуулт) дараах мэдээллийг цуглуул: нэр, компани/брэнд, хэрэгтэй үйлчилгээ, сарын төсөв, эхлэх хугацаа, утас эсвэл имэйл.
- Хэрэгцээ ба холбоо барих мэдээлэл (утас эсвэл имэйл) тодорхой болмогц: "Баярлалаа, манай менежер удахгүй холбогдоно" гэж хэлээд төгсгөлд нь [[LEAD: нэр | компани | үйлчилгээ | төсөв | хугацаа | утас/имэйл]] гэж бич (мэдэхгүй талбарт "-").

ДҮРЭМ:
- Хариулт 1–4 өгүүлбэр. **тод** гэх мэт markdown бүү ашигла.
- Дээр байхгүй үнэ (нэг видеоны үнэ, инфлюенсерийн хөлс, boost төсөв, тусгай захиалга), хугацаа, хөнгөлөлтийг ХЭЗЭЭ Ч бүү зохио — "менежер тань дээр тооцоолж санал илгээнэ" гэж хэлээд холбоо барих мэдээллийг нь ав.
- Төлбөрийн нөхцөл, гэрээ, хүргэх хугацааг асуувал: гэрээгээр тохиролцоно, менежер тодруулна гэж хэл.
- Пэйжийн нэрээр өмнө бичигдсэн ямар ч мессежийг ("[АДМИН]", "[ПЭЙЖИЙН АВТОМАТ ХАРИУ]" г.м.) бүү үгүйсгэ, бүү засварла, уучлалт бүү гуй. Ярианд "[АДМИН]" байвал админ ярьж байна — юу ч бүү бич, зөвхөн [[HUMAN]].
- Хэрэглэгч зураг илгээвэл (жишээ, лавлагаа, бүтээгдэхүүн) хараад ойлгож хариул.
- "за", "ok", "баярлалаа" гэх мэт товч хариу таны асуултын хариу биш бол [[SKIP]].
- Гомдол, уурласан, "хүнтэй ярья" гэвэл: эелдгээр, менежер удахгүй холбогдоно гэж хэлээд [[HUMAN]].

ТЭМДЭГЛЭГЭЭ (хариултын хамгийн төгсгөлд, дээд тал нь НЭГ, хэрэглэгчид харагдахгүй):
- [[LEAD: ...]] — шинэ захиалгын мэдээлэл бүрдсэн
- [[HUMAN]] — менежерт мэдэгдэх
- [[SKIP]] — хариу шаардлагагүй`;
}

const UC_GREETING =
  "Сайн байна уу 👋 Ulaan Creative-д хандсанд баярлалаа!\n\n" +
  "Бид AI контент, Reels видео, инфлюенсер маркетинг, брэнд ба дижитал маркетингийн үйлчилгээ үзүүлдэг.\n\n" +
  "Танай брэнд ямар чиглэлийн маркетинг хийлгэх сонирхолтой байна вэ? 🙂";

async function handleCommentAgency(commentId) {
  if (!commentId) return;
  await sendPrivateReply(commentId, { text: UC_GREETING, metadata: BOT_TAG });
  await replyToComment(commentId, "Танд Messenger-ээр мэдээлэл илгээлээ 📩");
}


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

// Пэйжийн албан ёсны утас (Facebook-ийн автомат хариунд ч бичигдсэн)
const CONTACT_PHONE = "8005-3358";

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
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  if (host) BASE_URL = `https://${host}`;

  // Удирдлагын хуудас: /api/webhook?panel=ADMIN_KEY
  if (req.query?.panel !== undefined) {
    const p = PAGES.find((x) => x.key === req.query.page) || DEFAULT_PAGE;
    return withPage(p, () => handlePanel(req, res));
  }

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
    const p = await resolvePage(pageId);
    await withPage(p, () => handleEntry(entry, pageId));
  }

  return res.status(200).send("EVENT_RECEIVED");
}

async function handleEntry(entry, pageId) {
  {

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
      if (!(await botEnabled())) continue;
      await safe(() => handleComment(value.comment_id));
    }

    // ---------- MESSENGER ----------
    for (const event of entry.messaging || []) {
      await safe(() => handleMessagingEvent(event, pageId));
    }
  }
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

    // Facebook-ийн өөрийн автомат хариу (Instant reply, FAQ г.м.) — админ биш.
    // Хэрэглэгч бичсэнээс хойш 10 секундэд ирсэн, эсвэл өмнө нь автомат гэж танигдсан текст.
    const sinceCustomer = Date.now() - Number((await kvGet(`lastin:${customerId}`)) || 0);
    if (sinceCustomer < 10000 || (await isAutoText(event.message.text))) {
      await rememberAutoText(customerId, event.message.text);
      console.log("Facebook automation echo — bot keeps running:", customerId);
      return;
    }

    await pauseUser(customerId, HUMAN_PAUSE_HOURS);
    await kvDel(`resumed:${customerId}`);
    // AI дараа нь таны бичсэнийг "засах" гэж оролдохгүйн тулд санана
    await rememberAdminText(customerId, event.message.text);

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

  // Хэрэглэгч бичсэн цаг (Facebook-ийн автомат хариуг админаас ялгахад)
  await kvSet(`lastin:${senderId}`, Date.now(), 120);

  // Админы команд (#admin, #on, #off, #status) — админы хувийн чатад бот хариулахгүй
  const rawText = event.message?.text?.trim() || "";
  if (rawText.startsWith("#") || senderId === (await adminPsid())) {
    if (await handleAdminCommand(senderId, rawText)) return;
  }

  // Бот унтраалттай бол хэнд ч хариулахгүй
  if (!(await botEnabled())) {
    console.log("Bot is OFF — skipped:", senderId);
    return;
  }

  // Like 👍, стикерт хариулахгүй
  if (event.message?.sticker_id) return;

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

  // ---------- Зураг, видео, файл ----------
  // AI зургийг харж шийднэ: банкны баримт бол [[RECEIPT]], бусад бол асуултад хариулна
  const attachments = event.message?.attachments || [];
  if (attachments.length && !event.message?.text) {
    const img = attachments.find((a) => a.type === "image" && a.payload?.url);
    const kind = img ? "зураг" : attachments[0].type === "video" ? "видео" : "файл";
    console.log("Attachment from:", senderId, kind);
    return handleAI(senderId, pageId, `[Хэрэглэгч ${kind} илгээлээ]`, { imageUrl: img?.payload?.url, attachment: true });
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
  if (isAgency()) {
    if (payload === "GET_STARTED" || payload === "MENU") return sendText(psid, UC_GREETING);
    return handleAI(psid, pageId, payload);
  }
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
  if (email && !isAgency()) {
    return sendText(
      psid,
      `📧 Имэйл хүлээн авлаа: ${email[0]}\n\n` +
        "Төлбөрийн баримтын screenshot-оо илгээсэн бол болоо. " +
        "Админ төлбөрийг шалгаад энэ имэйл рүү илгээнэ ✅"
    );
  }

  // Админтай холбогдох хүсэлт → шууд админд шилжүүлнэ
  if (/(админ|admin|оператор|operator|хүнтэй ярь|hun?tei yari)/i.test(text)) {
    return handOff(
      psid,
      "Админтай холбогдохыг хүссэн",
      raw,
      "Админд мэдэгдлээ 🙏 Удахгүй энд хариулна."
    );
  }

  // Ulaan Creative: бүтээгдэхүүний товчлол байхгүй — бүгдийг AI-д
  if (isAgency()) return handleAI(psid, pageId, raw);

  const wordCount = text.split(/\s+/).length;
  const productId = detectProduct(text);

  // "Canva Pro авах", "мастер пак авъя", "дансаа явуулаарай" → шууд төлбөрийн мэдээлэл
  if (productId && BUY_RE.test(text) && !AFTER_BUY_RE.test(text)) {
    return handleBuy(psid, pageId, productId);
  }

  // Богино мессежээр бүтээгдэхүүн нэрлэсэн бол шууд карт харуулна
  if (productId && wordCount <= 4) {
    return showProduct(psid, pageId, productId);
  }

  // Бусад бүх мессежийг AI-д
  return handleAI(psid, pageId, raw);
}

// Худалдан авах хүсэл / аль хэдийн төлсөн (эдгээрт данс дахин илгээхгүй)
const BUY_RE = /(авах|авъя|авья|авмаар|авна|авии|avah|awah|avya|avia|avmaar|awmaar|avna|avii|захиал|zahial|төлөх|tuluh|данс|dans)/i;
const AFTER_BUY_RE = /(ирээгүй|ireegui|ireegu|төлсөн|tulsun|tolson|шилжүүлсэн|shiljuulsen|авсан|avsan|awsan)/i;

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
  if (isAgency()) return handleCommentAgency(commentId);
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
  if (isAgency()) return ucPrompt();
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

ЗУРАГ:
- Хэрэглэгч зураг илгээвэл сайн хар. Бүх зураг төлбөрийн баримт БИШ.
- Банкны апп/шилжүүлгийн дэлгэц (дүн, данс, гүйлгээний утга харагдана) бол: баярлалаа гэж, имэйл хаягаа өгөөгүй бол асуу, админ шалгаад илгээнэ гэж хэлээд [[RECEIPT]].
- Бусад зураг (Canva-ийн дэлгэц, алдааны мэдэгдэл, загвар г.м.) бол юу харагдаж байгааг ойлгож, хэрэглэгчийн асуултад хариул. Canva Pro-д BG Remover, Magic Edit, Magic Eraser, Magic Expand, Upscale, Premium загвар, элемент, фонт зэрэг Pro хэрэгслүүд бүгд нээгдэнэ.
- Видео, файлыг харах боломжгүй — юу асуух гэснээ бичиж, эсвэл дэлгэцийн зураг илгээхийг хүс.

ТӨЛБӨРИЙН ЖУРАМ:
Хэрэглэгч данс руу шилжүүлж (гүйлгээний утгад нэр + утасны дугаар), баримтын screenshot-оо чатад илгээж, имэйл хаягаа бичнэ. Админ шалгаад файл/урилгыг имэйлээр илгээнэ. QPay зэрэг автомат төлбөрийн систем байхгүй.

ДҮРЭМ:
- Хариулт 1–4 өгүүлбэр. Emoji бага зэрэг ашиглаж болно. **тод** гэх мэт markdown бүү ашигла.
- PACK-д юу орсныг асуувал: хэрэгцээнд нь хамаарах файлуудын нэрийг (3–6 ширхэг) жагсаалтаас яг нэрээр нь хэл. Бүх жагсаалтыг харахыг хүсвэл [[LIST:ID]] ашигла.
- Тодорхой баримт байгаа эсэхийг асуувал (жишээ "ажлаас халах тушаал бий юу") — жагсаалтаас хайж, байгаа бол яг нэрийг нь, аль PACK-д байгааг хэл. Байхгүй бол үнэнээр нь хэл.
- Жагсаалтад байхгүй бүтээгдэхүүн, үнэ, хямдрал, урамшуулал, хугацааг ХЭЗЭЭ Ч зохиож болохгүй. Жагсаалтад байхгүй бүтээгдэхүүн асуувал (жишээ нь CapCut) "одоогоор байхгүй" гэж шууд хэлээд, байгаа бүтээгдэхүүнээс тохирохыг санал болго — үүнд [[HUMAN]] бүү бич.
- Файлыг өөрөө илгээж, жишээ файл хавсаргаж чадахгүй. Жишээ харахыг хүсвэл админ илгээнэ гэж хэл.
- Төлбөр баталгаажуулах, мөнгө буцаах, гомдол зэрэгт "админ удахгүй хариулна" гэж хэлээд [[HUMAN]].
- Хэрэглэгч юу хүсч байгааг ойлгохгүй бол таамаглаж бүү хариул — нэг богино тодруулах асуулт асуу.
- Аль нь тохирохыг асуувал хэрэгцээг нь сонсоод тохирохыг санал болго. Олон PACK хэрэгтэй бол MASTER PACK-ийг санал болго.
- Хэрэглэгчийн ЯГ бичсэн зүйлд нь хариул. Яриан дээр цэс аль хэдийн илгээгдсэн бол цэсийг дахин бүү давт.
- Хэрэглэгч доромжилсон, уурласан ч тайван, эелдэг хэвээр бай.
- Canva урилга / файл имэйлээр ирээгүй гэвэл: уучлалт гуйж, Spam/Promotions хавтсаа шалгах, Canva урилгыг Accept дарах хэрэгтэйг хэлээд, ямар имэйл өгснийг асуу. Төгсгөлд [[HUMAN]] бич.
- Гомдол, уурласан, мөнгө буцаах, "хүнтэй ярья" гэвэл: уучлалт гуйж, админ удахгүй холбогдоно гэж хэлээд төгсгөлд [[HUMAN]] бич.

ХОЛБОО БАРИХ:
- Утас: ${CONTACT_PHONE}. Эсвэл энэ чатаар бичвэл админ хариулна. "Холбоо барих", "утасны дугаар" гэж асуувал үүнийг хэл.

ӨМНӨХ МЕССЕЖҮҮД (МАШ ЧУХАЛ):
- Пэйжийн нэрээр бичигдсэн өмнөх мессежүүдийг заавал чи бичээгүй: "[АДМИН]" — админ (хүн) гараар бичсэн, "[ПЭЙЖИЙН АВТОМАТ ХАРИУ]" — Facebook-ийн автомат хариу. Тэмдэглэгээгүй ч бусад хүн бичсэн байж болно.
- Пэйжийн нэрээр өмнө бичигдсэн ЯМАР Ч мессежийн үнэ, утасны дугаар, үйлчилгээ, тохиролцоо, амлалтыг ХЭЗЭЭ Ч бүү үгүйсгэ, "алдаа", "баталгаажаагүй", "үл тоомсорло" гэж бүү хэл, уучлалт бүү гуй, бүү засварла. Зүгээр хэрэглэгчийн сүүлийн асуултад хариул.
- Каталогт байхгүй үйлчилгээ, тусгай захиалгын яриа (жишээ нь видео хийлгэх, дизайн, лого, өөр үнэтэй тохиролцоо) явж байвал — энэ нь админы ажил. Юу ч бүү бич, зөвхөн [[HUMAN]].
- Хэрэглэгч "за", "ok", "ойлголоо", "баярлалаа" гэх мэт товч хариу бичсэн бол, энэ нь таны асуултын хариу биш бол [[SKIP]].

ТОВЧ ХАРУУЛАХ (хариултын хамгийн төгсгөлд дээд тал нь НЭГИЙГ бич, хэрэглэгчид харагдахгүй):
- [[SKIP]] — хэрэглэгчид юу ч илгээхгүй (хариу шаардлагагүй үед)
- [[HUMAN]] — админд мэдэгдэж, энэ хүн дээр ботыг түр зогсооно. Гомдол, эрх/файл ирээгүй, мөнгө буцаах, тусгай захиалга, админы яриа үргэлжилж байгаа үед. Текст бичвэл хэрэглэгчид илгээгдэнэ; тусгай захиалга/админы ярианд текстгүй зөвхөн [[HUMAN]] бич.
- [[MENU]] — бүх бүтээгдэхүүний цэсийг харуулах (зөвхөн анхны мэндчилгээ эсвэл "юу байгаа вэ" гэж асуувал)
- [[PRODUCT:ID]] — нэг бүтээгдэхүүний карт (үнэ, агуулга, АВАХ товч). Карт өөрөө үнэ, агуулгыг харуулдаг тул энэ үед текстээ 1 өгүүлбэрээс хэтрүүлэхгүй, үнэ, дэлгэрэнгүйг бүү давт.
- [[LIST:ID]] — PACK-ийн бүх файлын нэрсийг илгээх (MASTER бол 4 PACK бүгд)
- [[BUY:ID]] — хэрэглэгч авах, захиалах, данс, төлбөрийн мэдээлэл хүсвэл ШУУД төлбөрийн мэдээлэл илгээх (картыг дахин бүү харуул). Аль бүтээгдэхүүн болохыг яриан дээрээс ойлго.
- [[RECEIPT]] — хэрэглэгч банкны гүйлгээний баримт илгээсэн үед
Дансны дугаарыг өөрөө бүү бич — [[BUY:ID]] ашигла.`;
}

async function handleAI(psid, pageId, raw, { imageUrl, attachment = false } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  await senderAction(psid, "typing_on");

  const [history, admins, autos] = await Promise.all([
    recentMessages(psid, 12),
    adminTexts(psid),
    autoTexts(psid),
  ]);
  for (const m of history) {
    m.admin = m.fromPage && admins.has(normText(m.text));
    m.auto = m.fromPage && !m.admin && (autos.has(normText(m.text)) || (await isAutoText(m.text)));
  }
  // Бот/админ энэ хүнд өмнө нь бичсэн эсэх — бичсэн бол цэсийг дахин бүү илгээ
  const talkedBefore = history.some((m) => m.fromPage);

  // "за", "ok", "баярлалаа", 👍 гэх мэт — өмнө нь асуулт асуугаагүй бол хариулахгүй
  const lastPage = [...history].reverse().find((m) => m.fromPage);
  if (!attachment && ACK_RE.test(raw) && !(lastPage && !lastPage.admin && /[?？]\s*$/.test(lastPage.text || ""))) {
    console.log("Ack — no reply:", psid, raw);
    return;
  }
  // Хамгийн сүүлд админ бичсэн бол бот оролцохгүй (админы яриа үргэлжилж байна)
  if (lastPage?.admin && Date.now() - lastPage.at < 24 * 3600 * 1000 && !(await kvGet(`resumed:${psid}`))) {
    console.log("Admin conversation — bot stays quiet:", psid);
    return pauseUser(psid, HUMAN_PAUSE_HOURS);
  }

  let reply = "";
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY тохируулаагүй байна");
  } else {
    // Одоо илгээсэн зураг, эсвэл сүүлийн 4 мессеж дотор хэрэглэгчийн илгээсэн зураг ("ийм цонх..." г.м.)
    const recentImage =
      imageUrl || [...history].slice(-4).reverse().find((m) => !m.fromPage && m.image)?.image;
    const image = recentImage ? await loadImage(recentImage) : null;
    reply = await askClaude(apiKey, buildMessages(history, raw, image));
  }

  // AI ажиллахгүй бол: анх удаа бичсэн хүнд цэс, бусад үед хэрэглэгчид юу ч бичихгүй, админд мэдэгдэнэ
  if (!reply) {
    if (attachment) return notifyAdmin(psid, `Хэрэглэгч ${raw.includes("зураг") ? "зураг" : "файл"} илгээсэн (бот уншиж чадсангүй)`, raw);
    if (!talkedBefore) return isAgency() ? sendText(psid, UC_GREETING) : sendMenu(psid);
    return notifyAdmin(psid, "Бот хариулж чадсангүй", raw);
  }

  // Төгсгөлийн товчны тэмдэглэгээ
  const marker = reply.match(/\[\[(MENU|HUMAN|SKIP|RECEIPT|PRODUCT:(\w+)|BUY:(\w+)|LIST:(\w+))\]\]/);
  // Messenger markdown-ыг үргэлж зөв харуулдаггүй тул ** арилгана
  const text = reply.replace(/\[\[[^\]]*\]\]/g, "").replace(/\*\*/g, "").trim();

  // Ulaan Creative: шинэ захиалгын мэдээлэл бүрдсэн
  const lead = reply.match(/\[\[LEAD:([^\]]*)\]\]/);
  if (lead) {
    if (text) await sendText(psid, text);
    const labels = ["Нэр", "Компани", "Үйлчилгээ", "Төсөв", "Хугацаа", "Холбоо барих"];
    const info = lead[1]
      .split("|")
      .map((v, i) => `${labels[i] || "•"}: ${v.trim()}`)
      .join("\n");
    return notifyAdmin(psid, "🔥 Шинэ захиалга", "\n" + info);
  }

  if (marker?.[1] === "RECEIPT") {
    await sendText(
      psid,
      text ||
        "✅ Төлбөрийн баримтыг хүлээн авлаа. Баярлалаа!\n\n" +
          "📧 Файл хүлээн авах ИМЭЙЛ хаягаа илгээгээгүй бол энд бичээрэй.\n\n" +
          "⏳ Админ баталгаажуулсны дараа танд мэдэгдэх болно."
    );
    return notifyAdmin(psid, "Төлбөрийн баримт ирлээ — шалгаад илгээнэ үү", raw);
  }

  if (marker?.[1] === "SKIP") {
    console.log("AI chose not to reply:", psid, raw);
    return;
  }

  if (marker?.[1] === "HUMAN") {
    return handOff(psid, "Админ хариулах хэрэгтэй", raw, text);
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

  if (text) return sendText(psid, text);
}

// Товч зөвшөөрөл, талархал, emoji
const ACK_RE =
  /^(за+|заа|zaa*|ok+|ок+|okey|okay|ойлгосон|ойлголоо|oilgoson|oilgoloo|баярлалаа|bayrlalaa|bayarlalaa|thanks?|thank you|thx|[\s👍🙏❤️♥️😊🙂👌🥰😍]+)[\s.!,)]*$/iu;

// Claude-ийн хүсэлтийн бие. Haiku 5.5 зэрэг 5.x model-ууд хариулахаасаа өмнө
// "бодож" токен зарцуулдаг (adaptive thinking, max_tokens-д тооцогдоно), тиймээс
// чатад effort-ыг "low" болгож, max_tokens-д зай үлдээнэ. Haiku 4.5 effort дэмждэггүй.
function claudeBody(model, messages) {
  const isNew = !/4-5|4\.5/.test(model);
  return {
    model,
    max_tokens: isNew ? 2000 : 800,
    ...(isNew ? { output_config: { effort: "low" } } : {}),
    // Урт тул cache-лэнэ — дараагийн мессежүүд хямд, хурдан
    system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
    messages,
  };
}

async function diagnose() {
  const key = process.env.ANTHROPIC_API_KEY || "";
  const out = {
    time: new Date().toISOString(),
    anthropicKey: key ? `тохируулсан (${key.length} тэмдэгт, ${key.startsWith("sk-ant-") ? "sk-ant- эхлэлтэй" : "ЭХЛЭЛ БУРУУ"})` : "БАЙХГҮЙ",
    pageToken: process.env.META_PAGE_ACCESS_TOKEN ? "тохируулсан" : "БАЙХГҮЙ",
    pages: await Promise.all(
      PAGES.map(async (p) => ({
        page: p.name,
        token: process.env[p.tokenEnv] ? "тохируулсан" : `БАЙХГҮЙ (${p.tokenEnv})`,
        id: (await pageIdOf(p)) ? "танигдсан" : "-",
      }))
    ),
    botEnabled: await botEnabled(),
    redis: hasRedis ? "холбогдсон" : "БАЙХГҮЙ",
    adminKey: ADMIN_KEY ? "тохируулсан" : "БАЙХГҮЙ",
    telegram: process.env.TELEGRAM_BOT_TOKEN ? "тохируулсан" : "БАЙХГҮЙ",
    webhookFields: await webhookFields(),
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
        body: JSON.stringify(claudeBody(model, [{ role: "user", content: "sain bnu" }])),
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
        body: JSON.stringify(claudeBody(model, messages)),
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        const text = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (text) return text;
        // Хоосон хариу (бодолд токен дууссан, refusal г.м.) → дараагийн model-ийг оролдоно
        console.error(`Claude API empty reply (${model}):`, data.stop_reason);
        continue;
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
function buildMessages(history, current, image = null) {
  const msgs = [];
  for (const m of history) {
    const role = m.fromPage ? "assistant" : "user";
    const tag = m.admin ? "[АДМИН] " : m.auto ? "[ПЭЙЖИЙН АВТОМАТ ХАРИУ] " : "";
    const text = tag + (m.text || "").trim();
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
  if (!msgs.length) msgs.push({ role: "user", content: current });

  // Зургийг хэрэглэгчийн сүүлийн мессежид хавсаргана
  if (image) {
    const lastUser = msgs[msgs.length - 1];
    lastUser.content = [
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
      { type: "text", text: lastUser.content },
    ];
  }
  return msgs;
}

// Messenger-ийн зургийг татаж Claude-д өгөх (5MB хүртэл)
async function loadImage(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mediaType = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|gif|webp)$/.test(mediaType)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4.5 * 1024 * 1024) return null;
    return { mediaType, data: buf.toString("base64") };
  } catch (e) {
    console.error("Image download failed:", e);
    return null;
  }
}

// Хэрэглэгчтэй хийсэн сүүлийн мессежүүд (хуучнаас шинэ рүү)
async function recentMessages(psid, limit) {
  const token = pageToken();
  try {
    const url =
      `${GRAPH}/me/conversations?platform=messenger&user_id=${psid}` +
      `&fields=messages.limit(${limit}){message,from,created_time,attachments{image_data{url}}}&access_token=${token}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Conversation fetch error:", await response.text());
      return [];
    }
    const data = await response.json();
    const items = data.data?.[0]?.messages?.data || [];
    return items
      .reverse()
      .map((m) => {
        const atts = m.attachments?.data || [];
        const image = atts.find((a) => a.image_data?.url)?.image_data.url;
        const text = m.message || (image ? "[зураг]" : atts.length ? "[файл/видео]" : "");
        return { text, image, fromPage: m.from?.id !== psid, at: Date.parse(m.created_time) || 0 };
      });
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
// ХАДГАЛАЛТ (Redis) — ботын төлөвийг найдвартай санах
// Vercel → Storage → Upstash Redis холбоход KV_REST_API_URL/TOKEN автоматаар нэмэгдэнэ.
// Redis байхгүй бол серверийн санах ойд хадгална (Vercel дээр мартагддаг — найдваргүй).
// ==========================================

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRedis = !!(KV_URL && KV_TOKEN);
const mem = new Map(); // fallback: key -> { v, exp }

async function redis(cmd) {
  const response = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(cmd),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function memGet(key) {
  const item = mem.get(key);
  if (!item) return null;
  if (item.exp && item.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return item.v;
}

async function kvGet(key) {
  if (hasRedis) {
    try {
      return await redis(["GET", key]);
    } catch (e) {
      console.error("Redis GET error:", e);
    }
  }
  return memGet(key);
}

async function kvSet(key, value, ttlSec) {
  mem.set(key, { v: String(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  if (!hasRedis) return;
  const cmd = ["SET", key, String(value)];
  if (ttlSec) cmd.push("EX", String(Math.ceil(ttlSec)));
  await redis(cmd).catch((e) => console.error("Redis SET error:", e));
}

async function kvDel(key) {
  mem.delete(key);
  if (hasRedis) await redis(["DEL", key]).catch((e) => console.error("Redis DEL error:", e));
}

// Жагсаалтын эхэнд нэмж, max хүртэл таслана
async function kvPush(key, value, max, ttlSec) {
  const list = [value, ...(memGet(key) || [])].slice(0, max);
  mem.set(key, { v: list, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  if (!hasRedis) return;
  try {
    await redis(["LPUSH", key, value]);
    await redis(["LTRIM", key, "0", String(max - 1)]);
    if (ttlSec) await redis(["EXPIRE", key, String(ttlSec)]);
  } catch (e) {
    console.error("Redis LPUSH error:", e);
  }
}

async function kvList(key, n) {
  if (hasRedis) {
    try {
      return (await redis(["LRANGE", key, "0", String(n - 1)])) || [];
    } catch (e) {
      console.error("Redis LRANGE error:", e);
    }
  }
  return (memGet(key) || []).slice(0, n);
}

// ==========================================
// БОТ АСААХ / УНТРААХ, ТҮР ЗОГСООХ
// ==========================================

const HUMAN_PAUSE_HOURS = Number(process.env.HUMAN_PAUSE_HOURS || 12);
const ADMIN_KEY = process.env.ADMIN_KEY || "";
let BASE_URL = "https://www.amjuulya.mn";

async function botEnabled() {
  if (process.env.BOT_ENABLED === "false") return false;
  return (await kvGet(pk("cfg:enabled"))) !== "0";
}

async function setBotEnabled(on) {
  await kvSet(pk("cfg:enabled"), on ? "1" : "0");
}

async function pauseUser(psid, hours) {
  await kvSet(`pause:${psid}`, Date.now() + hours * 3600 * 1000, hours * 3600);
}

async function resumeUser(psid) {
  await kvDel(`pause:${psid}`);
  // Админ сүүлд бичсэн байсан ч бот дахин хариулж эхэлнэ
  await kvSet(`resumed:${psid}`, Date.now(), 24 * 3600);
}

async function pausedUntil(psid) {
  const v = Number(await kvGet(`pause:${psid}`));
  return v > Date.now() ? v : 0;
}

async function isPaused(psid) {
  return (await pausedUntil(psid)) > 0;
}

// Админы гараар бичсэн мессежүүдийг санана — AI тэдгээрийг "засахгүй"
const normText = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 300);

async function rememberAdminText(psid, text) {
  if (!text) return;
  await kvPush(`admintxt:${psid}`, normText(text), 30, 30 * 24 * 3600);
}

async function adminTexts(psid) {
  return new Set(await kvList(`admintxt:${psid}`, 30));
}

const textKey = (t) => {
  let h = 0;
  for (const c of normText(t)) h = (Math.imul(31, h) + c.codePointAt(0)) | 0;
  return (h >>> 0).toString(36);
};

async function rememberAutoText(psid, text) {
  if (!text) return;
  await kvSet(`autotext:${textKey(text)}`, "1", 90 * 24 * 3600);
  await kvPush(`autotxt:${psid}`, normText(text), 20, 30 * 24 * 3600);
}

async function isAutoText(text) {
  return !!text && !!(await kvGet(`autotext:${textKey(text)}`));
}

async function autoTexts(psid) {
  return new Set(await kvList(`autotxt:${psid}`, 20));
}

async function adminPsid() {
  return (page().key === DEFAULT_PAGE.key && process.env.ADMIN_PSID) || (await kvGet(pk("admin:psid"))) || "";
}

// ==========================================
// АДМИНД МЭДЭГДЭЛ (Telegram ба/эсвэл Messenger)
// ==========================================

async function customerName(psid) {
  const cached = await kvGet(`name:${psid}`);
  if (cached) return cached;
  try {
    const r = await fetch(
      `${GRAPH}/${psid}?fields=first_name,last_name&access_token=${pageToken()}`
    );
    if (!r.ok) return "Хэрэглэгч";
    const j = await r.json();
    const name = [j.first_name, j.last_name].filter(Boolean).join(" ") || "Хэрэглэгч";
    await kvSet(`name:${psid}`, name, 7 * 24 * 3600);
    return name;
  } catch {
    return "Хэрэглэгч";
  }
}

const panelUrl = () =>
  ADMIN_KEY
    ? `${BASE_URL}/api/webhook?panel=${encodeURIComponent(ADMIN_KEY)}` +
      (page().key === DEFAULT_PAGE.key ? "" : `&page=${page().key}`)
    : "";

// Telegram: TELEGRAM_BOT_TOKEN тохируулаад ботдоо /start бичихэд chat автоматаар олдоно
async function telegramChatId() {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const saved = await kvGet("tg:chat");
  if (saved) return saved;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return "";
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const j = await r.json();
    const updates = j.result || [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const chat = updates[i].message?.chat || updates[i].my_chat_member?.chat;
      if (chat?.id) {
        await kvSet("tg:chat", chat.id);
        return String(chat.id);
      }
    }
  } catch (e) {
    console.error("Telegram getUpdates failed:", e);
  }
  return "";
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, why: "TELEGRAM_BOT_TOKEN тохируулаагүй" };
  const chatId = await telegramChatId();
  if (!chatId) return { ok: false, why: "Telegram ботдоо /start гэж бичээгүй байна" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const j = await r.json();
    return j.ok ? { ok: true } : { ok: false, why: j.description || "Telegram алдаа" };
  } catch (e) {
    return { ok: false, why: String(e) };
  }
}

async function sendAdminMessenger(text) {
  const admin = await adminPsid();
  if (!admin) return { ok: false, why: "Messenger админ бүртгээгүй" };
  const ok = await sendText(admin, text);
  return ok
    ? { ok: true }
    : { ok: false, why: "Messenger илгээгдсэнгүй (24 цагийн дотор пэйж рүү бичээгүй байж магадгүй)" };
}

async function notifyAdmin(psid, reason, userText, { paused = false } = {}) {
  console.log("ADMIN NEEDED:", psid, reason, userText);

  // Нэг хүний нэг шалтгаанаар 15 минутад нэгээс олон мэдэгдэл илгээхгүй
  const dedupeKey = `notif:${psid}:${reason}`;
  if (await kvGet(dedupeKey)) return;
  await kvSet(dedupeKey, "1", 15 * 60);

  const name = await customerName(psid);
  await kvPush(
    pk("handoffs"),
    JSON.stringify({ psid, name, reason, text: String(userText).slice(0, 300), at: Date.now() }),
    30
  );

  const panel = panelUrl();
  const text =
    `🔔 ${page().name} — ${reason.startsWith("🔥") ? "шинэ захиалга" : "админ хэрэгтэй"}\n\n` +
    `👤 ${name}\n` +
    `📌 ${reason}\n` +
    `💬 "${String(userText).slice(0, 300)}"\n` +
    (paused ? `🤖 Бот энэ хүн дээр ${HUMAN_PAUSE_HOURS} цаг зогслоо\n` : "") +
    `\n➡️ Хариулах: https://business.facebook.com/latest/inbox/all` +
    (panel ? `\n⚙️ Удирдлага: ${panel}` : "");

  const results = await Promise.all([sendTelegram(text), sendAdminMessenger(text)]);
  if (!results.some((r) => r.ok)) console.error("Admin notification not delivered:", results);
}

// Хэрэглэгчийг админд шилжүүлэх: (сонголтоор) хариу бичиж, бот зогсоод, админд мэдэгдэнэ
// Бот зогсохгүй — хэрэглэгч өөр асуулт асуувал хариулсаар байна. Админ гараар бичмэгц бот зогсоно.
async function handOff(psid, reason, userText, replyText) {
  if (replyText) await sendText(psid, replyText);
  await notifyAdmin(psid, reason, userText);
}

// ==========================================
// АДМИНЫ КОМАНД (өөрийн хувийн Messenger-ээс пэйж рүү бичнэ)
//   #admin <ADMIN_KEY>  → энэ Messenger-ийг админ болгож бүртгэнэ
//   #off / #on          → бүх ботыг унтраах / асаах
//   #status             → төлөв харах
// ==========================================

async function handleAdminCommand(psid, raw) {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith("#admin")) {
    const key = text.slice(6).trim();
    if (!ADMIN_KEY || key !== ADMIN_KEY) {
      await sendText(psid, "❌ Нууц үг буруу байна.");
      return true;
    }
    await kvSet(pk("admin:psid"), psid);
    await sendText(
      psid,
      `✅ Та ${page().name} пэйжийн админ боллоо. Админ хэрэгтэй чат гарахад энд мэдэгдэл ирнэ.\n\n` +
        "Командууд:\n#off — ботыг унтраах\n#on — ботыг асаах\n#status — төлөв\n\n" +
        (panelUrl() ? `⚙️ Удирдлага: ${panelUrl()}` : "")
    );
    return true;
  }

  if (psid !== (await adminPsid())) return false;

  if (lower === "#off") {
    await setBotEnabled(false);
    await sendText(psid, "⏸️ Бот УНТАРЛАА. Хэрэглэгчдэд автоматаар хариулахгүй. Асаах бол #on");
  } else if (lower === "#on") {
    await setBotEnabled(true);
    await sendText(psid, "▶️ Бот АСЛАА. Хэрэглэгчдэд автоматаар хариулна.");
  } else {
    await sendText(
      psid,
      `${page().name} бот: ${(await botEnabled()) ? "▶️ АСААЛТТАЙ" : "⏸️ УНТРААЛТТАЙ"}\n` +
        `Хадгалалт: ${hasRedis ? "Redis ✅" : "⚠️ Redis байхгүй"}\n\n` +
        "#off — унтраах, #on — асаах" +
        (panelUrl() ? `\n⚙️ ${panelUrl()}` : "")
    );
  }
  // Админы хувийн чатад бот AI-аар хариулахгүй
  return true;
}

// ==========================================
// УДИРДЛАГЫН ХУУДАС: /api/webhook?panel=ADMIN_KEY
// ==========================================

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ubTime = (ts) =>
  new Date(Number(ts)).toLocaleString("en-GB", {
    timeZone: "Asia/Ulaanbaatar",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

// Meta webhook-ийн subscribed_fields (message_echoes байгаа эсэх)
async function webhookFields() {
  const token = pageToken();
  try {
    const [appRes, subRes] = await Promise.all([
      fetch(`${GRAPH}/app?access_token=${token}`),
      fetch(`${GRAPH}/me/subscribed_apps?access_token=${token}`),
    ]);
    const app = await appRes.json();
    const sub = await subRes.json();
    if (sub.error) return { error: sub.error.message };
    const mine = (sub.data || []).find((a) => a.id === app.id) || (sub.data || [])[0];
    return { fields: mine?.subscribed_fields || [] };
  } catch (e) {
    return { error: String(e) };
  }
}

async function fixWebhookFields() {
  const current = await webhookFields();
  if (current.error) return current.error;
  const fields = [...new Set([...current.fields, "messages", "messaging_postbacks", "message_echoes"])];
  const r = await fetch(
    `${GRAPH}/me/subscribed_apps?subscribed_fields=${fields.join(",")}&access_token=${pageToken()}`,
    { method: "POST" }
  );
  const j = await r.json();
  return j.success ? "" : j.error?.message || "Тохиргоо хийгдсэнгүй";
}

async function handlePanel(req, res) {
  const key = String(req.query.panel || "");
  if (!ADMIN_KEY) {
    return res
      .status(200)
      .send("Удирдлагын хуудсыг ашиглахын тулд Vercel дээр ADMIN_KEY (нууц үг) тохируулаад Redeploy хийнэ үү.");
  }
  if (key !== ADMIN_KEY) return res.status(403).send("Нууц үг буруу");

  const self =
    `?panel=${encodeURIComponent(key)}` + (page().key === DEFAULT_PAGE.key ? "" : `&page=${page().key}`);

  if (req.method === "POST") {
    const b = req.body || {};
    let msg = "";
    if (b.action === "on") await setBotEnabled(true);
    if (b.action === "off") await setBotEnabled(false);
    if (b.action === "resume" && b.psid) await resumeUser(b.psid);
    if (b.action === "pause" && b.psid) await pauseUser(b.psid, 24 * 30);
    if (b.action === "test") {
      const text = "✅ Mongol AI: туршилтын мэдэгдэл. Мэдэгдэл зөв ажиллаж байна.";
      const [tg, ms] = await Promise.all([sendTelegram(text), sendAdminMessenger(text)]);
      msg = `Telegram: ${tg.ok ? "илгээгдлээ ✅" : tg.why} · Messenger: ${ms.ok ? "илгээгдлээ ✅" : ms.why}`;
    }
    if (b.action === "fixhook") {
      const err = await fixWebhookFields();
      msg = err ? `Webhook: ${err}` : "Webhook тохиргоо засагдлаа ✅";
    }
    res.statusCode = 303;
    res.setHeader("Location", self + (msg ? `&msg=${encodeURIComponent(msg)}` : ""));
    return res.end();
  }

  const [enabled, hook, tgChat, admin, rawHandoffs] = await Promise.all([
    botEnabled(),
    webhookFields(),
    process.env.TELEGRAM_BOT_TOKEN ? telegramChatId() : Promise.resolve(""),
    adminPsid(),
    kvList(pk("handoffs"), 20),
  ]);

  const seen = new Set();
  const handoffs = [];
  for (const raw of rawHandoffs) {
    try {
      const h = JSON.parse(raw);
      if (seen.has(h.psid)) continue;
      seen.add(h.psid);
      h.pausedUntil = await pausedUntil(h.psid);
      handoffs.push(h);
    } catch {}
  }

  const echoOk = hook.fields?.includes("message_echoes");
  const form = (action, label, cls = "", psid = "") =>
    `<form method="post" action="${self}"><input type="hidden" name="action" value="${action}">` +
    (psid ? `<input type="hidden" name="psid" value="${esc(psid)}">` : "") +
    `<button class="${cls}">${label}</button></form>`;

  const row = (ok, label, detail) =>
    `<div class="row"><span class="dot ${ok ? "ok" : "bad"}"></span><div><b>${label}</b><small>${detail}</small></div></div>`;

  const notice = req.query.msg ? `<div class="notice">${esc(req.query.msg)}</div>` : "";

  const html = `<!doctype html><html lang="mn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page().name)} бот</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--ink:#16181d;--muted:#6b7280;--line:#e5e7eb;--ok:#16a34a;--bad:#dc2626;--brand:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--ink:#eef0f3;--muted:#9aa3af;--line:#2a2f37}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0 14px}h2{font-size:15px;margin:22px 0 8px;color:var(--muted);font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:10px}
.status{display:flex;align-items:center;justify-content:space-between;gap:12px}
.big{font-size:18px;font-weight:700}.on{color:var(--ok)}.off{color:var(--bad)}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:10px 14px;background:var(--brand);color:#fff;cursor:pointer;width:100%}
button.stop{background:var(--bad)}button.go{background:var(--ok)}button.ghost{background:transparent;color:var(--brand);border:1px solid var(--line)}
form{margin:0}.status form{width:auto}.status button{width:auto;padding:12px 18px}
.row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.row small{display:block;color:var(--muted)}.dot{width:10px;height:10px;border-radius:50%;margin-top:6px;flex:none}.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}
.h-top{display:flex;justify-content:space-between;gap:8px}.h-top small{color:var(--muted)}
.quote{margin:6px 0 10px;color:var(--muted);word-wrap:break-word}.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:var(--bg);margin-top:4px}
.actions{display:flex;gap:8px}.actions form{flex:1}
.notice{background:#fef3c7;color:#78350f;border-radius:10px;padding:10px 12px;margin-bottom:10px}
.empty{color:var(--muted);text-align:center;padding:18px}
.tabs{display:flex;gap:6px;margin:-4px 0 14px;flex-wrap:wrap}.tabs a{padding:6px 12px;border-radius:99px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600;font-size:14px}.tabs a.cur{background:var(--brand);border-color:var(--brand);color:#fff}
</style></head><body><main>
<h1>🤖 ${esc(page().name)} бот</h1>
<div class="tabs">${PAGES.filter((x) => x.key === DEFAULT_PAGE.key || process.env[x.tokenEnv])
  .map((x) => `<a class="${x.key === page().key ? "cur" : ""}" href="?panel=${encodeURIComponent(key)}${x.key === DEFAULT_PAGE.key ? "" : `&page=${x.key}`}">${esc(x.name)}</a>`)
  .join("")}</div>
${notice}
<div class="card status">
  <div><div class="big ${enabled ? "on" : "off"}">${enabled ? "▶️ Асаалттай" : "⏸️ Унтраалттай"}</div>
  <small style="color:var(--muted)">${enabled ? "Хэрэглэгчдэд автоматаар хариулж байна" : "Бот хэнд ч хариулахгүй — та өөрөө хариулна"}</small></div>
  ${enabled ? form("off", "Унтраах", "stop") : form("on", "Асаах", "go")}
</div>
${process.env.BOT_ENABLED === "false" ? `<div class="notice">Vercel дээр BOT_ENABLED=false тохируулсан тул бот үргэлж унтраалттай.</div>` : ""}

<h2>Админ хүлээж буй чатууд</h2>
${
  handoffs.length
    ? handoffs
        .map(
          (h) => `<div class="card"><div class="h-top"><b>${esc(h.name)}</b><small>${ubTime(h.at)}</small></div>
<div class="tag">${esc(h.reason)}</div><div class="quote">“${esc(h.text)}”</div>
<div class="actions">${
            h.pausedUntil
              ? form("resume", "🤖 Ботыг буцааж асаах", "ghost", h.psid)
              : form("pause", "🔕 Энэ хүн дээр бот зогсоох", "ghost", h.psid)
          }</div>
<small style="color:var(--muted)">${h.pausedUntil ? `Бот зогссон: ${ubTime(h.pausedUntil)} хүртэл` : "Бот энэ хүнтэй ярилцаж байна"}</small></div>`
        )
        .join("")
    : `<div class="card empty">Одоогоор хүлээгдэж буй чат алга</div>`
}

<h2>Тохиргоо</h2>
<div class="card">
${row(hasRedis, "Хадгалалт (Redis)", hasRedis ? "Холбогдсон — бот төлөвөө мартахгүй" : "Байхгүй — бот таныг гараар бичсэнийг мартаж, дундуур орно. Vercel → Storage → Upstash Redis холбоно уу.")}
${row(echoOk, "Админы мессеж таних (message_echoes)", hook.error ? esc(hook.error) : echoOk ? "Идэвхтэй — та бичихэд бот тэр хүн дээр зогсоно" : "Идэвхгүй — доорх товчоор засна уу")}
${row(!!tgChat, "Telegram мэдэгдэл", process.env.TELEGRAM_BOT_TOKEN ? (tgChat ? "Холбогдсон" : "Telegram ботдоо /start гэж бичнэ үү") : "Тохируулаагүй (TELEGRAM_BOT_TOKEN)")}
${row(!!admin, "Messenger мэдэгдэл", admin ? "Бүртгэлтэй (24 цагийн дотор пэйж рүү бичсэн үед ирнэ)" : "Хувийн Messenger-ээсээ пэйж рүү “#admin нууцүг” гэж бичнэ")}
</div>
<div class="actions">${form("test", "🔔 Тест мэдэгдэл", "ghost")}${echoOk ? "" : form("fixhook", "🔧 Webhook засах", "ghost")}</div>
</main></body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(html);
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
  // Conversions API зөвхөн Mongol AI-д тохируулагдсан
  if (page().key !== DEFAULT_PAGE.key) return;
  const datasetId = process.env.META_DATASET_ID;
  const token = process.env.META_CAPI_TOKEN || pageToken();

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
  const token = pageToken();
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
