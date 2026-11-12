// Bring in many files at once: notes exported from Notability (or GoodNotes
// and the like), or Word, PowerPoint and picture files. Each file becomes a
// handwritten note in the notebook you pick, with its pages to write on; the
// text in them is searchable and their sections show in Contents. A zip of
// files works too, and its folders become sections.

import * as V from './vault.js';
import { state } from './vault.js';
import { newNote } from './model.js';
import { uid } from './util.js';
import { refreshInkSummary } from './notework.js';
import { fileKind, readFile } from './docintake.js';

const isDoc = (name, type = '') => ['pdf', 'docx', 'pptx', 'image'].includes(fileKind({ name, type }));
const isZip = (name, type = '') => fileKind({ name, type }) === 'zip';
const base = (path) => path.split('/').pop();
const titleOf = (name) => base(name).replace(/\.(pdf|docx|pptx|png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i, '').replace(/[_]+/g, ' ').trim() || 'Imported note';

// The documents among the chosen files (opening zips): [{ name, folder, size, blob }].
export async function collect(files) {
  const out = [];
  for (const f of files) {
    if (isDoc(f.name, f.type)) out.push({ name: f.name, folder: null, size: f.size, blob: f });
    else if (isZip(f.name, f.type)) {
      const { unzipSync } = await import('../vendor/fflate.min.js');
      let entries;
      try { entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => isDoc(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) }); } catch { throw new Error(`Couldn’t open ${f.name}.`); }
      for (const [path, bytes] of Object.entries(entries)) {
        const parts = path.split('/').filter(Boolean);
        // The folder a file sits in becomes its section (top folder of the zip skipped if everything is in one).
        out.push({ name: base(path), path: parts, size: bytes.length, blob: new File([bytes], base(path), { type: '' }) });
      }
    }
  }
  // Folders: if every file shares the same top folder, use the next one down.
  const withPath = out.filter((x) => x.path);
  if (withPath.length) {
    const tops = new Set(withPath.map((x) => (x.path.length > 1 ? x.path[0] : '')));
    const skip = tops.size === 1 && withPath.every((x) => x.path.length > 2) ? 1 : 0;
    for (const x of withPath) x.folder = x.path.length - 1 > skip ? x.path[x.path.length - 2] : null;
  }
  return out.sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// Import them into a notebook. sectionId: where PDFs without a folder go.
// onProgress({ i, total, name, page, pages }). Returns { notes, pages, failed: [{ name, why }] }.
export async function importAll(items, { notebookId, sectionId, onProgress, stop = () => false } = {}) {
  let nb = state.notebooks.get(notebookId);
  if (!nb) throw new Error('That notebook is gone.');
  // Sections for the zip's folders, made once.
  const secFor = new Map();
  const folders = [...new Set(items.map((x) => x.folder).filter(Boolean))];
  if (folders.length) {
    const sections = [...nb.sections];
    for (const name of folders) {
      let sec = sections.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (!sec) { sec = { id: uid('s'), name }; sections.push(sec); }
      secFor.set(name, sec.id);
    }
    if (sections.length !== nb.sections.length) nb = await V.saveNotebook({ ...nb, sections });
  }
  const res = { notes: 0, pages: 0, failed: [] };
  for (let i = 0; i < items.length; i++) {
    if (stop()) break;
    const it = items[i];
    window.dispatchEvent(new Event('sb-busy')); // keep auto-lock away while importing
    try {
      const file = it.blob instanceof File ? it.blob : new File([it.blob], it.name, { type: 'application/pdf' });
      const r = await readFile(file, { sealed: !!nb.sealed, onProgress: (p, n) => onProgress?.({ i, total: items.length, name: it.name, page: p, pages: n }) });
      const { pages, text, created } = r;
      if (!pages.length) throw new Error('No pages in it.');
      const when = created || null;
      const n = newNote({
        kind: 'ink',
        title: r.title || titleOf(it.name),
        titleAuto: false,
        notebook: nb.id,
        section: (it.folder && secFor.get(it.folder)) || sectionId || nb.sections[0].id,
        region: nb.region || null,
        inbox: !nb.region,
        sealed: !!nb.sealed,
        source: r.source,
        pages,
        docSections: r.docSections || [],
        ...(when ? { createdAt: when } : {}),
      });
      const saved = await V.saveNote(n);
      await refreshInkSummary(saved.id, { pdfText: text, touch: false });
      res.notes++;
      res.pages += pages.length;
    } catch (e) {
      res.failed.push({ name: it.name, why: e.message || 'Couldn’t read it.' });
    }
  }
  return res;
}
