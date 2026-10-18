// "Ulaan" — the Ulaan Creative mascot. Original artwork, drawn in code so the
// same source produces static files, icons and the animated hero version.
//
// Anatomy (ids/classes are used by the site's animation code):
//   speech-bubble body (brand voice) · camera-visor band (production / digital)
//   LED pill eyes (.m-eyes, expressions below) · spark antenna (.m-spark, ideas)
//   white "U" emblem · raised waving hand (.m-hand)
//
// Expressions: default | happy | wink | surprised | focused

const EYES = {
  default: (c) => `
    <rect class="m-eye m-eye-l" x="${c.lx - 26}" y="${c.y - 46}" width="52" height="92" rx="26" fill="#fff"/>
    <rect class="m-eye m-eye-r" x="${c.rx - 26}" y="${c.y - 46}" width="52" height="92" rx="26" fill="#fff"/>`,
  happy: (c) => `
    <path d="M${c.lx - 30} ${c.y + 14} Q${c.lx} ${c.y - 40} ${c.lx + 30} ${c.y + 14}" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round"/>
    <path d="M${c.rx - 30} ${c.y + 14} Q${c.rx} ${c.y - 40} ${c.rx + 30} ${c.y + 14}" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round"/>`,
  wink: (c) => `
    <rect class="m-eye m-eye-l" x="${c.lx - 26}" y="${c.y - 46}" width="52" height="92" rx="26" fill="#fff"/>
    <path d="M${c.rx - 30} ${c.y + 4} Q${c.rx} ${c.y + 30} ${c.rx + 30} ${c.y + 4}" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round"/>`,
  surprised: (c) => `
    <circle cx="${c.lx}" cy="${c.y}" r="38" fill="#fff"/><circle cx="${c.rx}" cy="${c.y}" r="38" fill="#fff"/>
    <circle cx="${c.lx + 6}" cy="${c.y + 4}" r="13" fill="#111"/><circle cx="${c.rx + 6}" cy="${c.y + 4}" r="13" fill="#111"/>`,
  focused: (c) => `
    <path d="M${c.lx - 26} ${c.y - 18} L${c.lx + 26} ${c.y - 30} L${c.lx + 26} ${c.y + 30} Q${c.lx + 26} ${c.y + 46} ${c.lx} ${c.y + 46} Q${c.lx - 26} ${c.y + 46} ${c.lx - 26} ${c.y + 30} Z" fill="#fff"/>
    <path d="M${c.rx + 26} ${c.y - 18} L${c.rx - 26} ${c.y - 30} L${c.rx - 26} ${c.y + 30} Q${c.rx - 26} ${c.y + 46} ${c.rx} ${c.y + 46} Q${c.rx + 26} ${c.y + 46} ${c.rx + 26} ${c.y + 30} Z" fill="#fff"/>`,
};

/**
 * @param {object} o
 * @param {string} [o.expression]
 * @param {string} [o.id]      unique prefix for gradient ids (several mascots per page)
 * @param {string} [o.title]   accessible name; omit for decorative use
 * @param {boolean} [o.shadow] ground shadow
 */
export function mascotSVG({ expression = 'default', id = 'um', title = '', shadow = true, className = '' } = {}) {
  const c = { lx: 252, rx: 362, y: 312 };
  const eyes = (EYES[expression] || EYES.default)(c);
  const a11y = title ? `role="img" aria-labelledby="${id}-t"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="mascot ${className}" viewBox="0 0 640 700" xmlns="http://www.w3.org/2000/svg" ${a11y}>
  ${title ? `<title id="${id}-t">${title}</title>` : ''}
  <defs>
    <radialGradient id="${id}-body" cx="34%" cy="26%" r="78%">
      <stop offset="0" stop-color="#FF6A70"/>
      <stop offset=".42" stop-color="#F2283A"/>
      <stop offset=".82" stop-color="#C8061C"/>
      <stop offset="1" stop-color="#8E0012"/>
    </radialGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="0">
      <stop offset=".72" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".55"/>
    </linearGradient>
    <linearGradient id="${id}-visor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2B2B2E"/>
      <stop offset=".55" stop-color="#121214"/>
      <stop offset="1" stop-color="#050506"/>
    </linearGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity=".95"/>
      <stop offset=".4" stop-color="#fff" stop-opacity=".35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#3A0006" stop-opacity=".55"/>
      <stop offset="1" stop-color="#3A0006" stop-opacity="0"/>
    </radialGradient>
  </defs>

  ${shadow ? `<ellipse cx="318" cy="668" rx="230" ry="26" fill="url(#${id}-shadow)"/>` : ''}

  <!-- feet -->
  <g class="m-feet">
    <rect x="196" y="600" width="96" height="58" rx="29" fill="#111"/>
    <rect x="344" y="600" width="96" height="58" rx="29" fill="#111"/>
    <rect x="206" y="642" width="76" height="8" rx="4" fill="#fff" opacity=".9"/>
    <rect x="354" y="642" width="76" height="8" rx="4" fill="#fff" opacity=".9"/>
  </g>

  <!-- left arm (resting) -->
  <rect x="62" y="400" width="74" height="132" rx="37" fill="#B00418" transform="rotate(14 99 466)"/>

  <!-- body: rounded speech bubble with a tail at the lower left -->
  <path class="m-body" fill="url(#${id}-body)" stroke="#7A0010" stroke-width="6" stroke-linejoin="round"
    d="M318 128
       C462 128 540 196 540 352
       C540 520 470 616 318 616
       C258 616 212 604 176 584
       L92 626
       C84 630 76 622 80 614
       L110 538
       C96 492 96 430 96 352
       C96 196 174 128 318 128 Z"/>
  <path fill="url(#${id}-rim)" d="M318 128 C462 128 540 196 540 352 C540 520 470 616 318 616 C430 600 500 520 506 352 C506 210 440 140 318 128 Z" opacity=".6"/>
  <!-- soft top highlight -->
  <ellipse cx="236" cy="196" rx="96" ry="40" fill="#fff" opacity=".18" transform="rotate(-18 236 196)"/>

  <!-- visor -->
  <g class="m-visor">
    <rect x="150" y="236" width="318" height="152" rx="76" fill="url(#${id}-visor)" stroke="#000" stroke-width="4"/>
    <path d="M196 252 H330 Q350 252 344 262 Q330 276 300 276 H190 Q172 276 176 264 Q182 252 196 252 Z" fill="#fff" opacity=".12"/>
    <g class="m-eyes">${eyes}</g>
  </g>

  <!-- U emblem -->
  <path d="M286 452 v34 a32 32 0 0 0 64 0 v-34" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round"/>

  <!-- raised hand -->
  <g class="m-hand">
    <rect x="500" y="300" width="72" height="150" rx="36" fill="#D80C22" stroke="#7A0010" stroke-width="5" transform="rotate(28 536 375)"/>
    <circle cx="582" cy="290" r="44" fill="#E8142B" stroke="#7A0010" stroke-width="5"/>
    <circle cx="570" cy="276" r="12" fill="#fff" opacity=".25"/>
  </g>

  <!-- spark antenna -->
  <path d="M318 130 C318 92 336 70 362 56" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round"/>
  <g transform="translate(374 46)"><g class="m-spark">
    <circle r="46" fill="url(#${id}-glow)"/>
    <path d="M0 -36 C4 -10 10 -4 36 0 C10 4 4 10 0 36 C-4 10 -10 4 -36 0 C-10 -4 -4 -10 0 -36 Z" fill="#fff" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
  </g></g>
</svg>`;
}

/** Compact head-only mark for favicons / avatars (reads at 16–32 px). */
export function mascotIconSVG({ background = '#E50920' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${background}"/>
  <path d="M33 13 C33 8 36 6 40 5" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M42 1.5 C42.6 4.6 43.4 5.4 46.5 6 C43.4 6.6 42.6 7.4 42 10.5 C41.4 7.4 40.6 6.6 37.5 6 C40.6 5.4 41.4 4.6 42 1.5 Z" fill="#fff"/>
  <rect x="9" y="22" width="46" height="23" rx="11.5" fill="#111"/>
  <rect x="21" y="26.5" width="7" height="14" rx="3.5" fill="#fff"/>
  <rect x="36" y="26.5" width="7" height="14" rx="3.5" fill="#fff"/>
  <path d="M27 50 v3.5 a5 5 0 0 0 10 0 V50" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

export const EXPRESSIONS = Object.keys(EYES);
