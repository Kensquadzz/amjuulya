// Fonts are bundled with the app (Fontsource, SIL OFL 1.1) — no network font
// service is needed, so typography renders identically offline and in export.
// Latin-only families fall back per-glyph to a Cyrillic-capable family, so
// Mongolian text keeps a matching style.
export interface FontDef { family: string; stack: string; weights: number[]; italic: boolean; cyrillic: boolean }

export const FONTS: FontDef[] = [
  { family: 'Poppins', stack: '"Poppins", "Montserrat", "Helvetica Neue", Arial, sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], italic: true, cyrillic: false },
  { family: 'Montserrat', stack: '"Montserrat", "Helvetica Neue", Arial, sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], italic: true, cyrillic: true },
  { family: 'Inter', stack: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900], italic: true, cyrillic: true },
  { family: 'Unbounded', stack: '"Unbounded", "Montserrat", Arial, sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], italic: false, cyrillic: true },
  { family: 'Space Grotesk', stack: '"Space Grotesk", "Manrope", "Helvetica Neue", Arial, sans-serif', weights: [300, 400, 500, 600, 700], italic: false, cyrillic: false },
  { family: 'Manrope', stack: '"Manrope", "Helvetica Neue", Arial, sans-serif', weights: [200, 300, 400, 500, 600, 700, 800], italic: false, cyrillic: true },
  { family: 'Syne', stack: '"Syne", "Unbounded", "Helvetica Neue", Arial, sans-serif', weights: [400, 500, 600, 700, 800], italic: false, cyrillic: false },
  { family: 'Oswald', stack: '"Oswald", "Arial Narrow", sans-serif', weights: [300, 400, 500, 600, 700], italic: false, cyrillic: true },
  { family: 'Roboto Condensed', stack: '"Roboto Condensed", "Oswald", "Arial Narrow", sans-serif', weights: [300, 400, 500, 600, 700, 800], italic: true, cyrillic: true },
  { family: 'Orelega One', stack: '"Orelega One", "Playfair Display", Georgia, serif', weights: [400], italic: false, cyrillic: true },
  { family: 'Bebas Neue', stack: '"Bebas Neue", "Oswald", Impact, "Arial Narrow", sans-serif', weights: [400], italic: false, cyrillic: false },
  { family: 'Playfair Display', stack: '"Playfair Display", Georgia, "Times New Roman", serif', weights: [400, 500, 600, 700, 800, 900], italic: true, cyrillic: true },
  { family: 'Instrument Serif', stack: '"Instrument Serif", "Playfair Display", Georgia, serif', weights: [400], italic: true, cyrillic: false },
  { family: 'JetBrains Mono', stack: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace', weights: [300, 400, 500, 600, 700, 800], italic: true, cyrillic: true },
  { family: 'Helvetica Neue', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif', weights: [300, 400, 500, 700], italic: true, cyrillic: true },
  { family: 'Georgia', stack: 'Georgia, "Times New Roman", serif', weights: [400, 700], italic: true, cyrillic: true },
];

export function fontStack(family: string): string {
  return FONTS.find((f) => f.family === family)?.stack ?? `"${family}", sans-serif`;
}

const requested = new Set<string>();

/**
 * Ask the browser to load a web font. Returns true when it is ready to measure.
 * Calls onLoad once if the font becomes ready later, so the renderer can redraw.
 */
export function ensureFont(cssFont: string, onLoad: () => void, text = 'BESbswy'): boolean {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as FontFaceSet | undefined;
  if (!fonts) return true;
  try {
    if (fonts.check(cssFont, text)) return true;
  } catch {
    return true;
  }
  // the text matters: it decides which unicode-range subsets (latin/cyrillic) load
  const key = `${cssFont}|${/[\u0400-\u04ff]/.test(text) ? 'cyr' : 'lat'}`;
  if (!requested.has(key)) {
    requested.add(key);
    fonts.load(cssFont, text).then(onLoad, () => {});
  }
  return false;
}
