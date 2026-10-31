// Importing PDFs to write on: each PDF page becomes the background of a
// handwritten page (an encrypted image), and its text is kept for search.

import * as V from './vault.js';
import { newPage } from './model.js';

let lib = null;
async function pdfjs() {
  if (lib) return lib;
  lib = await import('../vendor/pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return lib;
}

const MAX_PAGES = 300;

export async function importPdfPages(file, { sealed = false, onProgress } = {}) {
  const P = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  let task;
  try {
    task = P.getDocument({
      data,
      isEvalSupported: false,
      enableXfa: false,
      wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href,
      standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
    });
    doc = await task.promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new Error('That PDF has a password. Remove it first, then import.');
    throw new Error('Couldn’t read that PDF.');
  }
  const count = doc.numPages || 0;
  const total = Math.min(count, MAX_PAGES);
  const pages = [];
  const texts = [];
  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total);
    const pg = await doc.getPage(i);
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(3, 1700 / base.width);
    const vp = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvas, canvasContext: ctx, viewport: vp, background: '#FFFFFF' }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    const fileId = await V.addFile(new Uint8Array(await blob.arrayBuffer()), { sealed, type: 'image/jpeg' });
    pages.push(newPage({ paper: 'blank', bg: fileId, h: Math.round((1000 * vp.height) / vp.width) }));
    try {
      const tc = await pg.getTextContent();
      texts.push(tc.items.map((x) => x.str).join(' ').replace(/\s+/g, ' ').trim());
    } catch { texts.push(''); }
    pg.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
  await (task.destroy ? task.destroy() : doc.destroy?.());
  const text = texts.map((t, i) => (t ? `Page ${i + 1}: ${t}` : '')).filter(Boolean).join('\n\n').slice(0, 200000);
  return { pages, text, skipped: Math.max(0, count - total) };
}
