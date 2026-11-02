// The vault: unlock state, decrypted notes held in memory, and all writes.

import * as C from './crypto.js';
import { meta, records, files, wipeAll } from './db.js';
import { uid, bytesToB64, b64ToBytes, utf8, fromUtf8 } from './util.js';
import { normNote, normNotebook, normConfig, defaultConfig, deviceLabel } from './model.js';

export const CONFIG_ID = '__config';

export const state = {
  status: 'loading', // loading | new | locked | unlocked
  deviceId: null,
  keyring: null,
  keys: { m: null, s: null },
  notes: new Map(),
  notebooks: new Map(),
  config: null,
  device: null,
  hiddenSealed: 0,
  sync: { state: 'off', message: '', lastSyncAt: null },
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
// Goes up on every change, so screens can tell when cached results are stale.
export let rev = 0;
export function emit(evt) {
  rev++;
  for (const fn of listeners) {
    try { fn(evt); } catch (e) { console.error(e); }
  }
}

let localChangeHook = () => {};
export function onLocalChange(fn) { localChangeHook = fn; }
const changed = () => localChangeHook();

const defaultDevice = () => ({ sync: null, autoLockMin: 10 });

export async function init() {
  state.deviceId = await meta.get('deviceId');
  if (!state.deviceId) {
    state.deviceId = crypto.randomUUID();
    await meta.set('deviceId', state.deviceId);
  }
  state.keyring = (await meta.get('keyring')) || null;
  state.status = state.keyring ? 'locked' : 'new';
}

async function saveDevice() {
  const env = await C.encryptJSON(state.keys.m, 'm', 'device', state.device);
  await meta.set('device', env);
}
export async function updateDevice(patch) {
  state.device = { ...state.device, ...patch };
  await saveDevice();
  emit({ type: 'device' });
}

export async function saveConfig(patch = {}) {
  state.config = normConfig({ ...state.config, ...patch, updatedAt: Date.now() });
  await writeRecord(CONFIG_ID, state.config, 'm');
  emit({ type: 'config' });
  changed();
}

async function writeRecord(id, obj, kid) {
  const key = state.keys[kid];
  if (!key) throw new Error('Unlock sealed notes first.');
  const env = await C.encryptJSON(key, kid, id, obj);
  const prev = await records.get(id);
  await records.put({ id, env, rev: (prev?.rev || 0) + 1, dirty: true, deleted: false, remoteSha: prev?.remoteSha || null });
}

// Records hold either a note or a notebook; put each in the right map.
function place(id, obj) {
  if (obj?.kind === 'notebook') {
    state.notebooks.set(id, normNotebook(obj));
    state.notes.delete(id);
  } else {
    state.notes.set(id, normNote(obj));
    state.notebooks.delete(id);
  }
}

export async function createVault(passphrase) {
  const { wrapped, key } = await C.newWrappedKey(passphrase);
  const keyring = { format: 'second-brain-keyring', v: 1, vaultId: crypto.randomUUID(), main: wrapped, sealed: null, updatedAt: Date.now() };
  await meta.set('keyring', keyring);
  await meta.set('keyringDirty', true);
  state.keyring = keyring;
  state.keys.m = key;
  state.notes = new Map();
  state.notebooks = new Map();
  state.device = defaultDevice();
  await saveDevice();
  state.config = defaultConfig();
  await saveConfig();
  state.status = 'unlocked';
  requestPersistence();
  emit({ type: 'unlock' });
}

// Used when joining an existing vault from another device or a backup.
export async function adoptKeyring(keyring, passphrase, { keyringSha = null } = {}) {
  const key = await C.unwrapKey(keyring.main, passphrase);
  await meta.set('keyring', keyring);
  await meta.set('keyringDirty', false);
  if (keyringSha) await meta.set('keyringSha', keyringSha);
  state.keyring = keyring;
  state.keys.m = key;
  state.device = defaultDevice();
  await saveDevice();
  await loadAll();
  state.status = 'unlocked';
  requestPersistence();
  emit({ type: 'unlock' });
}

function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch { /* not supported */ }
}

export async function unlock(passphrase) {
  state.keys.m = await C.unwrapKey(state.keyring.main, passphrase);
  await loadAll();
  state.status = 'unlocked';
  emit({ type: 'unlock' });
  migrateDefaults().catch((e) => console.warn('migrate', e));
}

// One-off changes to defaults. Lined paper was the default for new pages;
// dot grid is now. Notebooks still on the old default switch (pages already
// written keep their paper).
async function migrateDefaults() {
  if (state.config?.paperV2) return;
  for (const nb of [...state.notebooks.values()]) {
    if (nb.paper === 'ruled' && (!nb.sealed || state.keys.s)) await saveNotebook({ ...nb, paper: 'dotted' }, { touch: false });
  }
  if (state.device?.paper === 'ruled') await updateDevice({ paper: 'dotted' });
  await saveConfig({ paperV2: true });
}

export async function loadAll() {
  const recs = await records.all();
  state.notes = new Map();
  state.notebooks = new Map();
  let hidden = 0;
  let config = null;
  for (const r of recs) {
    if (r.deleted || !r.env) continue;
    if (r.id === CONFIG_ID) {
      try { config = normConfig(await C.decryptJSON(state.keys.m, r.id, r.env)); } catch (e) { console.warn('config unreadable', e); }
      continue;
    }
    const key = state.keys[r.env.k];
    if (!key) { hidden++; continue; }
    try {
      place(r.id, await C.decryptJSON(key, r.id, r.env));
    } catch (e) {
      console.warn('Could not decrypt', r.id, e);
    }
  }
  state.hiddenSealed = hidden;
  state.config = config || state.config || defaultConfig();
  const dev = await meta.get('device');
  if (dev) {
    try { state.device = { ...defaultDevice(), ...(await C.decryptJSON(state.keys.m, 'device', dev)) }; } catch { state.device = defaultDevice(); }
  } else if (!state.device) state.device = defaultDevice();
}

// Apply one record that arrived from sync (already stored locally).
export async function applyRemoteRecord(rec) {
  if (rec.id === CONFIG_ID) {
    try { state.config = normConfig(await C.decryptJSON(state.keys.m, rec.id, rec.env)); emit({ type: 'config' }); } catch { /* ignore */ }
    return;
  }
  const key = state.keys[rec.env.k];
  if (!key) {
    state.notes.delete(rec.id);
    state.notebooks.delete(rec.id);
    state.hiddenSealed++;
    return;
  }
  try {
    place(rec.id, await C.decryptJSON(key, rec.id, rec.env));
    pageCacheDropStale();
  } catch (e) { console.warn('Could not decrypt synced note', rec.id, e); }
}
export function forgetNote(id) {
  state.notes.delete(id);
  state.notebooks.delete(id);
}
export async function decryptEnv(id, env) {
  const key = state.keys[env.k];
  if (!key) return null;
  const obj = await C.decryptJSON(key, id, env);
  return obj?.kind === 'notebook' ? normNotebook(obj) : normNote(obj);
}

export function lock() {
  state.keys.m = null;
  state.keys.s = null;
  state.notes = new Map();
  state.notebooks = new Map();
  pageCache.clear();
  location.reload();
}

export async function changePassphrase(oldPass, newPass) {
  const main = await C.rewrapKey(state.keyring.main, oldPass, newPass);
  state.keyring = { ...state.keyring, main, updatedAt: Date.now() };
  await meta.set('keyring', state.keyring);
  await meta.set('keyringDirty', true);
  changed();
}

// ---- Notes -----------------------------------------------------------------

export async function saveNote(note, { touch = true } = {}) {
  const n = normNote(note);
  if (touch) { n.updatedAt = Date.now(); n.editedOn = deviceLabel(); }
  await writeRecord(n.id, n, n.sealed ? 's' : 'm');
  state.notes.set(n.id, n);
  emit({ type: 'note', id: n.id });
  changed();
  return n;
}

export async function saveNotes(list) {
  const out = [];
  for (const n of list) out.push(await saveNote(n));
  return out;
}

export async function deleteNote(id) {
  const n = state.notes.get(id);
  if (!n) return;
  for (const f of n.files || []) await deleteFile(f.id);
  for (const r of n.recordings || []) await deleteFile(r.fileId);
  for (const fid of await pageFileIds(n)) await deleteFile(fid);
  for (const p of n.pages || []) pageCache.delete(p.id);
  // Sub-notes move up a level rather than vanishing with their parent.
  for (const child of [...state.notes.values()].filter((c) => c.parent === id)) {
    await saveNote({ ...child, parent: n.parent || null }, { touch: false });
  }
  const prev = await records.get(id);
  if (prev?.remoteSha) await records.put({ ...prev, deleted: true, dirty: true, rev: (prev.rev || 0) + 1 });
  else await records.del(id);
  state.notes.delete(id);
  for (const other of [...state.notes.values()]) {
    if (other.links.includes(id) || other.suggested.some((s) => s.id === id)) {
      await saveNote({ ...other, links: other.links.filter((x) => x !== id), suggested: other.suggested.filter((s) => s.id !== id) }, { touch: false });
    }
  }
  emit({ type: 'delete', id });
  changed();
}

export async function linkNotes(a, b) {
  const na = state.notes.get(a);
  const nb = state.notes.get(b);
  if (!na || !nb || a === b) return;
  if (!na.links.includes(b)) {
    await saveNote({ ...na, links: [...na.links, b], suggested: na.suggested.filter((s) => s.id !== b) });
  }
  if (nb.suggested.some((s) => s.id === a)) await saveNote({ ...nb, suggested: nb.suggested.filter((s) => s.id !== a) });
}
export async function unlinkNotes(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const n = state.notes.get(x);
    if (n && n.links.includes(y)) await saveNote({ ...n, links: n.links.filter((l) => l !== y) });
  }
}
export async function dismissSuggestion(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const n = state.notes.get(x);
    if (n && n.suggested.some((s) => s.id === y)) {
      await saveNote({ ...n, suggested: n.suggested.filter((s) => s.id !== y), dismissed: [...n.dismissed, y] });
    }
  }
}

export async function fileNote(id, regionId) {
  const n = state.notes.get(id);
  if (!n) return;
  await saveNote({ ...n, region: regionId, inbox: false, suggestedRegion: null });
}

// ---- Files (images) ---------------------------------------------------------

const urlCache = new Map();

export async function addFile(bytes, { sealed = false, type = 'image/jpeg' } = {}) {
  const id = uid('f');
  const kid = sealed ? 's' : 'm';
  const data = await C.encryptBytes(state.keys[kid], id, bytes);
  await files.put({ id, k: kid, type, data, rev: 1, dirty: true, deleted: false, remoteSha: null });
  changed();
  return id;
}

export async function fileBytes(id) {
  const rec = await files.get(id);
  if (!rec || rec.deleted || !rec.data?.byteLength) return null;
  const key = state.keys[rec.k];
  if (!key) return null;
  return { bytes: await C.decryptBytes(key, id, rec.data), type: rec.type || 'image/jpeg' };
}

export async function fileURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const f = await fileBytes(id);
  if (!f) return null;
  const url = URL.createObjectURL(new Blob([f.bytes], { type: f.type }));
  urlCache.set(id, url);
  return url;
}

export async function fileBlob(id) {
  const f = await fileBytes(id);
  return f ? new Blob([f.bytes], { type: f.type }) : null;
}

export async function deleteFile(id) {
  const rec = await files.get(id);
  if (!rec) return;
  if (rec.remoteSha) await files.put({ ...rec, deleted: true, dirty: true, data: new Uint8Array(0), rev: (rec.rev || 0) + 1 });
  else await files.del(id);
  if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
  changed();
}

export async function reencryptFile(id, toKid) {
  const rec = await files.get(id);
  if (!rec || rec.deleted || rec.k === toKid) return;
  const fromKey = state.keys[rec.k];
  const toKey = state.keys[toKid];
  if (!fromKey || !toKey) throw new Error('Unlock sealed notes first.');
  const bytes = await C.decryptBytes(fromKey, id, rec.data);
  const data = await C.encryptBytes(toKey, id, bytes);
  await files.put({ ...rec, k: toKid, data, dirty: true, rev: (rec.rev || 0) + 1 });
}

export async function setSealed(id, sealed) {
  const n = state.notes.get(id);
  if (!n || n.sealed === sealed) return n;
  if (!state.keys.s) throw new Error('Set up and unlock sealed notes first.');
  for (const f of n.files) await reencryptFile(f.id, sealed ? 's' : 'm');
  for (const r of n.recordings || []) await reencryptFile(r.fileId, sealed ? 's' : 'm');
  for (const fid of await pageFileIds(n)) await reencryptFile(fid, sealed ? 's' : 'm');
  for (const p of n.pages || []) pageCache.delete(p.id);
  return saveNote({ ...n, sealed, sealSuggested: false });
}

// ---- Notebooks ---------------------------------------------------------------

export async function saveNotebook(nb, { touch = true } = {}) {
  const b = normNotebook(nb);
  if (touch) b.updatedAt = Date.now();
  await writeRecord(b.id, b, b.sealed ? 's' : 'm');
  state.notebooks.set(b.id, b);
  emit({ type: 'notebook', id: b.id });
  changed();
  return b;
}

export const notesIn = (notebookId) => [...state.notes.values()].filter((n) => n.notebook === notebookId);

export async function deleteNotebook(id) {
  const b = state.notebooks.get(id);
  if (!b) return;
  for (const n of notesIn(id)) await deleteNote(n.id);
  if (b.cover?.photo) await deleteFile(b.cover.photo);
  const prev = await records.get(id);
  if (prev?.remoteSha) await records.put({ ...prev, deleted: true, dirty: true, rev: (prev.rev || 0) + 1 });
  else await records.del(id);
  state.notebooks.delete(id);
  emit({ type: 'delete', id });
  changed();
}

// Sealing a notebook seals every note in it, and the notebook itself.
export async function setNotebookSealed(id, sealed) {
  const b = state.notebooks.get(id);
  if (!b) return null;
  if (!state.keys.s) throw new Error('Set up and unlock sealed notes first.');
  for (const n of notesIn(id)) await setSealed(n.id, sealed);
  if (b.cover?.photo) await reencryptFile(b.cover.photo, sealed ? 's' : 'm');
  return saveNotebook({ ...b, sealed });
}

// Move a notebook to another region: its notes move with it.
export async function moveNotebook(id, region) {
  const b = state.notebooks.get(id);
  if (!b) return;
  for (const n of notesIn(id)) await saveNote({ ...n, region, inbox: !region, suggestedRegion: null }, { touch: false });
  await saveNotebook({ ...b, region });
}

// ---- Handwritten pages ------------------------------------------------------
// Each page's ink, stickers and text boxes live in their own encrypted file
// (files/<pageId>.bin), so only the page you touched is re-uploaded.

const pageCache = new Map();
function pageCacheDropStale() { /* pages are re-read when a remote file arrives */ }
export function forgetPageCache(id) { if (id) pageCache.delete(id); else pageCache.clear(); }

async function gzip(bytes) {
  if (typeof CompressionStream === 'function') {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(cs).arrayBuffer());
  }
  const { gzipSync } = await import('../vendor/fflate.min.js');
  return gzipSync(bytes);
}
async function gunzip(bytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(ds).arrayBuffer());
  }
  const { gunzipSync } = await import('../vendor/fflate.min.js');
  return gunzipSync(bytes);
}

export const emptyPageData = () => ({ v: 1, strokes: [], objects: [], tomb: [], at: 0 });

export async function decodePageBytes(bytes) {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes;
  const data = JSON.parse(fromUtf8(raw));
  return { ...emptyPageData(), ...data };
}

// A page's data if it's already loaded (no waiting), else null.
export const peekPage = (pageId) => pageCache.get(pageId) || null;

export async function loadPage(pageId) {
  if (pageCache.has(pageId)) return pageCache.get(pageId);
  const rec = await files.get(pageId);
  if (rec && !rec.deleted && !state.keys[rec.k]) throw new Error('Unlock sealed notes first.');
  const f = await fileBytes(pageId);
  const data = f ? await decodePageBytes(f.bytes) : emptyPageData();
  pageCache.set(pageId, data);
  return data;
}

export async function encodePageBytes(data) {
  return gzip(utf8(JSON.stringify(data)));
}

export async function savePage(pageId, data, { sealed = false } = {}) {
  const kid = sealed ? 's' : 'm';
  const key = state.keys[kid];
  if (!key) throw new Error('Unlock sealed notes first.');
  const stamped = { ...data, at: Date.now() };
  const enc = await C.encryptBytes(key, pageId, await encodePageBytes(stamped));
  const prev = await files.get(pageId);
  await files.put({ id: pageId, k: kid, type: 'application/x-ink', data: enc, rev: (prev?.rev || 0) + 1, dirty: true, deleted: false, remoteSha: prev?.remoteSha || null });
  pageCache.set(pageId, stamped);
  changed();
  return stamped;
}

// Every file a handwritten note owns: page ink, page backgrounds, and photos
// placed on pages.
export async function pageFileIds(n) {
  const out = [];
  for (const p of n.pages || []) {
    out.push(p.id);
    if (p.bg) out.push(p.bg);
    try {
      const d = await loadPage(p.id);
      for (const o of d.objects || []) if (o.fileId) out.push(o.fileId);
    } catch { /* page not downloaded yet */ }
  }
  return out;
}

export function revokeFileURLs() {
  for (const u of urlCache.values()) URL.revokeObjectURL(u);
  urlCache.clear();
}

// ---- Sealed notes ----------------------------------------------------------

export const sealedState = () => (!state.keyring?.sealed ? 'none' : state.keys.s ? 'open' : 'locked');

export async function setupSealed(passphrase) {
  const { wrapped, key } = await C.newWrappedKey(passphrase);
  state.keyring = { ...state.keyring, sealed: wrapped, updatedAt: Date.now() };
  await meta.set('keyring', state.keyring);
  await meta.set('keyringDirty', true);
  state.keys.s = key;
  emit({ type: 'sealed' });
  changed();
}

export async function unlockSealed(passphrase) {
  if (!state.keyring?.sealed) throw new Error('Sealed notes aren’t set up yet.');
  state.keys.s = await C.unwrapKey(state.keyring.sealed, passphrase);
  for (const r of await records.all()) {
    if (r.deleted || r.env?.k !== 's') continue;
    try { place(r.id, await C.decryptJSON(state.keys.s, r.id, r.env)); } catch { /* skip */ }
  }
  state.hiddenSealed = 0;
  pageCache.clear();
  emit({ type: 'sealed' });
}

export function lockSealed() {
  state.keys.s = null;
  let hidden = 0;
  for (const n of [...state.notes.values()]) {
    if (n.sealed) { state.notes.delete(n.id); hidden++; for (const p of n.pages) pageCache.delete(p.id); }
  }
  for (const b of [...state.notebooks.values()]) if (b.sealed) state.notebooks.delete(b.id);
  state.hiddenSealed += hidden;
  revokeFileURLs();
  emit({ type: 'sealed' });
}

// ---- Backup / wipe ---------------------------------------------------------

export async function exportBackup() {
  const recs = (await records.all()).filter((r) => !r.deleted);
  const fls = (await files.all()).filter((f) => !f.deleted);
  return JSON.stringify({
    format: 'second-brain-backup',
    v: 1,
    exportedAt: new Date().toISOString(),
    keyring: state.keyring,
    records: recs.map((r) => ({ id: r.id, env: r.env })),
    files: fls.map((f) => ({ id: f.id, k: f.k, type: f.type, data: bytesToB64(f.data) })),
  });
}

export async function restoreBackup(text, passphrase) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn’t a Second brain backup.'); }
  if (data?.format !== 'second-brain-backup' || !data.keyring?.main) throw new Error('That file isn’t a Second brain backup.');
  await C.unwrapKey(data.keyring.main, passphrase); // verify before writing anything
  await records.putMany(data.records.map((r) => ({ id: r.id, env: r.env, rev: 1, dirty: true, deleted: false, remoteSha: null })));
  await files.putMany(data.files.map((f) => ({ id: f.id, k: f.k, type: f.type, data: b64ToBytes(f.data), rev: 1, dirty: true, deleted: false, remoteSha: null })));
  await meta.set('keyringDirty', true);
  await adoptKeyring(data.keyring, passphrase);
  await meta.set('keyringDirty', true);
}

export async function wipeDevice() {
  revokeFileURLs();
  await wipeAll();
  location.reload();
}
