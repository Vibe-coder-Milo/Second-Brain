// Sharp PDF pages. An imported PDF is kept as it came (one encrypted file),
// and each handwritten page made from it points at its page there
// (`page.pdf = { file, n }`). Here the part of that page that's on screen is
// drawn from the PDF itself at the size it's shown, so text stays crisp at
// any zoom. Until it's ready, the page's small picture (`page.bg`) shows.
// Everything happens on the device; the PDF is read from the vault, decrypted
// in memory only.

import * as V from './vault.js';
import { openPdf } from './pdf.js';
import { PAGE_W } from './model.js';

// Open PDFs (each holds its bytes in pdf.js's worker): only the few most
// recently used stay open.
const KEEP_DOCS = 3;
const docs = new Map(); // fileId -> { promise, doc, task, busy }

function openDoc(fileId) {
  let rec = docs.get(fileId);
  if (rec) { docs.delete(fileId); docs.set(fileId, rec); return rec.promise; }
  rec = { promise: null, doc: null, task: null, busy: 0 };
  rec.promise = (async () => {
    const f = await V.fileBytes(fileId);
    if (!f) throw new Error('PDF not on this device yet');
    const { doc, task } = await openPdf(f.bytes);
    rec.doc = doc;
    rec.task = task;
    return doc;
  })();
  rec.promise.catch(() => { if (docs.get(fileId) === rec) docs.delete(fileId); });
  docs.set(fileId, rec);
  for (const [id, r] of docs) {
    if (docs.size <= KEEP_DOCS) break;
    if (r === rec || r.busy) continue;
    docs.delete(id);
    closeDoc(r);
  }
  return rec.promise;
}
function closeDoc(r) {
  r.promise.then(() => (r.task?.destroy ? r.task.destroy() : r.doc?.destroy?.())).catch(() => {});
}

// The PDF page's own height in page units (the width is PAGE_W).
const heights = new Map(); // `${file}:${n}` -> page units
export const pdfPageHeight = (pdf) => heights.get(`${pdf.file}:${pdf.n}`) || null;

// Draw part of a PDF page. `q` is device pixels per page unit; `area` is the
// part of the page (page units). Resolves to { canvas, x, y, w, h } (the
// part drawn, in page units: never below the end of the PDF page) or null.
// `signal` (optional) cancels it.
export async function renderPdfArea(pdf, q, area, { signal } = {}) {
  if (!pdf?.file) return null;
  const rec = () => docs.get(pdf.file);
  let doc;
  try { doc = await openDoc(pdf.file); } catch { return null; }
  const r = rec();
  if (r) r.busy++;
  let canvas = null;
  try {
    const pg = await doc.getPage(pdf.n);
    const base = pg.getViewport({ scale: 1 });
    const unit = PAGE_W / base.width; // page units per PDF point
    const pdfH = base.height * unit;
    heights.set(`${pdf.file}:${pdf.n}`, pdfH);
    const x = Math.max(0, area.x);
    const y = Math.max(0, area.y);
    const w = Math.min(PAGE_W, area.x + area.w) - x;
    const h = Math.min(pdfH, area.y + area.h) - y;
    if (w <= 0 || h <= 0 || signal?.aborted) return null;
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * q));
    canvas.height = Math.max(1, Math.round(h * q));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const vp = pg.getViewport({ scale: unit * q, offsetX: -x * q, offsetY: -y * q });
    const task = pg.render({ canvas, canvasContext: ctx, viewport: vp, background: '#FFFFFF' });
    const stop = () => task.cancel();
    signal?.addEventListener('abort', stop);
    try { await task.promise; } finally { signal?.removeEventListener('abort', stop); }
    if (signal?.aborted) { canvas.width = 0; return null; }
    return { canvas, x, y, w, h };
  } catch {
    if (canvas) canvas.width = 0;
    return null;
  } finally {
    if (r) r.busy--;
  }
}

// ---- The page on screen ----------------------------------------------------------
// The screen asks for the same window again and again while it redraws, so the
// last few drawn windows are kept. Asking for a new window of a page drops any
// unfinished drawing of an older one.
const KEEP_TILE_BYTES = 96 * 1024 * 1024;
const tiles = new Map(); // key -> { tile, bytes }
let tileBytes = 0;
const pending = new Map(); // `${who}:${file}:${n}` -> { key, ctl, waiters }

const keyOf = (pdf, q, a) => `${pdf.file}:${pdf.n}:${q.toFixed(4)}:${Math.round(a.x)},${Math.round(a.y)},${Math.round(a.w)},${Math.round(a.h)}`;

// A drawn window that covers `area` at `q`, or null; `onReady` is called once
// it's been drawn (then ask again). `who` keeps separate askers (the page,
// the writing window) from cancelling each other.
export function pdfTile(pdf, q, area, onReady, who = 'page') {
  if (!pdf?.file) return null;
  const key = keyOf(pdf, q, area);
  const hit = tiles.get(key);
  if (hit) { tiles.delete(key); tiles.set(key, hit); return hit.tile; }
  const pk = `${who}:${pdf.file}:${pdf.n}`;
  const p = pending.get(pk);
  if (p && p.key === key) { if (onReady && !p.waiters.includes(onReady)) p.waiters.push(onReady); return null; }
  if (p) p.ctl.abort();
  const job = { key, ctl: new AbortController(), waiters: onReady ? [onReady] : [] };
  pending.set(pk, job);
  renderPdfArea(pdf, q, area, { signal: job.ctl.signal }).then((tile) => {
    if (pending.get(pk) === job) pending.delete(pk);
    if (!tile) return;
    const bytes = tile.canvas.width * tile.canvas.height * 4;
    tiles.set(key, { tile, bytes });
    tileBytes += bytes;
    for (const [k, t] of tiles) {
      if (tileBytes <= KEEP_TILE_BYTES || tiles.size <= 2) break;
      tiles.delete(k);
      tileBytes -= t.bytes;
      t.tile.canvas.width = 0;
    }
    job.waiters.forEach((f) => f());
  });
  return null;
}

// Wait for a window (with a time limit), for pictures and exports.
export async function pdfAreaReady(pdf, q, area, ms = 15000) {
  let timer;
  const late = new Promise((res) => { timer = setTimeout(() => res(null), ms); });
  try { return await Promise.race([renderPdfArea(pdf, q, area), late]); } finally { clearTimeout(timer); }
}

// The original bytes of an imported PDF (for export), or null.
export async function pdfBytes(fileId) {
  const f = await V.fileBytes(fileId).catch(() => null);
  return f ? f.bytes : null;
}

export function forgetPdfs() {
  for (const r of docs.values()) closeDoc(r);
  docs.clear();
  for (const p of pending.values()) p.ctl.abort();
  pending.clear();
  for (const t of tiles.values()) t.tile.canvas.width = 0;
  tiles.clear();
  tileBytes = 0;
}
export const openPdfCount = () => docs.size;
export const keptTileCount = () => tiles.size;

// Sealed notes locked again: let go of anything drawn from them.
V.subscribe((e) => { if (e.type === 'sealed' && !V.state.keys?.s) forgetPdfs(); });
