// Every way two notes connect, for the map and the map assistant:
//   link     you linked them ([[links]] or the link button)
//   sub      a sub-note and the note it sits under
//   board    a whiteboard and the notes on it
//   related  close in meaning (found on this device) or suggested by Claude
//   label    a note and a label stuck on it
// Each kind has its own colour, the same on the map and in notes.

import * as V from './vault.js';
import { state } from './vault.js';
import { displayTitle, wikiTitles, titleIndex, labelMap, noteText } from './model.js';
import { nearLists, nearVersion } from './semantic.js';

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

// Worked out once per change to your notes (or to what the device knows of
// their meaning) and shared by the map, the note mini-map and the assistant.
const memo = new Map();
export function connections(notesMap = state.notes, { labels = false } = {}) {
  if (notesMap !== state.notes) return compute(notesMap, labels);
  const near = nearLists(); // may start bringing them up to date
  const k = `${V.rev}|${nearVersion()}|${labels}|${near.size}`;
  if (memo.get(labels)?.k !== k) memo.set(labels, { k, v: compute(notesMap, labels) });
  return memo.get(labels).v;
}

function compute(notesMap, labels) {
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
  const near = nearLists();
  for (const n of notes) {
    let k = 0;
    for (const { id, score } of near.get(n.id) || []) {
      if (k >= RELATED_PER_NOTE) break;
      const o = notesMap.get(id);
      if (!o || taken.has(key(n.id, o.id)) || dismissed(n.id, o.id)) continue;
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

// ---- Themes ----------------------------------------------------------------------
// Inside a region, notes joined by links or close meaning form a theme. Each
// theme is named from the words its notes share that are rare elsewhere
// (e.g. "Renovation & condo" inside Property & home).

const STOP = new Set('the and for with that this from have has had was were are you your our their they them then than into onto about after before over under more most less very just also only even still need needs want wants will would could should can may might must not but all any some each other others same such own one two three four five six seven eight nine ten first last next new old good great big small get got make made take took give gave see saw know knew think thought say said tell told ask asked use used work works working note notes page pages week weeks day days month months year years time times today tomorrow yesterday thing things lot lots way ways back here there where when what which who whom whose why how out off per via etc yes yeah okay ok much many few well really maybe check sure like dont doesnt didnt isnt cant wont im ive its lets'.split(' '));
const tokens = (t) => (String(t || '').toLowerCase().match(/[a-z][a-z0-9&'-]{2,}/g) || []).map((w) => w.replace(/'s$/, '')).filter((w) => !STOP.has(w));

const themeMemo = new WeakMap();
export function themes(edges, { minSize = 3 } = {}) {
  const k = `${V.rev}|${minSize}`;
  const had = themeMemo.get(edges);
  if (had?.k === k) return had.v.map((t) => ({ ...t }));
  const v = findThemes(edges, minSize);
  themeMemo.set(edges, { k, v });
  return v.map((t) => ({ ...t }));
}

// Each note's words, kept until the note changes (a saved note is a new object).
const wordCache = new WeakMap();
const titleCache = new WeakMap();
const wordsOfNote = (n) => {
  let w = wordCache.get(n);
  if (!w) { w = new Set([...tokens(displayTitle(n)), ...tokens(noteText(n)).slice(0, 400)]); wordCache.set(n, w); }
  return w;
};
const titleWordsOf = (n) => {
  let w = titleCache.get(n);
  if (!w) { w = new Set(tokens(displayTitle(n))); titleCache.set(n, w); }
  return w;
};

function findThemes(edges, minSize) {
  const notes = [...state.notes.values()];
  const N = notes.length || 1;
  const words = { get: (id) => { const n = state.notes.get(id); return n ? wordsOfNote(n) : null; } };
  // How many notes use a word: only counted for the few words that could name a theme.
  const dfMemo = new Map();
  const df = { get: (w) => { if (!dfMemo.has(w)) { let c = 0; for (const n of notes) if (wordsOfNote(n).has(w)) c++; dfMemo.set(w, c); } return dfMemo.get(w); } };
  const titleWords = (n) => titleWordsOf(n);
  const out = [];
  for (const r of state.config.regions) {
    const ids = new Set(notes.filter((n) => !n.inbox && n.region === r.id).map((n) => n.id));
    if (ids.size < minSize) continue;
    const adj = new Map([...ids].map((id) => [id, new Set()]));
    for (const e of edges) if (e.kind !== 'label' && ids.has(e.a) && ids.has(e.b)) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); }
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id) || !adj.get(id).size) continue;
      const comp = [];
      const stack = [id];
      seen.add(id);
      while (stack.length) { const x = stack.pop(); comp.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); stack.push(y); } }
      if (comp.length < minSize || comp.length > Math.max(minSize, ids.size - 1)) continue;
      // Named for words every note in it shares (rare ones first), or else
      // for its most connected note.
      const inTheme = new Map();
      for (const x of comp) for (const w of words.get(x) || []) inTheme.set(w, (inTheme.get(w) || 0) + 1);
      const regionWords = new Set(tokens(r.name));
      const shared = [...inTheme].filter(([w, c]) => c === comp.length && !regionWords.has(w))
        .map(([w]) => [w, Math.log(N / (df.get(w) || 1) + 1) * (comp.some((x) => titleWords(state.notes.get(x)).has(w)) ? 1.5 : 1)])
        .filter(([, sc]) => sc > 0.9).sort((p, q) => q[1] - p[1]).map(([w]) => w).slice(0, 2);
      let name;
      if (shared.length) {
        // Keep short words written in capitals that way (HDB, CPF, ETF).
        const texts = comp.map((x) => `${displayTitle(state.notes.get(x))} ${noteText(state.notes.get(x))}`).join(' ');
        const show = (w, i) => (w.length <= 5 && new RegExp(`\\b${w.toUpperCase()}\\b`).test(texts) ? w.toUpperCase() : i === 0 ? w[0].toUpperCase() + w.slice(1) : w);
        name = shared.map(show).join(' & ');
      } else {
        const hub = comp.map((x) => [x, adj.get(x).size]).sort((p, q) => q[1] - p[1] || displayTitle(state.notes.get(p[0])).length - displayTitle(state.notes.get(q[0])).length)[0][0];
        name = displayTitle(state.notes.get(hub));
        if (name.length > 28) name = `${name.slice(0, 27)}…`;
      }
      out.push({ region: r.id, ids: comp, name });
    }
  }
  return out;
}
