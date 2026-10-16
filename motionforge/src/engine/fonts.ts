// Fonts are loaded from Google Fonts (see index.html). Each has a system fallback
// stack so the app still renders offline.
export const FONTS: { family: string; stack: string; weights: number[] }[] = [
  { family: 'Inter', stack: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Space Grotesk', stack: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Manrope', stack: '"Manrope", "Helvetica Neue", Arial, sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Syne', stack: '"Syne", "Helvetica Neue", Arial, sans-serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Bebas Neue', stack: '"Bebas Neue", Impact, "Arial Narrow", sans-serif', weights: [400] },
  { family: 'Playfair Display', stack: '"Playfair Display", Georgia, "Times New Roman", serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Instrument Serif', stack: '"Instrument Serif", Georgia, serif', weights: [400] },
  { family: 'JetBrains Mono', stack: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Helvetica Neue', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif', weights: [300, 400, 500, 700] },
  { family: 'Georgia', stack: 'Georgia, "Times New Roman", serif', weights: [400, 700] },
  { family: 'Menlo', stack: 'Menlo, Monaco, "Courier New", monospace', weights: [400, 700] },
];

export function fontStack(family: string): string {
  return FONTS.find((f) => f.family === family)?.stack ?? `"${family}", sans-serif`;
}

const requested = new Set<string>();

/**
 * Ask the browser to load a web font. Returns true when it is ready to measure.
 * Calls onLoad once if the font becomes ready later, so the renderer can redraw.
 */
export function ensureFont(cssFont: string, onLoad: () => void): boolean {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as FontFaceSet | undefined;
  if (!fonts) return true;
  try {
    if (fonts.check(cssFont)) return true;
  } catch {
    return true;
  }
  if (!requested.has(cssFont)) {
    requested.add(cssFont);
    fonts.load(cssFont).then(onLoad, () => {});
  }
  return false;
}
