// Every way two notes connect, for the map and the map assistant:
//   link     you linked them ([[links]] or the link button)
//   sub      a sub-note and the note it sits under
//   board    a whiteboard and the notes on it
//   related  close in meaning (found on this device) or suggested by Claude
//   label    a note and a label stuck on it
// Each kind has its own colour, the same on the map and in notes.

import { state } from './vault.js';
import { displayTitle, wikiTitles, titleIndex, labelMap } from './model.js';
import { similarNotes } from './semantic.js';

export const KINDS = [
  { id: 'link', name: 'Your links', css: '--c-link', fallback: '#2F6FB5', width: 1.9 },
  { id: 'sub', name: 'Sub-notes', css: '--c-sub', fallback: '#8A5CC2', width: 1.7 },
  { id: 'board', name: 'Whiteboards', css: '--c-board', fallback: '#168F88', width: 1.6 },
  { id: 'related', name: 'Related, found for you', css: '--c-related', fallback: '#C08A2E', width: 1.3, dash: [5, 4] },
  { id: 'label', name: 'Labels', css: '--c-label', fallback: '#C2557F', width: 1, dash: [2, 3] },
];
export const DEFAULT_SHOWN = ['link', 'sub', 'board', 'related'];

// How alike two notes must be (0 to 1) to be drawn as related, and how many
// related lines each note gets at most.
export const RELATED_MIN = 0.32;
const RELATED_PER_NOTE = 2;

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function connections(notesMap = state.notes, { labels = false } = {}) {
  const notes = [...notesMap.values()];
  const idx = titleIndex(notes);
  const edges = new Map(); // key -> { a, b, kind, why }
  const add = (a, b, kind, why = '') => {
    if (!a || !b || a === b) return;
    if (!notesMap.has(a) || (kind !== 'label' && !notesMap.has(b))) return;
    const k = kind === 'label' ? `${a}|${b}` : key(a, b);
    const had = edges.get(k);
    // A stronger kind wins: your link over sub-note over board over related.
    const rank = { link: 4, sub: 3, board: 2, related: 1, label: 0 };
    if (!had || rank[kind] > rank[had.kind]) edges.set(k, { a, b, kind, why });
  };
  for (const n of notes) {
    for (const l of n.links) add(n.id, l, 'link');
    for (const t of wikiTitles(n.body)) {
      const target = idx.get(t.toLowerCase());
      if (target) add(n.id, target.id, n.kind === 'board' || target.kind === 'board' ? 'board' : 'link');
    }
    if (n.parent) add(n.id, n.parent, 'sub');
  }
  // Related: Claude's suggestions, then closeness in meaning.
  const taken = new Set(edges.keys());
  const dismissed = (a, b) => notesMap.get(a)?.dismissed?.includes(b) || notesMap.get(b)?.dismissed?.includes(a);
  for (const n of notes) {
    for (const s of n.suggested || []) if (!taken.has(key(n.id, s.id)) && !dismissed(n.id, s.id)) add(n.id, s.id, 'related', s.reason || 'Suggested by Claude');
  }
  for (const n of notes) {
    const near = similarNotes(n, { limit: RELATED_PER_NOTE + 2, min: RELATED_MIN }) || [];
    let k = 0;
    for (const { note: o, score } of near) {
      if (k >= RELATED_PER_NOTE) break;
      if (taken.has(key(n.id, o.id)) || dismissed(n.id, o.id)) continue;
      add(n.id, o.id, 'related', `Close in meaning (${Math.round(score * 100)}%)`);
      k++;
    }
  }
  if (labels) {
    for (const n of notes) for (const l of n.labels || []) if (l?.l) add(n.id, `label:${l.l}`, 'label');
  }
  const list = [...edges.values()];
  const counts = Object.fromEntries(KINDS.map((k) => [k.id, 0]));
  for (const e of list) counts[e.kind]++;
  return { edges: list, counts };
}

// Labels used on notes, with how many notes carry each.
export function labelsInUse() {
  const lm = labelMap(state.config);
  const out = new Map();
  for (const n of state.notes.values()) for (const l of n.labels || []) {
    if (!l?.l) continue;
    const def = lm.get(l.l) || { id: l.l, name: l.l, color: '#6B7A85' };
    if (!out.has(l.l)) out.set(l.l, { label: def, count: 0 });
    out.get(l.l).count++;
  }
  return out;
}

export const titleOf = (id) => { const n = state.notes.get(id); return n ? displayTitle(n) : ''; };
