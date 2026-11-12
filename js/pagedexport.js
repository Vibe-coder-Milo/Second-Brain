// PDF pictures of a typed note shown as A4 pages (Scroll down or Next page).
// The pages are laid out like the note on an iPad or computer screen: the
// same proportions (the screen's page scaled to A4), the same rule for what
// goes on the next page (`flow` in editor/pages.js) and a new page at each
// page break, so the PDF has the pages you see. Endless notes don't come
// here (export.js lays them out as before).

import { state } from './vault.js';
import { displayTitle, PAGE_W, A4_H } from './model.js';
import { NOTE_FONT, TEXT_SIZE } from './fonts.js';
import { flow, unitsOfJson, REF_W, MARGIN } from './editor/pages.js';

// Space above a block on screen (CSS), in text sizes: between blocks, before
// headings (their own size times their margin), between list items.
const GAP = 0.55;
const HEAD_GAP = [0, 1.42, 1.25, 0.89];
const ITEM_GAP = 0.24;

export async function pagedCanvases(n, { px = 1240 } = {}) {
  const { drawRichText, fileImageReady, setInkTone } = await import('./editor/inkdraw.js');
  const { noteDoc } = await import('./editor/rich.js');
  const doc = noteDoc(n);
  const u = PAGE_W / REF_W; // page units per screen pixel
  const M = Math.max(16, Math.round(REF_W * MARGIN)) * u;
  const width = PAGE_W - 2 * M;
  const dt = state.config?.text || {};
  const sizePx = dt.size || TEXT_SIZE;
  const size = sizePx * u;
  const fontId = n.font || dt.font || NOTE_FONT;
  const opts = { size, font: fontId, color: dt.color || undefined, lineH: 1.55, gap: 0 };
  // Pictures first, so they're ready when drawn.
  const imgs = [];
  for (const f of n.files) imgs.push({ f, img: await fileImageReady(f.id) });
  const walkImgs = async (node) => { if (node?.type === 'imageFile') await fileImageReady(node.attrs?.fileId); for (const c of node?.content || []) await walkImgs(c); };
  await walkImgs(doc);
  await document.fonts?.ready;
  const probe = document.createElement('canvas').getContext('2d');

  // The title (below the line with the region and date on screen) and pictures.
  const title = displayTitle(n);
  const titleFont = `500 ${30 * u}px 'Spectral', Georgia, serif`;
  probe.font = titleFont;
  const titleLines = [];
  let line = '';
  for (const w of title.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (probe.measureText(t).width > width && line) { titleLines.push(line); line = w; } else line = t;
  }
  titleLines.push(line);
  let y = M + 28 * u;
  const titleTop = y;
  y += titleLines.length * 36 * u + 22 * u;
  const figs = [];
  for (const { f, img } of imgs) {
    if (!img) continue;
    const iw = f.w || img.naturalWidth || img.width;
    const ih = f.h || img.naturalHeight || img.height;
    const h = Math.min(574 * u, (width * ih) / iw);
    const w = Math.min(width, (h * iw) / ih);
    figs.push({ img, y, w, h });
    y += h + 14 * u;
  }
  if (figs.length) y += 8 * u;

  // Each block (and each list item) on its own, with its height.
  setInkTone(false);
  const units = unitsOfJson(doc).map(({ node, list, index }) => {
    const one = list ? { type: 'doc', content: [{ ...list, attrs: { ...(list.attrs || {}), start: (list.attrs?.start || 1) + index }, content: [node] }] } : { type: 'doc', content: [node] };
    const kind = node.type === 'pageBreak' ? 'break' : node.type === 'heading' ? 'heading' : 'block';
    const h = kind === 'break' ? 0 : drawRichText(probe, one, M, 0, width, opts);
    const before = kind === 'heading' ? Math.max(0, HEAD_GAP[node.attrs?.level || 1] - 0.3) : list && index ? ITEM_GAP : GAP;
    return { one, kind, h, before };
  });
  const items = [];
  units.forEach((x, i) => {
    if (i) y += x.before * size;
    items.push({ top: y, h: x.h, kind: x.kind });
    y += x.h;
  });
  const lay = flow(items, { H: A4_H, P: M, G: 0, first: y });
  units.forEach((x, i) => { x.at = lay.at[i]; });

  // Draw page by page.
  const k = px / PAGE_W;
  const out = [];
  for (let s = 0; s < lay.count; s++) {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.round(A4_H * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, -s * A4_H * k);
    const from = s * A4_H;
    const to = from + A4_H;
    if (s === 0) {
      ctx.fillStyle = '#1B2A38';
      ctx.font = titleFont;
      ctx.textBaseline = 'alphabetic';
      titleLines.forEach((t, i) => ctx.fillText(t, M, titleTop + i * 36 * u + 30 * u * 0.95));
    }
    for (const f of figs) if (f.y < to && f.y + f.h > from) ctx.drawImage(f.img, M, f.y, f.w, f.h);
    for (const x of units) {
      if (x.kind === 'break' || x.at >= to || x.at + x.h <= from) continue;
      drawRichText(ctx, x.one, M, x.at, width, opts);
    }
    ctx.restore();
    c.range = [s, s + 1, lay.count];
    out.push(c);
  }
  return out;
}
