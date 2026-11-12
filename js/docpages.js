// Turns a Word file, a PowerPoint file or a picture into the pages of a
// handwritten note, so you can write and highlight on it like on an imported
// PDF. Everything happens on the device. Each page becomes a stored
// background picture (an encrypted JPEG, like a PDF page's picture), and the
// words are collected for search.
//
//   documentPages(file, { sealed, onProgress }) ->
//     { kind, title, pages, sections, text, warnings }
//     kind      'docx' | 'pptx' | 'image'
//     pages     ready-made page objects (same shape as a PDF page without a
//               kept original): { id, paper: 'blank', bg: <file id>, h, ... }
//     sections  [{ title, level, page }]  page = 0-based index into pages
//     text      plain words of the document, for search
//     warnings  plain-English notes about things that couldn't be shown
//   A PDF is not handled here: this throws "Use the PDF importer" (js/pdf.js).
//
// Word files are laid out with the same text engine as typed notes (so they
// look like the app's own pages, close to the original, not exact), on A4
// pages. Slides become one page each in the slide's own shape. One page is
// drawn at a time and let go straight away, so a long deck stays light.

import * as V from './vault.js';
import { state } from './vault.js';
import { newPage, PAGE_W, A4_H } from './model.js';
import { documentKind, readDocx, readPptx } from './docread.js';
import { fileTitle } from './docintake.js';
import { fontCss, NOTE_FONT, TEXT_SIZE, boxSize } from './fonts.js';

const WORD_PX = 1654; // Word page picture width (about 200 dpi on A4)
const SLIDE_PX = 2000; // slide picture width
const QUALITY = 0.85;
const M = 80; // page margin in page units (same as typed-note export)
const PAGE_GROUP = 8; // lay out at most about this many pages at once
const UNITS_PER_PX = PAGE_W / (8.27 * 96); // a Word picture's CSS pixels -> page units
const INK = '#1B2A38';


const toJpeg = async (canvas) => {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('Couldn’t make the pages for that file.');
  return new Uint8Array(await blob.arrayBuffer());
};
const freeCanvas = (c) => { c.width = 0; c.height = 0; };

export async function documentPages(file, { sealed = false, onProgress } = {}) {
  const kind = documentKind(file);
  if (kind === 'pdf') throw new Error('Use the PDF importer');
  if (!kind) throw new Error('That kind of file can’t be opened here. Try a Word or PowerPoint file (.docx, .pptx), a PDF or a picture.');
  if (kind === 'image') return imagePages(file, { sealed, onProgress });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === 'docx') return wordPages(file, await readDocx(bytes), { sealed, onProgress });
  return slidePages(file, await readPptx(bytes), { sealed, onProgress });
}

// ---- Pictures -----------------------------------------------------------------------

async function imagePages(file, { sealed, onProgress }) {
  const { compressImage } = await import('./images.js');
  onProgress?.(0, 1);
  let img;
  try { img = await compressImage(file, { max: 2200, quality: QUALITY }); } catch { throw new Error('Couldn’t open that picture.'); }
  const bg = await V.addFile(img.bytes, { sealed, type: 'image/jpeg' });
  onProgress?.(1, 1);
  return {
    kind: 'image', title: fileTitle(file.name) || 'Picture', sections: [], text: '', warnings: [],
    pages: [newPage({ paper: 'blank', bg, h: Math.round((1000 * img.h) / img.w) })],
  };
}

// ---- Word ---------------------------------------------------------------------------

const docText = (doc) => {
  const out = [];
  const inline = (n) => (n.type === 'text' ? n.text || '' : n.type === 'hardBreak' ? '\n' : (n.content || []).map(inline).join(''));
  const walk = (n) => {
    if (n.type === 'paragraph' || n.type === 'heading') { const t = inline(n).trim(); if (t) out.push(t); return; }
    if (n.type === 'tableRow') { const cells = (n.content || []).map((c) => (c.content || []).map(inline).join(' ').trim()).filter(Boolean); if (cells.length) out.push(cells.join('  ')); return; }
    (n.content || []).forEach(walk);
  };
  (doc.content || []).forEach(walk);
  return out.join('\n');
};

async function wordPages(file, r, { sealed, onProgress }) {
  const { typedPages } = await import('./export.js');
  const { drawRichText, setInkTone } = await import('./editor/inkdraw.js');
  const warnings = [...r.warnings];
  const content = r.doc.content || [];

  // Pictures go in as short-lived stored files, so the text engine can draw
  // them; they are removed again at the end.
  const temp = [];
  const ids = {};
  const info = {};
  for (const im of r.images) {
    try { ids[im.id] = await V.addFile(im.bytes, { sealed, type: im.type }); temp.push(ids[im.id]); info[im.id] = im; } catch { /* left out */ }
  }
  const fix = (n) => {
    if (n.type === 'imageFile') {
      const id = n.attrs?.fileId;
      if (!ids[id]) return null;
      // drawRichText shows w/2 page units: give it twice the size we want.
      let w = (n.attrs.w || info[id].w || 400) * UNITS_PER_PX;
      let h = (n.attrs.h || info[id].h || 300) * UNITS_PER_PX;
      const k = Math.min(1, (PAGE_W - M * 2) / w, 1000 / h);
      n.attrs = { ...n.attrs, fileId: ids[id], w: Math.round(w * k * 2), h: Math.round(h * k * 2) };
      return n;
    }
    if (n.content) n.content = n.content.map(fix).filter(Boolean);
    return n;
  };

  try {
    // Keep each block's place in the original list: readDocx's sections point there.
    const entries = content.map((b, i) => ({ i, b: b.type === 'pageBreak' ? b : fix(structuredClone(b)) })).filter((e) => e.b);
    const blocks = entries.map((e) => e.b);
    // Text settings the typed-note export uses.
    const dt = state.config?.text || {};
    const opts = { size: boxSize(dt.size || TEXT_SIZE), font: dt.font || NOTE_FONT, color: dt.color || undefined };
    await document.fonts?.ready;
    const probe = document.createElement('canvas').getContext('2d');
    setInkTone(false);
    const heights = blocks.map((b) => (b.type === 'pageBreak' ? 0 : drawRichText(probe, { type: 'doc', content: [b] }, M, 0, PAGE_W - M * 2, opts)));

    // Groups of blocks: a page break starts a new group; long stretches are cut
    // into groups of a few pages, to keep memory down.
    const groups = [];
    let cur = null;
    const open = () => { cur = { orig: [], blocks: [], y: [], h: 0 }; groups.push(cur); };
    blocks.forEach((b, i) => {
      if (b.type === 'pageBreak') { cur = null; return; }
      if (cur && cur.blocks.length && cur.h + heights[i] > PAGE_GROUP * (A4_H - M * 2)) cur = null;
      if (!cur) open();
      cur.orig.push(entries[i].i);
      cur.y.push(cur.h);
      cur.blocks.push(b);
      cur.h += heights[i];
    });
    // Leave out groups that hold nothing but empty lines.
    const hasText = (g) => g.blocks.some((b) => b.type !== 'paragraph' || (b.content || []).length);
    const used = groups.filter(hasText);
    if (!used.length) throw new Error('That Word file has nothing in it to show.');

    const pages = [];
    const where = new Map(); // block index -> page index
    for (const g of used) {
      onProgress?.(pages.length, pages.length + 1);
      const canvases = await typedPages({ doc: { type: 'doc', content: g.blocks }, files: [], font: null, title: '' }, { px: WORD_PX, heading: false });
      // The layout adds a bottom margin; when that alone spills onto a new page, drop that empty page.
      if (canvases.length > 1) { const c = canvases[canvases.length - 1]; if (c.range[1] - c.range[0] <= M + 1) freeCanvas(canvases.pop()); }
      const first = pages.length;
      g.blocks.forEach((b, j) => {
        const y = M + g.y[j] + 0.5;
        let p = canvases.findIndex((c) => y >= c.range[0] && y < c.range[1]);
        if (p < 0) p = canvases.length - 1;
        where.set(g.orig[j], first + p);
      });
      for (const c of canvases) {
        const jpg = await toJpeg(c);
        freeCanvas(c);
        const bg = await V.addFile(jpg, { sealed, type: 'image/jpeg' });
        pages.push(newPage({ paper: 'blank', bg, h: A4_H }));
      }
    }
    onProgress?.(pages.length, pages.length);

    // Headings: the page each one landed on. The title style of a document is
    // the note's name, so it isn't listed as a section.
    const sections = [];
    for (const s of r.sections) {
      const p = where.get(s.block);
      if (!s.isTitle && p != null) sections.push({ title: s.title, level: s.level, page: p });
    }
    return { kind: 'docx', title: r.title || fileTitle(file.name) || 'Word document', pages, sections, text: docText({ content }).slice(0, 200000), warnings };
  } finally {
    for (const id of temp) { try { await V.deleteFile(id); } catch { /* already gone */ } }
  }
}

// ---- PowerPoint ---------------------------------------------------------------------

const luminance = (hex) => {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

async function slidePages(file, r, { sealed, onProgress }) {
  const warnings = [...r.warnings];
  if (!r.slides.length) throw new Error('That PowerPoint file has no slides.');
  const W = SLIDE_PX;
  const H = Math.round((W * r.height) / r.width);
  const pxPerPt = W / (r.width / 12700);
  const sans = fontCss('Overpass');
  const imgById = new Map(r.images.map((i) => [i.id, i]));
  await Promise.all(['400', '700'].flatMap((w) => ['normal', 'italic'].map((s) => document.fonts?.load(`${s} ${w} 24px Overpass`).catch(() => null))));
  await document.fonts?.ready;

  const pages = [];
  const texts = [];
  for (const [si, slide] of r.slides.entries()) {
    onProgress?.(si, r.slides.length);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const bgColor = slide.background || '#FFFFFF';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);
    const dark = luminance(bgColor) < 0.5;
    const inkColor = dark ? '#FFFFFF' : INK;
    const words = [];
    for (const sh of slide.shapes) {
      const bx = sh.x * W, by = sh.y * H, bw = sh.w * W, bh = sh.h * H;
      if (sh.type === 'picture') {
        const im = imgById.get(sh.imageId);
        if (!im) continue;
        let bmp = null;
        try { bmp = await createImageBitmap(new Blob([im.bytes], { type: im.type })); } catch { warnings.push(`A picture on slide ${si + 1} couldn’t be opened.`); }
        if (!bmp) continue;
        const k = Math.min(bw / bmp.width, bh / bmp.height);
        const dw = bmp.width * k, dh = bmp.height * k;
        ctx.drawImage(bmp, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
        bmp.close?.();
      } else if (sh.type === 'text') {
        drawSlideText(ctx, sh, bx, by, bw, bh, { pxPerPt, sans, inkColor });
        for (const p of sh.paragraphs) words.push(p.runs.map((x) => x.text).join(''));
      } else if (sh.type === 'table') {
        drawSlideTable(ctx, sh.rows, bx, by, bw, bh, { pxPerPt, sans, inkColor, dark });
        for (const row of sh.rows) words.push(row.filter(Boolean).join('  '));
      }
    }
    const jpg = await toJpeg(canvas);
    freeCanvas(canvas);
    const bg = await V.addFile(jpg, { sealed, type: 'image/jpeg' });
    pages.push(newPage({ paper: 'blank', bg, h: Math.round((1000 * r.height) / r.width) }));
    const head = `Slide ${si + 1}: ${words.join(' ').replace(/\s+/g, ' ').trim()}`;
    texts.push(slide.notes ? `${head} Notes: ${slide.notes.replace(/\s+/g, ' ').trim()}` : head);
  }
  onProgress?.(r.slides.length, r.slides.length);

  const slideTitle = (s, i) => s.title || `Slide ${i + 1}`;
  const sections = [];
  if (r.sections.some((s) => s.slides.length)) {
    const starts = new Map(r.sections.filter((s) => s.slides.length).map((s) => [Math.min(...s.slides), s.name || 'Section']));
    r.slides.forEach((s, i) => {
      if (starts.has(i)) sections.push({ title: starts.get(i), level: 1, page: i });
      sections.push({ title: slideTitle(s, i), level: 2, page: i });
    });
  } else r.slides.forEach((s, i) => sections.push({ title: slideTitle(s, i), level: 1, page: i }));
  return { kind: 'pptx', title: r.title || fileTitle(file.name) || 'Presentation', pages, sections, text: texts.join('\n\n').slice(0, 200000), warnings };
}

// Words of a paragraph with their fonts, wrapped to a width. Returns lines of
// { words: [{ t, font, color, under, w }], width }.
function wrapRuns(ctx, runs, avail, px, sans, inkColor, forceBold) {
  const lines = [];
  let line = { words: [], width: 0 };
  const push = () => { if (line.words.length) lines.push(line); line = { words: [], width: 0 }; };
  for (const r of runs) {
    const size = (r.size || 18) * px;
    const font = `${r.italic ? 'italic ' : ''}${r.bold || forceBold ? '700' : '400'} ${size}px ${sans}`;
    ctx.font = font;
    const parts = r.text.split(/(\n|\s+)/).filter((s) => s !== '');
    for (const t of parts) {
      if (t === '\n') { push(); line.size = size; continue; }
      const isSpace = /^\s+$/.test(t);
      const w = ctx.measureText(t).width;
      if (!isSpace && line.width + w > avail && line.words.length) {
        // Drop a trailing space before wrapping.
        while (line.words.length && line.words[line.words.length - 1].space) line.width -= line.words.pop().w;
        push();
      }
      if (isSpace && !line.words.length) continue;
      line.words.push({ t, font, space: isSpace, color: r.color || inkColor, under: r.underline, w });
      line.width += w;
      line.size = Math.max(line.size || 0, size);
    }
  }
  while (line.words.length && line.words[line.words.length - 1].space) line.width -= line.words.pop().w;
  push();
  return lines;
}

function drawSlideText(ctx, sh, bx, by, bw, bh, { pxPerPt, sans, inkColor }) {
  const inset = 7.2 * pxPerPt;
  const layout = (scale) => {
    const px = pxPerPt * scale;
    let y = 0;
    const out = [];
    for (const p of sh.paragraphs) {
      const indent = p.level * 18 * px + (p.bullet ? 18 * px : 0);
      const lines = wrapRuns(ctx, p.runs.length ? p.runs : [{ text: ' ', size: 18 }], Math.max(40, bw - inset * 2 - indent), px, sans, inkColor, sh.isTitle);
      const gap = (p.bullet ? 0.35 : 0.15) * (p.runs[0]?.size || 18) * px;
      for (const [li, l] of lines.entries()) {
        const lh = (l.size || 18 * px) * 1.2;
        out.push({ l, y: y + (l.size || 18 * px) * 0.95, indent, align: p.align, bullet: p.bullet && li === 0, size: l.size || 18 * px });
        y += lh;
      }
      y += gap;
    }
    return { out, height: y };
  };
  // Text that is longer than its box is made a little smaller, down to 60%.
  let scale = 1;
  let res = layout(scale);
  while (res.height > bh - inset && scale > 0.6) { scale -= 0.05; res = layout(scale); }
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  for (const { l, y, indent, align, bullet, size } of res.out) {
    const avail = bw - inset * 2 - indent;
    let x = bx + inset + indent;
    if (align === 'center') x += (avail - l.width) / 2; else if (align === 'right') x += avail - l.width;
    const baseY = by + inset / 2 + y;
    if (bullet) {
      ctx.fillStyle = l.words[0]?.color || inkColor;
      ctx.beginPath();
      ctx.arc(bx + inset + indent - size * 0.7, baseY - size * 0.3, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const w of l.words) {
      ctx.font = w.font;
      ctx.fillStyle = w.color;
      ctx.fillText(w.t, x, baseY);
      if (w.under && !w.space) { ctx.fillRect(x, baseY + size * 0.1, w.w, Math.max(1, size * 0.05)); }
      x += w.w;
    }
  }
  ctx.restore();
}

function drawSlideTable(ctx, rows, bx, by, bw, bh, { pxPerPt, sans, inkColor, dark }) {
  if (!rows.length) return;
  const cols = Math.max(...rows.map((r) => r.length));
  const cw = bw / cols;
  // Rows are as tall as their text needs, but not less than the box shares out.
  const px = pxPerPt;
  const pad = 5 * px;
  const size = 14;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const grid = dark ? 'rgba(255,255,255,0.45)' : '#9AA7B2';
  let y = by;
  const minH = Math.min(bh / rows.length, 40 * px);
  rows.forEach((row, ri) => {
    const bold = ri === 0;
    const cells = [];
    for (let c = 0; c < cols; c++) cells.push(wrapRuns(ctx, [{ text: row[c] || '', size, bold }], cw - pad * 2, px, sans, inkColor, false));
    const rh = Math.max(minH, ...cells.map((ls) => ls.length * size * px * 1.25 + pad * 2));
    for (let c = 0; c < cols; c++) {
      const x = bx + c * cw;
      if (ri === 0) { ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : '#E6EDF3'; ctx.fillRect(x, y, cw, rh); }
      ctx.strokeStyle = grid;
      ctx.lineWidth = Math.max(1, px * 0.75);
      ctx.strokeRect(x, y, cw, rh);
      cells[c].forEach((l, li) => {
        let tx = x + pad;
        const ty = y + pad + size * px * (0.95 + li * 1.25);
        for (const w of l.words) { ctx.font = w.font; ctx.fillStyle = w.color; ctx.fillText(w.t, tx, ty); tx += w.w; }
      });
    }
    y += rh;
  });
  ctx.restore();
}
