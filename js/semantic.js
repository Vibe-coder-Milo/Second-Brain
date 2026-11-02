// Search by meaning, worked out on this device. Each note is split into a few
// passages; a small language model turns each passage into a vector, and notes
// whose vectors point the same way are about the same thing, even when they
// share no words. Vectors are cached encrypted in this device's storage (sealed
// notes only in memory) and never synced or sent anywhere.

import { state } from './vault.js';
import * as C from './crypto.js';
import { local } from './db.js';
import { displayTitle, noteText } from './model.js';
import { embed } from './ai.js';

const DIM = 384;
const index = new Map(); // noteId -> { hash, chunks: Int8Array[], mean: Float32Array }
let ver = 0; // goes up whenever the index changes
const listeners = new Set();
let loaded = false;
let building = null;
let again = false;
export const semState = { done: 0, total: 0, building: false, error: null };

export const semanticOn = () => state.device?.semantic !== false;
export const onSemantic = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const tell = () => listeners.forEach((f) => f({ ...semState }));

// ---- Passages -------------------------------------------------------------------

function textOf(n) {
  const parts = [n.title ? '' : displayTitle(n), noteText(n)];
  return parts.join('\n').replace(/[#>*_`|[\]]+/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function hashOf(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

const MAX_WORDS = 110;
const MAX_CHUNKS = 8;
export function passages(n) {
  const title = displayTitle(n);
  const paras = textOf(n).split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let cur = [];
  const push = () => { if (cur.length) out.push(cur.join(' ')); cur = []; };
  for (const p of paras) {
    const words = p.split(/\s+/);
    if (cur.length + words.length > MAX_WORDS) push();
    for (let i = 0; i < words.length; i += MAX_WORDS) {
      const slice = words.slice(i, i + MAX_WORDS);
      if (slice.length === MAX_WORDS) { push(); out.push(slice.join(' ')); } else cur.push(...slice);
    }
    if (out.length >= MAX_CHUNKS) break;
  }
  push();
  const list = out.slice(0, MAX_CHUNKS);
  // Every passage carries the title, so a long note still knows what it's about.
  return list.length ? list.map((t, i) => (i === 0 || t.startsWith(title) ? t : `${title}. ${t}`)) : [title];
}

// ---- Storage ----------------------------------------------------------------------

const toInt8 = (v) => { const o = new Int8Array(v.length); for (let i = 0; i < v.length; i++) o[i] = Math.max(-127, Math.min(127, Math.round(v[i] * 127))); return o; };

function meanOf(chunks) {
  const m = new Float32Array(DIM);
  for (const c of chunks) for (let i = 0; i < DIM; i++) m[i] += c[i];
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += m[i] * m[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) m[i] /= norm;
  return m;
}

function encode(hash, chunks) {
  const head = new TextEncoder().encode(JSON.stringify({ hash, n: chunks.length }));
  const out = new Uint8Array(4 + head.length + chunks.length * DIM);
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  chunks.forEach((c, i) => out.set(new Uint8Array(c.buffer, c.byteOffset, DIM), 4 + head.length + i * DIM));
  return out;
}
function decode(bytes) {
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + len)));
  const chunks = [];
  for (let i = 0; i < head.n; i++) chunks.push(new Int8Array(bytes.buffer.slice(bytes.byteOffset + 4 + len + i * DIM, bytes.byteOffset + 4 + len + (i + 1) * DIM)));
  return { hash: head.hash, chunks };
}
const asFloat = (c) => { const f = new Float32Array(DIM); for (let i = 0; i < DIM; i++) f[i] = c[i] / 127; return f; };

async function loadSaved() {
  if (loaded || !state.keys.m) return;
  loaded = true;
  await loadNear();
  for (const r of await local.all()) {
    if (!r.id.startsWith('emb:')) continue;
    const id = r.id.slice(4);
    if (!state.notes.has(id)) { local.del(r.id).catch(() => {}); continue; }
    try {
      const { hash, chunks } = decode(await C.decryptBytes(state.keys.m, r.id, r.data));
      index.set(id, { hash, chunks, mean: meanOf(chunks.map(asFloat)) });
      ver++;
    } catch { /* re-made on the next pass */ }
  }
}

// ---- Building --------------------------------------------------------------------

export function buildSoon(delay = 2500) {
  clearTimeout(buildSoon.t);
  if (!semanticOn()) return;
  buildSoon.t = setTimeout(() => { buildIndex().catch(() => {}); }, delay);
}

export async function buildIndex() {
  if (!semanticOn() || state.status !== 'unlocked') return;
  if (building) { again = true; return building; }
  building = (async () => {
    try {
      do {
        again = false;
        await loadSaved();
        for (const id of [...index.keys()]) if (!state.notes.has(id)) { index.delete(id); ver++; local.del(`emb:${id}`).catch(() => {}); }
        for (const n of state.notes.values()) if (n.sealed) local.del(`emb:${n.id}`).catch(() => {});
        const todo = [];
        for (const n of state.notes.values()) {
          const h = hashOf(textOf(n));
          if (index.get(n.id)?.hash !== h) todo.push({ n, h });
        }
        semState.total = state.notes.size;
        semState.done = semState.total - todo.length;
        semState.building = !!todo.length;
        semState.error = null;
        tell();
        for (const { n, h } of todo) {
          const ps = passages(n);
          const vecs = [];
          for (let i = 0; i < ps.length; i += 8) vecs.push(...await embed(ps.slice(i, i + 8)));
          const chunks = vecs.map(toInt8);
          // The same (rounded) numbers that are saved, so results match after unlocking again.
          index.set(n.id, { hash: h, chunks, mean: meanOf(chunks.map(asFloat)) });
          ver++;
          if (!n.sealed && state.keys.m) {
            const rid = `emb:${n.id}`;
            await local.put({ id: rid, k: 'm', data: await C.encryptBytes(state.keys.m, rid, encode(h, chunks)) });
          }
          semState.done++;
          tell();
          await new Promise((r) => setTimeout(r, 0));
          if (state.status !== 'unlocked') return;
        }
      } while (again);
      semState.building = false;
      tell();
    } catch (e) {
      semState.building = false;
      semState.error = e.message || 'Search by meaning stopped.';
      tell();
      throw e;
    } finally {
      building = null;
    }
  })();
  return building;
}

export function forgetIndex() {
  index.clear();
  ver++;
  nearGen++;
  near = { map: new Map(), hashes: new Map(), ver: -1 };
  nearLoaded = false;
  loaded = false;
  semState.done = 0;
  semState.total = 0;
}

export async function clearIndex() {
  forgetIndex();
  for (const r of await local.all()) if (r.id.startsWith('emb:') || r.id === NEAR_ID) await local.del(r.id);
}

// ---- Queries ----------------------------------------------------------------------

const dotI8 = (q, c) => { let s = 0; for (let i = 0; i < DIM; i++) s += q[i] * c[i]; return s / 127; };
const dotF = (a, b) => { let s = 0; for (let i = 0; i < DIM; i++) s += a[i] * b[i]; return s; };

export const indexReady = () => index.size > 0;
// A note's meaning as one unit vector (or null if not worked out yet).
export const noteVector = (id) => index.get(id)?.mean || null;
export const hasVector = (id) => index.has(id);

const qCache = new Map();
export async function searchByMeaning(query, { limit = 12, min = 0.18, pool = null } = {}) {
  if (!index.size) return [];
  const key = query.trim().toLowerCase();
  let q = qCache.get(key);
  if (!q) {
    [q] = await embed([query]);
    q = Float32Array.from(q);
    qCache.set(key, q);
    if (qCache.size > 40) qCache.delete(qCache.keys().next().value);
  }
  const out = [];
  for (const [id, e] of index) {
    const n = state.notes.get(id);
    if (!n || (pool && !pool.has(id))) continue;
    let best = -1;
    let at = 0;
    e.chunks.forEach((c, i) => { const s = dotI8(q, c); if (s > best) { best = s; at = i; } });
    if (best >= min) out.push({ note: n, score: best, passage: at });
  }
  out.sort((a, b) => b.score - a.score);
  // Keep what's reasonably close to the best match.
  const cut = out.length ? out[0].score * 0.55 : 0;
  return out.filter((x) => x.score >= cut).slice(0, limit);
}

export const indexVersion = () => ver;

// ---- Notes close in meaning ---------------------------------------------------------
// For every note, the few notes closest in meaning (the map, each note's
// mini-map and the assistant read these). Worked out for all pairs once, then
// kept up to date as notes change: only the changed notes are compared again.
// Saved encrypted on this device, so opening the app doesn't redo it. Big
// jobs (thousands of notes) run in small slices, so the app never freezes.

const NEAR = { limit: 4, min: 0.32 };
const NEAR_ID = 'near:lists';
let near = { map: new Map(), hashes: new Map(), ver: -1 };
let nearGen = 0;
let nearBusy = false;
let nearAgain = false;
let nearLoaded = false;

// The version of the index the lists reflect (changes when they're updated).
export const nearVersion = () => near.ver;

function topInsert(list, id, sc) {
  if (sc < NEAR.min) return;
  if (list.length >= NEAR.limit && sc <= list[list.length - 1].score) return;
  let i = list.length;
  while (i > 0 && list[i - 1].score < sc) i--;
  list.splice(i, 0, { id, score: sc });
  if (list.length > NEAR.limit) list.pop();
}

// All pairs, a slice at a time (each pair once).
function allPairs(ids) {
  const vs = ids.map((id) => index.get(id).mean);
  const lists = ids.map(() => []);
  let i = 0;
  return {
    step(ms) {
      const t0 = performance.now();
      while (i < ids.length) {
        const a = vs[i];
        const li = lists[i];
        for (let j = i + 1; j < ids.length; j++) {
          const sc = dotF(a, vs[j]);
          if (sc >= NEAR.min) { topInsert(li, ids[j], sc); topInsert(lists[j], ids[i], sc); }
        }
        i++;
        if (performance.now() - t0 > ms) break;
      }
      return i >= ids.length;
    },
    result: () => new Map(ids.map((id, k) => [id, lists[k]])),
  };
}

// Only what changed: fresh rows for changed notes, offered to everyone else;
// a list that lost a neighbour it needed is worked out again.
function patchPairs(ids, changed, gone) {
  const map = new Map(near.map);
  const bad = new Set([...changed, ...gone]);
  for (const id of gone) map.delete(id);
  const redo = new Set();
  for (const [id, list] of map) {
    if (bad.has(id)) continue;
    if (!list.some((x) => bad.has(x.id))) continue;
    map.set(id, list.filter((x) => !bad.has(x.id)));
    if (list.length >= NEAR.limit) redo.add(id);
  }
  const vec = (id) => index.get(id).mean;
  for (const c of changed) {
    const a = vec(c);
    const row = [];
    for (const o of ids) {
      if (o === c) continue;
      const sc = dotF(a, vec(o));
      if (sc < NEAR.min) continue;
      topInsert(row, o, sc);
      if (!bad.has(o) && !redo.has(o)) { const l = map.get(o) ? [...map.get(o)] : []; topInsert(l, c, sc); map.set(o, l); }
    }
    map.set(c, row);
  }
  for (const r of redo) {
    const a = vec(r);
    const row = [];
    for (const o of ids) if (o !== r) topInsert(row, o, dotF(a, vec(o)));
    map.set(r, row);
  }
  return map;
}

// Bring the lists up to date: straight away when it's quick, otherwise in
// the background (the map and the rest update when it's done).
function refreshNear() {
  if (nearBusy) { nearAgain = true; return; }
  const gen = nearGen;
  const target = ver;
  const ids = [...index.keys()];
  const changed = ids.filter((id) => near.hashes.get(id) !== index.get(id).hash);
  const gone = [...near.hashes.keys()].filter((id) => !index.has(id));
  const finish = (map) => {
    near = { map, hashes: new Map(ids.map((id) => [id, index.get(id).hash])), ver: target };
    saveNearSoon();
  };
  const full = !near.hashes.size || changed.length > ids.length * 0.25;
  const cost = full ? (ids.length * ids.length) / 2 : (changed.length + gone.length + 4) * ids.length;
  if (!full) { finish(patchPairs(ids, changed, gone)); return; }
  if (cost <= 3e5) { const job = allPairs(ids); job.step(Infinity); finish(job.result()); return; }
  nearBusy = true;
  (async () => {
    try {
      const job = allPairs(ids);
      while (!job.step(20)) {
        await new Promise((r) => setTimeout(r, 0));
        if (gen !== nearGen) return;
      }
      if (gen !== nearGen) return;
      finish(job.result());
      tell();
    } finally {
      nearBusy = false;
      if (nearAgain && gen === nearGen) { nearAgain = false; refreshNear(); }
    }
  })();
}

// A fresh full answer, worked out on the spot (to check the kept lists).
export function nearFull() {
  const job = allPairs([...index.keys()]);
  job.step(Infinity);
  return job.result();
}
export const nearBusyNow = () => nearBusy;

export function nearLists() {
  if (near.ver !== ver) refreshNear();
  return near.map;
}

// Kept encrypted on this device (sealed notes left out: theirs are only ever in memory).
let saveT = null;
function saveNearSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    if (!state.keys.m) return;
    const open = (id) => !state.notes.get(id)?.sealed;
    const rows = [];
    for (const [id, list] of near.map) if (open(id)) rows.push([id, list.filter((x) => open(x.id)).map((x) => [x.id, Math.round(x.score * 1e4)])]);
    const hashes = [...near.hashes].filter(([id]) => open(id));
    const body = JSON.stringify({ v: 1, limit: NEAR.limit, min: NEAR.min, rows, hashes });
    try { await local.put({ id: NEAR_ID, k: 'm', data: await C.encryptBytes(state.keys.m, NEAR_ID, new TextEncoder().encode(body)) }); } catch { /* next time */ }
  }, 4000);
}
async function loadNear() {
  if (nearLoaded || !state.keys.m) return;
  nearLoaded = true;
  try {
    const rec = await local.get(NEAR_ID);
    if (!rec) return;
    const o = JSON.parse(new TextDecoder().decode(await C.decryptBytes(state.keys.m, NEAR_ID, rec.data)));
    if (o.v !== 1 || o.limit !== NEAR.limit || o.min !== NEAR.min) return;
    near = { map: new Map(o.rows.map(([id, l]) => [id, l.map(([x, sc]) => ({ id: x, score: sc / 1e4 }))])), hashes: new Map(o.hashes), ver: -1 };
  } catch { /* worked out again */ }
}

// Notes closest in meaning to this one (no model call needed).
export function similarNotes(n, { limit = 4, min = 0.3, exclude = new Set() } = {}) {
  const me = index.get(n.id);
  if (!me) return null;
  const out = [];
  for (const [id, e] of index) {
    if (id === n.id || exclude.has(id)) continue;
    const o = state.notes.get(id);
    if (!o) continue;
    const s = dotF(me.mean, e.mean);
    if (s >= min) out.push({ note: o, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// The passage of a note that best matches, for showing in results.
export function passageText(n, i) {
  const t = passages(n)[i] || '';
  const title = displayTitle(n);
  return t.startsWith(title) ? t.slice(title.length).replace(/^[.\s]+/, '') : t;
}
