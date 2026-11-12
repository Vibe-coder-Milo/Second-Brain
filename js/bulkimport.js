// Bring in many files at once: notes exported from Notability (or GoodNotes
// and the like), or Word, PowerPoint and picture files. Each file becomes a
// handwritten note in the notebook you pick, with its pages to write on; the
// text in them is searchable and their sections show in Contents. A zip of
// files works too, and its folders become sections. Several pictures (in the
// same folder) become one note with a page each; every document is a note.

import * as V from './vault.js';
import { state } from './vault.js';
import { newNote } from './model.js';
import { uid, fmtDate } from './util.js';
import { refreshInkSummary } from './notework.js';
import { fileKind, readFile, fileTitle } from './docintake.js';

const isDoc = (name, type = '') => ['pdf', 'docx', 'pptx', 'image'].includes(fileKind({ name, type }));
const isZip = (name, type = '') => fileKind({ name, type }) === 'zip';
const base = (path) => path.split('/').pop();

// The documents among the chosen files (opening zips): [{ name, folder, size, blob }].
// Pictures in the same folder come as one item { name, title, folder, size, parts } (in the order chosen).
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
  // Several pictures together: one note, a page each.
  const docs = [];
  const groups = new Map();
  for (const x of out) {
    if (fileKind({ name: x.name, type: x.blob.type }) !== 'image') { docs.push(x); continue; }
    const k = x.folder || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  for (const [k, list] of groups) {
    if (list.length === 1) docs.push(list[0]);
    else docs.push({ name: `${list.length} pictures`, title: `Pictures, ${fmtDate(Date.now())}`, folder: k || null, size: list.reduce((t, x) => t + x.size, 0), parts: list });
  }
  return docs.sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

const asFile = (it) => (it.blob instanceof File ? it.blob : new File([it.blob], it.name, { type: 'application/pdf' }));

// One item read into pages: a file, or the pictures of a group (pages in order).
async function readItem(it, { sealed, onProgress, stop }) {
  if (!it.parts) return readFile(asFile(it), { sealed, onProgress });
  const out = { pages: [], text: '', title: it.title, source: null, docSections: [], warnings: [], created: null };
  try {
    for (let k = 0; k < it.parts.length; k++) {
      if (stop()) throw new Error('Stopped.');
      const r = await readFile(asFile(it.parts[k]), { sealed });
      out.pages.push(...r.pages);
      onProgress?.(k + 1, it.parts.length);
    }
  } catch (e) {
    for (const p of out.pages) if (p.bg) await V.deleteFile(p.bg).catch(() => {});
    throw e;
  }
  return out;
}

// Import them into a notebook. sectionId: where PDFs without a folder go.
// onProgress({ i, total, name, page, pages }). Returns { notes, pages, failed: [{ name, why }], warnings: [] }.
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
  const res = { notes: 0, pages: 0, failed: [], warnings: [] };
  for (let i = 0; i < items.length; i++) {
    if (stop()) break;
    const it = items[i];
    window.dispatchEvent(new Event('sb-busy')); // keep auto-lock away while importing
    try {
      const r = await readItem(it, { sealed: !!nb.sealed, stop, onProgress: (p, n) => onProgress?.({ i, total: items.length, name: it.name, page: p, pages: n }) });
      const { pages, text, created } = r;
      if (!pages.length) throw new Error('No pages in it.');
      const when = created || null;
      const n = newNote({
        kind: 'ink',
        title: r.title || fileTitle(it.name) || 'Imported note',
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
      res.warnings.push(...(r.warnings || []));
    } catch (e) {
      if (e.message === 'Stopped.') break;
      res.failed.push({ name: it.name, why: e.message || 'Couldn’t read it.' });
    }
  }
  return res;
}
