// First run (create / join / restore) and the unlock screen.

import { html, $, fmtDate, fmtTime, readFileText } from '../util.js';
import { meta } from '../db.js';
import * as V from '../vault.js';
import { passphraseStrength } from '../crypto.js';
import { GitHub, fetchRemoteKeyring, explainError, syncNow } from '../sync.js';
import { contourArt, icons } from '../icons.js';

export async function renderUnlock(root) {
  const last = await meta.get('lastSyncAt');
  root.innerHTML = `${html`<div class="gate">
    ${contourArt}
    <form id="unlock" novalidate>
      <div style="display:flex;flex-direction:column;gap:8px">
        <h1>Second brain</h1>
        <p class="muted" style="margin:0">Locked. Your notes are encrypted on this device.</p>
      </div>
      <div class="field">
        <label for="pass">Passphrase</label>
        <input id="pass" type="password" autocomplete="current-password" autofocus>
      </div>
      <p class="error" id="err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Unlock</button>
      <p class="hint">There is no reset. Without your passphrase, nobody can open these notes, not even you.</p>
    </form>
    ${last ? html`<p class="foot"><span style="color:var(--good);display:inline-flex">${icons.cloud({ size: 16, sw: 2 })}</span>Last synced ${fmtDate(last)} at ${fmtTime(last)}, encrypted</p>` : ''}
  </div>`}`;
  const form = $('#unlock', root);
  const err = $('#err', root);
  const btn = form.querySelector('[type=submit]');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const p = $('#pass', root).value;
    if (!p) return;
    btn.disabled = true;
    btn.textContent = 'Unlocking…';
    err.hidden = true;
    try {
      await V.unlock(p);
    } catch (ex) {
      err.textContent = ex.code === 'WRONG_PASSPHRASE' ? 'That passphrase doesn’t match. Try again.' : (ex.message || 'Could not unlock.');
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Unlock';
      $('#pass', root).select();
    }
  };
}

export function renderOnboarding(root, step = 'choose') {
  const views = { choose, create, join, restore };
  root.innerHTML = `${html`<div class="gate">${contourArt}<div class="stack" id="ob"></div></div>`}`;
  const box = $('#ob', root);
  const go = (s) => { views[s](box, go); window.scrollTo(0, 0); };
  go(step);
}

function choose(box, go) {
  box.innerHTML = `${html`
    <div style="display:flex;flex-direction:column;gap:8px">
      <h1>Second brain</h1>
      <p class="muted" style="margin:0">A private, encrypted map of your notes, screenshots and ideas.</p>
    </div>
    <button type="button" class="choice" data-go="create"><strong>Start a new second brain</strong><span>Set a passphrase and begin capturing on this device.</span></button>
    <button type="button" class="choice" data-go="join"><strong>Set up from another device</strong><span>Already syncing to GitHub? Connect this device to it.</span></button>
    <button type="button" class="choice" data-go="restore"><strong>Restore a backup file</strong><span>Use an encrypted backup you downloaded earlier.</span></button>`}`;
  box.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
}

function create(box, go) {
  box.innerHTML = `${html`
    <button type="button" class="back" data-back>${icons.back()}Back</button>
    <h1 style="font-size:32px">Choose a passphrase</h1>
    <p class="muted" style="margin:0">It encrypts everything on this device and in sync. Four or more random words is easy to type and hard to guess.</p>
    <form id="f" novalidate class="stack">
      <div class="field"><label for="p1">Passphrase</label><input id="p1" type="password" autocomplete="new-password" autofocus><p class="hint" id="strength" aria-live="polite"></p></div>
      <div class="field"><label for="p2">Type it again</label><input id="p2" type="password" autocomplete="new-password"></div>
      <label class="check"><input type="checkbox" id="ack"> I understand there’s no way to reset it</label>
      <p class="error" id="err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Create my second brain</button>
    </form>`}`;
  box.querySelector('[data-back]').onclick = () => go('choose');
  const p1 = $('#p1', box);
  const st = $('#strength', box);
  p1.addEventListener('input', () => { st.textContent = p1.value ? passphraseStrength(p1.value).msg : ''; });
  $('#f', box).onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#err', box);
    const a = p1.value;
    const b = $('#p2', box).value;
    const s = passphraseStrength(a);
    err.hidden = false;
    if (!s.ok) { err.textContent = s.msg; return; }
    if (a !== b) { err.textContent = 'The two passphrases don’t match.'; return; }
    if (!$('#ack', box).checked) { err.textContent = 'Tick the box to confirm you’ll keep your passphrase safe.'; return; }
    err.hidden = true;
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try { await V.createVault(a); } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Create my second brain'; }
  };
}

export function syncFields(prefix = 'gh', cur = {}) {
  return html`
    <div class="row2">
      <div class="field"><label for="${prefix}-owner">GitHub owner</label><input id="${prefix}-owner" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" value="${cur.owner || 'Vibe-coder-Milo'}"></div>
      <div class="field"><label for="${prefix}-repo">Data repo</label><input id="${prefix}-repo" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" value="${cur.repo || 'second-brain-data'}"></div>
    </div>
    <div class="field"><label for="${prefix}-branch">Branch</label><input id="${prefix}-branch" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" value="${cur.branch || 'main'}"></div>
    <div class="field"><label for="${prefix}-token">Access token</label><input id="${prefix}-token" type="password" autocomplete="off" spellcheck="false" placeholder="${cur.token ? 'Saved. Paste a new one to replace it' : 'github_pat_…'}"><p class="hint">A fine-grained token with access to only this repo, and Contents set to Read and write.</p></div>`;
}

export function readSyncFields(root, prefix = 'gh', cur = {}) {
  const v = (k) => $(`#${prefix}-${k}`, root).value.trim();
  return { owner: v('owner'), repo: v('repo'), branch: v('branch') || 'main', token: v('token') || cur.token || '' };
}

function join(box, go) {
  box.innerHTML = `${html`
    <button type="button" class="back" data-back>${icons.back()}Back</button>
    <h1 style="font-size:32px">Connect this device</h1>
    <p class="muted" style="margin:0">Use the same repo, token and passphrase as your other device. Your notes download encrypted and unlock here.</p>
    <form id="f" novalidate class="stack">
      ${syncFields('j')}
      <div class="field"><label for="jp">Passphrase</label><input id="jp" type="password" autocomplete="current-password"></div>
      <p class="error" id="err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Connect and download</button>
    </form>`}`;
  box.querySelector('[data-back]').onclick = () => go('choose');
  $('#f', box).onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#err', box);
    const cfg = readSyncFields(box, 'j');
    const pass = $('#jp', box).value;
    if (!cfg.owner || !cfg.repo || !cfg.token || !pass) { err.textContent = 'Fill in every field.'; err.hidden = false; return; }
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    err.hidden = true;
    try {
      const remote = await fetchRemoteKeyring(new GitHub(cfg));
      if (!remote) throw new Error('No second brain found in that repo yet. Set it up on your first device, or start a new one here.');
      btn.textContent = 'Unlocking…';
      await V.adoptKeyring(remote.keyring, pass, { keyringSha: remote.sha });
      await V.updateDevice({ sync: cfg });
      syncNow({ quiet: true }).catch(() => {});
    } catch (ex) {
      err.textContent = ex.code === 'WRONG_PASSPHRASE' ? 'That passphrase doesn’t open this vault.' : (ex.status ? explainError(ex) : ex.message);
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Connect and download';
    }
  };
}

function restore(box, go) {
  box.innerHTML = `${html`
    <button type="button" class="back" data-back>${icons.back()}Back</button>
    <h1 style="font-size:32px">Restore a backup</h1>
    <form id="f" novalidate class="stack">
      <div class="field"><label for="file">Backup file</label><input id="file" type="file" accept=".json,application/json"></div>
      <div class="field"><label for="rp">Passphrase</label><input id="rp" type="password" autocomplete="current-password"></div>
      <p class="error" id="err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Restore</button>
    </form>`}`;
  box.querySelector('[data-back]').onclick = () => go('choose');
  $('#f', box).onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#err', box);
    const file = $('#file', box).files[0];
    const pass = $('#rp', box).value;
    if (!file || !pass) { err.textContent = 'Choose the backup file and enter its passphrase.'; err.hidden = false; return; }
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Restoring…';
    try {
      await V.restoreBackup(await readFileText(file), pass);
    } catch (ex) {
      err.textContent = ex.code === 'WRONG_PASSPHRASE' ? 'That passphrase doesn’t open this backup.' : ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Restore';
    }
  };
}
