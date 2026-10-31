// How notes connect: links in both directions (with the line that links),
// mentions that aren't linked yet, and related notes worked out on this device.

import { state } from './vault.js';
import { computeLinks, displayTitle, noteText, wikiTitles } from './model.js';

const STOP = new Set('a about after again all also am an and any are as at be because been before being but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours i’m im it’s dont don’t can’t cant get got one two also like need want make made think going go see new note notes page today week'.split(' '));

const words = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9à-ÿ\s'-]+/g, ' ').split(/\s+/).map((w) => w.replace(/^['-]+|['-]+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

// ---- Linked, both ways --------------------------------------------------------

export function linkedWith(n) {
  const { neighbours } = computeLinks(state.notes);
  const ids = [...(neighbours.get(n.id) || [])];
  const title = displayTitle(n).toLowerCase();
  return ids.map((id) => state.notes.get(id)).filter(Boolean).map((o) => {
    const explicit = n.links.includes(o.id) || o.links.includes(n.id);
    let context = '';
    if (wikiTitles(o.body).some((t) => t.toLowerCase() === title)) {
      context = o.body.split('\n').find((l) => l.toLowerCase().includes(`[[${title}`)) || '';
    }
    const outgoing = n.links.includes(o.id) || wikiTitles(n.body).some((t) => t.toLowerCase() === displayTitle(o).toLowerCase());
    return { note: o, explicit, context: context.replace(/^[\s>#*\-[\]x]+/i, '').trim(), outgoing };
  });
}

// ---- Mentioned, not linked ------------------------------------------------------

export function mentions(n, limit = 6) {
  const title = displayTitle(n);
  if (!n.title || title.length < 4) return [];
  const linked = new Set(linkedWith(n).map((x) => x.note.id));
  const needle = title.toLowerCase();
  const re = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
  const out = [];
  for (const o of state.notes.values()) {
    if (o.id === n.id || linked.has(o.id) || o.dismissed.includes(n.id) || n.dismissed.includes(o.id)) continue;
    const text = noteText(o);
    const m = text.match(re);
    if (!m) continue;
    const at = m.index + m[1].length;
    const start = Math.max(0, text.lastIndexOf('\n', at) + 1, at - 60);
    const endNl = text.indexOf('\n', at);
    const end = Math.min(endNl === -1 ? text.length : endNl, at + needle.length + 60);
    out.push({ note: o, before: text.slice(start, at), match: text.slice(at, at + needle.length), after: text.slice(at + needle.length, end) });
    if (out.length >= limit) break;
  }
  return out;
}

// ---- Related (TF-IDF over your notes, on this device) ------------------------------

let index = null;
let indexKey = '';
function buildIndex() {
  let key = `${state.notes.size}`;
  for (const n of state.notes.values()) key += n.updatedAt % 100000;
  if (index && key === indexKey) return index;
  const docs = new Map();
  const df = new Map();
  for (const n of state.notes.values()) {
    const tf = new Map();
    for (const w of words(`${displayTitle(n)} ${displayTitle(n)} ${noteText(n)}`)) tf.set(w, (tf.get(w) || 0) + 1);
    docs.set(n.id, tf);
    for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = Math.max(1, docs.size);
  const vecs = new Map();
  for (const [id, tf] of docs) {
    const v = new Map();
    let norm = 0;
    for (const [w, c] of tf) {
      const d = df.get(w);
      if (d === N && N > 3) continue;
      const x = (1 + Math.log(c)) * Math.log(1 + N / d);
      v.set(w, x);
      norm += x * x;
    }
    vecs.set(id, { v, norm: Math.sqrt(norm) || 1 });
  }
  index = vecs;
  indexKey = key;
  return index;
}

export function related(n, limit = 3) {
  if (state.notes.size < 3) return [];
  const idx = buildIndex();
  const me = idx.get(n.id);
  if (!me) return [];
  const linked = new Set(linkedWith(n).map((x) => x.note.id));
  const out = [];
  for (const [id, other] of idx) {
    if (id === n.id || linked.has(id) || n.dismissed.includes(id)) continue;
    let dot = 0;
    const shared = [];
    for (const [w, x] of me.v) {
      const y = other.v.get(w);
      if (y) { dot += x * y; shared.push([w, x * y]); }
    }
    const score = dot / (me.norm * other.norm);
    if (score >= 0.12) out.push({ note: state.notes.get(id), score, shared: shared.sort((a, b) => b[1] - a[1]).slice(0, 3).map((s) => s[0]) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const subNotes = (n) => [...state.notes.values()].filter((c) => c.parent === n.id).sort((a, b) => a.order - b.order);
