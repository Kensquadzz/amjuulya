// Default website content. Used until a section is edited and published in the
// admin dashboard (and as a fallback if the database is unreachable).
// Facts here are owner-supplied; nothing in this file should be invented.

export const DEFAULT_CONTENT = {
  seo: {
    title: 'Ulaan Creative — Create. Grow. Go Viral. | Creative Marketing Agency, Mongolia',
    description: 'Ulaan Creative — бүтээлч маркетинг, AI-д суурилсан контент үйлдвэрлэл, influencer кампанит ажил. Creative marketing, AI-powered production and influencer campaigns that move brands forward.',
    ogTitle: 'Ulaan Creative — Create. Grow. Go Viral.',
    ogDescription: 'Creative thinking. AI-powered production. Influencer-driven reach.',
    ogImageMediaId: null,
  },
  hero: {
    metaLabel: '( 001 ) — Creative marketing agency, Mongolia',
    headline: 'CREATE\nGROW\nGO VIRAL.',
    lede: 'Creative marketing, AI-powered production, and influencer campaigns that move brands forward.',
    ctaLabel: 'START A PROJECT',
    ctaHref: '#contact',
    status: 'Available for new projects',
    tagline: 'Ideas move fast. Brands move forward.',
  },
  marquee: {
    items: ['Creative thinking', 'AI-powered production', 'Influencer-driven reach'],
  },
  intro: {
    label: '( 002 ) — Агентлагийн тухай товчхон',
    title: 'Ideas move fast. *Brands move forward.*',
    copy: 'Бид стратеги, бүтээлч санаа, технологи, үйлдвэрлэл болон түгээлтийг нэг дор нэгтгэж, брэндийг урагшлуулдаг бүтээлч түнш.',
    stats: [
      { value: '5', suffix: '+', label: 'Жилийн туршлага', sublabel: 'Years of experience', visible: true },
      { value: '30', suffix: '+', label: 'Тоглолтын маркетинг', sublabel: 'Concerts marketed', visible: true },
      { value: '30', suffix: '+', label: 'Брэнд, компани, төслийн хамтын ажиллагаа', sublabel: 'Brands, companies & projects worked with', visible: true },
      { value: '∞', suffix: '', label: 'Салбар дамнасан боломж', sublabel: 'Possibilities across industries', visible: true },
    ],
  },
  services: {
    label: '( 003 ) — Services',
    title: 'One agency.\nFour engines.',
    intro: 'Бизнес бүрийн зорилгод тохируулан стратеги, контент, технологи, түгээлтийг нэгтгэсэн шийдэл гаргана.',
    items: [
      { visual: 'ai', tag: 'AI · Production', title: 'AI Creative\nProduction', description: 'AI-г уламжлалт бүтээлч үйлдвэрлэлтэй хослуулж, санаанаас эцсийн визуал хүртэлх хугацааг богиносгоно.', bullets: ['AI-д суурилсан видео концепц', 'Бүтээгдэхүүний визуал, рекламны креатив', 'AI-assisted контент үйлдвэрлэл'] },
      { visual: 'influencer', tag: 'People · Reach', title: 'Influencer\nMarketing', description: 'Брэндийн зорилго, зорилтот үзэгчдэд тохирох creator-уудыг сонгож, кампанит ажлыг эхнээс нь дуустал зохион байгуулна.', bullets: ['Creator сонголт', 'Influencer кампанит ажлын төлөвлөлт', 'Sponsored контент, хамтын ажиллагааны зохицуулалт'] },
      { visual: 'video', tag: 'Video · Content', title: 'Video & Content\nProduction', description: 'Богино видеоноос бүтээгдэхүүний реклам хүртэл — зураг авалт, эвлүүлэг, бүтээлч удирдлагыг нэг багаас.', bullets: ['Reels болон богино хэлбэрийн видео', 'Бүтээгдэхүүний реклам', 'Зураг авалт, эвлүүлэг, creative direction'] },
      { visual: 'calendar', tag: 'Brand · Digital', title: 'Brand & Digital\nMarketing', description: 'Брэндийн дуу хоолойг тодорхойлж, сошиал медиа болон дижитал сувгуудад тогтвортой, зорилготой харилцаа үүсгэнэ.', bullets: ['Брэндийн харилцаа, мессеж', 'Сошиал медиа стратеги', 'Контент төлөвлөлт', 'Дижитал кампанит ажил'] },
    ],
  },
  work: {
    label: '( 004 ) — Selected work',
    title: 'Ideas into\n*impact.*',
    intro: 'Тоглолтоос эхлээд компани, бүтээгдэхүүн, брэнд хүртэл — ажил бүр өөрийн зорилготой.',
    emptyTitle: 'Шинэ төслүүд удахгүй нэмэгдэнэ.',
    emptyText: 'Бидний сүүлийн үеийн ажлуудыг энд байршуулж байна. Өөрийн төслөө ярилцахыг хүсвэл бидэнтэй холбогдоорой.',
  },
  influencers: {
    label: '( 005 ) — Influencer network',
    title: 'Creators that\nconnect.',
    intro: 'Брэндийн зорилго, үзэгчдэд тохирох creator-уудтай хамтын ажиллагааг бид зохион байгуулна.',
  },
  packages: {
    label: '( 006 ) — Packages',
    title: 'Choose your\ncreative level.',
    intro: 'Бизнесийнхээ зорилго, контентын хэрэгцээнд тохирох сарын багцаа сонгоорой.',
    note: 'Рекламны (boost) төсөв, influencer-ийн төлбөр болон нэмэлт үйлдвэрлэлийн зардал багцын үнэд ороогүй бөгөөд тусад нь тооцогдоно — өөрөөр тохиролцоогүй бол. Ажлын хамрах хүрээ, хугацааг гэрээгээр баталгаажуулна.',
    items: [
      { id: 'starter', tier: '01 / Starter', name: 'Creative\nStarter', tagline: 'Контент үйлдвэрлэлээ эхлүүлэхэд.', price: '₮1,500,000', priceSuffix: '', badge: '', theme: 'light', ctaLabel: 'Багц сонгох', features: ['5 Reels видео', '5 постер / дизайн', 'Контент төлөвлөгөө', 'Caption бичих', 'Үндсэн эвлүүлэг, өнгө засалт', '1 засварын үе шат'] },
      { id: 'growth', tier: '02 / Growth', name: 'Creative\nGrowth', tagline: 'Брэндийн танигдалт, контентын чанарыг өсгөхөд.', price: '₮2,000,000', priceSuffix: '', badge: '', theme: 'dark', ctaLabel: 'Багц сонгох', features: ['7 Reels видео', '8 постер / дизайн', 'Контент стратеги, календарь', 'Caption бичих', 'Видео зураг авалт, эвлүүлэг', 'Boost тохиргоо, кампанит ажлын удирдлага', 'Гүйцэтгэлийн тайлан', '2 засварын үе шат'] },
      { id: 'premium', tier: '03 / Premium', name: 'Creative\nPremium', tagline: 'Өргөн хүрээний контент үйлдвэрлэл, бүтээлч кампанит ажилд.', price: '₮3,000,000', priceSuffix: '+ НӨАТ', badge: '★ Full service', theme: 'red', ctaLabel: 'Багц сонгох', features: ['10 Reels видео', '12 постер / дизайн', 'AI, UGC-style, бүтээгдэхүүний болон рекламны видео сонголт', 'Нарийвчилсан контент стратеги, календарь', 'Зураг авалт, эвлүүлэг', 'Boost тохиргоо, кампанит ажлын удирдлага', 'Гүйцэтгэлийн тайлан', '2 засварын үе шат'] },
    ],
  },
  about: {
    label: '( 007 ) — About Ulaan Creative',
    manifesto: 'Таван жилийн туршлагыг *AI хэрэгсэл*, бүтээлч үйлдвэрлэл, *influencer маркетинг*, дижитал стратегитай нэгтгэж — брэндийг *урагш* хөдөлгөнө.',
    title: 'Creative thinking.\nFast execution.',
    paragraphs: [
      'Ulaan Creative бол 5 жилийн туршлагатай бүтээлч маркетингийн агентлаг. Бид олон төрлийн төсөл, брэнд, компани болон арга хэмжээний маркетингийн ажлуудыг гүйцэтгэж ирсэн.',
      '30 гаруй тоглолтын маркетингийн туршлагаа компани, бүтээгдэхүүн, брэндийн кампанит ажилтай хослуулж, AI технологи, influencer маркетинг, видео үйлдвэрлэл, дизайн, дижитал маркетингийг нэг дор хэрэгжүүлдэг.',
    ],
    process: [
      { en: 'Strategy', mn: 'Стратеги' },
      { en: 'Creative', mn: 'Бүтээлч санаа' },
      { en: 'Production', mn: 'Үйлдвэрлэл' },
      { en: 'Distribution', mn: 'Түгээлт' },
    ],
  },
  faq: {
    label: '( 008 ) — FAQ',
    title: 'Түгээмэл асуултууд',
    items: [], // left empty on purpose — the section stays hidden until the owner adds real answers
  },
  contact: {
    label: '( 009 ) — Contact',
    title: 'Let’s make\nsomething\nloud.',
    copy: 'Шинэ брэнд, кампанит ажил эсвэл контентын санаа байна уу? Төслөө товч танилцуулаарай — бид тантай эргэн холбогдоно.',
    consentLabel: 'Миний илгээсэн мэдээллийг Ulaan Creative зөвхөн энэ хүсэлтэд хариу өгөх зорилгоор хадгалж, ашиглахыг зөвшөөрч байна.',
    privacyNotice: 'Таны мэдээллийг гуравдагч этгээдэд худалдахгүй, дамжуулахгүй. Мэдээллээ устгуулахыг хүсвэл бидэнд мэдэгдэнэ үү.',
    successMessage: 'Баярлалаа! Таны хүсэлтийг хүлээн авлаа. Бид удахгүй эргэн холбогдоно.',
  },
  // Business contact details: empty until the owner confirms them. Empty values are never shown publicly.
  contact_details: {
    email: '',
    phone: '',
    address: '',
    instagram: '',
    facebook: '',
    tiktok: '',
    youtube: '',
  },
  footer: {
    tagline: 'Creative thinking.\nAI-powered production.\nInfluencer-driven reach.',
  },
};

export const CONTENT_KEYS = Object.keys(DEFAULT_CONTENT);

export const SERVICE_OPTIONS = [
  ['ai', 'AI Creative Production'],
  ['influencer', 'Influencer Marketing'],
  ['video', 'Video & Content Production'],
  ['brand', 'Brand & Digital Marketing'],
  ['starter', 'Багц — Creative Starter'],
  ['growth', 'Багц — Creative Growth'],
  ['premium', 'Багц — Creative Premium'],
  ['other', 'Бусад'],
];

export const BUDGET_OPTIONS = [
  ['lt-1.5m', '₮1.5 сая хүртэл'],
  ['1.5-3m', '₮1.5 – 3 сая'],
  ['3-5m', '₮3 – 5 сая'],
  ['gt-5m', '₮5 саяас дээш'],
  ['unknown', 'Одоогоор тодорхойгүй'],
];
