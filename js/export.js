// Getting your notes out: Markdown (one note, a notebook, or everything, with
// images and handwritten pages as files) and PDF (handwritten notes, typed
// notes and whole notebooks, with the cover first).

import { state, notesIn } from './vault.js';
import * as V from './vault.js';
import { displayTitle, PAGE_W, A4_H } from './model.js';
import { downloadBlob, toast } from './util.js';
import { NOTE_FONT, TEXT_SIZE, boxSize, fontIdsIn, loadFonts } from './fonts.js';

export const safeName = (s) => String(s || 'note').replace(/[\\/:*?"<>|#^[\]\n\r]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'note';
const isoDate = (ts) => new Date(ts).toISOString().slice(0, 10);
const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const extFor = (type) => (/png/.test(type || '') ? 'png' : /webp/.test(type || '') ? 'webp' : 'jpg');

// ---- Markdown ---------------------------------------------------------------------

export function noteToMarkdown(n, { images = [] } = {}) {
  const region = state.config.regions.find((r) => r.id === n.region);
  const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
  const sec = nb?.sections.find((s) => s.id === n.section);
  const fm = ['---', `title: ${yamlStr(displayTitle(n))}`, `created: ${new Date(n.createdAt).toISOString()}`, `updated: ${new Date(n.updatedAt).toISOString()}`];
  if (region && !n.inbox) fm.push(`region: ${yamlStr(region.name)}`);
  if (n.inbox) fm.push('inbox: true');
  if (nb) fm.push(`notebook: ${yamlStr(nb.title)}`);
  if (sec && nb.sections.length > 1) fm.push(`section: ${yamlStr(sec.name)}`);
  if (n.kind === 'ink') fm.push('handwritten: true');
  if (n.kind === 'board') fm.push('whiteboard: true');
  if (n.daily) fm.push(`daily: ${n.daily}`);
  if (n.tags.length) fm.push(`tags: [${n.tags.map(yamlStr).join(', ')}]`);
  if (n.url) fm.push(`url: ${yamlStr(n.url)}`);
  fm.push('---', '');
  const parts = [fm.join('\n'), `# ${displayTitle(n)}`];
  if (images.length) parts.push(images.map((p, i) => `![${n.kind === 'ink' ? `Page ${i + 1}` : n.kind === 'board' ? 'The board' : `Image ${i + 1}`}](${p})`).join('\n\n'));
  if (n.body.trim()) parts.push(n.body.trim());
  const ocr = n.files.filter((f) => f.ocr?.trim());
  if (ocr.length) parts.push(`## Text from images\n\n${ocr.map((f) => f.ocr.trim()).join('\n\n')}`);
  const links = n.links.map((id) => state.notes.get(id)).filter(Boolean);
  if (links.length) parts.push(`## Links\n\n${links.map((o) => `- [[${displayTitle(o)}]]`).join('\n')}`);
  const parent = n.parent ? state.notes.get(n.parent) : null;
  if (parent) parts.push(`Part of [[${displayTitle(parent)}]]`);
  return `${parts.join('\n\n').trim()}\n`;
}

async function pngOfPage(page, n = null) {
  const { renderPageCanvas, layerView } = await import('./editor/inkdraw.js');
  const data = await V.loadPage(page.id);
  // Long pages get narrower pictures, so they stay within what phones can draw.
  const width = Math.min(1200, Math.floor(Math.sqrt((12e6 * 1000) / Math.max(1, page.h))));
  const c = await renderPageCanvas(page, data, width, layerView(n, { forExport: true }));
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// Build a zip of notes. `place(n)` returns the folder for a note.
async function zipNotes(list, place, name) {
  const { zipSync, strToU8 } = await import('../vendor/fflate.min.js');
  const out = {};
  const used = new Set();
  const unique = (p) => { let x = p; let i = 2; while (used.has(x.toLowerCase())) x = p.replace(/(\.\w+)$/, ` ${i++}$1`); used.add(x.toLowerCase()); return x; };
  let done = 0;
  for (const n of list) {
    const folder = place(n);
    const images = [];
    try {
      for (const f of n.files) {
        const b = await V.fileBytes(f.id);
        if (!b) continue;
        const p = unique(`attachments/${f.id}.${extFor(f.type)}`);
        out[p] = b.bytes || b;
        images.push(`${'../'.repeat(folder.split('/').filter(Boolean).length)}${p}`);
      }
      if (n.kind === 'board' && n.pages[0]) {
        const { renderBoardCanvas } = await import('./boarddraw.js');
        const c = await renderBoardCanvas(await V.loadPage(n.pages[0].id), { widthPx: 1800 });
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const p = unique(`attachments/${safeName(displayTitle(n))}.png`);
        out[p] = new Uint8Array(await blob.arrayBuffer());
        images.push(`${'../'.repeat(folder.split('/').filter(Boolean).length)}${encodeURI(p)}`);
      }
      if (n.kind === 'ink') {
        for (const [i, pg] of n.pages.entries()) {
          const p = unique(`attachments/${safeName(displayTitle(n))} page ${i + 1}.png`);
          out[p] = await pngOfPage(pg, n);
          images.push(`${'../'.repeat(folder.split('/').filter(Boolean).length)}${encodeURI(p)}`);
        }
      }
    } catch (e) { console.warn('export images', n.id, e); }
    const file = unique(`${folder}${folder ? '/' : ''}${n.daily ? n.daily : safeName(displayTitle(n))}.md`);
    out[file] = strToU8(noteToMarkdown(n, { images }));
    done++;
    if (done % 20 === 0) toast(`Exported ${done} of ${list.length}…`);
  }
  out['README.md'] = strToU8(`# ${name}\n\nExported from Second brain on ${new Date().toLocaleString()}.\n\nEach note is a Markdown file. Links between notes use [[Title]], which Obsidian and similar apps understand. Images and handwritten pages are in attachments/.\n`);
  const zip = zipSync(out, { level: 6 });
  return new Blob([zip], { type: 'application/zip' });
}

export async function exportAllMarkdown() {
  const list = [...state.notes.values()];
  const place = (n) => {
    if (n.daily) return 'Daily notes';
    const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
    if (nb) {
      const sec = nb.sections.find((s) => s.id === n.section);
      return `Notebooks/${safeName(nb.title)}${sec && nb.sections.length > 1 ? `/${safeName(sec.name)}` : ''}`;
    }
    if (n.inbox) return 'Inbox';
    const r = state.config.regions.find((x) => x.id === n.region);
    return r ? safeName(r.name) : 'Unsorted';
  };
  const blob = await zipNotes(list, place, 'Second brain');
  downloadBlob(`Second brain ${isoDate(Date.now())}.zip`, blob);
  return list.length;
}

export async function exportNotebookMarkdown(nb) {
  const list = treeOrder(nb);
  const place = (n) => {
    const sec = nb.sections.find((s) => s.id === n.section);
    return sec && nb.sections.length > 1 ? safeName(sec.name) : '';
  };
  const blob = await zipNotes(list, place, nb.title);
  downloadBlob(`${safeName(nb.title)}.zip`, blob);
}

// Notes of a notebook in the order they appear: section by section, each note
// followed by its sub-notes.
export function treeOrder(nb) {
  const all = notesIn(nb.id);
  const out = [];
  const walk = (list) => {
    for (const n of list.sort((a, b) => a.order - b.order)) {
      out.push(n);
      walk(all.filter((c) => c.parent === n.id));
    }
  };
  nb.sections.forEach((s, si) => {
    walk(all.filter((n) => (!n.parent || !all.some((p) => p.id === n.parent)) && ((n.section || nb.sections[0].id) === s.id || (si === 0 && !nb.sections.some((x) => x.id === n.section)))));
  });
  return out;
}

// ---- PDF ----------------------------------------------------------------------------

const PX = 1240; // pixel width of a rendered page (about 150 dpi on A4)

const INK_PX = 1860; // pixel width of the writing drawn over an original PDF page (about 225 dpi on A4)

async function inkCanvases(n) {
  const { renderPageCanvas, layerView } = await import('./editor/inkdraw.js');
  const { A4_H, PAGE_W } = await import('./model.js');
  const out = [];
  const view = layerView(n, { forExport: true });
  for (const p of n.pages) {
    const data = await V.loadPage(p.id);
    // A page from a PDF: the original page goes in as it is (sharp text and
    // drawings), with the writing on top as a see-through picture.
    if (p.pdf && !view.paperHidden) {
      const writing = (data.strokes || []).length || (data.objects || []).length;
      out.push({ pdf: p.pdf, h: p.h, overlay: writing ? await renderPageCanvas(p, data, INK_PX, { ...view, noPaper: true }) : null, fallback: () => renderPageCanvas(p, data, PX, view) });
      continue;
    }
    if (p.h <= A4_H * 1.1) { out.push(await renderPageCanvas(p, data, PX, view)); continue; }
    // A long (endless) page is printed as A4-sized pieces.
    for (let y = 0; y < p.h; y += A4_H) out.push(await renderPageCanvas(p, data, PX, { ...view, crop: { x: 0, y, w: PAGE_W, h: Math.min(A4_H, p.h - y) } }));
  }
  return out;
}

// px: the width of each page picture (smaller for the pages view of a long note).
// Each canvas carries `range`: [from, to, total] in layout units, to jump to it.
async function typedCanvases(n, { px = PX } = {}) {
  const { drawRichText, fileImageReady, setInkTone } = await import('./editor/inkdraw.js');
  const { noteDoc } = await import('./editor/rich.js');
  const doc = noteDoc(n);
  const M = 80;
  const width = PAGE_W - M * 2;
  // Images first, so they're ready when drawn.
  const imgs = [];
  for (const f of n.files) imgs.push({ f, img: await fileImageReady(f.id) });
  const walkImgs = async (node) => { if (node?.type === 'imageFile') await fileImageReady(node.attrs?.fileId); for (const c of node?.content || []) await walkImgs(c); };
  await walkImgs(doc);
  // Load the fonts the note and its marks use (canvas text needs them loaded).
  await loadFonts([...fontIdsIn(doc), n.font, state.config?.text?.font, NOTE_FONT].filter(Boolean));
  // The note's own font, else the default text from Settings (as on screen).
  const dt = state.config?.text || {};
  const fontId = n.font || dt.font || NOTE_FONT;
  const layout = (ctx) => {
    let y = M;
    ctx.fillStyle = '#1B2A38';
    ctx.font = "500 40px 'Spectral', Georgia, serif";
    ctx.textBaseline = 'alphabetic';
    const title = displayTitle(n);
    const words = title.split(/\s+/);
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > width && line) { y += 48; ctx.fillText(line, M, y); line = w; } else line = t;
    }
    y += 48;
    ctx.fillText(line, M, y);
    y += 30;
    for (const { f, img } of imgs) {
      if (!img) continue;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const h = Math.min(900, width * (f.h || ih) / (f.w || iw));
      const w = h * (f.w || iw) / (f.h || ih);
      ctx.drawImage(img, M, y, w, h);
      y += h + 24;
    }
    setInkTone(false);
    y += drawRichText(ctx, doc, M, y, width, { size: boxSize(dt.size || TEXT_SIZE), font: fontId, color: dt.color || undefined });
    return y + M;
  };
  const probe = document.createElement('canvas').getContext('2d');
  const total = Math.max(A4_H, Math.ceil(layout(probe)));
  const k = px / PAGE_W;
  const pageH = Math.round(A4_H * k);
  const pad = 50; // top and bottom margin on continuation pages, in page units
  // Draw only the slice [from, to) of the note, offset to `top` pixels.
  const paint = (ctx, from, to, top) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, px, (to - from) * k);
    ctx.clip();
    ctx.setTransform(k, 0, 0, k, 0, top - from * k);
    layout(ctx);
    ctx.restore();
  };
  // Look upwards from `end` for an empty row, so a line of text isn't cut in half.
  const blankAbove = (end, min) => {
    const span = Math.min(240, end - min);
    if (span <= 4) return end;
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.ceil(span * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    paint(ctx, end - span, end, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let r = c.height - 1; r >= 0; r--) {
      let blank = true;
      for (let x = 0; x < c.width; x += 2) {
        const i = (r * c.width + x) * 4;
        if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { blank = false; break; }
      }
      if (blank) return end - span + r / k;
    }
    return end;
  };
  const out = [];
  let y = 0;
  while (y < total - 2) {
    const top = out.length ? pad : 0;
    const room = A4_H - top - pad;
    let end = Math.min(total, y + room);
    if (end < total) end = blankAbove(end, y + room * 0.6);
    const c = document.createElement('canvas');
    c.width = px;
    c.height = pageH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    paint(ctx, y, end, Math.round(top * k));
    c.range = [y, end, total];
    out.push(c);
    y = end;
  }
  return out;
}

async function boardCanvases(n) {
  const { renderBoardCanvas } = await import('./boarddraw.js');
  const data = await V.loadPage(n.pages[0].id);
  return [await renderBoardCanvas(data, { widthPx: 2000 })];
}

export const typedPages = (n, opts) => typedCanvases(n, opts);
export const noteCanvases = (n) => (n.kind === 'ink' ? inkCanvases(n) : n.kind === 'board' ? boardCanvases(n) : typedCanvases(n));

async function coverCanvas(nb) {
  const { coverStandaloneSVG } = await import('./covers.js');
  let photo = null;
  if (nb.cover?.style === 'photo' && nb.cover.photo) {
    const b = await V.fileBytes(nb.cover.photo);
    if (b) {
      const bytes = b.bytes || b;
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      photo = `data:image/jpeg;base64,${btoa(s)}`;
    }
  }
  const svg = coverStandaloneSVG(nb, { width: PX, photoUrl: photo });
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode().catch(() => {});
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = Math.round(PX * 4 / 3);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  if (img.naturalWidth) ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// An original PDF page put into the export, with the writing over it.
// False if it can't be (then the page goes in as a picture).
async function addPdfPage(pdf, item, sources, PDFDocument) {
  const { pdfBytes } = await import('./pdfview.js');
  try {
    if (!sources.has(item.pdf.file)) {
      const bytes = await pdfBytes(item.pdf.file);
      sources.set(item.pdf.file, bytes ? await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }) : null);
    }
    const src = sources.get(item.pdf.file);
    const sp = src?.getPages()[item.pdf.n - 1];
    if (!sp || sp.getRotation().angle % 360) return false; // turned pages: as a picture, the way they show
    const cb = sp.getCropBox();
    const emb = await pdf.embedPage(sp, { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height });
    const w = 595.28;
    const h = (w * item.h) / PAGE_W;
    const ph = Math.min(h, (w * cb.height) / cb.width);
    const page = pdf.addPage([w, h]);
    page.drawPage(emb, { x: 0, y: h - ph, width: w, height: ph });
    if (item.overlay) {
      const blob = await new Promise((r) => item.overlay.toBlob(r, 'image/png'));
      page.drawImage(await pdf.embedPng(new Uint8Array(await blob.arrayBuffer())), { x: 0, y: 0, width: w, height: h });
    }
    return true;
  } catch (e) {
    console.warn('export pdf page', e);
    return false;
  } finally {
    if (item.overlay) { item.overlay.width = 0; item.overlay.height = 0; }
  }
}

async function canvasesToPdf(canvases, title) {
  const { PDFDocument } = await import('../vendor/pdf-lib.esm.min.js');
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('Second brain');
  pdf.setProducer('Second brain');
  const sources = new Map();
  for (let c of canvases) {
    if (c.pdf) {
      if (await addPdfPage(pdf, c, sources, PDFDocument)) continue;
      c = await c.fallback();
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const w = 595.28;
    const h = (w * c.height) / c.width;
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    c.width = 0;
    c.height = 0;
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

export async function exportNotePdf(n) {
  const blob = await canvasesToPdf(await noteCanvases(n), displayTitle(n));
  downloadBlob(`${safeName(displayTitle(n))}.pdf`, blob);
}

export async function exportNotebookPdf(nb) {
  const canvases = [await coverCanvas(nb)];
  const list = treeOrder(nb);
  for (const [i, n] of list.entries()) {
    if (i && i % 5 === 0) toast(`Drawing note ${i + 1} of ${list.length}…`);
    try { canvases.push(...await noteCanvases(n)); } catch (e) { console.warn('export', n.id, e); }
  }
  const blob = await canvasesToPdf(canvases, nb.title);
  downloadBlob(`${safeName(nb.title)}.pdf`, blob);
}
