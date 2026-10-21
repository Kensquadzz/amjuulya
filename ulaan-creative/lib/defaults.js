// Default website content. Used until a section is edited and published in the
// admin dashboard (and as a fallback if the database is unreachable).
// Facts here are owner-supplied; nothing in this file should be invented.

export const DEFAULT_CONTENT = {
  seo: {
    title: 'Ulaan Creative — Create. Grow. Go Viral. | Бүтээлч маркетингийн агентлаг',
    description: 'Ulaan Creative — бүтээлч маркетинг, AI-д суурилсан контент үйлдвэрлэл, influencer кампанит ажил, видео үйлдвэрлэл, брэнд ба дижитал маркетинг.',
    ogTitle: 'Ulaan Creative — Create. Grow. Go Viral.',
    ogDescription: 'Бүтээлч санаа. AI-д суурилсан үйлдвэрлэл. Influencer-ээр дамжсан хүрээ.',
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
    label: '( 002 ) — Бидний тухай товчхон',
    title: 'Ideas move fast. *Brands move forward.*',
    copy: 'Бид бүтээлч санаа, AI контент үйлдвэрлэл, видео продакшн, influencer маркетинг, брэнд хөгжүүлэлт, дижитал маркетингийг нэгтгэн, брэндүүдийг илүү бүтээлчээр таниулж, өсөлтөд хөтөлнө.',
    stats: [
      { value: '5', suffix: '+', label: 'Жилийн туршлага', sublabel: 'Years of experience', visible: true },
      { value: '30', suffix: '+', label: 'Тоглолтын маркетинг', sublabel: 'Concerts marketed', visible: true },
      { value: '30', suffix: '+', label: 'Хамтран ажилласан брэнд, компани, төсөл', sublabel: 'Brands, companies & projects', visible: true },
    ],
  },
  services: {
    label: '( 003 ) — Үйлчилгээ',
    title: 'One agency.\nFour engines.',
    intro: 'Бизнес бүрийн зорилгод нийцүүлэн стратеги, контент, технологи, түгээлтийг нэгтгэсэн цогц шийдэл санал болгоно.',
    items: [
      {
        visual: 'ai', tag: 'AI · Production', title: 'AI Creative\nProduction',
        description: 'AI технологийг уламжлалт бүтээлч үйлдвэрлэлтэй хослуулж, санаанаас эцсийн бүтээл хүртэлх хугацааг богиносгоно.',
        bullets: ['AI-д суурилсан видео концепц', 'Бүтээгдэхүүний визуал, сурталчилгааны креатив', 'AI хэрэгслээр дэмжсэн контент үйлдвэрлэл'],
        works: [], // filled from the admin with real uploaded images / videos
      },
      {
        visual: 'influencer', tag: 'People · Reach', title: 'Influencer\nMarketing',
        description: 'Брэндийн зорилго, зорилтот үзэгчдэд тохирох контент бүтээгчдийг сонгож, кампанит ажлыг эхнээс нь дуустал зохион байгуулна.',
        bullets: ['Контент бүтээгч (influencer) сонголт', 'Influencer кампанит ажлын төлөвлөлт', 'Ивээн тэтгэсэн контент, хамтын ажиллагааны зохицуулалт'],
        works: [],
      },
      {
        visual: 'video', tag: 'Video · Content', title: 'Video & Content\nProduction',
        description: 'Богино видеоноос бүтээгдэхүүний сурталчилгаа хүртэл зураг авалт, эвлүүлэг, бүтээлч удирдлагыг нэг багаас авна.',
        bullets: ['Reels болон богино хэлбэрийн видео', 'Бүтээгдэхүүний сурталчилгааны видео', 'Зураг авалт, эвлүүлэг, бүтээлч удирдлага'],
        works: [],
      },
      {
        visual: 'strategy', tag: 'Brand · Digital', title: 'Brand & Digital\nMarketing',
        description: 'Брэндийн дуу хоолойг тодорхойлж, сошиал медиа болон дижитал сувгуудаар тогтвортой, зорилготой харилцаа бий болгоно.',
        bullets: ['Брэндийн мессеж, харилцааны стратеги', 'Сошиал медиа стратеги', 'Контент төлөвлөлт', 'Дижитал кампанит ажил'],
        works: [],
      },
    ],
  },
  work: {
    label: '( 004 ) — Сонгомол бүтээлүүд',
    title: 'Ideas into\n*impact.*',
    intro: 'Тоглолтын маркетингаас эхлээд компани, бүтээгдэхүүн, брэндийн кампанит ажил хүртэл — бүтээл бүр тодорхой зорилготой.',
    flow: [
      { en: 'Idea', mn: 'Санаа', text: 'Брэндийн зорилгоос төрсөн бүтээлч санаа' },
      { en: 'Action', mn: 'Хэрэгжүүлэлт', text: 'Стратеги, контент, үйлдвэрлэл, түгээлт' },
      { en: 'Result', mn: 'Үр дүн', text: 'Брэндийн танигдалт, үзэгчидтэй тогтсон холбоо' },
    ],
    emptyTitle: 'Бүтээлүүд удахгүй нэмэгдэнэ',
    emptyText: 'Сүүлийн үеийн ажлуудаа энд байршуулж байна. Өөрийн төслөө ярилцахыг хүсвэл бидэнтэй холбогдоорой.',
  },
  influencers: {
    label: '( 005 ) — Influencer сүлжээ',
    title: 'Creators that\nconnect.',
    homeSubtitle: 'Брэндтэй тань тохирох контент бүтээгчдийг олоорой.',
    intro: 'Брэндийн зорилго, үзэгчдэд тохирсон контент бүтээгчидтэй хамтын ажиллагааг бид зохион байгуулна.',
    emptyTitle: 'Хамтран ажилладаг influencer-үүд удахгүй нэмэгдэнэ',
    emptyText: 'Брэндийнхээ кампанит ажилд тохирох контент бүтээгч хайж байна уу? Зорилго, төсөвт тань нийцүүлэн сонгож, хамтын ажиллагааг эхнээс нь дуустал зохион байгуулна.',
  },
  packages: {
    label: '( 006 ) — Багцууд',
    title: 'Choose your\ncreative level.',
    intro: 'Бизнесийнхээ зорилго, контентын хэрэгцээнд тохирсон сарын багцаа сонгоорой.',
    note: 'Сурталчилгааны (boost) төсөв, influencer-ийн төлбөр болон нэмэлт үйлдвэрлэлийн зардал багцын үнэд ороогүй бөгөөд өөрөөр тохиролцоогүй бол тусад нь тооцогдоно. Ажлын хамрах хүрээ, хугацааг гэрээгээр баталгаажуулна.',
    items: [
      { id: 'starter', tier: '01 / Starter', name: 'Creative\nStarter', tagline: 'Контент үйлдвэрлэлээ эхлүүлж буй брэндүүд.', price: '₮1,500,000', priceSuffix: '/ сар', badge: '', theme: 'light', ctaLabel: 'Багц сонгох', features: ['5 Reels видео', '5 постер / дизайн', 'Контент төлөвлөгөө', 'Тайлбар (caption) бичих', 'Үндсэн эвлүүлэг, өнгө засалт', '1 удаагийн засвар'] },
      { id: 'growth', tier: '02 / Growth', name: 'Creative\nGrowth', tagline: 'Брэндийн танигдалт, контентын чанарыг өсгөх.', price: '₮2,000,000', priceSuffix: '/ сар', badge: '', theme: 'dark', ctaLabel: 'Багц сонгох', features: ['7 Reels видео', '8 постер / дизайн', 'Контент стратеги, хуанли', 'Тайлбар (caption) бичих', 'Видео зураг авалт, эвлүүлэг', 'Boost тохиргоо, кампанит ажлын удирдлага', 'Гүйцэтгэлийн тайлан', '2 удаагийн засвар'] },
      { id: 'premium', tier: '03 / Premium', name: 'Creative\nPremium', tagline: 'Өргөн хүрээний контент үйлдвэрлэл, бүтээлч кампанит ажил.', price: '₮3,000,000+', priceSuffix: '/ сар', badge: '★ Full service', theme: 'red', ctaLabel: 'Багц сонгох', features: ['10 Reels видео', '10 постер / дизайн', 'AI, UGC хэв маягийн видео', 'Нарийвчилсан стратеги, хуанли', 'Зураг авалт, эвлүүлэг', 'Boost тохиргоо, кампанит ажлын удирдлага', 'Гүйцэтгэлийн тайлан', '2 удаагийн засвар'] },
    ],
  },
  about: {
    label: '( 007 ) — Ulaan Creative-ийн тухай',
    manifesto: 'Таван жилийн туршлагаа *AI хэрэгсэл*, бүтээлч үйлдвэрлэл, *influencer маркетинг*, дижитал стратегитай хослуулж, брэндийг *урагш* хөдөлгөнө.',
    title: 'Creative thinking.\nFast execution.',
    paragraphs: [
      'Ulaan Creative бол таван жилийн туршлагатай бүтээлч маркетингийн агентлаг. Бид олон төрлийн төсөл, брэнд, компани, арга хэмжээний маркетингийн ажлыг хэрэгжүүлж ирсэн.',
      'Гуч гаруй тоглолтын маркетингийн туршлагаа компани, бүтээгдэхүүн, брэндийн кампанит ажилтай хослуулан AI технологи, influencer маркетинг, видео үйлдвэрлэл, дизайн, дижитал маркетингийг нэг дор хэрэгжүүлдэг.',
    ],
    process: [
      { en: 'Strategy', mn: 'Стратеги' },
      { en: 'Creative', mn: 'Бүтээлч санаа' },
      { en: 'Production', mn: 'Үйлдвэрлэл' },
      { en: 'Distribution', mn: 'Түгээлт' },
    ],
  },
  faq: {
    label: '( 008 ) — Түгээмэл асуулт',
    title: 'Түгээмэл асуултууд',
    items: [], // left empty on purpose — the section stays hidden until the owner adds real answers
  },
  contact: {
    label: '( 009 ) — Холбоо барих',
    title: 'Let’s make\nsomething\nloud.',
    copy: 'Шинэ брэнд, кампанит ажил эсвэл контентын санаа байна уу? Төслөө товч танилцуулаарай — бид тантай эргэн холбогдоно.',
    consentLabel: 'Ulaan Creative миний илгээсэн мэдээллийг зөвхөн энэ хүсэлтэд хариу өгөх зорилгоор хадгалж, ашиглахыг зөвшөөрч байна.',
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
