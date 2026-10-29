// Shrink photos and screenshots before they're encrypted, so sync stays fast.
// Screenshots keep enough resolution for their text to stay readable.

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function compressImage(file, { max = 2048, quality = 0.86 } = {}) {
  const src = await decode(file);
  const w0 = src.width || src.naturalWidth;
  const h0 = src.height || src.naturalHeight;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  canvas.width = canvas.height = 0;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h, type: 'image/jpeg' };
}

export const looksLikeScreenshot = (file, w, h) =>
  /screenshot|screen shot/i.test(file.name || '') || (file.type === 'image/png' && h / w > 1.6);
