// Document scanning, done on this device with plain canvas maths: find the
// page in a photo, straighten it, and clean it up for reading and OCR.

// ---- Finding the page ------------------------------------------------------------

function grayOf(img, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * img[j] + 0.587 * img[j + 1] + 0.114 * img[j + 2];
  return g;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function otsu(g) {
  const hist = new Array(256).fill(0);
  for (const v of g) hist[Math.max(0, Math.min(255, v | 0))]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

// Returns four corners [tl, tr, br, bl] as fractions of the image size, and
// whether the page was actually found.
export function detectPage(source) {
  const S = 360;
  const sw = source.naturalWidth || source.videoWidth || source.width;
  const sh = source.naturalHeight || source.videoHeight || source.height;
  const k = S / Math.max(sw, sh);
  const w = Math.max(8, Math.round(sw * k));
  const h = Math.max(8, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const g = boxBlur(grayOf(ctx.getImageData(0, 0, w, h).data, w, h), w, h, 2);
  const t = otsu(g);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) mask[i] = g[i] > t ? 1 : 0;
  // Largest bright region.
  const label = new Int32Array(w * h);
  let bestId = 0;
  let bestSize = 0;
  let id = 0;
  const stack = new Int32Array(w * h);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    id++;
    let sp = 0;
    let size = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = id; stack[sp++] = p + w; }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
  }
  const fallback = { corners: [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96]], found: false };
  if (!bestId || bestSize < w * h * 0.12) return fallback;
  // The corners are the region's extreme points along the two diagonals.
  let tl = null; let tr = null; let br = null; let bl = null;
  let s0 = Infinity; let s1 = -Infinity; let d0 = Infinity; let d1 = -Infinity;
  let touches = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== bestId) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches++;
      const s = x + y;
      const d = x - y;
      if (s < s0) { s0 = s; tl = [x, y]; }
      if (s > s1) { s1 = s; br = [x, y]; }
      if (d > d1) { d1 = d; tr = [x, y]; }
      if (d < d0) { d0 = d; bl = [x, y]; }
    }
  }
  // A page that fills the whole photo can't be told from the background.
  if (touches > (w + h) * 1.2) return fallback;
  const n = (p) => [Math.min(1, Math.max(0, (p[0] + 0.5) / w)), Math.min(1, Math.max(0, (p[1] + 0.5) / h))];
  const pts = [n(tl), n(tr), n(br), n(bl)];
  // Pull the corners a hair inside the edge so no desk shows.
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  return { corners: pts.map(([x, y]) => [x + (cx - x) * 0.012, y + (cy - y) * 0.012]), found: true };
}

// ---- Straightening ----------------------------------------------------------------

// Homography that maps the unit square's corners onto the quad.
function homography(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2; const dx2 = x3 - x2; const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2; const dy2 = y3 - y2; const dy3 = y0 - y1 + y2 - y3;
  let a13 = 0; let a23 = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    a13 = (dx3 * dy2 - dx2 * dy3) / den;
    a23 = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return {
    a11: x1 - x0 + a13 * x1, a21: x3 - x0 + a23 * x3, a31: x0,
    a12: y1 - y0 + a13 * y1, a22: y3 - y0 + a23 * y3, a32: y0,
    a13, a23,
  };
}

// Output size from the quad's sides, in source pixels.
export function quadSize(q, sw, sh) {
  const P = q.map(([x, y]) => [x * sw, y * sh]);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { w: Math.max(d(P[0], P[1]), d(P[3], P[2])), h: Math.max(d(P[0], P[3]), d(P[1], P[2])) };
}

export function straighten(source, corners, { maxSide = 2000 } = {}) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const sz = quadSize(corners, sw, sh);
  const k = Math.min(1, maxSide / Math.max(sz.w, sz.h));
  const ow = Math.max(16, Math.round(sz.w * k));
  const oh = Math.max(16, Math.round(sz.h * k));
  const src = document.createElement('canvas');
  src.width = sw;
  src.height = sh;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(source, 0, 0);
  const sd = sctx.getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas');
  out.width = ow;
  out.height = oh;
  const octx = out.getContext('2d');
  const od = octx.createImageData(ow, oh);
  const H = homography(corners.map(([x, y]) => [x * sw, y * sh]));
  const o = od.data;
  for (let y = 0; y < oh; y++) {
    const v = (y + 0.5) / oh;
    for (let x = 0; x < ow; x++) {
      const u = (x + 0.5) / ow;
      const den = H.a13 * u + H.a23 * v + 1;
      const fx = (H.a11 * u + H.a21 * v + H.a31) / den - 0.5;
      const fy = (H.a12 * u + H.a22 * v + H.a32) / den - 0.5;
      const ix = Math.max(0, Math.min(sw - 2, Math.floor(fx)));
      const iy = Math.max(0, Math.min(sh - 2, Math.floor(fy)));
      const ax = Math.max(0, Math.min(1, fx - ix));
      const ay = Math.max(0, Math.min(1, fy - iy));
      const p00 = (iy * sw + ix) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + sw * 4;
      const p11 = p01 + 4;
      const q = (y * ow + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        o[q + ch] = (sd[p00 + ch] * (1 - ax) + sd[p10 + ch] * ax) * (1 - ay) + (sd[p01 + ch] * (1 - ax) + sd[p11 + ch] * ax) * ay;
      }
      o[q + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  src.width = 0;
  src.height = 0;
  return out;
}

// ---- Cleaning up -------------------------------------------------------------------

export const FILTERS = [
  { id: 'colour', name: 'Colour' },
  { id: 'grey', name: 'Greyscale' },
  { id: 'bw', name: 'Black and white' },
  { id: 'none', name: 'Original' },
];

export function enhance(canvas, mode) {
  const w = canvas.width;
  const h = canvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  if (mode === 'none') return out;
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const g = grayOf(d, w, h);
  if (mode === 'bw') {
    // Compare each pixel with its neighbourhood, so shadows don't turn black.
    const r = Math.max(8, Math.round(Math.max(w, h) / 40));
    const mean = boxBlur(g, w, h, r);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const v = g[i] < mean[i] * 0.86 ? 0 : 255;
      d[j] = d[j + 1] = d[j + 2] = v;
    }
  } else {
    // Even out the lighting: divide by a blurred copy (the paper's shade), then
    // stretch the levels.
    const r = Math.max(10, Math.round(Math.max(w, h) / 24));
    const bg = boxBlur(g, w, h, r);
    const hist = new Array(256).fill(0);
    const norm = new Float32Array(g.length);
    for (let i = 0; i < g.length; i++) { norm[i] = Math.min(1.2, g[i] / Math.max(1, bg[i])); hist[Math.min(255, (norm[i] * 212) | 0)]++; }
    let lo = 0;
    let acc = 0;
    while (lo < 255 && acc + hist[lo] < g.length * 0.01) acc += hist[lo++];
    const lv = lo / 212;
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const f = Math.max(0, Math.min(1, (norm[i] - lv) / Math.max(0.05, 0.96 - lv)));
      const gain = g[i] > 1 ? (f * 255) / g[i] : 0;
      if (mode === 'grey') { d[j] = d[j + 1] = d[j + 2] = f * 255; } else {
        for (let ch = 0; ch < 3; ch++) d[j + ch] = Math.max(0, Math.min(255, d[j + ch] * gain));
      }
    }
  }
  ctx.putImageData(id, 0, 0);
  return out;
}

export function rotateCanvas(canvas, quarterTurns = 1) {
  const t = ((quarterTurns % 4) + 4) % 4;
  if (!t) return canvas;
  const out = document.createElement('canvas');
  out.width = t % 2 ? canvas.height : canvas.width;
  out.height = t % 2 ? canvas.width : canvas.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

export async function canvasToJpeg(canvas, quality = 0.86) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height, type: 'image/jpeg' };
}
