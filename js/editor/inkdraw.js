// Drawing a handwritten page onto a canvas: paper, background, ink, stickers,
// post-its, tape, photos and text boxes. Used for the live page, thumbnails,
// label previews and PDF export, so they all look the same.

import { getStroke } from '../../vendor/freehand.js';
import { PAGE_W, PAPER_COLORS } from '../model.js';
import { state } from '../vault.js';
import * as V from '../vault.js';
import { stickerDef, stickerSVG, svgImage, labelDef, tapePattern, postitColor } from '../stickers.js';
import { labelMap } from '../model.js';

// ---- Pens -------------------------------------------------------------------------

export const PENS = {
  fountain: { name: 'Fountain', sizes: [2.2, 3.4, 5.2], o: { thinning: 0.62, smoothing: 0.62, streamline: 0.48, start: { taper: 0, cap: true }, end: { taper: 0, cap: true } } },
  ballpoint: { name: 'Ballpoint', sizes: [1.9, 2.8, 4], o: { thinning: 0.18, smoothing: 0.5, streamline: 0.45 } },
  brush: { name: 'Brush', sizes: [3.5, 6, 10], o: { thinning: 0.82, smoothing: 0.65, streamline: 0.5, start: { taper: 18 }, end: { taper: 28 } } },
  pencil: { name: 'Pencil', sizes: [1.8, 2.6, 3.6], alpha: 0.78, o: { thinning: 0.35, smoothing: 0.45, streamline: 0.4 } },
  marker: { name: 'Marker', sizes: [4, 6.5, 10], o: { thinning: 0, smoothing: 0.55, streamline: 0.5 } },
  calligraphy: { name: 'Calligraphy', sizes: [4, 6.5, 10], nib: true },
};
export const HL = { sizes: [12, 18, 26], alpha: 0.36 };
export const mm = (units) => `${(units * 0.21).toFixed(1).replace(/\.0$/, '')} mm`;

export const INK_COLORS = [
  ['Ink black', '#16191D'], ['Navy', '#1B2A38'], ['Chart blue', '#2B5684'], ['Royal blue', '#2E5BD8'], ['Deep teal', '#1C5F6A'], ['Forest', '#2F5D3A'],
  ['Olive', '#556019'], ['Walnut', '#6B4A2E'], ['Oxblood', '#7A2430'], ['Violet', '#5B3E99'], ['Graphite', '#4A4F55'], ['Steel blue', '#4A6E8C'],
  ['Bright blue', '#2F7DE1'], ['Lagoon', '#2A8C9C'], ['Sea green', '#2F8A72'], ['Leaf', '#4F9A3A'], ['Moss', '#7C8A2F'], ['Ochre', '#C0802F'],
  ['Brick', '#B0413E'], ['Plum', '#8C67B0'], ['Slate', '#6B7A85'], ['Sky', '#5AA9E6'], ['Cyan', '#2BB3C0'], ['Mint', '#5FC49A'],
  ['Spring green', '#7BC043'], ['Lime', '#B5C935'], ['Sunflower', '#E0A526'], ['Tangerine', '#E8792B'], ['Coral red', '#E2554B'], ['Rose', '#B8578E'],
  ['White', '#FFFFFF'], ['Mist', '#C9D3DA'], ['Pale blue', '#B9D3F0'], ['Pale mint', '#C2E8D5'], ['Pale yellow', '#F7E6A1'], ['Pale pink', '#F3C1C9'],
];
export const HL_COLORS = [['Yellow', '#F7D046'], ['Green', '#7FD99A'], ['Blue', '#7DB7F0'], ['Pink', '#F29BC0'], ['Orange', '#F5A962'], ['Violet', '#B79BEB']];
export const DEFAULT_FAVS = ['#1B2A38', '#2B5684', '#B0413E', '#2F8A72', '#C0802F', '#8C67B0'];

// ---- Layers -------------------------------------------------------------------------
// Everything on a page sits on a layer: `l` when set, otherwise highlighter
// strokes are on Highlights and everything else on Ink.
export const layerOf = (it) => it.l || (it.t === 'hl' ? 'hl' : 'ink');
export const DEFAULT_LAYERS = [{ id: 'ink', name: 'Ink' }, { id: 'hl', name: 'Highlights' }, { id: 'paper', name: 'Paper', locked: true }];
export function noteLayers(n) {
  const list = Array.isArray(n?.layers) && n.layers.length ? n.layers : DEFAULT_LAYERS;
  const ids = new Set(list.map((l) => l.id));
  return [...list, ...DEFAULT_LAYERS.filter((l) => !ids.has(l.id))];
}
// What to draw for a note: { visible(item), paperHidden }, or {} when nothing is hidden.
export function layerView(n, { forExport = false } = {}) {
  if (forExport && n?.exportAllLayers) return {};
  const hidden = new Set(noteLayers(n).filter((l) => l.hidden).map((l) => l.id));
  if (!hidden.size) return {};
  return { visible: (it) => !hidden.has(layerOf(it)), paperHidden: hidden.has('paper') };
}

// ---- Stroke geometry --------------------------------------------------------------

const pathCache = new WeakMap();

function outlinePath(outline) {
  const p = new Path2D();
  if (!outline.length) return p;
  p.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1];
    const [x1, y1] = outline[i];
    p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  p.closePath();
  return p;
}

export function strokePoints(s) {
  const out = [];
  for (let i = 0; i < s.pts.length; i += 3) out.push([s.pts[i], s.pts[i + 1], s.pts[i + 2]]);
  return out;
}

// Flat-nib calligraphy: sweep a slanted nib along the path.
function nibPath(pts, size) {
  const p = new Path2D();
  const a = (-38 * Math.PI) / 180;
  for (let i = 0; i < pts.length; i++) {
    const [x, y, pr] = pts[i];
    const k = size * (0.55 + 0.7 * (pr || 0.5));
    const nx = Math.cos(a) * k / 2;
    const ny = Math.sin(a) * k / 2;
    const [px, py, pp] = pts[Math.max(0, i - 1)];
    const kp = size * (0.55 + 0.7 * (pp || 0.5));
    const pnx = Math.cos(a) * kp / 2;
    const pny = Math.sin(a) * kp / 2;
    p.moveTo(px - pnx, py - pny);
    p.lineTo(px + pnx, py + pny);
    p.lineTo(x + nx, y + ny);
    p.lineTo(x - nx, y - ny);
    p.closePath();
  }
  if (pts.length === 1) { p.ellipse(pts[0][0], pts[0][1], size / 2, size / 5, a, 0, Math.PI * 2); }
  return p;
}

export function strokePath(s) {
  let p = pathCache.get(s);
  if (p) return p;
  const pts = strokePoints(s);
  if (s.t === 'pen' && PENS[s.pen]?.nib) p = nibPath(pts, s.s);
  else {
    const pen = s.t === 'hl' ? { o: { thinning: 0, smoothing: 0.5, streamline: 0.55 } } : PENS[s.pen] || PENS.fountain;
    const outline = getStroke(pts, { size: s.s, ...pen.o, simulatePressure: !!s.sp && !s.shape, last: true });
    p = outlinePath(outline);
  }
  pathCache.set(s, p);
  return p;
}

export function strokeBox(s) {
  if (s._box) return s._box;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < s.pts.length; i += 3) {
    const x = s.pts[i];
    const y = s.pts[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const r = s.s;
  const box = { x: x0 - r, y: y0 - r, w: x1 - x0 + 2 * r, h: y1 - y0 + 2 * r };
  Object.defineProperty(s, '_box', { value: box, enumerable: false, configurable: true });
  return box;
}

export function drawStroke(ctx, s, fade = 1) {
  ctx.save();
  ctx.fillStyle = s.c;
  ctx.globalAlpha = (s.t === 'hl' ? HL.alpha : (PENS[s.pen]?.alpha || 1)) * fade;
  ctx.fill(strokePath(s), 'nonzero');
  ctx.restore();
}

// ---- Paper --------------------------------------------------------------------------

export const paperColor = (page) => PAPER_COLORS.find((c) => c.id === page.color) || PAPER_COLORS[0];

export function drawPaper(ctx, page, scale, bgImage = null) {
  const h = page.h;
  const pc = paperColor(page);
  ctx.save();
  ctx.fillStyle = pc.bg;
  ctx.fillRect(0, 0, PAGE_W, h);
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, PAGE_W, h);
    ctx.restore();
    return;
  }
  const lw = Math.max(0.9 / scale, 0.8);
  ctx.strokeStyle = pc.line;
  ctx.lineWidth = lw;
  const lines = (gap, top = 120) => {
    ctx.beginPath();
    for (let y = top; y < h - 40; y += gap) { ctx.moveTo(0, y); ctx.lineTo(PAGE_W, y); }
    ctx.stroke();
  };
  if (page.paper === 'ruled' || page.paper === 'cornell') lines(36);
  if (page.paper === 'narrow') lines(28);
  if (page.paper === 'ruled' || page.paper === 'narrow') {
    ctx.strokeStyle = pc.margin;
    ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(110, h); ctx.stroke();
  }
  if (page.paper === 'cornell') {
    ctx.strokeStyle = pc.margin;
    ctx.lineWidth = lw * 1.4;
    ctx.beginPath(); ctx.moveTo(280, 84); ctx.lineTo(280, h - 280); ctx.moveTo(0, h - 280); ctx.lineTo(PAGE_W, h - 280); ctx.moveTo(0, 84); ctx.lineTo(PAGE_W, 84); ctx.stroke();
  }
  if (page.paper === 'grid') {
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let x = 25; x < PAGE_W; x += 25) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 25; y < h; y += 25) { ctx.moveTo(0, y); ctx.lineTo(PAGE_W, y); }
    ctx.stroke();
  }
  if (page.paper === 'dotted') {
    ctx.fillStyle = pc.line;
    const r = Math.max(1.6, 1.3 / scale);
    for (let y = 25; y < h; y += 25) for (let x = 25; x < PAGE_W; x += 25) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); }
  }
  ctx.restore();
}

// ---- Images used on pages -------------------------------------------------------

const fileImgs = new Map();
export function fileImage(fileId, onload) {
  if (!fileId) return null;
  let rec = fileImgs.get(fileId);
  if (!rec) {
    const img = new Image();
    img.decoding = 'async';
    rec = { img, ready: false, waiters: [] };
    fileImgs.set(fileId, rec);
    V.fileURL(fileId).then((u) => {
      if (!u) return;
      img.onload = () => { rec.ready = true; rec.waiters.splice(0).forEach((f) => f()); };
      img.src = u;
    });
  }
  if (rec.ready) return rec.img;
  if (onload) rec.waiters.push(onload);
  return null;
}
export function forgetFileImages() { fileImgs.clear(); }

export async function fileImageReady(fileId) {
  if (!fileId) return null;
  const now = fileImage(fileId);
  if (now) return now;
  return new Promise((res) => {
    const t = setTimeout(() => res(null), 8000);
    fileImage(fileId, () => { clearTimeout(t); res(fileImage(fileId)); });
  });
}

// ---- Objects ---------------------------------------------------------------------

export function drawLabelTag(ctx, label, o) {
  const d = labelDef(label);
  const [, , vw, vh] = d.vb.split(' ').map(Number);
  ctx.save();
  ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
  if (o.rot) ctx.rotate(o.rot);
  ctx.translate(-o.w / 2, -o.h / 2);
  ctx.scale(o.w / vw, o.h / vh);
  const right = vw - 5;
  const path = new Path2D(`M12 3 H${right - 5} a5 5 0 0 1 5 5 V24 a5 5 0 0 1 -5 5 H12 L2 16 Z`);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke(path);
  ctx.fillStyle = label?.color || '#6B7A85';
  ctx.fill(path);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(12, 16, 2.6, 0, 6.3); ctx.fill();
  ctx.font = '700 12.5px Overpass, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label?.name || 'Label', (18 + right) / 2, 20.5);
  ctx.restore();
}

function rotated(ctx, o, fn) {
  ctx.save();
  ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
  if (o.rot) ctx.rotate(o.rot);
  ctx.translate(-o.w / 2, -o.h / 2);
  fn();
  ctx.restore();
}

export function drawObject(ctx, o, { redraw } = {}) {
  if (o.type === 'tape') {
    rotated(ctx, o, () => {
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = tapePattern(ctx, o.key);
      ctx.beginPath();
      // torn ends
      const z = Math.min(6, o.h / 4);
      ctx.moveTo(0, 0);
      for (let x = 0; x < o.w; x += 8) ctx.lineTo(x + 4, (x / 8) % 2 ? 0 : z * 0.4);
      ctx.lineTo(o.w, 0);
      ctx.lineTo(o.w - z * 0.6, o.h / 2);
      ctx.lineTo(o.w, o.h);
      for (let x = o.w; x > 0; x -= 8) ctx.lineTo(x - 4, (x / 8) % 2 ? o.h : o.h - z * 0.4);
      ctx.lineTo(0, o.h);
      ctx.lineTo(z * 0.6, o.h / 2);
      ctx.closePath();
      ctx.fill();
      if (o.key === 'stitch') {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#FFFFFF';
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(6, o.h / 2); ctx.lineTo(o.w - 6, o.h / 2); ctx.stroke();
      }
    });
    return;
  }
  if (o.type === 'image' || o.type === 'mine') {
    const fid = o.type === 'mine' ? (state.config?.myStickers || []).find((m) => m.id === o.mine)?.fileId : o.fileId;
    const img = fileImage(fid, redraw);
    rotated(ctx, o, () => {
      if (img) {
        if (o.type === 'image') {
          ctx.shadowColor = 'rgba(0,0,0,0.12)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
        }
        ctx.drawImage(img, 0, 0, o.w, o.h);
      } else if (o.type === 'image') {
        ctx.fillStyle = '#E1E8E6';
        ctx.fillRect(0, 0, o.w, o.h);
      }
    });
    return;
  }
  if (o.type === 'sticker') {
    const def = stickerDef(o.pack, o.key);
    if (!def) return;
    const img = svgImage(stickerSVG(def), redraw);
    if (img.complete && img.naturalWidth) rotated(ctx, o, () => ctx.drawImage(img, 0, 0, o.w, o.h));
    return;
  }
  if (o.type === 'label') {
    const l = labelMap(state.config).get(o.label) || { name: o.label, color: '#6B7A85' };
    drawLabelTag(ctx, l, o);
    return;
  }
  if (o.type === 'postit') {
    const c = postitColor(o.color);
    if (o.collapsed) {
      rotated(ctx, { ...o, w: 64, h: 64 }, () => {
        ctx.shadowColor = 'rgba(0,0,0,0.16)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.fillStyle = c.bg;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(64, 0); ctx.lineTo(64, 46); ctx.lineTo(46, 64); ctx.lineTo(0, 64); ctx.closePath(); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = c.fold;
        ctx.beginPath(); ctx.moveTo(46, 64); ctx.lineTo(46, 46); ctx.lineTo(64, 46); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1B2A38';
        ctx.font = '700 22px Overpass, system-ui, sans-serif';
        ctx.textAlign = 'center';
        const lines = String(o.text || '').split('\n').filter((l) => l.trim()).length;
        ctx.fillText(lines ? String(lines) : '…', 28, 40);
      });
      return;
    }
    rotated(ctx, o, () => {
      const f = Math.min(34, o.w * 0.18);
      ctx.shadowColor = 'rgba(0,0,0,0.16)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.fillStyle = c.bg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(o.w, 0); ctx.lineTo(o.w, o.h - f); ctx.lineTo(o.w - f, o.h); ctx.lineTo(0, o.h); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = c.fold;
      ctx.beginPath(); ctx.moveTo(o.w - f, o.h); ctx.lineTo(o.w - f, o.h - f); ctx.lineTo(o.w, o.h - f); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1B2A38';
      ctx.font = '400 30px Caveat, cursive';
      ctx.textBaseline = 'alphabetic';
      const lines = wrapPlain(ctx, String(o.text || ''), o.w - 28);
      let y = 40;
      for (const l of lines) { if (y > o.h - 14) break; ctx.fillText(l, 14, y); y += 32; }
    });
    return;
  }
  if (o.type === 'text') {
    ctx.save();
    const h = drawRichText(ctx, o.doc, o.x, o.y, o.w, { size: o.size || 20, font: o.font, redraw });
    ctx.restore();
    if (Math.abs((o.h || 0) - h) > 1) Object.defineProperty(o, '_h', { value: h, configurable: true, enumerable: false });
  }
}

function wrapPlain(ctx, text, width) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// ---- Rich text on canvas (text boxes, typed notes in PDF export) ---------------------

const FONT_CSS = {
  Spectral: "'Spectral', Georgia, serif", Overpass: "'Overpass', system-ui, sans-serif", Fraunces: "'Fraunces', Georgia, serif", Nunito: "'Nunito', system-ui, sans-serif",
  'Atkinson Hyperlegible': "'Atkinson Hyperlegible', system-ui, sans-serif", 'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace", Caveat: "'Caveat', cursive",
};

export function drawRichText(ctx, doc, x, y, width, { size = 20, font = 'Overpass', color = '#1B2A38', redraw } = {}) {
  const base = FONT_CSS[font] || FONT_CSS.Overpass;
  let cy = y;
  const lm = labelMap(state.config);

  const runsOf = (node, style) => {
    const runs = [];
    for (const c of node.content || []) {
      if (c.type === 'text') {
        const m = Object.fromEntries((c.marks || []).map((k) => [k.type, k.attrs || true]));
        runs.push({
          text: c.text,
          bold: style.bold || !!m.bold,
          italic: !!m.italic,
          under: !!m.underline,
          strike: !!m.strike,
          color: m.textStyle?.color || style.color || color,
          hl: m.highlight ? (m.highlight.color || '#FFF1B8') : null,
          size: m.textStyle?.fontSize ? (parseFloat(m.textStyle.fontSize) / 18) * style.size : style.size,
          family: m.textStyle?.fontFamily ? (FONT_CSS[m.textStyle.fontFamily] || base) : style.family,
        });
      } else if (c.type === 'hardBreak') runs.push({ br: true });
      else if (c.type === 'labelChip') runs.push({ label: lm.get(c.attrs?.label) || { name: c.attrs?.label, color: '#6B7A85' }, size: style.size });
      else if (c.type === 'dueDate' && c.attrs?.date) runs.push({ text: `📅 ${new Date(`${c.attrs.date}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, size: style.size * 0.85, color: '#51606C', family: base, bold: true });
      else if (c.type === 'sticker') runs.push({ sticker: c.attrs, size: style.size });
    }
    return runs;
  };

  const fontOf = (r) => `${r.italic ? 'italic ' : ''}${r.bold ? '700' : '400'} ${r.size}px ${r.family || base}`;

  // Lay out runs into wrapped lines and draw them; returns height used.
  const paragraph = (runs, px, pw, { lineH = 1.42 } = {}) => {
    const words = [];
    for (const r of runs) {
      if (r.br) { words.push({ br: true }); continue; }
      if (r.label) {
        const d = labelDef(r.label);
        const h = r.size * 1.25;
        words.push({ label: r.label, w: (d.w / d.h) * h, h, size: r.size });
        continue;
      }
      if (r.sticker) { words.push({ sticker: r.sticker, w: r.size * 1.3, h: r.size * 1.3, size: r.size }); continue; }
      const parts = r.text.split(/(\s+)/);
      for (const p of parts) if (p) words.push({ ...r, text: p });
    }
    const lines = [];
    let line = [];
    let lw = 0;
    let maxSize = runs.find((r) => r.size)?.size || size;
    for (const w of words) {
      if (w.br) { lines.push(line); line = []; lw = 0; continue; }
      let ww;
      if (w.text !== undefined) { ctx.font = fontOf(w); ww = ctx.measureText(w.text).width; } else ww = w.w + 4;
      w.ww = ww;
      if (lw + ww > pw && line.length && !(w.text && !w.text.trim())) { lines.push(line); line = []; lw = 0; if (w.text && !w.text.trim()) continue; }
      line.push(w);
      lw += ww;
    }
    lines.push(line);
    let yy = 0;
    for (const ln of lines) {
      const ls = Math.max(maxSize, ...ln.map((w) => w.size || 0));
      const lh = ls * lineH;
      const baseY = cy + yy + ls * 1.05;
      let xx = px;
      for (const w of ln) {
        if (w.label) {
          drawLabelTag(ctx, w.label, { x: xx, y: baseY - w.h * 0.85, w: w.w, h: w.h });
        } else if (w.sticker) {
          const def = stickerDef(w.sticker.pack, w.sticker.key);
          if (def) { const img = svgImage(stickerSVG(def), redraw); if (img.complete && img.naturalWidth) ctx.drawImage(img, xx, baseY - w.h * 0.85, w.w, w.h); }
        } else {
          ctx.font = fontOf(w);
          if (w.hl) { ctx.fillStyle = w.hl; ctx.fillRect(xx, baseY - w.size * 0.92, w.ww, w.size * 1.18); }
          ctx.fillStyle = w.color;
          ctx.fillText(w.text, xx, baseY);
          if (w.under || w.strike) {
            ctx.fillRect(xx, w.under ? baseY + w.size * 0.12 : baseY - w.size * 0.3, w.ww, Math.max(1, w.size * 0.07));
          }
        }
        xx += w.ww;
      }
      yy += lh;
    }
    return yy;
  };

  const block = (b, px, pw, depth = 0) => {
    const st = { size, family: base, color };
    switch (b.type) {
      case 'paragraph': cy += paragraph(runsOf(b, st), px, pw) + size * 0.25; break;
      case 'heading': {
        const lv = b.attrs?.level || 1;
        const s2 = { ...st, size: size * [0, 1.7, 1.35, 1.12][lv], bold: true, color: lv === 3 ? '#51606C' : color };
        cy += size * 0.3;
        cy += paragraph(runsOf(b, s2), px, pw, { lineH: 1.25 }) + size * 0.2;
        break;
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        let n = b.attrs?.start || 1;
        for (const item of b.content || []) {
          const top = cy;
          const ind = size * 1.3;
          ctx.fillStyle = color;
          if (b.type === 'bulletList') { ctx.beginPath(); ctx.arc(px + size * 0.45, top + size * 0.72, size * (depth ? 0.15 : 0.18), 0, 6.3); if (depth) { ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke(); } else ctx.fill(); }
          if (b.type === 'orderedList') { ctx.font = `600 ${size}px ${base}`; ctx.fillText(`${n++}.`, px, top + size * 1.05); }
          if (b.type === 'taskList') {
            const bx = px + 1; const by = top + size * 0.22; const bs = size * 0.86;
            ctx.strokeStyle = '#51606C'; ctx.lineWidth = 1.6; ctx.strokeRect(bx, by, bs, bs);
            if (item.attrs?.checked) { ctx.strokeStyle = '#2F8A72'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(bx + bs * 0.2, by + bs * 0.55); ctx.lineTo(bx + bs * 0.42, by + bs * 0.78); ctx.lineTo(bx + bs * 0.82, by + bs * 0.25); ctx.stroke(); }
          }
          for (const c of item.content || []) {
            if (c.type === 'paragraph' && item.attrs?.checked) {
              const before = cy;
              cy += paragraph(runsOf(c, { ...st, color: '#8A96A1' }), px + ind, pw - ind) + size * 0.15;
              void before;
            } else block(c, px + ind, pw - ind, depth + 1);
          }
          if (cy === top) cy += size * 1.4;
        }
        break;
      }
      case 'blockquote': {
        const top = cy;
        for (const c of b.content || []) block(c, px + size * 0.9, pw - size * 0.9, depth);
        ctx.fillStyle = '#CDD9D6'; ctx.fillRect(px + 2, top + 2, 3, cy - top - 6);
        break;
      }
      case 'callout':
      case 'postit': {
        const top = cy;
        const pad = size * 0.6;
        const l = b.type === 'callout' ? (lm.get(b.attrs?.label) || { name: b.attrs?.label, color: '#B0413E' }) : null;
        cy += pad + (l ? size * 1.5 : 0);
        for (const c of b.content || []) block(c, px + pad, pw - pad * 2, depth);
        cy += pad * 0.6;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = b.type === 'postit' ? postitColor(b.attrs?.color).bg : `${l.color}1A`;
        ctx.fillRect(px, top, pw, cy - top);
        ctx.restore();
        if (l) {
          ctx.fillStyle = l.color; ctx.fillRect(px, top, 4, cy - top);
          const d = labelDef(l); const h = size * 1.2;
          drawLabelTag(ctx, l, { x: px + pad, y: top + pad * 0.6, w: (d.w / d.h) * h, h });
        }
        cy += size * 0.4;
        break;
      }
      case 'horizontalRule': ctx.fillStyle = '#CDD9D6'; ctx.fillRect(px, cy + size * 0.5, pw, 1.5); cy += size * 1.1; break;
      case 'table': {
        const rows = b.content || [];
        const cols = Math.max(1, ...rows.map((r) => (r.content || []).length));
        const cw = pw / cols;
        for (const r of rows) {
          const top = cy;
          let rowH = 0;
          (r.content || []).forEach((cell, ci) => {
            const save = cy;
            cy = top + size * 0.35;
            const head = cell.type === 'tableHeader';
            for (const p of cell.content || []) cy += paragraph(runsOf(p, { ...st, bold: head, size: size * 0.92 }), px + ci * cw + size * 0.4, cw - size * 0.8);
            rowH = Math.max(rowH, cy - top + size * 0.35);
            cy = save;
          });
          (r.content || []).forEach((cell, ci) => {
            const bg = cell.attrs?.background || (cell.type === 'tableHeader' ? '#EEF2F1' : null);
            if (bg) { ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bg; ctx.fillRect(px + ci * cw, top, cw, rowH); ctx.restore(); }
            ctx.strokeStyle = '#CDD9D6'; ctx.lineWidth = 1; ctx.strokeRect(px + ci * cw, top, cw, rowH);
          });
          cy = top + rowH;
        }
        cy += size * 0.5;
        break;
      }
      case 'codeBlock': cy += paragraph([{ text: (b.content || []).map((t) => t.text).join(''), size: size * 0.85, family: FONT_CSS['JetBrains Mono'], color }], px, pw) + size * 0.3; break;
      case 'imageFile': {
        const img = fileImage(b.attrs?.fileId, redraw);
        const w = Math.min(pw, (b.attrs?.w || 800) / 2);
        const h = w * ((b.attrs?.h || 600) / (b.attrs?.w || 800));
        if (img) ctx.drawImage(img, px, cy, w, h); else { ctx.fillStyle = '#E1E8E6'; ctx.fillRect(px, cy, w, h); }
        cy += h + size * 0.5;
        break;
      }
      default: for (const c of b.content || []) block(c, px, pw, depth);
    }
  };

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const b of doc?.content || []) block(b, x, width);
  return Math.max(size * 1.4, cy - y);
}

// ---- The whole page ---------------------------------------------------------------

const ORDER = { image: 0, tape: 1, text: 3, sticker: 4, label: 4, mine: 4, postit: 5 };

// `dim(item)` fades items (used when replaying with audio); `visible(item)`
// hides whole layers.
export function drawContent(ctx, data, { redraw, skip = null, hidden = null, dim = null, visible = null } = {}) {
  const objs = [...(data.objects || [])].sort((a, b) => (ORDER[a.type] ?? 4) - (ORDER[b.type] ?? 4));
  const show = (o) => !(skip && skip.has(o.id)) && (!visible || visible(o));
  const fade = (x) => (dim && dim(x) ? 0.16 : 1);
  const obj = (o) => {
    const f = fade(o);
    if (f === 1) { drawObject(ctx, o, { redraw }); return; }
    ctx.save(); ctx.globalAlpha = f; drawObject(ctx, o, { redraw }); ctx.restore();
  };
  const ok = (s) => !hidden?.has(s.id) && (!visible || visible(s));
  for (const o of objs) if ((ORDER[o.type] ?? 4) < 2 && show(o)) obj(o);
  for (const s of data.strokes || []) if (s.t === 'hl' && ok(s)) drawStroke(ctx, s, fade(s));
  for (const s of data.strokes || []) if (s.t !== 'hl' && ok(s)) drawStroke(ctx, s, fade(s));
  for (const o of objs) if ((ORDER[o.type] ?? 4) >= 2 && show(o)) obj(o);
}

// Render a page to a new canvas at a given pixel width (thumbnails, export, crops).
export async function renderPageCanvas(page, data, widthPx, { crop = null, visible = null, paperHidden = false } = {}) {
  if (paperHidden) page = { ...page, paper: 'blank', bg: null };
  const bg = page.bg ? await fileImageReady(page.bg) : null;
  for (const o of data.objects || []) {
    if (o.type === 'image') await fileImageReady(o.fileId);
    if (o.type === 'mine') await fileImageReady((state.config?.myStickers || []).find((m) => m.id === o.mine)?.fileId);
  }
  await document.fonts?.ready;
  const area = crop || { x: 0, y: 0, w: PAGE_W, h: page.h };
  const scale = widthPx / area.w;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(area.w * scale));
  c.height = Math.max(1, Math.round(area.h * scale));
  const ctx = c.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
  drawPaper(ctx, page, scale, bg);
  // stickers drawn from SVG need to be decoded first
  await Promise.all((data.objects || []).filter((o) => o.type === 'sticker').map((o) => new Promise((res) => {
    const def = stickerDef(o.pack, o.key);
    if (!def) return res();
    const img = svgImage(stickerSVG(def));
    if (img.complete && img.naturalWidth) res(); else { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); setTimeout(res, 1500); }
  })));
  drawContent(ctx, data, { visible });
  return c;
}
