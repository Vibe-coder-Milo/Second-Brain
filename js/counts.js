// The numbers in the menu: tasks due (today and late), tasks to do (also by
// region), labelled spots and highlights. Each note's own numbers are kept
// until that note changes, so the menu stays quick with thousands of notes.

import { state, rev } from './vault.js';
import { noteTasks } from './model.js';
import { docLabels, isoToday } from './doc.js';
import { typedHighlights } from './highlights.js';

const perNote = new WeakMap(); // note object -> its numbers (a saved note is a new object)

function ofNote(n) {
  let c = perNote.get(n);
  if (c) return c;
  const tasks = noteTasks(n).filter((t) => !t.checked).map((t) => t.due || '');
  const labels = n.kind === 'ink'
    ? (n.labels || []).filter((x) => n.pages.some((p) => p.id === x.page)).length
    : n.doc ? docLabels(n.doc).length : 0;
  const highlights = n.kind === 'ink' ? (n.hlCount ?? n.hlPages?.length ?? 0) : n.doc ? typedHighlights(n.doc).length : 0;
  c = { tasks, labels, highlights };
  perNote.set(n, c);
  return c;
}

// The region a note's tasks count under: its region, or none (inbox, unsorted).
const regionOf = (n) => (n.inbox || !n.region ? '' : n.region);

let memo = { key: null, value: null };
export function menuCounts() {
  const today = isoToday();
  const key = `${rev}:${today}:${state.notes.size}`;
  if (memo.key === key) return memo.value;
  let open = 0; let due = 0; let labels = 0; let highlights = 0;
  const byRegion = new Map(); // region id ('' = none) -> { open, due }
  for (const n of state.notes.values()) {
    const c = ofNote(n);
    labels += c.labels;
    highlights += c.highlights;
    if (!c.tasks.length) continue;
    const r = regionOf(n);
    const g = byRegion.get(r) || { open: 0, due: 0 };
    for (const d of c.tasks) {
      open++; g.open++;
      if (d && d <= today) { due++; g.due++; }
    }
    byRegion.set(r, g);
  }
  memo = { key, value: { open, due, labels, highlights, byRegion } };
  return memo.value;
}
