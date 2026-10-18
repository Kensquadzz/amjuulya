// Turns whatever the owner picks into files every phone and browser can show, before upload:
//  · photos: JPG/PNG/WebP/AVIF/GIF are kept; HEIC/HEIF (iPhone), TIFF, BMP … become JPEG;
//    oversized photos are scaled down (long edge ≤ 4096 px) instead of being rejected.
//  · videos: always end up as MP4 with H.264 video + AAC audio — the combination Android,
//    iPhone and desktop browsers all play. iPhone HEVC (.mov), WebM, VP9, AV1 … are converted
//    in the browser (WebCodecs via Mediabunny); compatible MP4s are uploaded untouched.
// Heavy libraries are loaded only when a file actually needs converting.

export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];
export const CONVERT_IMAGE_EXT = ['heic', 'heif', 'hif', 'tif', 'tiff', 'bmp', 'ico', 'jfif', 'pjpeg', 'jpe'];
export const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', '3gp', '3g2', 'ogv', 'avi'];
export const PICK_ACCEPT = ['image/*', 'video/*', ...[...IMAGE_EXT, ...CONVERT_IMAGE_EXT, ...VIDEO_EXT].map((e) => '.' + e)].join(',');

const MAX_PHOTO_EDGE = 4096;
const MAX_VIDEO_EDGE = 1920;

const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n || '') || [, ''])[1].toLowerCase();
const baseOf = (n) => (n || 'file').replace(/\.[a-z0-9]+$/i, '') || 'file';

export function kindOf(file) {
  const e = extOf(file.name), t = file.type || '';
  if (t.startsWith('video/') || VIDEO_EXT.includes(e)) return 'video';
  if (t.startsWith('image/') || IMAGE_EXT.includes(e) || CONVERT_IMAGE_EXT.includes(e)) return 'image';
  return '';
}

const RAW_EXT = ['dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'psd', 'ai', 'eps', 'svg', 'pdf'];
export class PrepareError extends Error {}

/* -------------------------------- photos -------------------------------- */

async function isHeicFile(file) {
  const e = extOf(file.name);
  if (['heic', 'heif', 'hif'].includes(e) || /hei[cf]/i.test(file.type)) return true;
  const brand = new TextDecoder().decode(await file.slice(8, 12).arrayBuffer());
  return /^(heic|heix|hevc|hevx|mif1|msf1)/.test(brand) && new TextDecoder().decode(await file.slice(4, 8).arrayBuffer()) === 'ftyp';
}

async function decodeImage(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* not decodable natively */ }
  if (await isHeicFile(file)) {
    const { heicTo } = await import('./vendor/heic-to.js');
    return heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
  }
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if ((magic[0] === 0x49 && magic[1] === 0x49) || (magic[0] === 0x4d && magic[1] === 0x4d)) { // TIFF (Chrome/Android can't decode it natively)
    const { default: UTIF } = await import('./vendor/utif.js');
    const buf = await file.arrayBuffer();
    const ifd = UTIF.decode(buf)[0];
    UTIF.decodeImage(buf, ifd);
    return createImageBitmap(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(ifd).buffer), ifd.width, ifd.height));
  }
  return null;
}

const canvasBlob = (c, type, q) => new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('encode'))), type, q));

async function preparePhoto(file, limit, onStage) {
  const e = extOf(file.name);
  if (RAW_EXT.includes(e)) throw new PrepareError(`.${e} файлыг вэб сайтад шууд ашиглах боломжгүй. JPEG эсвэл PNG болгож экспортлоод оруулна уу.`);
  const native = IMAGE_EXT.includes(e);
  if (native && file.size <= limit) {
    // keep as is unless the photo is enormous in pixels (e.g. 48 MP) — scale those down for the web
    const bmp = e === 'gif' ? null : await createImageBitmap(file).catch(() => null);
    const big = bmp && Math.max(bmp.width, bmp.height) > MAX_PHOTO_EDGE * 1.5;
    bmp?.close?.();
    if (!big) return file;
  }
  if (e === 'gif') throw new PrepareError(`GIF хэт том байна (дээд хэмжээ ${Math.round(limit / 1048576)} MB). Видео (MP4) болгож оруулна уу.`);
  onStage?.(native ? 'Зургийг багасгаж байна…' : 'Зургийг JPEG болгож байна…');
  const bmp = await decodeImage(file).catch(() => null);
  if (!bmp) throw new PrepareError('Энэ зургийг уншиж чадсангүй. JPEG эсвэл PNG болгож оруулна уу.');
  const keepAlpha = ['png', 'webp', 'avif'].includes(e);
  let scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bmp.width, bmp.height));
  let quality = 0.9;
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext('2d');
    if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await canvasBlob(c, keepAlpha ? 'image/webp' : 'image/jpeg', quality);
    // Safari can't encode WebP and silently returns PNG — name/type the file by what it really is
    const type = blob.type || (keepAlpha ? 'image/webp' : 'image/jpeg');
    const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[type] || 'jpg';
    if (blob.size <= limit) { bmp.close?.(); return new File([blob], `${baseOf(file.name)}.${ext}`, { type }); }
    quality = Math.max(0.6, quality - 0.1); scale *= 0.8;
  }
  bmp.close?.();
  throw new PrepareError('Зургийг хангалттай жижигрүүлж чадсангүй.');
}

/* -------------------------------- videos -------------------------------- */

const VIDEO_HELP = 'Утсан дээрээ «Камер → Формат → Most Compatible» тохиргоогоор бичих, эсвэл видеог H.264 MP4 болгон экспортлоод оруулна уу. Chrome эсвэл Safari-ийн шинэ хувилбар дээр автоматаар хөрвүүлэгдэнэ.';

async function prepareVideo(file, limit, onStage, onProgress) {
  onStage?.('Видеог шалгаж байна…');
  const mb = await import('./vendor/mediabunny.js');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  let format, video, audio;
  try {
    format = await input.getFormat();
    video = await input.getPrimaryVideoTrack();
    audio = await input.getPrimaryAudioTrack();
  } catch {
    throw new PrepareError(`Видео файлыг уншиж чадсангүй (гэмтсэн эсвэл дэмжигдээгүй формат). ${VIDEO_HELP}`);
  }
  if (!video) throw new PrepareError('Энэ файлд видео дүрс алга.');
  const w = video.displayWidth, h = video.displayHeight, long = Math.max(w, h);
  const isMp4 = format.mimeType === 'video/mp4';
  const videoOk = video.codec === 'avc';
  const audioOk = !audio || audio.codec === 'aac';
  if (isMp4 && videoOk && audioOk && file.size <= limit) return file; // already plays everywhere

  const resize = long > MAX_VIDEO_EDGE && (!videoOk || file.size > limit);
  const transcodeVideo = !videoOk || resize;
  if (transcodeVideo) {
    if (!(await video.canDecode())) throw new PrepareError(`Энэ хөтөч ${String(video.codec || '').toUpperCase()} видеог унших боломжгүй тул хөрвүүлж чадсангүй. ${VIDEO_HELP}`);
    const size = resize ? (w >= h ? { width: MAX_VIDEO_EDGE } : { height: MAX_VIDEO_EDGE }) : {};
    const outW = size.width || (size.height ? Math.round((w / h) * size.height) : w);
    const outH = size.height || (size.width ? Math.round((h / w) * size.width) : h);
    if (!(await mb.canEncodeVideo('avc', { width: outW, height: outH }))) throw new PrepareError(`Энэ хөтөч H.264 видео үүсгэж чадахгүй байна. ${VIDEO_HELP}`);
  }
  if (audio && !audioOk) {
    if (!(await audio.canDecode())) throw new PrepareError(`Видеоны дууны формат (${audio.codec}) энэ хөтөч дээр уншигдахгүй байна. ${VIDEO_HELP}`);
    if (!(await mb.canEncodeAudio('aac'))) {
      const { registerAacEncoder } = await import('./vendor/mediabunny-aac-encoder.js');
      registerAacEncoder();
    }
  }

  onStage?.(transcodeVideo ? 'Android-д тохируулж хөрвүүлж байна…' : 'MP4 болгож байна…');
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input, output, tracks: 'primary', showWarnings: false,
    video: () => ({ codec: 'avc', ...(resize ? (w >= h ? { width: MAX_VIDEO_EDGE } : { height: MAX_VIDEO_EDGE }) : {}), ...(transcodeVideo ? { bitrate: mb.QUALITY_HIGH } : {}) }),
    audio: () => ({ codec: 'aac' }),
  });
  if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack?.() || t.type === 'video')) {
    const why = conversion.discardedTracks.map((d) => d.reason).join(', ');
    throw new PrepareError(`Видеог хөрвүүлэх боломжгүй байна${why ? ` (${why})` : ''}. ${VIDEO_HELP}`);
  }
  conversion.onProgress = (p) => onProgress?.(p, 'convert');
  try { await conversion.execute(); } catch (e) { throw new PrepareError(`Видеог хөрвүүлэх үед алдаа гарлаа: ${e.message || e}. ${VIDEO_HELP}`); }
  const out = new File([output.target.buffer], `${baseOf(file.name)}.mp4`, { type: 'video/mp4' });
  if (out.size > limit) throw new PrepareError(`Хөрвүүлсний дараа ч видео ${Math.round(limit / 1048576)} MB-аас том байна. Богиносгоод дахин оруулна уу.`);
  return out;
}

/**
 * Returns a File that is safe to upload (possibly converted). Throws PrepareError with a
 * Mongolian message the admin can act on.
 */
export async function prepareFile(file, { imageLimit, videoLimit, onStage, onProgress } = {}) {
  const kind = kindOf(file);
  const e = extOf(file.name);
  if (!kind) {
    if (RAW_EXT.includes(e)) throw new PrepareError(`.${e} файлыг вэб сайтад шууд ашиглах боломжгүй. JPEG/PNG (зураг) эсвэл MP4 (видео) болгож экспортлоод оруулна уу.`);
    throw new PrepareError(`.${e || '?'} төрлийн файл зураг эсвэл видео биш байна.`);
  }
  return kind === 'image' ? preparePhoto(file, imageLimit, onStage) : prepareVideo(file, videoLimit, onStage, onProgress);
}
