// Reads just enough of an MP4 file (box headers + the 'moov' box, via ranged reads) to tell
// which codecs it uses. Used to make sure every published video plays on Android, iPhone
// and desktop: H.264 (avc1/avc3) video + AAC (mp4a) audio in an MP4 container.

const VIDEO_FOURCC = ['avc1', 'avc3', 'hvc1', 'hev1', 'dvh1', 'dvhe', 'av01', 'vp08', 'vp09', 'mp4v', 'apcn', 'apch', 'apcs', 'apco', 'ap4h', 's263', 'jpeg', 'mjpa'];
const AUDIO_FOURCC = ['mp4a', 'Opus', 'opus', 'ac-3', 'ec-3', 'alac', 'lpcm', 'sowt', 'twos', 'fLaC', 'samr', 'sawb', 'ulaw', 'alaw', '.mp3', 'ipcm', 'fpcm'];
const MAX_MOOV = 64 * 1024 * 1024;

/** @param readRange (start, length) => Promise<Buffer> */
export async function probeMp4(readRange, size) {
  let off = 0, brand = '', moov = null;
  for (let i = 0; i < 200 && off + 8 <= size; i++) {
    const hdr = await readRange(off, 16);
    if (hdr.length < 8) break;
    let len = hdr.readUInt32BE(0);
    const type = hdr.toString('latin1', 4, 8);
    if (len === 1 && hdr.length >= 16) len = Number(hdr.readBigUInt64BE(8));
    else if (len === 0) len = size - off;
    if (type === 'ftyp' && hdr.length >= 12) brand = hdr.toString('latin1', 8, 12);
    if (type === 'moov') {
      if (len > MAX_MOOV) return { brand, error: 'moov_too_large' };
      moov = await readRange(off, len);
      break;
    }
    if (len < 8) break;
    off += len;
  }
  if (!moov) return { brand, error: 'no_moov' };
  const fourccs = [];
  for (let idx = moov.indexOf('stsd', 0, 'latin1'); idx !== -1; idx = moov.indexOf('stsd', idx + 4, 'latin1')) {
    if (idx + 20 <= moov.length) fourccs.push(moov.toString('latin1', idx + 16, idx + 20));
  }
  return {
    brand,
    video: fourccs.filter((f) => VIDEO_FOURCC.includes(f)),
    audio: fourccs.filter((f) => AUDIO_FOURCC.includes(f)),
  };
}

/** Plays on Android, iPhone and desktop browsers? */
export function isUniversalMp4(p) {
  if (!p || p.error) return false;
  if (p.brand === 'qt  ') return false;
  if (!p.video.length || !p.video.every((v) => v === 'avc1' || v === 'avc3')) return false;
  return p.audio.every((a) => a === 'mp4a');
}
