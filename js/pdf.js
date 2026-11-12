// Importing PDFs to write on: each PDF page becomes the background of a
// handwritten page, and its text is kept for search. The PDF itself is kept
// (one encrypted file) and each page points at its page there, so pages are
// drawn from it at whatever size they're shown (see pdfview.js): sharp when
// zoomed in, in focus mode and in exports. Each page also gets a small
// picture (an encrypted image) for thumbnails and to show straight away.

import * as V from './vault.js';
import { newPage } from './model.js';

let lib = null;
async function pdfjs() {
  if (lib) return lib;
  lib = await import('../vendor/pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return lib;
}

// Open PDF bytes with pdf.js (all bundled, nothing fetched from elsewhere).
// pdf.js takes the bytes over, so pass a copy if you still need them.
export async function openPdf(data) {
  const P = await pdfjs();
  const task = P.getDocument({
    data,
    isEvalSupported: false,
    enableXfa: false,
    wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href,
    standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
  });
  return { doc: await task.promise, task };
}

const MAX_PAGES = 300;

// PDFs up to this size are kept as they came. GitHub takes files up to
// 100 MB and sync sends them as text (a third bigger), so bigger ones get
// sharper pictures of each page instead.
const KEEP_PDF_MAX = 40 * 1024 * 1024;
const THUMB_W = 1240; // the small picture's width when the PDF is kept (about 150 dpi on A4)
const FULL_W = 2400; // the picture's width when it isn't (about 290 dpi on A4)

export async function importPdfPages(file, { sealed = false, onProgress } = {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  const keep = data.byteLength <= KEEP_PDF_MAX;
  let doc;
  let task;
  try {
    ({ doc, task } = await openPdf(keep ? data.slice() : data));
  } catch (e) {
    if (e?.name === 'PasswordException') throw new Error('That PDF has a password. Remove it first, then import.');
    throw new Error('Couldn’t read that PDF.');
  }
  const pdfFile = keep ? await V.addFile(data, { sealed, type: 'application/pdf' }) : null;
  // When the PDF was made (Notability and others write this), to keep the
  // note's date when it comes over.
  let created = null;
  try {
    const m = String((await doc.getMetadata())?.info?.CreationDate || '').match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-])?(\d{2})?'?(\d{2})?/);
    if (m) {
      const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', z, oh = '00', om = '00'] = m;
      let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
      if (z === '+' || z === '-') t -= (z === '+' ? 1 : -1) * (+oh * 60 + +om) * 60000;
      if (t > Date.UTC(1995, 0, 1) && t < Date.now() + 86400000) created = t;
    }
  } catch { /* no date */ }
  const count = doc.numPages || 0;
  const total = Math.min(count, MAX_PAGES);
  const pages = [];
  const texts = [];
  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total);
    const pg = await doc.getPage(i);
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(3, (pdfFile ? THUMB_W : FULL_W) / base.width);
    const vp = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvas, canvasContext: ctx, viewport: vp, background: '#FFFFFF' }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', pdfFile ? 0.85 : 0.92));
    const fileId = await V.addFile(new Uint8Array(await blob.arrayBuffer()), { sealed, type: 'image/jpeg' });
    pages.push(newPage({ paper: 'blank', bg: fileId, pdf: pdfFile ? { file: pdfFile, n: i } : null, h: Math.round((1000 * vp.height) / vp.width) }));
    try {
      const tc = await pg.getTextContent();
      texts.push(tc.items.map((x) => x.str).join(' ').replace(/\s+/g, ' ').trim());
    } catch { texts.push(''); }
    pg.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
  let outline = [];
  try { outline = (await import('./docsections.js')).fromIndexes(await (await import('./docsections.js')).pdfOutline(doc), pages); } catch { /* no bookmarks */ }
  await (task.destroy ? task.destroy() : doc.destroy?.());
  const text = texts.map((t, i) => (t ? `Page ${i + 1}: ${t}` : '')).filter(Boolean).join('\n\n').slice(0, 200000);
  return { pages, text, docSections: outline, skipped: Math.max(0, count - total), created, pdfFile };
}
