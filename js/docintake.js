// "Mark up a document": which files can be opened as pages to write on, and
// where a pile of dropped or chosen files should go. PDFs, Word (.docx),
// PowerPoint (.pptx) and pictures work, and a zip of them. One file opens as
// a note straight away; several go through the bring-in sheet, a note each.
// Anything else gets a plain-words message.

import { toast } from './util.js';

export const DOC_ACCEPT = 'application/pdf,.pdf,.docx,.pptx,image/*,.zip,application/zip';

const ext = (f) => ((String(f?.name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '');

// 'pdf' | 'docx' | 'pptx' | 'image' | 'zip' | null (can't be opened)
export function fileKind(f) {
  const e = ext(f);
  const t = String(f?.type || '').toLowerCase();
  if (e === 'pdf' || t === 'application/pdf') return 'pdf';
  if (e === 'docx' || e === 'docm' || t.includes('wordprocessingml.document')) return 'docx';
  if (e === 'pptx' || e === 'pptm' || t.includes('presentationml.presentation')) return 'pptx';
  if (e === 'zip' || /zip/.test(t)) return 'zip';
  if (t.startsWith('image/') || /^(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/.test(e)) return 'image';
  return null;
}

// In plain words, why a file can't be opened.
export function whyNot(f) {
  const e = ext(f);
  if (e === 'doc') return 'Old Word files (.doc) can’t be opened. Save as .docx or PDF first.';
  if (e === 'ppt') return 'Old PowerPoint files (.ppt) can’t be opened. Save as .pptx or PDF first.';
  if (e === 'xls' || e === 'xlsx') return 'Excel files can’t be opened here. Save the sheet as PDF first.';
  return `${f?.name || 'That file'} can’t be opened here. Try a PDF, Word, PowerPoint or a picture.`;
}

// Split files into the ones that open and the others.
export function sortFiles(files) {
  const ok = [];
  const bad = [];
  for (const f of files || []) (fileKind(f) ? ok : bad).push(f);
  return { ok, bad };
}

// Open what can be opened: one file (not a zip) with `single`, otherwise
// `many`. Says why for the others. Returns true if anything was taken.
export function routeFiles(files, { single, many }) {
  const { ok, bad } = sortFiles(files);
  if (bad.length) toast(bad.length === 1 ? whyNot(bad[0]) : `${bad.length} files can’t be opened here. Try PDF, Word, PowerPoint or pictures.`);
  if (!ok.length) return false;
  if (ok.length > 1 || fileKind(ok[0]) === 'zip') many(ok); else single(ok[0]);
  return true;
}

// Read one file into pages to write on (not a zip):
// { pages, text, docSections, title, source, created, kind }. `title` is the
// document's own title (null for a PDF: use the file name).
export async function readFile(file, { sealed = false, onProgress } = {}) {
  const kind = fileKind(file);
  if (!kind || kind === 'zip') throw new Error(whyNot(file));
  const { fromIndexes } = await import('./docsections.js');
  if (kind === 'pdf') {
    const { importPdfPages } = await import('./pdf.js');
    const r = await importPdfPages(file, { sealed, onProgress });
    return { ...r, title: null, source: 'pdf', kind };
  }
  const { documentPages } = await import('./docpages.js');
  const d = await documentPages(file, { sealed, onProgress });
  return { ...d, docSections: fromIndexes(d.sections, d.pages), source: d.kind === 'image' ? null : d.kind, created: null };
}
