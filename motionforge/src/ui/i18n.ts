// UI strings for the simple (CapCut-style) editor. Mongolian is the default;
// English is one tap away. Pro panels keep their English technical labels.
import { useSyncExternalStore } from 'react';

export type Lang = 'mn' | 'en';

const MN = {
  home: 'Нүүр', newProject: 'Шинэ төсөл', continue: 'Үргэлжлүүлэх', templates: 'Загварууд', myProjects: 'Миний төслүүд',
  allTemplates: 'Бүх загвар', chooseRatio: 'Хэмжээ сонгох', open: 'Нээх', export: 'Экспорт', undo: 'Буцаах', redo: 'Дахин',
  play: 'Тоглуулах', pause: 'Зогсоох',
  // main tools
  tTemplates: 'Загвар', tText: 'Текст', tAudio: 'Дуу', tImage: 'Зураг', tEffects: 'Эффект', tStickers: 'Стикер', tRatio: 'Харьцаа',
  tBackground: 'Дэвсгэр', tPro: 'Pro', tSettings: 'Тохиргоо',
  // context tools
  cEdit: 'Засах', cFont: 'Фонт', cStyle: 'Загвар', cAnim: 'Анимэйшн', cPosition: 'Байрлал', cSplit: 'Хуваах', cCopy: 'Хуулах',
  cDelete: 'Устгах', cForward: 'Урагш', cBackward: 'Хойш', cReplace: 'Солих', cCutout: 'Фон арилгах', cRestore: 'Анхны зураг',
  cShadow: 'Сүүдэр', cAdjust: 'Тохируулах', cColor: 'Өнгө', cVolume: 'Дууны хэмжээ', cFade: 'Fade', cAll: 'Бүх тохиргоо', cBack: 'Буцах',
  cKeyframe: 'Keyframe',
  // panels
  editText: 'Текст засах', typeHere: 'Текстээ бичнэ үү…', animIn: 'Орох', animOut: 'Гарах', animNone: 'Байхгүй', speed: 'Хурд',
  size: 'Хэмжээ', spacing: 'Үсгийн зай', lineHeight: 'Мөр хоорондын зай', glow: 'Гэрэлтэлт', opacity: 'Тунгалаг', rotation: 'Эргэлт',
  scale: 'Томруулах', posX: 'Хэвтээ', posY: 'Босоо', blur: 'Бүдгэрүүлэх', textColor: 'Текстийн өнгө', glowColor: 'Гэрэлтэлтийн өнгө',
  weight: 'Зузаан', italic: 'Налуу', uppercase: 'ТОМ ҮСЭГ', align: 'Байрлуулалт',
  stickerTiles: 'Glass icon', stickerShapes: 'Дүрс', stickerFx: 'Хөдөлгөөнт', particles: 'Бөөмс',
  bgSolid: 'Нэг өнгө', bgGradient: 'Градиент', bgProject: 'Төслийн дэвсгэр',
  ratioHint: 'Анимэйшн бүгд хадгалагдана — зөвхөн хүрээ өөрчлөгдөнө.',
  noSelection: 'Timeline дээрх зүйлийг дарж сонгоно уу',
  added: 'Нэмэгдлээ', deleted: 'Устгагдлаа (Буцаах дарж сэргээнэ)', split: 'Хуваагдлаа', copied: 'Хуулагдлаа',
  splitHint: 'Playhead-ийг тухайн зүйлийн дунд аваачна уу',
  proHint: 'Мэргэжлийн хэрэгсэл: keyframe, давхарга, shader код.',
  tapToEdit: 'Засахын тулд дарна уу', empty: 'Хоосон төсөл — доорх хэрэгслээр текст, зураг, дуу нэмнэ үү.',
  language: 'Хэл', saved: 'Хадгалагдлаа', cutoutBusy: 'Фон арилгаж байна…',
  enterAnim: 'Орох анимэйшн', exitAnim: 'Гарах анимэйшн', duration: 'Хугацаа', intensity: 'Хүч',
  aFade: 'Бүдэг', aZoomIn: 'Томрох', aZoomOut: 'Жижгэрэх', aSlideUp: 'Доороос', aSlideDown: 'Дээрээс', aSlideLeft: 'Баруунаас',
  aSlideRight: 'Зүүнээс', aPop: 'Үсрэх', aSpin: 'Эргэх', aBlur: 'Бүдгээс', aRise: 'Дээш хөвөх',
  scenes: 'scene', seconds: 'сек', withSound: 'Дуутай', imageSlots: 'зургийн слот',
  posHint: '☝ Preview дээр хуруугаар чирж зөөнө, хоёр хуруугаар томруулж эргүүлнэ. ◆ товч тухайн мөчид keyframe тавина.',
};

const EN: typeof MN = {
  home: 'Home', newProject: 'New project', continue: 'Continue', templates: 'Templates', myProjects: 'My projects',
  allTemplates: 'All templates', chooseRatio: 'Choose size', open: 'Open', export: 'Export', undo: 'Undo', redo: 'Redo',
  play: 'Play', pause: 'Pause',
  tTemplates: 'Templates', tText: 'Text', tAudio: 'Audio', tImage: 'Photo', tEffects: 'Effects', tStickers: 'Stickers', tRatio: 'Ratio',
  tBackground: 'Background', tPro: 'Pro', tSettings: 'Settings',
  cEdit: 'Edit', cFont: 'Font', cStyle: 'Style', cAnim: 'Animation', cPosition: 'Position', cSplit: 'Split', cCopy: 'Duplicate',
  cDelete: 'Delete', cForward: 'Forward', cBackward: 'Backward', cReplace: 'Replace', cCutout: 'Remove BG', cRestore: 'Original',
  cShadow: 'Shadow', cAdjust: 'Adjust', cColor: 'Color', cVolume: 'Volume', cFade: 'Fade', cAll: 'All settings', cBack: 'Back',
  cKeyframe: 'Keyframe',
  editText: 'Edit text', typeHere: 'Type your text…', animIn: 'In', animOut: 'Out', animNone: 'None', speed: 'Speed',
  size: 'Size', spacing: 'Letter spacing', lineHeight: 'Line height', glow: 'Glow', opacity: 'Opacity', rotation: 'Rotation',
  scale: 'Scale', posX: 'Horizontal', posY: 'Vertical', blur: 'Blur', textColor: 'Text colour', glowColor: 'Glow colour',
  weight: 'Weight', italic: 'Italic', uppercase: 'UPPERCASE', align: 'Align',
  stickerTiles: 'Glass icons', stickerShapes: 'Shapes', stickerFx: 'Animated', particles: 'Particles',
  bgSolid: 'Solid', bgGradient: 'Gradient', bgProject: 'Project background',
  ratioHint: 'All animation is kept — only the frame changes.',
  noSelection: 'Tap something on the timeline to select it',
  added: 'Added', deleted: 'Deleted (Undo to restore)', split: 'Split', copied: 'Duplicated',
  splitHint: 'Move the playhead inside the item first',
  proHint: 'Pro tools: keyframes, layers, shader code.',
  tapToEdit: 'Tap to edit', empty: 'Empty project — add text, photos or sound with the tools below.',
  language: 'Language', saved: 'Saved', cutoutBusy: 'Removing background…',
  enterAnim: 'In animation', exitAnim: 'Out animation', duration: 'Duration', intensity: 'Strength',
  aFade: 'Fade', aZoomIn: 'Zoom in', aZoomOut: 'Zoom out', aSlideUp: 'From below', aSlideDown: 'From above', aSlideLeft: 'From right',
  aSlideRight: 'From left', aPop: 'Pop', aSpin: 'Spin', aBlur: 'From blur', aRise: 'Rise',
  scenes: 'scenes', seconds: 's', withSound: 'Sound', imageSlots: 'image slots',
  posHint: '☝ Drag on the preview to move, pinch with two fingers to scale and rotate. ◆ sets a keyframe at the playhead.',
};

export type StrKey = keyof typeof MN;
const DICT: Record<Lang, typeof MN> = { mn: MN, en: EN };

let lang: Lang = (() => { try { return (localStorage.getItem('mf.lang') as Lang) || 'mn'; } catch { return 'mn'; } })();
const subs = new Set<() => void>();

export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem('mf.lang', l); } catch { /* */ }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}

export const tr = (k: StrKey) => DICT[lang][k] ?? EN[k];

/** Re-renders the component when the language changes. */
export function useLang() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => lang);
  return { lang, t: tr };
}

/** Friendly names for text animation presets in the simple editor. */
export const TEXT_ANIM_NAMES: Record<string, { mn: string; en: string }> = {
  none: { mn: 'Байхгүй', en: 'None' },
  smooth: { mn: 'Зөөлөн', en: 'Smooth' },
  typewriter: { mn: 'Бичгийн машин', en: 'Typewriter' },
  typePop: { mn: 'Үсэг үсгээр', en: 'Type pop' },
  blurReveal: { mn: 'Бүдгээс тодрох', en: 'Blur reveal' },
  spacing: { mn: 'Зай тэлэх', en: 'Spacing' },
  split: { mn: 'Хуваагдах', en: 'Split' },
  stagger: { mn: 'Үсрэлт', en: 'Bounce' },
  fadeRise: { mn: 'Дээш хөвөх', en: 'Fade & rise' },
  slideBlur: { mn: 'Гулсах', en: 'Slide' },
  elastic: { mn: 'Уян', en: 'Elastic' },
  kinetic: { mn: 'Үг үгээр цохих', en: 'Kinetic' },
  cursorGlow: { mn: 'Гэрэлт курсор', en: 'Glow cursor' },
  lightbar: { mn: 'Гэрлийн зурвас', en: 'Light bar' },
  glitch: { mn: 'Glitch', en: 'Glitch' },
  mask: { mn: 'Маск', en: 'Mask' },
  wordByWord: { mn: 'Үг үгээр', en: 'Word by word' },
  rotate: { mn: 'Эргэлдэх', en: 'Rotate' },
  cinematic: { mn: 'Кино гарчиг', en: 'Cinematic' },
};
