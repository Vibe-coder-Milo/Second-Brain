// Encrypted sync to a private GitHub repo using the Git Data API.
// GitHub only ever receives ciphertext: notes/<id>.json, files/<id>.bin and
// keyring.json (the data keys, wrapped by your passphrases).
// Each sync is one commit, so the repo history doubles as version history.

import { meta, records, files } from './db.js';
import { state, emit, applyRemoteRecord, forgetNote, decryptEnv, saveNote, CONFIG_ID } from './vault.js';
import { textToB64, b64ToText, bytesToB64, b64ToBytes, debounce } from './util.js';
// (bytesToB64 / b64ToBytes carry encrypted file payloads.)
import { normNote, displayTitle } from './model.js';

const apiBase = () => 'https://api.github.com';

export class GitHub {
  constructor({ owner, repo, branch = 'main', token }) {
    Object.assign(this, { owner, repo, branch, token });
  }
  async req(method, path, body) {
    const res = await fetch(`${apiBase()}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      const e = new Error(`GitHub ${res.status}`);
      e.status = res.status;
      try { e.detail = (await res.json()).message; } catch { e.detail = ''; }
      throw e;
    }
    return res.status === 204 ? null : res.json();
  }
  repoInfo() { return this.req('GET', ''); }
  getRef() { return this.req('GET', `/git/ref/heads/${encodeURIComponent(this.branch)}`); }
  getCommit(sha) { return this.req('GET', `/git/commits/${sha}`); }
  getTree(sha) { return this.req('GET', `/git/trees/${sha}?recursive=1`); }
  getBlob(sha) { return this.req('GET', `/git/blobs/${sha}`); }
  createBlob(b64) { return this.req('POST', '/git/blobs', { content: b64, encoding: 'base64' }); }
  createTree(base, tree) { return this.req('POST', '/git/trees', base ? { base_tree: base, tree } : { tree }); }
  createCommit(message, tree, parents) { return this.req('POST', '/git/commits', { message, tree, parents }); }
  updateRef(sha) { return this.req('PATCH', `/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha, force: false }); }
  putContents(path, b64, message) { return this.req('PUT', `/contents/${path}`, { message, content: b64, branch: this.branch }); }
}

export function explainError(e) {
  if (!navigator.onLine) return 'You’re offline. Changes are saved here and will sync later.';
  if (e?.code === 'VAULT_MISMATCH') return 'That repo holds a different vault. Pick an empty repo, or set this device up from that vault.';
  switch (e?.status) {
    case 401: return 'GitHub rejected the token. Check it hasn’t expired.';
    case 403: return 'The token can’t write to that repo. Give it Contents: Read and write access.';
    case 404: return 'Repo not found. Check the owner and name, and that the token can see it.';
    case 409: return 'The repo is empty. Add a README on GitHub, then try again.';
    default: return e?.detail || e?.message || 'Sync failed.';
  }
}

const ghFromDevice = () => {
  const s = state.device?.sync;
  return s?.token && s.owner && s.repo ? new GitHub(s) : null;
};

export const isConfigured = () => !!ghFromDevice();

function setSync(patch) {
  state.sync = { ...state.sync, ...patch };
  emit({ type: 'sync' });
}

// Fetch the repo's current tree. Returns null head for an empty repo.
async function remoteState(gh) {
  let ref;
  try {
    ref = await gh.getRef();
  } catch (e) {
    if (e.status === 409) return { head: null, treeSha: null, entries: [] }; // empty repository
    if (e.status === 404) {
      await gh.repoInfo(); // throws a clearer 404 if the repo itself is missing
      return { head: null, treeSha: null, entries: [] };
    }
    throw e;
  }
  const head = ref.object.sha;
  const commit = await gh.getCommit(head);
  const tree = await gh.getTree(commit.tree.sha);
  return { head, treeSha: commit.tree.sha, entries: (tree.tree || []).filter((t) => t.type === 'blob') };
}

export async function fetchRemoteKeyring(gh) {
  const rs = await remoteState(gh);
  const kr = rs.entries.find((e) => e.path === 'keyring.json');
  if (!kr) return null;
  const blob = await gh.getBlob(kr.sha);
  return { keyring: JSON.parse(b64ToText(blob.content)), sha: kr.sha };
}

async function pool(items, n, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

let running = null;
let again = false;

export function syncNow(opts) {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce(opts);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce({ quiet = false } = {}) {
  const gh = ghFromDevice();
  if (!gh || state.status !== 'unlocked') { setSync({ state: 'off' }); return; }
  if (!navigator.onLine) { setSync({ state: 'offline', message: explainError() }); return; }
  setSync({ state: 'syncing', message: '' });
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const done = await attemptSync(gh);
      if (done) {
        const now = Date.now();
        await meta.set('lastSyncAt', now);
        setSync({ state: 'idle', lastSyncAt: now, message: '' });
        return;
      }
    }
    throw new Error('Sync kept colliding with another device. Try again in a moment.');
  } catch (e) {
    console.error('sync failed', e);
    setSync({ state: navigator.onLine ? 'error' : 'offline', message: explainError(e) });
    if (!quiet) throw e;
  }
}

// One pass. Returns false if the branch moved underneath us and we should retry.
async function attemptSync(gh) {
  const lastHead = await meta.get('lastHead');
  const localRecs = await records.all();
  const localFiles = await files.all();
  const keyringDirty = !!(await meta.get('keyringDirty'));
  const anyDirty = keyringDirty || localRecs.some((r) => r.dirty) || localFiles.some((f) => f.dirty);

  // Cheap check: nothing changed on either side.
  if (!anyDirty && lastHead) {
    try {
      const ref = await gh.getRef();
      if (ref.object.sha === lastHead) return true;
    } catch (e) { if (e.status !== 409) throw e; }
  }

  let { head, treeSha, entries } = await remoteState(gh);

  // Empty repo: create the first commit through the contents API.
  if (!head) {
    await gh.putContents('keyring.json', textToB64(JSON.stringify(state.keyring, null, 2)), 'Create vault');
    return false;
  }

  const remote = new Map();
  let remoteKeyring = null;
  for (const e of entries) {
    if (e.path === 'keyring.json') { remoteKeyring = e; continue; }
    const m = e.path.match(/^(notes|files)\/([A-Za-z0-9_-]+)\.(json|bin)$/);
    if (m) remote.set(`${m[1]}:${m[2]}`, e.sha);
  }

  // Keyring: make sure this repo belongs to this vault.
  const treeEntries = [];
  const keyringSha = await meta.get('keyringSha');
  if (remoteKeyring && remoteKeyring.sha !== keyringSha) {
    const rk = JSON.parse(b64ToText((await gh.getBlob(remoteKeyring.sha)).content));
    if (rk.vaultId !== state.keyring.vaultId) {
      const err = new Error('vault mismatch');
      err.code = 'VAULT_MISMATCH';
      throw err;
    }
    if (!keyringDirty) {
      // Another device changed a passphrase or set up sealed notes.
      state.keyring = rk;
      await meta.set('keyring', rk);
      await meta.set('keyringSha', remoteKeyring.sha);
      emit({ type: 'sealed' });
    }
  }
  let pushKeyring = keyringDirty || !remoteKeyring;

  // ---- Work out what to pull and push.
  const pulls = [];
  const pushes = [];
  const deletes = [];
  const conflicts = [];
  const localGone = [];
  const seen = new Set();

  const plan = (kind, list) => {
    for (const r of list) {
      const key = `${kind}:${r.id}`;
      seen.add(key);
      const rs = remote.get(key);
      if (r.deleted) {
        if (!rs) localGone.push({ kind, id: r.id });
        else if (!r.remoteSha || rs === r.remoteSha) deletes.push({ kind, id: r.id });
        else pulls.push({ kind, id: r.id, sha: rs }); // edited elsewhere after we deleted: keep the edit
        continue;
      }
      if (rs) {
        if (rs !== r.remoteSha) {
          if (r.dirty && kind === 'notes') conflicts.push({ rec: r, sha: rs });
          else if (r.dirty) pushes.push({ kind, rec: r });
          else pulls.push({ kind, id: r.id, sha: rs });
        } else if (r.dirty) pushes.push({ kind, rec: r });
      } else if (r.remoteSha && !r.dirty) {
        localGone.push({ kind, id: r.id }); // deleted on another device
      } else {
        pushes.push({ kind, rec: r });
      }
    }
  };
  plan('notes', localRecs);
  plan('files', localFiles);
  for (const [key, sha] of remote) {
    if (seen.has(key)) continue;
    const [kind, id] = key.split(':');
    pulls.push({ kind, id, sha });
  }

  // ---- Pull (notes first, so files can be matched to them).
  await pool(pulls.filter((p) => p.kind === 'notes'), 4, async (p) => {
    const env = JSON.parse(b64ToText((await gh.getBlob(p.sha)).content));
    const rec = { id: p.id, env, rev: 1, dirty: false, deleted: false, remoteSha: p.sha };
    await records.put(rec);
    await applyRemoteRecord(rec);
  });
  await pool(pulls.filter((p) => p.kind === 'files'), 3, async (p) => {
    const { k, data } = unpackFile(b64ToBytes((await gh.getBlob(p.sha)).content));
    await files.put({ id: p.id, k, type: fileType(p.id), data, rev: 1, dirty: false, deleted: false, remoteSha: p.sha });
  });

  // ---- Conflicts. If only OCR results differ, merge quietly. Otherwise the
  // newer version wins and the other is kept as a copy in the inbox.
  for (const { rec, sha } of conflicts) {
    const env = JSON.parse(b64ToText((await gh.getBlob(sha)).content));
    if (rec.id === CONFIG_ID) { pushes.push({ kind: 'notes', rec: { ...rec, remoteSha: sha } }); continue; }
    const remoteNote = await decryptEnv(rec.id, env).catch(() => null);
    const localNote = state.notes.get(rec.id) || (await decryptEnv(rec.id, rec.env).catch(() => null));
    if (!remoteNote || !localNote) {
      pushes.push({ kind: 'notes', rec: { ...rec, remoteSha: sha } }); // can't compare: keep ours
      continue;
    }
    if (sameContent(localNote, remoteNote)) {
      await records.put({ ...rec, remoteSha: sha });
      const saved = await saveNote(mergeOcr(localNote, remoteNote), { touch: false });
      pushes.push({ kind: 'notes', rec: await records.get(saved.id) });
      continue;
    }
    const remoteNewer = remoteNote.updatedAt > localNote.updatedAt;
    const loser = remoteNewer ? localNote : remoteNote;
    if (remoteNewer) {
      const r2 = { id: rec.id, env, rev: (rec.rev || 0) + 1, dirty: false, deleted: false, remoteSha: sha };
      await records.put(r2);
      await applyRemoteRecord(r2);
    } else {
      pushes.push({ kind: 'notes', rec: { ...rec, remoteSha: sha } });
    }
    const copy = await saveNote({
      ...normNote({ ...loser }),
      id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      title: `${displayTitle(loser)} (conflict copy)`,
      titleAuto: false,
      inbox: true,
      region: null,
      suggestedRegion: loser.region,
      source: 'conflict',
      files: [],
      links: [],
      suggested: [],
    });
    pushes.push({ kind: 'notes', rec: await records.get(copy.id) });
  }

  // ---- Push.
  const pushed = [];
  if (pushes.length || deletes.length || pushKeyring) {
    await pool(pushes, 4, async ({ kind, rec }) => {
      const content = kind === 'notes' ? textToB64(JSON.stringify(rec.env)) : bytesToB64(packFile(rec));
      const blob = await gh.createBlob(content);
      treeEntries.push({ path: `${kind}/${rec.id}.${kind === 'notes' ? 'json' : 'bin'}`, mode: '100644', type: 'blob', sha: blob.sha });
      pushed.push({ kind, id: rec.id, rev: rec.rev, sha: blob.sha });
    });
    for (const d of deletes) {
      treeEntries.push({ path: `${d.kind}/${d.id}.${d.kind === 'notes' ? 'json' : 'bin'}`, mode: '100644', type: 'blob', sha: null });
    }
    let keyringBlob = null;
    if (pushKeyring) {
      keyringBlob = await gh.createBlob(textToB64(JSON.stringify(state.keyring, null, 2)));
      treeEntries.push({ path: 'keyring.json', mode: '100644', type: 'blob', sha: keyringBlob.sha });
    }
    const tree = await gh.createTree(treeSha, treeEntries);
    const n = pushes.filter((p) => p.kind === 'notes').length;
    const f = pushes.length - n;
    const parts = [];
    if (n) parts.push(`${n} note${n === 1 ? '' : 's'}`);
    if (f) parts.push(`${f} file${f === 1 ? '' : 's'}`);
    if (deletes.length) parts.push(`${deletes.length} deleted`);
    if (pushKeyring && !parts.length) parts.push('keys');
    const commit = await gh.createCommit(`Sync: ${parts.join(', ')}`, tree.sha, [head]);
    try {
      await gh.updateRef(commit.sha);
    } catch (e) {
      if (e.status === 422 || e.status === 409) return false; // someone else pushed first
      throw e;
    }
    head = commit.sha;

    for (const p of pushed) {
      const table = p.kind === 'notes' ? records : files;
      const cur = await table.get(p.id);
      if (!cur) continue;
      await table.put({ ...cur, remoteSha: p.sha, dirty: cur.rev === p.rev ? false : cur.dirty });
    }
    for (const d of deletes) await (d.kind === 'notes' ? records : files).del(d.id);
    if (keyringBlob) {
      await meta.set('keyringSha', keyringBlob.sha);
      await meta.set('keyringDirty', false);
    }
  }

  // ---- Things deleted on other devices.
  for (const g of localGone) {
    if (g.kind === 'notes') {
      await records.del(g.id);
      forgetNote(g.id);
    } else {
      await files.del(g.id);
    }
  }

  await meta.set('lastHead', head);
  if (pulls.length || conflicts.length || localGone.length) emit({ type: 'remote' });
  return true;
}

const CONTENT_KEYS = ['body', 'type', 'region', 'inbox', 'sealed', 'tags', 'links', 'url', 'chat', 'suggestedRegion', 'dismissed'];
function sameContent(a, b) {
  const pick = (n) => {
    const o = Object.fromEntries(CONTENT_KEYS.map((k) => [k, n[k]]));
    o.files = n.files.map((f) => f.id);
    if (!a.titleAuto && !b.titleAuto) o.title = n.title;
    return JSON.stringify(o);
  };
  return pick(a) === pick(b);
}
function mergeOcr(local, remote) {
  const files = local.files.map((f) => {
    const r = remote.files.find((x) => x.id === f.id);
    return f.ocrStatus === 'pending' && r && r.ocrStatus !== 'pending' ? r : f;
  });
  const title = local.title || remote.title;
  const suggested = [...local.suggested, ...remote.suggested.filter((s) => !local.suggested.some((x) => x.id === s.id))];
  return { ...local, files, title, suggested, updatedAt: Math.max(local.updatedAt, remote.updatedAt) };
}

// Remote file layout: one byte naming the key ('m' main, 's' sealed), then iv||ciphertext.
function packFile(rec) {
  const out = new Uint8Array(1 + rec.data.byteLength);
  out[0] = rec.k === 's' ? 0x73 : 0x6d;
  out.set(new Uint8Array(rec.data), 1);
  return out;
}
function unpackFile(bytes) {
  return { k: bytes[0] === 0x73 ? 's' : 'm', data: bytes.slice(1) };
}
function fileType(fileId) {
  for (const n of state.notes.values()) {
    const f = n.files.find((x) => x.id === fileId);
    if (f?.type) return f.type;
  }
  return 'image/jpeg';
}

// ---- Scheduling ----------------------------------------------------------

const soon = debounce(() => syncNow({ quiet: true }).catch(() => {}), 4000);
export function scheduleSync() {
  if (isConfigured()) soon();
}

let timer = null;
export function startAutoSync() {
  if (timer) return;
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') syncNow({ quiet: true }).catch(() => {});
  }, 3 * 60 * 1000);
  window.addEventListener('online', () => syncNow({ quiet: true }).catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow({ quiet: true }).catch(() => {});
  });
  meta.get('lastSyncAt').then((t) => { if (t) setSync({ lastSyncAt: t }); });
  if (isConfigured()) {
    setSync({ state: 'idle' });
    syncNow({ quiet: true }).catch(() => {});
  }
}

// Check a repo before saving settings: returns { remoteKeyring } or throws.
export async function probe(cfg) {
  const gh = new GitHub(cfg);
  await gh.repoInfo();
  const r = await fetchRemoteKeyring(gh);
  return { remoteKeyring: r?.keyring || null, sha: r?.sha || null };
}
