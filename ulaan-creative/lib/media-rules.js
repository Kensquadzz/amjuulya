// Upload rules + server-side file-type detection. The browser's MIME type and
// the file extension are only hints: after upload the server reads the first
// bytes of the stored object and checks the real format ("magic numbers").

export const LIMITS = {
  image: (Number(process.env.MAX_IMAGE_MB) || 50) * 1024 * 1024,
  video: (Number(process.env.MAX_VIDEO_MB) || 2048) * 1024 * 1024,
  thumb: 2 * 1024 * 1024,
};

// SVG is intentionally not accepted (can carry scripts).
export const TYPES = {
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' },
  webp: { kind: 'image', mime: 'image/webp' },
  avif: { kind: 'image', mime: 'image/avif' },
  gif: { kind: 'image', mime: 'image/gif' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/mp4' },
};

export const ACCEPT_ATTR = Object.keys(TYPES).map((e) => '.' + e).join(',');

export function extOf(name) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

/** Detect the real format from file header bytes. Returns a MIME type or ''. */
export function sniff(buf) {
  if (!buf || buf.length < 12) return '';
  const hex = (a, b) => buf.subarray(a, b).toString('hex');
  const ascii = (a, b) => buf.subarray(a, b).toString('latin1');
  if (hex(0, 3) === 'ffd8ff') return 'image/jpeg';
  if (hex(0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (hex(0, 4) === '1a45dfa3') return 'video/webm';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4'; // isom, mp41, mp42, M4V , dash, iso5 …
  }
  return '';
}

/** Validate an upload request before issuing a presigned URL. Returns { kind, mime, ext } or throws a message. */
export function checkDeclared({ name, size, type }) {
  const ext = extOf(name);
  const t = TYPES[ext];
  if (!t) return { error: `Зөвшөөрөгдөөгүй файлын төрөл (.${ext || '?'}). Зөвшөөрөгдөх: ${Object.keys(TYPES).join(', ')}` };
  if (type && type !== t.mime && !(t.kind === 'video' && String(type).startsWith('video/')) && !(t.kind === 'image' && String(type).startsWith('image/'))) {
    return { error: 'Файлын өргөтгөл болон төрөл таарахгүй байна.' };
  }
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return { error: 'Файлын хэмжээ буруу.' };
  if (n > LIMITS[t.kind]) return { error: `Файл хэт том байна (дээд хэмжээ ${Math.round(LIMITS[t.kind] / 1048576)} MB).` };
  return { kind: t.kind, mime: t.mime, ext: ext === 'jpeg' ? 'jpg' : ext };
}

/** Is the sniffed type acceptable for the declared kind/mime? */
export function sniffMatches(sniffed, declared) {
  if (!sniffed) return false;
  if (sniffed === declared.mime) return true;
  // mp4/mov containers share ISO-BMFF; accept either for videos
  if (declared.kind === 'video' && ['video/mp4', 'video/quicktime'].includes(sniffed) && ['video/mp4', 'video/quicktime'].includes(declared.mime)) return true;
  return false;
}
