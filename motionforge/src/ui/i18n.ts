// UI strings for the simple (CapCut-style) editor. Mongolian is the default;
// English is one tap away. Pro panels keep their English technical labels.
import { useSyncExternalStore } from 'react';

export type Lang = 'mn' | 'en';

const MN = {
  home: 'Нүүр', newProject: 'Шинэ төсөл', continue: 'Үргэлжлүүлэх', templates: 'Загварууд', myProjects: 'Миний төслүүд', openProjectFile: 'Төслийн файл нээх (.json)', voiceVideo: 'Voice over → Видео', imported: 'Нээгдлээ', importFailed: 'Нээж чадсангүй',
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
  zoomIn: 'Томруулах', zoomOut: 'Жижигрүүлэх', tlExpand: 'Timeline томруулах', tlCollapse: 'Timeline багасгах',
  tlHint: 'Хуруугаар гүйлгэж цаг сонгоно · дарж сонгоно', tlSelHint: 'Ирмэгийг чирж тайрна · ◆ дарж очно, чирж зөөнө',
  cLock: 'Түгжих', cUnlock: 'Тайлах', cHide: 'Нуух', cShow: 'Харуулах', locked: 'Түгжигдсэн',
  saving: 'Хадгалж байна…', savedState: 'Хадгалсан', unsaved: 'Хадгалаагүй',
  kfPrev: 'Өмнөх keyframe', kfNext: 'Дараагийн keyframe', kfAll: 'Бүгдэд keyframe', kfEase: 'Keyframe-ийн хурдатгал',
  kfNone: 'Энэ мөчид keyframe алга. ◆ дарж нэмнэ.', kfSteps: '1) Playhead-ээ зөөнө 2) утгаа өөрчилнө 3) ◆ дарна — бусад мөчид дахин хийхэд хөдөлгөөн үүснэ.',
  eLinear: 'Шулуун', eIn: 'Удаан эхлэх', eOut: 'Удаан дуусах', eInOut: 'Зөөлөн', eBack: 'Хэтрэлттэй', eHold: 'Үсрэх (hold)',
  fit: 'Дэлгэцэнд тааруулах',
  t3D: '3D', m3dTitle: '3D модель', m3dUpload: 'GLB / GLTF файл оруулах…', m3dSamples: 'Бэлэн 3D загвар', m3dHint: 'Өөрийн 3D файлаа (GLB эсвэл бүх зүйлээ агуулсан GLTF) оруулна уу. Draco шахалттай файл дэмжигдэхгүй.',
  m3dPhone: 'Утас', m3dCan: 'Лааз', m3dKnot: 'Хром зангилаа', m3dSphere: 'Сувдан бөмбөлөг', m3dCube: 'Шоо',
  cModel: 'Модель', cCamera: 'Камер', cLight: 'Гэрэл', cMaterial: 'Материал',
  camPresets: 'Камерын хөдөлгөөн', pTurntable: 'Эргэлдэх тавцан', pOrbit: 'Тойрч илрүүлэх', pPush: 'Ойртох', pHero: 'Баатарлаг налуу', pStatic: 'Хөдөлгөөнгүй',
  m3dScreen: 'Дэлгэц / шошгоны зураг', m3dClip: 'Моделийн анимэйшн', m3dNoClip: 'Анимэйшн байхгүй', m3dOverride: 'Өөрийн материал ашиглах', m3dEnv: 'Орчин',
  envStudio: 'Студи', envSoft: 'Зөөлөн', envNight: 'Шөнийн неон', m3dTooBig: 'Файл хэт том байна (30 MB хүртэл).',
  posHint: '☝ Preview дээр хуруугаар чирж зөөнө, хоёр хуруугаар томруулж эргүүлнэ. ◆ товч тухайн мөчид keyframe тавина.',
};

const EN: typeof MN = {
  home: 'Home', newProject: 'New project', continue: 'Continue', templates: 'Templates', myProjects: 'My projects', openProjectFile: 'Open project file (.json)', voiceVideo: 'Voice-over → Video', imported: 'Opened', importFailed: 'Could not open',
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
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', tlExpand: 'Expand timeline', tlCollapse: 'Collapse timeline',
  tlHint: 'Swipe to scrub · tap to select', tlSelHint: 'Drag edges to trim · tap ◆ to jump, drag to move',
  cLock: 'Lock', cUnlock: 'Unlock', cHide: 'Hide', cShow: 'Show', locked: 'Locked',
  saving: 'Saving…', savedState: 'Saved', unsaved: 'Not saved',
  kfPrev: 'Previous keyframe', kfNext: 'Next keyframe', kfAll: 'Keyframe all', kfEase: 'Keyframe easing',
  kfNone: 'No keyframe at the playhead. Tap ◆ to add one.', kfSteps: '1) Move the playhead 2) change a value 3) tap ◆ — repeat at another time to animate.',
  eLinear: 'Linear', eIn: 'Ease in', eOut: 'Ease out', eInOut: 'Ease in-out', eBack: 'Overshoot', eHold: 'Hold',
  fit: 'Fit to screen',
  t3D: '3D', m3dTitle: '3D model', m3dUpload: 'Upload GLB / GLTF…', m3dSamples: 'Ready-made 3D models', m3dHint: 'Bring your own 3D file (GLB, or a self-contained GLTF). Draco-compressed files are not supported.',
  m3dPhone: 'Phone', m3dCan: 'Can', m3dKnot: 'Chrome knot', m3dSphere: 'Pearl', m3dCube: 'Cube',
  cModel: 'Model', cCamera: 'Camera', cLight: 'Light', cMaterial: 'Material',
  camPresets: 'Camera moves', pTurntable: 'Turntable', pOrbit: 'Orbit reveal', pPush: 'Push in', pHero: 'Hero tilt', pStatic: 'Still',
  m3dScreen: 'Screen / label picture', m3dClip: 'Model animation', m3dNoClip: 'No animation', m3dOverride: 'Use my own material', m3dEnv: 'Environment',
  envStudio: 'Studio', envSoft: 'Soft', envNight: 'Night neon', m3dTooBig: 'File is too large (up to 30 MB).',
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
