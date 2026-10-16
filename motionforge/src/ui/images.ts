/** Load an image file, downscale to keep projects small, return a data URL. */
export async function loadImageFile(file: File, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('This image format could not be decoded by the browser.'));
      i.src = url;
    });
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const png = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
    return c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}
