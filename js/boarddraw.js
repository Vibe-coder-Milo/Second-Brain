// Whiteboards: the shared geometry (where arrows meet boxes, what's inside a
// frame), the text summary kept on the note for search and links, and drawing
// a whole board onto a canvas for export, history and thumbnails.
//
// A board is a note of kind 'board' with one page file. The page holds
// `objects` (cards, sticky notes, text, shapes, frames, images, arrows) and
// `strokes` (pen and highlighter). Objects are never removed from the file:
// deleting one marks it `del`, so undo and other devices agree on its id and
// arrows pointing at it come back with it.

import { getStroke } from '../vendor/freehand.js';
import { PENS, HL, fileImageReady, penOptions } from './editor/inkdraw.js';
import { POSTIT_COLORS } from './stickers.js';
import { state } from './vault.js';
import { displayTitle, noteText, regionColors, typeName } from './model.js';
import { fmtDate, snippet } from './util.js';

export const STICKY_COLORS = [...POSTIT_COLORS, { id: 'orange', bg: '#FFE0C2', fold: '#F2C9A0' }];
export const stickyBg = (id) => (STICKY_COLORS.find((c) => c.id === id) || STICKY_COLORS[0]).bg;
export const BOARD_INK = ['#1B2A38', '#2B5684', '#B0413E', '#2F8A72', '#C0802F', '#8C67B0', '#6B7A85'];
export const TEXT_SIZES = [{ id: 's', px: 16, name: 'Small' }, { id: 'm', px: 24, name: 'Medium' }, { id: 'l', px: 36, name: 'Large' }, { id: 'xl', px: 56, name: 'Huge' }];
export const textPx = (o) => (TEXT_SIZES.find((x) => x.id === o.size) || TEXT_SIZES[1]).px;
export const SHAPES = [{ id: 'rect', name: 'Rectangle' }, { id: 'ellipse', name: 'Oval' }, { id: 'diamond', name: 'Diamond' }];
export const DEFAULTS = {
  card: { w: 280, h: 120 },
  sticky: { w: 150, h: 150 },
  text: { w: 260, h: 40 },
  shape: { w: 180, h: 120 },
  frame: { w: 480, h: 360 },
  image: { w: 260, h: 200 },
};

export const PAPER = { bg: '#F1F4F2', dot: '#C9D4D1', ink: '#1B2A38', muted: '#51606C', line: '#CDD9D6', card: '#FFFFFF', frame: 'rgba(255,255,255,0.55)' };

// ---- Objects --------------------------------------------------------------------

export const live = (data) => (data?.objects || []).filter((o) => !o.del).sort((a, b) => (a.z || 0) - (b.z || 0));
export const isBoxy = (o) => o.type !== 'arrow';

// Card contents: what the card shows about its note.
export function cardInfo(o) {
  const n = state.notes.get(o.note);
  if (!n) return { missing: true, title: 'A note that’s gone', meta: '', excerpt: 'Deleted, or sealed and locked.', dot: '#C9D4D1' };
  const r = state.config?.regions?.find((x) => x.id === n.region);
  const title = displayTitle(n);
  let rest = noteText({ ...n, title: '' }).trim();
  if (rest.startsWith(title)) rest = rest.slice(title.length);
  const kind = n.kind === 'ink' ? 'Handwritten' : n.kind === 'board' ? 'Whiteboard' : typeName(n.type);
  return { title, meta: `${kind}, ${fmtDate(n.updatedAt)}`, excerpt: snippet(rest, 150), dot: regionColors(n.inbox ? null : r).dot, sealed: n.sealed };
}

// ---- Arrows ---------------------------------------------------------------------

const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];

// Where a line from the box's centre towards (tx, ty) leaves the box.
function exitPoint(b, tx, ty, gap = 6) {
  const [cx, cy] = center(b);
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { p: [cx, cy], side: 'r' };
  const hw = b.w / 2 + gap;
  const hh = b.h / 2 + gap;
  const sx = dx ? hw / Math.abs(dx) : Infinity;
  const sy = dy ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  const side = sx < sy ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'b' : 't');
  return { p: [cx + dx * s, cy + dy * s], side };
}

const DIR = { r: [1, 0], l: [-1, 0], b: [0, 1], t: [0, -1] };

// An arrow as a gentle curve: { p0, c0, c1, p1, mid, ang } in board units.
// `boxOf(id)` gives the current box of an object, or null.
export function arrowGeom(a, boxOf) {
  const fb = a.from?.id ? boxOf(a.from.id) : null;
  const tb = a.to?.id ? boxOf(a.to.id) : null;
  const fp = fb ? center(fb) : [a.from?.x ?? 0, a.from?.y ?? 0];
  const tp = tb ? center(tb) : [a.to?.x ?? 0, a.to?.y ?? 0];
  const s = fb ? exitPoint(fb, tp[0], tp[1]) : { p: fp, side: null };
  const e = tb ? exitPoint(tb, s.p[0], s.p[1], 8) : { p: tp, side: null };
  // Re-aim the start at where the end actually lands.
  const s2 = fb ? exitPoint(fb, e.p[0], e.p[1]) : s;
  const p0 = s2.p;
  const p1 = e.p;
  const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const k = Math.min(dist * 0.4, 160);
  const d0 = s2.side ? DIR[s2.side] : [0, 0];
  const d1 = e.side ? DIR[e.side] : [0, 0];
  const c0 = [p0[0] + d0[0] * k, p0[1] + d0[1] * k];
  const c1 = [p1[0] + d1[0] * k, p1[1] + d1[1] * k];
  const bez = (t) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0], u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1]];
  };
  const near = bez(0.96);
  const ang = Math.atan2(p1[1] - near[1], p1[0] - near[0]);
  return { p0, c0, c1, p1, mid: bez(0.5), ang, bez };
}

export const arrowD = (g) => `M${g.p0[0].toFixed(1)} ${g.p0[1].toFixed(1)} C${g.c0[0].toFixed(1)} ${g.c0[1].toFixed(1)} ${g.c1[0].toFixed(1)} ${g.c1[1].toFixed(1)} ${g.p1[0].toFixed(1)} ${g.p1[1].toFixed(1)}`;

export function arrowHead(g, size = 13) {
  const [x, y] = g.p1;
  const a = g.ang;
  const w = 0.42;
  return [[x, y], [x - size * Math.cos(a - w), y - size * Math.sin(a - w)], [x - size * Math.cos(a + w), y - size * Math.sin(a + w)]];
}

// Distance from a point to an arrow's curve (for tapping on it).
export function arrowDistance(g, x, y) {
  let best = Infinity;
  for (let i = 0; i <= 24; i++) {
    const [px, py] = g.bez(i / 24);
    best = Math.min(best, Math.hypot(px - x, py - y));
  }
  return best;
}

// ---- Strokes --------------------------------------------------------------------

const dCache = new WeakMap();
export function strokeD(s) {
  let d = dCache.get(s);
  if (d) return d;
  const pts = [];
  for (let i = 0; i < s.pts.length; i += 3) pts.push([s.pts[i], s.pts[i + 1], s.pts[i + 2]]);
  const pen = s.t === 'hl' ? { o: { thinning: 0, smoothing: 0.5, streamline: 0.55 } } : PENS[s.pen] || PENS.ballpoint;
  const o = getStroke(pts, { size: s.s, ...penOptions(s, pen.o || PENS.ballpoint.o), simulatePressure: !!s.sp && !s.np, last: true });
  if (!o.length) return '';
  let out = `M${o[0][0].toFixed(1)} ${o[0][1].toFixed(1)}`;
  for (let i = 1; i < o.length; i++) {
    const [x0, y0] = o[i - 1];
    const [x1, y1] = o[i];
    out += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
  }
  d = `${out} Z`;
  dCache.set(s, d);
  return d;
}

export function strokeBounds(s) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < s.pts.length; i += 3) {
    x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]);
    y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]);
  }
  return { x: x0 - s.s, y: y0 - s.s, w: x1 - x0 + 2 * s.s, h: y1 - y0 + 2 * s.s };
}

export function strokeHit(s, x, y, tol = 8) {
  const b = strokeBounds(s);
  if (x < b.x - tol || x > b.x + b.w + tol || y < b.y - tol || y > b.y + b.h + tol) return false;
  const r = s.s / 2 + tol;
  for (let i = 0; i < s.pts.length; i += 3) {
    const px = s.pts[i];
    const py = s.pts[i + 1];
    if (Math.hypot(px - x, py - y) <= r) return true;
    if (i + 3 < s.pts.length) {
      const qx = s.pts[i + 3];
      const qy = s.pts[i + 4];
      const vx = qx - px; const vy = qy - py;
      const l2 = vx * vx + vy * vy;
      if (l2) {
        const t = Math.max(0, Math.min(1, ((x - px) * vx + (y - py) * vy) / l2));
        if (Math.hypot(px + t * vx - x, py + t * vy - y) <= r) return true;
      }
    }
  }
  return false;
}

// ---- Frames ---------------------------------------------------------------------

// Objects whose centre sits inside a frame move with it.
export function insideFrame(f, o, boxOf) {
  if (o.id === f.id || o.type === 'arrow') return false;
  if (o.type === 'frame' && (o.w * o.h >= f.w * f.h)) return false;
  const b = boxOf(o.id) || o;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx > f.x && cx < f.x + f.w && cy > f.y && cy < f.y + f.h;
}

export function strokeInFrame(f, s) {
  const b = strokeBounds(s);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx > f.x && cx < f.x + f.w && cy > f.y && cy < f.y + f.h;
}

// ---- Bounds ---------------------------------------------------------------------

export function contentBounds(data, boxOf) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const add = (b) => { if (!b) return; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y - (b.label ? 26 : 0)); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); };
  for (const o of live(data)) {
    if (o.type === 'arrow') {
      const g = arrowGeom(o, boxOf);
      for (const p of [g.p0, g.p1, g.mid]) add({ x: p[0] - 8, y: p[1] - 8, w: 16, h: 16 });
    } else add({ ...(boxOf(o.id) || o), label: o.type === 'frame' });
  }
  for (const s of data?.strokes || []) add(strokeBounds(s));
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---- Text summary ----------------------------------------------------------------

// A plain outline of the board, kept as the note's body: frames become
// headings, cards become [[links]] (so the notes on the board show it under
// their mentions), sticky notes and text are quoted, arrows are listed.
export function boardSummary(data, boxOf = (id) => (data.objects || []).find((o) => o.id === id)) {
  const objs = live(data);
  const frames = objs.filter((o) => o.type === 'frame').sort((a, b) => a.y - b.y || a.x - b.x);
  const name = (o) => {
    if (!o) return '';
    if (o.type === 'card') { const n = state.notes.get(o.note); return n ? displayTitle(n) : ''; }
    if (o.type === 'frame') return o.title || 'Frame';
    if (o.type === 'image') return o.caption || 'Image';
    return String(o.text || '').split('\n')[0].trim();
  };
  const line = (o) => {
    if (o.type === 'card') { const n = state.notes.get(o.note); return n ? `- [[${displayTitle(n)}]]` : ''; }
    if (o.type === 'sticky') return o.text?.trim() ? `> ${o.text.trim().split('\n').join(' ')}` : '';
    if (o.type === 'text' || o.type === 'shape') return o.text?.trim() || '';
    if (o.type === 'image') return o.caption ? `Image: ${o.caption}` : '';
    return '';
  };
  const order = (a, b) => (Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y);
  const used = new Set();
  const out = [];
  for (const f of frames) {
    const inner = objs.filter((o) => o.type !== 'frame' && o.type !== 'arrow' && !used.has(o.id) && insideFrame(f, o, boxOf)).sort(order);
    inner.forEach((o) => used.add(o.id));
    const lines = inner.map(line).filter(Boolean);
    out.push(`## ${f.title || 'Frame'}`);
    if (lines.length) out.push(lines.join('\n'));
  }
  const loose = objs.filter((o) => o.type !== 'frame' && o.type !== 'arrow' && !used.has(o.id)).sort(order).map(line).filter(Boolean);
  if (loose.length) { if (frames.length) out.push('## Elsewhere on the board'); out.push(loose.join('\n')); }
  const byId = new Map(objs.map((o) => [o.id, o]));
  const links = objs.filter((o) => o.type === 'arrow' && o.from?.id && o.to?.id).map((a) => {
    const f = name(byId.get(a.from.id));
    const t = name(byId.get(a.to.id));
    return f && t ? `- ${f} → ${t}${a.label ? ` (${a.label})` : ''}` : '';
  }).filter(Boolean);
  if (links.length) out.push(`## Arrows\n${links.join('\n')}`);
  return out.join('\n\n').trim();
}

// ---- Drawing on a canvas ----------------------------------------------------------

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !cur) cur = next;
      else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SANS = "'Overpass', system-ui, sans-serif";
const SERIF = "'Spectral', Georgia, serif";

// The height a card needs, laid out the same way as on screen.
export function cardHeight(ctx, o) {
  const info = cardInfo(o);
  ctx.font = `400 17px ${SERIF}`;
  const t = wrap(ctx, info.title, o.w - 28).slice(0, 3);
  ctx.font = `400 13px ${SANS}`;
  const ex = info.excerpt ? wrap(ctx, info.excerpt, o.w - 28).slice(0, 3) : [];
  return Math.max(o.h || 0, 14 + 18 + 6 + t.length * 23 + (ex.length ? 6 + ex.length * 19 : 0) + 14);
}

function fitSticky(ctx, text, w, h) {
  for (let px = 26; px >= 11; px -= 1) {
    ctx.font = `400 ${px}px ${SERIF}`;
    const lines = wrap(ctx, text, w - 28);
    if (lines.length * px * 1.15 <= h - 28) return { px, lines };
  }
  ctx.font = `400 11px ${SERIF}`;
  return { px: 11, lines: wrap(ctx, text, w - 28).slice(0, Math.floor((h - 28) / 13)) };
}

function drawObject(ctx, o, imgs) {
  ctx.save();
  if (o.type === 'frame') {
    ctx.fillStyle = PAPER.frame;
    ctx.strokeStyle = '#B9C7C3';
    ctx.lineWidth = 1.2;
    roundRect(ctx, o.x, o.y, o.w, o.h, 14);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER.muted;
    ctx.font = `600 14px ${SANS}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(o.title || 'Frame', o.x + 2, o.y - 9);
  } else if (o.type === 'card') {
    const info = cardInfo(o);
    ctx.shadowColor = 'rgba(27,42,56,0.08)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = PAPER.card;
    roundRect(ctx, o.x, o.y, o.w, o.h, 12);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = PAPER.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    let y = o.y + 14;
    ctx.fillStyle = info.dot;
    ctx.beginPath(); ctx.arc(o.x + 18, y + 8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAPER.muted;
    ctx.font = `400 12.5px ${SANS}`;
    ctx.textBaseline = 'top';
    ctx.fillText(info.meta, o.x + 30, y + 2);
    y += 24;
    ctx.fillStyle = PAPER.ink;
    ctx.font = `400 17px ${SERIF}`;
    for (const l of wrap(ctx, info.title, o.w - 28).slice(0, 3)) { ctx.fillText(l, o.x + 14, y); y += 23; }
    if (info.excerpt) {
      y += 6;
      ctx.fillStyle = PAPER.muted;
      ctx.font = `400 13px ${SANS}`;
      for (const l of wrap(ctx, info.excerpt, o.w - 28).slice(0, 3)) { ctx.fillText(l, o.x + 14, y); y += 19; }
    }
  } else if (o.type === 'sticky') {
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate(((o.rot || 0) * Math.PI) / 180);
    ctx.translate(-o.w / 2, -o.h / 2);
    ctx.shadowColor = 'rgba(27,42,56,0.14)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = stickyBg(o.color);
    ctx.fillRect(0, 0, o.w, o.h);
    ctx.shadowColor = 'transparent';
    const { px, lines } = fitSticky(ctx, o.text || '', o.w, o.h);
    ctx.fillStyle = PAPER.ink;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 14, 14 + i * px * 1.15));
  } else if (o.type === 'text') {
    const px = textPx(o);
    ctx.font = `${o.bold ? 700 : 400} ${px}px ${o.font === 'serif' ? SERIF : SANS}`;
    ctx.fillStyle = o.color || PAPER.ink;
    ctx.textBaseline = 'top';
    wrap(ctx, o.text || '', o.w).forEach((l, i) => ctx.fillText(l, o.x, o.y + i * px * 1.25));
  } else if (o.type === 'shape') {
    ctx.strokeStyle = o.color || PAPER.ink;
    ctx.lineWidth = 2.2;
    ctx.fillStyle = o.fill ? `${o.color || PAPER.ink}1F` : 'transparent';
    ctx.beginPath();
    if (o.shape === 'ellipse') ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
    else if (o.shape === 'diamond') { ctx.moveTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x + o.w, o.y + o.h / 2); ctx.lineTo(o.x + o.w / 2, o.y + o.h); ctx.lineTo(o.x, o.y + o.h / 2); ctx.closePath(); } else roundRect(ctx, o.x, o.y, o.w, o.h, 10);
    if (o.fill) ctx.fill();
    ctx.stroke();
    if (o.text) {
      ctx.fillStyle = PAPER.ink;
      ctx.font = `500 16px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrap(ctx, o.text, o.w * 0.8);
      lines.forEach((l, i) => ctx.fillText(l, o.x + o.w / 2, o.y + o.h / 2 + (i - (lines.length - 1) / 2) * 20));
    }
  } else if (o.type === 'image') {
    ctx.fillStyle = PAPER.card;
    roundRect(ctx, o.x, o.y, o.w, o.h, 10);
    ctx.fill();
    ctx.strokeStyle = PAPER.line;
    ctx.stroke();
    const img = imgs.get(o.fileId);
    const capH = o.caption ? 26 : 0;
    if (img) {
      ctx.save();
      roundRect(ctx, o.x + 8, o.y + 8, o.w - 16, o.h - 16 - capH, 6);
      ctx.clip();
      const bw = o.w - 16; const bh = o.h - 16 - capH;
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      const k = Math.max(bw / nw, bh / nh);
      const iw = nw * k; const ih = nh * k;
      ctx.drawImage(img, o.x + 8 + (bw - iw) / 2, o.y + 8 + (bh - ih) / 2, iw, ih);
      ctx.restore();
    }
    if (o.caption) {
      ctx.fillStyle = PAPER.muted;
      ctx.font = `400 12.5px ${SANS}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(o.caption, o.x + 10, o.y + o.h - 14, o.w - 20);
    }
  }
  ctx.restore();
}

function drawArrow(ctx, a, boxOf) {
  const g = arrowGeom(a, boxOf);
  ctx.save();
  ctx.strokeStyle = a.color || PAPER.ink;
  ctx.fillStyle = a.color || PAPER.ink;
  ctx.lineWidth = 2;
  if (a.dash) ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(...g.p0);
  ctx.bezierCurveTo(...g.c0, ...g.c1, ...g.p1);
  ctx.stroke();
  ctx.setLineDash([]);
  const h = arrowHead(g);
  ctx.beginPath(); ctx.moveTo(...h[0]); ctx.lineTo(...h[1]); ctx.lineTo(...h[2]); ctx.closePath(); ctx.fill();
  if (a.label) {
    ctx.font = `500 13px ${SANS}`;
    const w = ctx.measureText(a.label).width + 12;
    ctx.fillStyle = PAPER.bg;
    ctx.fillRect(g.mid[0] - w / 2, g.mid[1] - 11, w, 22);
    ctx.fillStyle = a.color || PAPER.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.label, g.mid[0], g.mid[1]);
  }
  ctx.restore();
}

// The whole board (or `area` of it) on a new canvas `widthPx` wide.
export async function renderBoardCanvas(data, { widthPx = 1600, maxPx = 4096, area = null, grid = false } = {}) {
  await document.fonts?.ready;
  const measure = document.createElement('canvas').getContext('2d');
  const objs = live(data).map((o) => (o.type === 'card' ? { ...o, h: cardHeight(measure, o) } : o));
  const byId = new Map(objs.map((o) => [o.id, o]));
  const boxOf = (id) => byId.get(id) || null;
  const imgs = new Map();
  for (const o of objs) if (o.type === 'image' && o.fileId) imgs.set(o.fileId, await fileImageReady(o.fileId));
  const b = area || contentBounds({ ...data, objects: objs }, boxOf) || { x: 0, y: 0, w: 800, h: 600 };
  const pad = area ? 0 : 40;
  const box = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  let scale = widthPx / box.w;
  if (box.h * scale > maxPx) scale = maxPx / box.h;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(box.w * scale));
  c.height = Math.max(1, Math.round(box.h * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER.bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  if (grid) {
    ctx.fillStyle = PAPER.dot;
    const step = 24;
    for (let x = Math.floor(box.x / step) * step; x < box.x + box.w; x += step) for (let y = Math.floor(box.y / step) * step; y < box.y + box.h; y += step) ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  }
  for (const o of objs.filter((x) => x.type === 'frame')) drawObject(ctx, o, imgs);
  for (const o of objs.filter((x) => x.type !== 'frame' && x.type !== 'arrow')) drawObject(ctx, o, imgs);
  for (const o of objs.filter((x) => x.type === 'arrow')) drawArrow(ctx, o, boxOf);
  for (const s of data.strokes || []) {
    const d = strokeD(s);
    if (!d) continue;
    ctx.save();
    ctx.fillStyle = s.c;
    ctx.globalAlpha = s.t === 'hl' ? HL.alpha : (PENS[s.pen]?.alpha || 1);
    ctx.fill(new Path2D(d));
    ctx.restore();
  }
  return c;
}
