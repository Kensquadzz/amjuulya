// "Ulaan" — the Ulaan Creative mascot: a red cartoon bomb with a lit fuse.
// Original artwork drawn in code, so the same source produces the static files,
// the icon and the animated hero version.
//
// Animation hooks used by public/assets/js/main.js:
//   .m-eye / .m-eye-l (blink, CTA line target) · .m-pupil (follow cursor)
//   .m-spark (fuse spark) · .m-hand (wave)
//
// Expressions: default (sly) | happy | wink | surprised | focused

const L = { x: 252, y: 404 };
const R = { x: 392, y: 398 };

// Sly half-lidded almond eye with a clipped pupil.
function slyEye(id, c, side, { lidTilt = 0 } = {}) {
  const t = side === 'l' ? lidTilt : -lidTilt;
  const shape = `M${c.x - 50} ${c.y + 2 + t} Q${c.x} ${c.y - 18} ${c.x + 50} ${c.y + 2 - t} Q${c.x + 40} ${c.y + 34} ${c.x} ${c.y + 34} Q${c.x - 42} ${c.y + 34} ${c.x - 50} ${c.y + 2 + t} Z`;
  return `
    <g class="m-eye m-eye-${side}">
      <clipPath id="${id}-clip-${side}"><path d="${shape}"/></clipPath>
      <path d="${shape}" fill="#fff"/>
      <g clip-path="url(#${id}-clip-${side})"><circle class="m-pupil" cx="${c.x + 14}" cy="${c.y + 14}" r="17" fill="#111"/><circle cx="${c.x + 20}" cy="${c.y + 8}" r="5" fill="#fff"/></g>
      <path d="M${c.x - 54} ${c.y + 3 + t} Q${c.x} ${c.y - 19} ${c.x + 54} ${c.y + 3 - t}" fill="none" stroke="#1a0004" stroke-width="10" stroke-linecap="round"/>
    </g>`;
}

const roundEye = (c, side) => `
  <g class="m-eye m-eye-${side}">
    <circle cx="${c.x}" cy="${c.y}" r="40" fill="#fff" stroke="#1a0004" stroke-width="6"/>
    <circle class="m-pupil" cx="${c.x + 4}" cy="${c.y + 4}" r="16" fill="#111"/>
    <circle cx="${c.x + 10}" cy="${c.y - 3}" r="5" fill="#fff"/>
  </g>`;

const arcEye = (c, up = true) =>
  `<path d="M${c.x - 40} ${c.y + (up ? 12 : -4)} Q${c.x} ${c.y + (up ? -34 : 26)} ${c.x + 40} ${c.y + (up ? 12 : -4)}" fill="none" stroke="#1a0004" stroke-width="13" stroke-linecap="round"/>`;

const MOUTH = {
  smirk: '<path d="M282 494 Q318 506 352 486" fill="none" stroke="#1a0004" stroke-width="9" stroke-linecap="round"/>',
  smile: '<path d="M274 482 Q320 532 368 482" fill="#3a0008" stroke="#1a0004" stroke-width="8" stroke-linejoin="round"/>',
  o: '<ellipse cx="320" cy="498" rx="17" ry="22" fill="#3a0008" stroke="#1a0004" stroke-width="6"/>',
  flat: '<path d="M290 496 L350 490" fill="none" stroke="#1a0004" stroke-width="9" stroke-linecap="round"/>',
};

const FACES = {
  default: (id) => `${slyEye(id, L, 'l')}${slyEye(id, R, 'r')}${MOUTH.smirk}`,
  happy: () => `<g class="m-eye m-eye-l">${arcEye(L)}</g><g class="m-eye m-eye-r">${arcEye(R)}</g>${MOUTH.smile}`,
  wink: (id) => `${slyEye(id, L, 'l')}<g class="m-eye m-eye-r">${arcEye(R, false)}</g>${MOUTH.smile}`,
  surprised: () => `${roundEye(L, 'l')}${roundEye(R, 'r')}${MOUTH.o}`,
  focused: (id) => `${slyEye(id, L, 'l', { lidTilt: 10 })}${slyEye(id, R, 'r', { lidTilt: 10 })}
    <path d="M196 352 L298 374" stroke="#1a0004" stroke-width="14" stroke-linecap="round"/><path d="M448 346 L346 370" stroke="#1a0004" stroke-width="14" stroke-linecap="round"/>${MOUTH.flat}`,
};

/**
 * @param {object} o
 * @param {string} [o.expression]
 * @param {string} [o.id]      unique prefix for gradient ids (several mascots per page)
 * @param {string} [o.title]   accessible name; omit for decorative use
 * @param {boolean} [o.shadow] ground shadow
 */
export function mascotSVG({ expression = 'default', id = 'um', title = '', shadow = true, className = '' } = {}) {
  const face = (FACES[expression] || FACES.default)(id);
  const a11y = title ? `role="img" aria-labelledby="${id}-t"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="mascot ${className}" viewBox="0 0 640 700" xmlns="http://www.w3.org/2000/svg" ${a11y}>
  ${title ? `<title id="${id}-t">${title}</title>` : ''}
  <defs>
    <radialGradient id="${id}-body" cx="36%" cy="30%" r="74%">
      <stop offset="0" stop-color="#FF6B72"/>
      <stop offset=".35" stop-color="#F2192E"/>
      <stop offset=".78" stop-color="#C20619"/>
      <stop offset="1" stop-color="#7C000E"/>
    </radialGradient>
    <radialGradient id="${id}-spec" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity=".75"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="0">
      <stop offset=".7" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#FFC2C6" stop-opacity=".55"/>
    </linearGradient>
    <linearGradient id="${id}-cap" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2A2A2D"/><stop offset=".35" stop-color="#4A4A50"/><stop offset=".6" stop-color="#1B1B1E"/><stop offset="1" stop-color="#050506"/>
    </linearGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#FFF6D8" stop-opacity="1"/>
      <stop offset=".35" stop-color="#FFE08A" stop-opacity=".55"/>
      <stop offset="1" stop-color="#FFB703" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#3A0006" stop-opacity=".55"/>
      <stop offset="1" stop-color="#3A0006" stop-opacity="0"/>
    </radialGradient>
  </defs>

  ${shadow ? `<ellipse cx="320" cy="672" rx="220" ry="24" fill="url(#${id}-shadow)"/>` : ''}

  <!-- feet -->
  <g class="m-feet">
    <rect x="200" y="606" width="92" height="56" rx="28" fill="#111"/>
    <rect x="350" y="606" width="92" height="56" rx="28" fill="#111"/>
    <rect x="210" y="646" width="72" height="8" rx="4" fill="#fff" opacity=".9"/>
    <rect x="360" y="646" width="72" height="8" rx="4" fill="#fff" opacity=".9"/>
  </g>

  <!-- resting arm -->
  <rect x="70" y="430" width="70" height="124" rx="35" fill="#A8000F" transform="rotate(18 105 492)"/>

  <!-- bomb body -->
  <circle class="m-body" cx="320" cy="404" r="226" fill="url(#${id}-body)" stroke="#6E000C" stroke-width="6"/>
  <path d="M320 178 A226 226 0 0 1 320 630 A200 226 0 0 0 320 178 Z" fill="url(#${id}-rim)"/>
  <ellipse cx="226" cy="270" rx="88" ry="54" fill="url(#${id}-spec)" transform="rotate(-32 226 270)"/>
  <ellipse cx="196" cy="300" rx="16" ry="10" fill="#fff" opacity=".7" transform="rotate(-32 196 300)"/>

  <!-- metal cap -->
  <g transform="rotate(12 352 192)">
    <rect x="290" y="146" width="124" height="66" rx="16" fill="url(#${id}-cap)" stroke="#000" stroke-width="5"/>
    <rect x="298" y="190" width="108" height="10" rx="5" fill="#000" opacity=".35"/>
    <ellipse cx="352" cy="148" rx="62" ry="15" fill="#3A3A3F" stroke="#000" stroke-width="5"/>
    <ellipse cx="352" cy="148" rx="26" ry="7" fill="#000"/>
  </g>

  <!-- rope fuse -->
  <path d="M344 140 C330 100 372 84 398 92 C432 102 420 58 452 44" fill="none" stroke="#5B4A33" stroke-width="20" stroke-linecap="round"/>
  <path d="M344 140 C330 100 372 84 398 92 C432 102 420 58 452 44" fill="none" stroke="#EADFC8" stroke-width="14" stroke-linecap="round"/>
  <path d="M344 140 C330 100 372 84 398 92 C432 102 420 58 452 44" fill="none" stroke="#B9A684" stroke-width="14" stroke-dasharray="4 7" stroke-linecap="butt"/>

  <!-- face -->
  <g class="m-face">${face}</g>

  <!-- waving hand -->
  <g class="m-hand">
    <rect x="500" y="318" width="70" height="140" rx="35" fill="#D10A1F" stroke="#6E000C" stroke-width="5" transform="rotate(28 535 388)"/>
    <circle cx="582" cy="304" r="42" fill="#E8142B" stroke="#6E000C" stroke-width="5"/>
    <circle cx="570" cy="290" r="11" fill="#fff" opacity=".3"/>
  </g>

  <!-- spark -->
  <g transform="translate(458 40)"><g class="m-spark">
    <circle r="60" fill="url(#${id}-glow)"/>
    <path d="M0 -46 L9 -14 L40 -26 L18 -2 L46 12 L13 14 L18 46 L0 20 L-18 46 L-13 14 L-46 12 L-18 -2 L-40 -26 L-9 -14 Z" fill="#fff" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <circle r="10" fill="#FFD23F"/>
    <circle cx="-52" cy="-30" r="5" fill="#fff"/><circle cx="54" cy="-36" r="4" fill="#fff"/><circle cx="58" cy="30" r="5" fill="#fff"/>
  </g></g>
</svg>`;
}

/** Compact bomb-head mark for favicons / avatars (reads at 16–32 px). */
export function mascotIconSVG({ background = '#111111' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${background}"/>
  <circle cx="31" cy="37" r="22" fill="#E50920"/>
  <ellipse cx="24" cy="29" rx="7" ry="4.5" fill="#fff" opacity=".35" transform="rotate(-30 24 29)"/>
  <rect x="31" y="10" width="13" height="8" rx="2" fill="#555" transform="rotate(14 37 14)"/>
  <path d="M38 11 C38 7 42 5 46 5" fill="none" stroke="#EADFC8" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M49 0.5 L50.6 4 L54.5 3 L52 5.6 L55 8 L51 7.6 L50.4 11.5 L48.6 8 L45 9.5 L47 6.4 L44 4 L48 4.2 Z" fill="#FFD23F"/>
  <path d="M17 38 Q22.5 34.5 28 37.5 Q26.5 42 22 42 Q18 42 17 38 Z" fill="#fff"/>
  <path d="M34 37.5 Q39.5 34.5 45 37 Q44 42 39.5 42 Q35 42 34 37.5 Z" fill="#fff"/>
  <path d="M16.5 37.5 Q22.5 33.5 28.5 37" fill="none" stroke="#111" stroke-width="2"/>
  <path d="M33.5 37 Q39.5 33.5 45.5 36.5" fill="none" stroke="#111" stroke-width="2"/>
  <circle cx="24" cy="39.3" r="2.2" fill="#111"/><circle cx="41" cy="39.3" r="2.2" fill="#111"/>
  <path d="M27 47 Q31 49 35 46.5" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/>
</svg>`;
}

export const EXPRESSIONS = Object.keys(FACES);
