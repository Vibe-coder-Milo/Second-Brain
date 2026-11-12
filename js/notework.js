// Work that spans notes: tasks from everywhere, daily notes, and the summary a
// handwritten note keeps of its pages (text, labels, tasks) for search.

import { state } from './vault.js';
import * as V from './vault.js';
import { newNote, noteTasks, labelMap } from './model.js';
import { groupStrokes } from './highlights.js';
import { setTaskChecked, setTaskDue, mdSetTask, docToMarkdown, docTasks, docLabels, appendTask, emptyDoc, isoToday } from './doc.js';

export { isoToday };

// ---- Handwritten note summaries -----------------------------------------------------

export async function inkSummary(n, pdfText = null) {
  const lm = labelMap(state.config);
  const parts = [];
  const labels = [];
  const tasks = [];
  const hlPages = [];
  let hlCount = 0;
  for (const [i, p] of n.pages.entries()) {
    let d;
    try { d = await V.loadPage(p.id); } catch { continue; }
    if ((d.strokes || []).some((s) => s.t === 'hl')) { hlPages.push(p.id); hlCount += groupStrokes(d.strokes).length; }
    const texts = [];
    // Handwriting read on a device (see handwriting.js) comes first.
    const hand = (n.hw?.[p.id]?.lines || []).map((l) => l.t).filter(Boolean).join('\n');
    if (hand) texts.push(hand);
    for (const o of d.objects || []) {
      if (o.type === 'text' && o.doc) {
        texts.push(docToMarkdown(o.doc, lm));
        for (const t of docTasks(o.doc)) tasks.push({ ...t, page: p.id, box: o.id });
        for (const l of docLabels(o.doc)) labels.push({ l: l.l, page: p.id, x: o.x, y: o.y, w: o.w, h: o.h || 40, ctx: l.ctx });
      }
      if (o.type === 'postit' && o.text?.trim()) texts.push(`> [!post-it]\n> ${o.text.trim().split('\n').join('\n> ')}`);
      if (o.type === 'label') labels.push({ l: o.label, page: p.id, x: o.x, y: o.y, w: o.w, h: o.h });
    }
    if (texts.length) parts.push(`${n.pages.length > 1 ? `### Page ${i + 1}\n\n` : ''}${texts.join('\n\n')}`);
  }
  const body = [parts.join('\n\n'), pdfText ?? n.pdfText ?? ''].filter(Boolean).join('\n\n');
  return { body, labels, tasks, hlPages, hlCount };
}

// Re-read a handwritten note's pages and save the summary if it changed.
export async function refreshInkSummary(id, { pdfText = null, touch = true } = {}) {
  const n = state.notes.get(id);
  if (!n || n.kind !== 'ink') return null;
  const s = await inkSummary(n, pdfText);
  const cur = state.notes.get(id);
  const same = cur.body === s.body && JSON.stringify(cur.labels) === JSON.stringify(s.labels) && JSON.stringify(cur.tasks) === JSON.stringify(s.tasks) && JSON.stringify(cur.hlPages) === JSON.stringify(s.hlPages) && cur.hlCount === s.hlCount;
  if (same && !touch) return cur;
  return V.saveNote((latest) => latest && { ...latest, ...s, ...(pdfText ? { pdfText } : {}) }, { id });
}

// ---- Tasks ------------------------------------------------------------------------

export function allTasks() {
  const out = [];
  for (const n of state.notes.values()) for (const t of noteTasks(n)) out.push({ ...t, note: n });
  return out;
}

export async function setTask(task, { checked, due } = {}) {
  const n = state.notes.get(task.note.id);
  if (!n) return;
  const apply = (doc) => {
    let d = doc;
    if (checked !== undefined) d = setTaskChecked(d, task.tid, checked);
    if (due !== undefined) d = setTaskDue(d, task.tid, due);
    return d;
  };
  if (n.kind === 'ink') {
    const data = await V.loadPage(task.page);
    const objects = (data.objects || []).map((o) => (o.id === task.box && o.doc ? { ...o, doc: apply(o.doc), t: Date.now() } : o));
    await V.savePage(task.page, { ...data, objects }, { sealed: n.sealed });
    await refreshInkSummary(n.id);
    return;
  }
  if (n.doc) {
    const doc = apply(n.doc);
    await V.saveNote({ ...n, doc, body: docToMarkdown(doc, labelMap(state.config)) });
    return;
  }
  await V.saveNote({ ...n, body: mdSetTask(n.body, task.tid, { checked, due }) });
}

// ---- Daily notes -------------------------------------------------------------------

export const dailyNote = (iso) => [...state.notes.values()].find((n) => n.daily === iso) || null;

export function dailyTitle(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export async function ensureDaily(iso = isoToday(), doc = null) {
  const have = dailyNote(iso);
  if (have) return have;
  const d = doc || emptyDoc();
  return V.saveNote(newNote({ title: dailyTitle(iso), titleAuto: false, daily: iso, source: 'daily', type: 'note', inbox: false, region: null, doc: d, body: docToMarkdown(d, labelMap(state.config)) }));
}

export async function addTaskToDaily(text, due = null, iso = isoToday()) {
  const n = await ensureDaily(iso);
  let base = n.doc;
  if (!base && n.body.trim()) {
    const { mdToDoc } = await import('./editor/rich.js');
    base = mdToDoc(n.body);
  }
  const doc = appendTask(base || emptyDoc(), text, due);
  return V.saveNote({ ...n, doc, body: docToMarkdown(doc, labelMap(state.config)) });
}

// ---- Dates -------------------------------------------------------------------------

export function addDays(iso, k) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + k);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const isoOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function dueLabel(iso, today = isoToday()) {
  if (!iso) return '';
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  const d = new Date(`${iso}T12:00:00`);
  const diff = Math.round((d - new Date(`${today}T12:00:00`)) / 86400000);
  if (diff > 0 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
