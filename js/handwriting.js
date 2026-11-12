// Reading handwriting on this device. Pen strokes are grouped into lines, each
// line is drawn small and clean, and a text-line recogniser reads it in the
// model worker. Results are kept on the note per page (by line), so unchanged
// lines are never read twice and other devices get the text with the sync.

import { strokeBox, strokePath } from './editor/inkdraw.js';
import { state } from './vault.js';
import * as V from './vault.js';

const H = 48; // model input height
const MIN_CONF = 0.55; // below this a line is probably a drawing, not words

export const handOn = () => state.device?.readHand !== false;

// Strokes that could be writing: pen strokes, not highlighter or snapped shapes.
const writing = (s) => s.t !== 'hl' && !s.shape && (s.pts?.length || 0) >= 3;

// Group strokes into lines of writing: [{ ids, box, strokes }], top to bottom.
export function groupLines(strokes) {
  const items = strokes.filter(writing).map((s) => ({ s, b: strokeBox(s) }));
  if (!items.length) return [];
  const hs = items.map((i) => i.b.h).filter((h) => h > 6).sort((a, b) => a - b);
  const unit = Math.max(14, Math.min(120, hs[Math.floor(hs.length * 0.6)] || 30));
  const small = (i) => i.b.h < unit * 0.55 && i.b.w < unit * 0.7;
  const tall = (i) => i.b.h > unit * 1.45;
  const big = items.filter((i) => !small(i) && !tall(i)).sort((a, b) => (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2));
  const lines = [];
  const near = (L, b, tol) => {
    const gap = Math.max(0, L.x0 - (b.x + b.w), b.x - L.x1);
    return gap < unit * 4 && Math.abs(b.y + b.h / 2 - L.cy) < tol;
  };
  for (const it of big) {
    const cy = it.b.y + it.b.h / 2;
    let best = null;
    let bd = Infinity;
    for (const L of lines) {
      const d = Math.abs(cy - L.cy);
      // Lines are found by height alone here; wide gaps split them below.
      if (d < bd && d < unit * 0.62) { best = L; bd = d; }
    }
    if (!best) { best = { items: [], cy, wsum: 0, x0: it.b.x, x1: it.b.x + it.b.w }; lines.push(best); }
    best.items.push(it);
    const w = Math.max(1, it.b.w);
    best.cy = (best.cy * best.wsum + cy * w) / (best.wsum + w);
    best.wsum += w;
    best.x0 = Math.min(best.x0, it.b.x);
    best.x1 = Math.max(best.x1, it.b.x + it.b.w);
  }
  // Capitals, loops and long strokes join the line they overlap most.
  for (const it of items.filter((i) => tall(i) && i.b.h < unit * 4).sort((a, b) => a.b.y - b.b.y)) {
    let best = null;
    let bo = 0;
    for (const L of lines) {
      const ov = Math.min(it.b.y + it.b.h, L.cy + unit / 2) - Math.max(it.b.y, L.cy - unit / 2);
      if (ov > bo && near(L, it.b, it.b.h)) { best = L; bo = ov; }
    }
    if (best) {
      best.items.push(it);
      best.x0 = Math.min(best.x0, it.b.x);
      best.x1 = Math.max(best.x1, it.b.x + it.b.w);
    } else lines.push({ items: [it], cy: it.b.y + it.b.h / 2, wsum: it.b.w, x0: it.b.x, x1: it.b.x + it.b.w });
  }
  // Dots, accents and commas join the nearest line.
  for (const it of items.filter(small)) {
    let best = null;
    let bd = Infinity;
    for (const L of lines) {
      const d = Math.abs(it.b.y + it.b.h / 2 - L.cy);
      if (d < bd && near(L, it.b, unit * 1.1)) { best = L; bd = d; }
    }
    if (best) best.items.push(it);
  }
  // A stray mark left on a line of its own joins the line beside it.
  for (const L of [...lines]) {
    if (L.items.length > 2) continue;
    const h = Math.max(...L.items.map((i) => i.b.y + i.b.h)) - Math.min(...L.items.map((i) => i.b.y));
    if (h > unit * 0.7) continue;
    let best = null;
    let bd = Infinity;
    for (const M of lines) {
      if (M === L || M.items.length <= 2) continue;
      const d = Math.abs(M.cy - L.cy);
      if (d < bd && d < unit * 1.4 && L.x1 > M.x0 - unit && L.x0 < M.x1 + unit) { best = M; bd = d; }
    }
    if (best) { best.items.push(...L.items); lines.splice(lines.indexOf(L), 1); }
  }
  // Split lines where there's a wide gap (two columns of notes side by side).
  const out = [];
  for (const L of lines) {
    const xs = L.items.sort((a, b) => a.b.x - b.b.x);
    let cur = [];
    let right = -Infinity;
    for (const it of xs) {
      if (cur.length && it.b.x - right > unit * 3) { out.push(cur); cur = []; right = -Infinity; }
      cur.push(it);
      right = Math.max(right, it.b.x + it.b.w);
    }
    if (cur.length) out.push(cur);
  }
  return out.map((its) => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const { b } of its) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { ids: its.map((i) => i.s.id).sort(), strokes: its.map((i) => i.s), box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }).sort((a, b) => (Math.abs(a.box.y - b.box.y) < unit * 0.6 ? a.box.x - b.box.x : a.box.y - b.box.y));
}

// A short key for a line: the same strokes give the same key.
export function lineKey(ids) {
  let h = 0x811c9dc5;
  for (const id of ids) for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Draw one line black on white, 48 pixels high, as the model expects.
function lineImage(line) {
  const b = line.box;
  const pad = 6;
  const k = (H - pad * 2) / Math.max(b.h, 12);
  const W = Math.max(16, Math.min(3200, Math.ceil(b.w * k + pad * 4)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(k, 0, 0, k, pad * 2 - b.x * k, pad - b.y * k);
  ctx.fillStyle = '#000';
  for (const s of line.strokes) {
    const p = strokePath(s);
    ctx.fill(p, 'nonzero');
    // Very fine pens drawn this small can vanish; give them some weight.
    if (s.s * k < 1.4) { ctx.lineWidth = 1.4 / k; ctx.strokeStyle = '#000'; ctx.stroke(p); }
  }
  const px = ctx.getImageData(0, 0, W, H).data;
  const data = new Float32Array(3 * H * W);
  const plane = H * W;
  for (let i = 0; i < plane; i++) {
    const g = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
    const v = (g - 0.5) / 0.5;
    data[i] = v;
    data[plane + i] = v;
    data[2 * plane + i] = v;
  }
  c.width = 0;
  return { w: W, data };
}

// Read some strokes (a lasso selection): the text, one line per line.
export async function readStrokes(strokes) {
  const lines = groupLines(strokes);
  if (!lines.length) return { text: '', lines: [] };
  const { readLines } = await import('./ai.js');
  const res = await readLines(lines.map(lineImage));
  const text = res.map((r) => r.text).filter(Boolean).join('\n');
  return { text, lines: lines.map((l, i) => ({ ...l, ...res[i] })) };
}

// Read a whole page, reusing lines read before. Returns { at, lines: [{ k, t }] }.
export async function readPage(data, prev = null) {
  const lines = groupLines(data.strokes || []);
  const known = new Map((prev?.lines || []).map((l) => [l.k, l]));
  const todo = [];
  const out = lines.map((l) => {
    const k = lineKey(l.ids);
    const hit = known.get(k);
    if (hit) return hit;
    const slot = { k, t: '' };
    todo.push({ l, slot });
    return slot;
  });
  if (todo.length) {
    const { readLines } = await import('./ai.js');
    // A few lines at a time keeps memory low on phones.
    for (let i = 0; i < todo.length; i += 6) {
      const part = todo.slice(i, i + 6);
      const res = await readLines(part.map((x) => lineImage(x.l)));
      res.forEach((r, j) => { part[j].slot.t = r.conf >= MIN_CONF ? r.text : ''; });
    }
  }
  return { at: data.at || Date.now(), lines: out };
}

export const pageText = (hw) => (hw?.lines || []).map((l) => l.t).filter(Boolean).join('\n');

// Read every page of a handwritten note that changed since it was last read,
// and keep the text on the note. Returns true if anything changed.
const running = new Map();
export function readNote(id, { pages = null } = {}) {
  if (running.has(id)) return running.get(id).then(() => readNote(id, { pages }));
  const job = (async () => {
    const n = state.notes.get(id);
    if (!n || n.kind !== 'ink' || !handOn()) return false;
    const hw = { ...(n.hw || {}) };
    let changed = false;
    let touched = false;
    for (const p of n.pages) {
      if (pages && !pages.includes(p.id)) continue;
      let d;
      try { d = await V.loadPage(p.id); } catch { continue; }
      if (hw[p.id] && hw[p.id].at >= (d.at || 0)) continue;
      const r = await readPage(d, hw[p.id]);
      if (JSON.stringify(r.lines) !== JSON.stringify(hw[p.id]?.lines)) changed = true;
      hw[p.id] = r;
      touched = true;
    }
    for (const k of Object.keys(hw)) if (!n.pages.some((p) => p.id === k)) { delete hw[k]; changed = true; touched = true; }
    const cur = state.notes.get(id);
    if (!cur || !touched) return false;
    const { refreshInkSummary } = await import('./notework.js');
    await V.saveNote((latest) => latest && { ...latest, hw }, { touch: false, id });
    if (changed) await refreshInkSummary(id, { touch: false });
    return changed;
  })();
  running.set(id, job);
  job.finally(() => running.delete(id)).catch(() => {});
  return job;
}

// Read handwriting in every note that needs it (from Settings).
export async function readAll(onProgress) {
  const list = [...state.notes.values()].filter((n) => n.kind === 'ink');
  let i = 0;
  for (const n of list) {
    onProgress?.(++i, list.length);
    try { await readNote(n.id); } catch (e) { console.warn('handwriting', n.id, e); }
  }
}
