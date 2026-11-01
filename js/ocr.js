// Reads text in images on this device with Tesseract (no uploads).
// The OCR engine (~6 MB) loads the first time it's needed and is cached after.

import { state, saveNote, fileBlob, emit } from './vault.js';
import { firstLine } from './util.js';

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the text reader.'));
    document.head.appendChild(s);
  });
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
      const base = new URL('vendor/tesseract/', location.href).href;
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: `${base}core`,
        langPath: `${base}lang`,
        workerBlobURL: false,
        gzip: true,
      });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

function cleanText(t) {
  return String(t || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

let running = false;
export const ocrBusy = () => running;

export async function runOcrQueue() {
  if (running || state.status !== 'unlocked') return;
  running = true;
  emit({ type: 'ocr', busy: true });
  try {
    for (;;) {
      const job = nextJob();
      if (!job) break;
      const { note, file } = job;
      let text = '';
      let status = 'done';
      try {
        const blob = await fileBlob(file.id);
        if (!blob) { status = 'error'; } else {
          const worker = await getWorker();
          const { data } = await worker.recognize(blob);
          text = cleanText(data.text);
          if (!text) status = 'none';
        }
      } catch (e) {
        console.warn('OCR failed', e);
        status = 'error';
      }
      const fresh = state.notes.get(note.id);
      if (!fresh) continue;
      const filesNext = fresh.files.map((f) => (f.id === file.id ? { ...f, ocr: text, ocrStatus: status } : f));
      const patch = { ...fresh, files: filesNext };
      if (fresh.titleAuto && !fresh.title && text && !fresh.body.trim()) {
        patch.title = firstLine(text, 70);
      }
      await saveNote(patch, { touch: false });
      emit({ type: 'ocr', id: note.id });
    }
  } finally {
    running = false;
    emit({ type: 'ocr', busy: false });
  }
}

// Each image is read by the device that captured it, so two devices don't race
// to read the same screenshot. If that device never got to it, anyone can after 15 minutes.
const mine = (note, f) => !f.ocrBy || f.ocrBy === state.deviceId || Date.now() - note.createdAt > 15 * 60000;
function nextJob() {
  for (const note of state.notes.values()) {
    const file = note.files.find((f) => f.ocrStatus === 'pending' && mine(note, f));
    if (file) return { note, file };
  }
  return null;
}

export async function rerunOcr(noteId, fileId) {
  const n = state.notes.get(noteId);
  if (!n) return;
  await saveNote({ ...n, files: n.files.map((f) => (f.id === fileId ? { ...f, ocrStatus: 'pending', ocrBy: state.deviceId } : f)) }, { touch: false });
  runOcrQueue();
}

// Read the text in one image (bytes or a Blob), for scanned pages.
export async function ocrImage(blobOrBytes) {
  const w = await getWorker();
  const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], { type: 'image/jpeg' });
  const { data } = await w.recognize(blob);
  return cleanText(data.text);
}
