// Highlights: everything you marked with the highlighter (on PDFs, photos and
// handwritten pages) and every highlight in typed notes, gathered in one
// place. For each highlight on a page it finds the words underneath: from the
// PDF's own text, from your handwriting (read on the device), or by reading
// the picture (OCR, on the device). Every highlight also keeps a picture of
// what you marked, so a sloppy one is never lost.
//
// How words are picked, so a highlight that misses the line still works:
// - a word counts when the highlight covers at least half of it (across);
// - the highlight takes the line it covers most, and a second line only when
//   it covers that one nearly as much (it clearly went over both);
// - a highlight over nothing readable keeps just its picture.

import * as V from './vault.js';
import { state } from './vault.js';
import { PAGE_W } from './model.js';

// Highlights on one page that belong together: same colour, drawn within a
// minute or so, the next one starting just below (a sentence over two lines).
const JOIN_MS = 90 * 1000;

const box = (s) => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < s.pts.length; i += 3) {
    const x = s.pts[i]; const y = s.pts[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const r = (s.s || 18) / 2;
  return { x: x0 - r, y: y0 - r, w: x1 - x0 + 2 * r, h: y1 - y0 + 2 * r };
};
const union = (a, b) => {
  const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

// The highlighter strokes of one page, grouped into highlights.
export function groupStrokes(strokes) {
  const hl = strokes.filter((s) => s.t === 'hl' && s.pts?.length >= 6).sort((a, b) => (a.at || 0) - (b.at || 0));
  const out = [];
  for (const s of hl) {
    const b = box(s);
    const last = out[out.length - 1];
    const lb = last?.box;
    const joins = last && last.color === s.c && Math.abs((s.at || 0) - last.at) < JOIN_MS &&
      b.y > lb.y + lb.h * 0.4 && b.y - (lb.y + lb.h) < Math.max(26, lb.h * 1.2);
    if (joins) { last.strokes.push(s); last.box = union(lb, b); last.at = s.at || last.at; } else out.push({ strokes: [s], color: s.c, box: b, at: s.at || 0 });
  }
  return out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

// ---- Typed notes ---------------------------------------------------------------
// Runs of highlighted text in a typed note: [{ text, color, context }].
export function typedHighlights(doc) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.content && node.content.some((c) => c.type === 'text')) {
      const para = node.content.map((c) => c.text || '').join('');
      let cur = null;
      for (const c of node.content) {
        const m = c.type === 'text' ? (c.marks || []).find((k) => k.type === 'highlight') : null;
        const color = m ? (m.attrs?.color || '#FFF1B8') : null;
        if (m && cur && cur.color === color) cur.text += c.text;
        else if (m) { cur = { text: c.text, color, context: para }; out.push(cur); } else cur = null;
      }
      return;
    }
    for (const c of node.content || []) walk(c);
  };
  walk(doc);
  return out.filter((h) => h.text.trim()).map((h) => ({ ...h, text: h.text.trim() }));
}

// ---- Which words a highlight covers -----------------------------------------
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function covered(strokes, x, y) {
  for (const s of strokes) {
    const r = (s.s || 18) / 2 + 0.5;
    const p = s.pts;
    for (let i = 3; i < p.length; i += 3) if (distToSeg(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= r) return true;
    if (p.length === 3 && Math.hypot(x - p[0], y - p[1]) <= r) return true;
  }
  return false;
}
const COLS = 6;
const ROWS = [0.25, 0.5, 0.75];
// How much of a box the highlight covers: share of columns touched, and of samples.
function coverage(strokes, b) {
  let cols = 0; let hits = 0; let top = 0; let bot = 0;
  for (let c = 0; c < COLS; c++) {
    const x = b.x0 + ((c + 0.5) / COLS) * (b.x1 - b.x0);
    let any = false;
    ROWS.forEach((r, ri) => {
      if (covered(strokes, x, b.top + r * (b.bot - b.top))) { any = true; hits++; if (ri === 0) top++; if (ri === 2) bot++; }
    });
    if (any) cols++;
  }
  return { cols: cols / COLS, hits, top, bot };
}

// Words in lines (each word { t, x0, x1, top, bot, line }), picked by the rules above.
// Returns { words, lines, note } where note says if the highlight was off the line.
export function pickWords(strokes, words) {
  const b = strokes.map(box).reduce(union);
  const near = words.filter((w) => w.x1 > b.x && w.x0 < b.x + b.w && w.bot > b.y && w.top < b.y + b.h);
  if (!near.length) return { words: [], lines: [], note: null };
  const byLine = new Map();
  for (const w of near) {
    const c = coverage(strokes, w);
    if (!byLine.has(w.line)) byLine.set(w.line, { line: w.line, score: 0, top: 0, bot: 0, words: [] });
    const L = byLine.get(w.line);
    L.score += c.hits; L.top += c.top; L.bot += c.bot;
    if (c.cols >= 0.5) L.words.push(w);
  }
  const lines = [...byLine.values()].filter((L) => L.score > 0).sort((a, b2) => b2.score - a.score);
  if (!lines.length) return { words: [], lines: [], note: null };
  const best = lines[0];
  const chosen = lines.filter((L) => L.score >= best.score * 0.6 && L.words.length);
  const picked = chosen.flatMap((L) => L.words).sort((a, b2) => a.line - b2.line || a.x0 - b2.x0);
  let note = null;
  // Slanted: from start to end it moved up or down by more than half a line.
  const lineH = Math.max(...near.filter((w) => w.line === best.line).map((w) => w.bot - w.top));
  const ends = strokes.map((s) => Math.abs(s.pts[s.pts.length - 2] - s.pts[1]));
  if (lines.some((L) => !chosen.includes(L) && L.score >= best.score * 0.15) || Math.max(...ends) > lineH * 0.5) note = 'drift';
  else if (best.top > best.bot * 1.6 && best.top - best.bot >= 2) note = 'high';
  else if (best.bot > best.top * 1.6 && best.bot - best.top >= 2) note = 'low';
  return { words: picked, lines: chosen.map((L) => L.line), note };
}

// ---- Words on a page --------------------------------------------------------------
// The PDF's own words, with their boxes in page units (cached per PDF page).
const pdfWordCache = new Map();
let measurer = null;
const measure = (t) => { measurer = measurer || document.createElement('canvas').getContext('2d'); measurer.font = '16px serif'; return measurer.measureText(t).width; };
export async function pdfWords(pdf) {
  if (!pdf?.file) return [];
  const key = `${pdf.file}:${pdf.n}`;
  if (pdfWordCache.has(key)) return pdfWordCache.get(key);
  const job = (async () => {
    const { openDocFor } = await import('./pdfview.js');
    const doc = await openDocFor(pdf.file);
    if (!doc) return [];
    const pg = await doc.getPage(pdf.n);
    const vp = pg.getViewport({ scale: 1 });
    const unit = PAGE_W / vp.width;
    const tc = await pg.getTextContent();
    const words = [];
    let line = 0;
    let lastY = null;
    const m = vp.transform;
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = it.transform;
      // The item's place on the page (top-left origin), as pdf.js draws it.
      const a = m[0] * t[0] + m[2] * t[1]; const b2 = m[1] * t[0] + m[3] * t[1];
      const c = m[0] * t[2] + m[2] * t[3]; const d = m[1] * t[2] + m[3] * t[3];
      const e = m[0] * t[4] + m[2] * t[5] + m[4]; const f = m[1] * t[4] + m[3] * t[5] + m[5];
      if (Math.abs(b2) > Math.abs(a) * 0.2) continue; // turned text: skip
      const size = Math.hypot(c, d) || Math.abs(it.height) || 10;
      const width = it.width * Math.abs(a) / (Math.hypot(t[0], t[1]) || 1) || measure(it.str) * size / 16;
      if (lastY === null || Math.abs(f - lastY) > size * 0.5) { line++; lastY = f; }
      const parts = it.str.split(/(\s+)/);
      const total = measure(it.str) || 1;
      let x = e;
      for (const p of parts) {
        const w = (measure(p) / total) * width;
        if (p.trim()) words.push({ t: p, x0: x * unit, x1: (x + w) * unit, top: (f - size * 0.78) * unit, bot: (f + size * 0.22) * unit, line });
        x += w;
      }
    }
    return words;
  })().catch(() => []);
  pdfWordCache.set(key, job);
  return job;
}

// Lines of your handwriting on the page, as "words" (one per line) for picking.
async function handLines(n, page, data) {
  const H = await import('./handwriting.js');
  const lines = H.groupLines(data.strokes || []);
  const known = new Map((n.hw?.[page.id]?.lines || []).map((l) => [l.k, l.t]));
  return lines.map((l, i) => ({ t: known.get(H.lineKey(l.ids)) || '', ids: l.ids, strokes: l.strokes, x0: l.box.x, x1: l.box.x + l.box.w, top: l.box.y, bot: l.box.y + l.box.h, line: i + 1 }));
}

// ---- Reading one highlight ------------------------------------------------------
const readCache = new Map();
// { text, how: 'pdf' | 'hand' | 'ocr' | 'none', note, crop } for a highlight on a page.
export function readHighlight(h) {
  const key = `${h.page.id}:${h.strokes.map((s) => s.id).join(',')}:${h.data.at || 0}`;
  if (!readCache.has(key)) readCache.set(key, doRead(h).catch(() => ({ text: '', how: 'none', note: null, crop: cropOf(h, []) })));
  return readCache.get(key);
}
function cropOf(h, boxes) {
  let b = h.box;
  for (const w of boxes) b = union(b, { x: w.x0, y: w.top, w: w.x1 - w.x0, h: w.bot - w.top });
  const pad = 8;
  const x = Math.max(0, b.x - pad); const y = Math.max(0, b.y - pad);
  return { x, y, w: Math.min(PAGE_W, b.x + b.w + pad) - x, h: Math.min(h.page.h, b.y + b.h + pad) - y };
}
async function doRead(h) {
  const { strokes, page, data, note: n } = h;
  // 1. The PDF's own text.
  if (page.pdf) {
    const r = pickWords(strokes, await pdfWords(page.pdf));
    if (r.words.length) return { text: joinWords(r.words), how: 'pdf', note: r.note, crop: cropOf(h, r.words) };
  }
  // 2. Your handwriting under it.
  const hand = await handLines(n, page, data);
  if (hand.length) {
    const r = pickWords(strokes, hand.map((l) => ({ ...l, x0: l.x0, x1: l.x1 })));
    const lines = hand.filter((l) => r.lines.includes(l.line));
    if (lines.length) {
      let text = lines.map((l) => l.t).filter(Boolean).join(' ');
      if (!text) {
        const H = await import('./handwriting.js');
        if (H.handOn()) text = (await H.readStrokes(lines.flatMap((l) => l.strokes))).text.replace(/\n/g, ' ');
      }
      if (text) return { text, how: 'hand', note: r.note, crop: cropOf(h, lines) };
    }
  }
  // 3. Read the picture (photos, scans, older PDF imports).
  if (page.bg || page.pdf) {
    const crop = cropOf(h, []);
    const text = await ocrCrop(page, data, crop);
    if (text) return { text, how: 'ocr', note: null, crop };
  }
  return { text: '', how: 'none', note: null, crop: cropOf(h, []) };
}
const joinWords = (ws) => ws.map((w) => w.t).join(' ').replace(/\s+([,.;:!?])/g, '$1');

async function ocrCrop(page, data, crop) {
  const { renderPageCanvas } = await import('./editor/inkdraw.js');
  const c = await renderPageCanvas(page, { ...data, strokes: [] }, Math.round(crop.w * 3), { crop });
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  c.width = 0;
  if (!blob) return '';
  const { ocrImage } = await import('./ocr.js');
  return (await ocrImage(blob)).replace(/\s+/g, ' ').trim();
}

// A picture of the highlight, as an object URL (cached; drawn from the page).
const picCache = new Map();
export async function highlightPicture(h, crop, widthPx = 640) {
  const key = `${h.page.id}:${h.strokes.map((s) => s.id).join(',')}:${h.data.at || 0}:${widthPx}`;
  if (picCache.has(key)) return picCache.get(key);
  const job = (async () => {
    const { renderPageCanvas } = await import('./editor/inkdraw.js');
    const c = await renderPageCanvas(h.page, h.data, Math.round(Math.min(widthPx, crop.w * 2.2)), { crop });
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
    c.width = 0;
    return blob ? URL.createObjectURL(blob) : null;
  })();
  picCache.set(key, job);
  return job;
}
// Sealed notes locked again: let go of the pictures and words.
V.subscribe((e) => {
  if (e.type === 'sealed' && !state.keys?.s) {
    for (const p of picCache.values()) p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {});
    picCache.clear(); readCache.clear(); pdfWordCache.clear();
  }
});

// ---- Gathering --------------------------------------------------------------
// Every highlight in these notes: [{ note, items: [...] }], notes newest first.
// Handwritten notes keep a list of their pages with highlights (`hlPages`),
// so only those pages are opened.
export async function gather(notes, { onProgress } = {}) {
  const groups = [];
  let k = 0;
  for (const n of notes) {
    k++;
    if (n.sealed && !state.keys.s) continue;
    const items = [];
    if (n.kind === 'ink') {
      const known = Array.isArray(n.hlPages);
      const pages = known ? n.pages.filter((p) => n.hlPages.includes(p.id)) : n.pages;
      const withHl = [];
      for (const page of pages) {
        let data;
        try { data = await V.loadPage(page.id); } catch { continue; }
        const gs = groupStrokes(data.strokes || []);
        if (gs.length) withHl.push(page.id);
        for (const g of gs) items.push({ kind: 'page', note: n, page, pageNo: n.pages.indexOf(page) + 1, data, ...g });
      }
      // An older note: remember its highlighted pages and how many (the menu shows the count).
      if (!known || n.hlCount !== items.length) { const cur = state.notes.get(n.id); if (cur) await V.saveNote({ ...cur, hlPages: withHl, hlCount: items.length }, { touch: false }).catch(() => {}); }
    } else if (n.doc) {
      for (const t of typedHighlights(n.doc)) items.push({ kind: 'typed', note: n, ...t });
    }
    if (items.length) groups.push({ note: n, items });
    onProgress?.(k, notes.length);
  }
  return groups;
}

// Highlight colours by name, for the filter chips.
const NAMES = [['Yellow', [247, 208, 70]], ['Green', [155, 224, 122]], ['Pink', [255, 158, 196]], ['Blue', [140, 200, 255]], ['Orange', [255, 180, 110]], ['Purple', [200, 170, 255]]];
export function colourGroup(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return 'Yellow';
  const c = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  let best = NAMES[0][0]; let bd = Infinity;
  for (const [name, v] of NAMES) { const d = (c[0] - v[0]) ** 2 + (c[1] - v[1]) ** 2 + (c[2] - v[2]) ** 2; if (d < bd) { bd = d; best = name; } }
  return best;
}
