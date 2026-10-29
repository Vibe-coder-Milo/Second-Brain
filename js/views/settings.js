// Settings: sync, security, sealed notes, regions, backup.

import { html, raw, $, fmtAgo, toast, downloadText, isoDay } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { meta } from '../db.js';
import { PALETTE } from '../model.js';
import { passphraseStrength } from '../crypto.js';
import { probe, syncNow, explainError } from '../sync.js';
import { confirmSheet } from '../ui.js';
import { syncFields, readSyncFields } from './gate.js';
import { icons } from '../icons.js';

const COLOR_NAMES = { ochre: 'Ochre', sea: 'Sea green', chart: 'Chart blue', plum: 'Plum', brick: 'Brick', olive: 'Olive', teal: 'Teal', rose: 'Rose' };

export function mount(main, params, ctx) {
  let editingSync = !state.device?.sync;
  let pwOpen = false;

  const draw = async () => {
    const sync = state.device?.sync;
    const s = state.sync;
    const sealed = V.sealedState();
    let usage = '';
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage) usage = `${(est.usage / 1048576).toFixed(1)} MB used on this device`;
    } catch { /* ignore */ }
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    const counts = new Map();
    for (const n of state.notes.values()) if (n.region) counts.set(n.region, (counts.get(n.region) || 0) + 1);

    main.innerHTML = `${html`<div class="page settings" style="gap:0">
      <div class="page-head" style="padding-bottom:18px"><h1 class="page-title">Settings</h1></div>

      <section aria-labelledby="s-sync">
        <h2 id="s-sync">Sync with GitHub</h2>
        ${sync && !editingSync ? html`
          <p class="status-line ${s.state === 'error' ? 'error' : ''}">${s.state === 'error' ? icons.cloudErr({ size: 18 }) : icons.cloud({ size: 18 })}
            ${s.state === 'syncing' ? 'Syncing…' : s.state === 'error' ? s.message : s.state === 'offline' ? 'Offline. Changes will sync when you’re back online.' : `Synced ${fmtAgo(s.lastSyncAt)}`}</p>
          <p class="hint">Encrypted notes sync to <strong>${sync.owner}/${sync.repo}</strong> (${sync.branch}). GitHub only ever sees scrambled data.</p>
          <div class="btn-row">
            <button type="button" class="btn" data-act="sync-now">Sync now</button>
            <button type="button" class="btn btn-ghost" data-act="edit-sync">Change repo or token</button>
          </div>`
        : html`
          <p class="hint">Keeps your phone, iPad and computer in step. Set up once per device.</p>
          <ol class="help">
            <li>On GitHub, create a <strong>private</strong> repo (for example <em>second-brain-data</em>) with a README.</li>
            <li>Settings, Developer settings, Fine-grained tokens: generate a token for <em>only</em> that repo, with Contents set to Read and write.</li>
            <li>Paste it below. It’s stored encrypted on this device.</li>
          </ol>
          <form id="sync-form" novalidate style="display:flex;flex-direction:column;gap:12px">
            ${syncFields('s', sync || {})}
            <p class="error" id="sync-err" role="alert" hidden></p>
            <div class="btn-row">
              <button class="btn btn-primary" type="submit" style="flex:1">Connect</button>
              ${sync ? html`<button class="btn btn-ghost" type="button" data-act="cancel-sync">Cancel</button>` : ''}
            </div>
          </form>`}
        ${sync && !editingSync ? html`<button type="button" class="link-btn" data-act="disconnect" style="align-self:flex-start">Stop syncing on this device</button>` : ''}
      </section>

      <section aria-labelledby="s-sec">
        <h2 id="s-sec">Security</h2>
        <div class="field"><label for="autolock">Lock automatically after</label>
          <select id="autolock">${[2, 5, 10, 30, 60].map((m) => html`<option value="${m}" ${state.device.autoLockMin === m ? raw('selected') : ''}>${m} minutes of no use</option>`)}</select></div>
        <div class="btn-row">
          <button type="button" class="btn" data-act="lock">${icons.lock({ size: 16 })}Lock now</button>
          <button type="button" class="btn btn-ghost" data-act="pw" aria-expanded="${pwOpen ? 'true' : 'false'}">Change passphrase</button>
        </div>
        ${pwOpen ? html`<form id="pw-form" novalidate style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label for="pw-old">Current passphrase</label><input id="pw-old" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="pw-new">New passphrase</label><input id="pw-new" type="password" autocomplete="new-password"></div>
          <div class="field"><label for="pw-new2">Type the new one again</label><input id="pw-new2" type="password" autocomplete="new-password"></div>
          <p class="error" id="pw-err" role="alert" hidden></p>
          <button class="btn btn-primary" type="submit">Change passphrase</button>
          <p class="hint">Your other devices will ask for the new passphrase next time they unlock.</p>
        </form>` : ''}
      </section>

      <section aria-labelledby="s-sealed">
        <h2 id="s-sealed">Sealed notes</h2>
        <p class="hint">A second lock for personal notes, like money or health. Sealed notes use their own passphrase, stay hidden until you open them, and are never included in anything you share with Claude.</p>
        ${sealed === 'none' ? html`<form id="sealed-form" novalidate style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="sp1">Sealed passphrase</label><input id="sp1" type="password" autocomplete="new-password"><p class="hint">Make it different from your main passphrase.</p></div>
            <div class="field"><label for="sp2">Type it again</label><input id="sp2" type="password" autocomplete="new-password"></div>
            <p class="error" id="sp-err" role="alert" hidden></p>
            <button class="btn btn-primary" type="submit">Set up sealed notes</button>
          </form>`
        : sealed === 'locked' ? html`<div class="btn-row"><button type="button" class="btn" data-act="unseal">${icons.unlock({ size: 16 })}Open sealed notes</button></div>`
        : html`<div class="btn-row"><button type="button" class="btn" data-act="reseal">${icons.lock({ size: 16 })}Lock sealed notes</button><a class="btn btn-ghost" href="#/notes?sealed=1">View sealed notes</a></div>`}
      </section>

      <section aria-labelledby="s-regions">
        <h2 id="s-regions">Regions</h2>
        <p class="hint">The territories on your map. A region can only be removed once it’s empty.</p>
        ${state.config.regions.map((r, i) => html`<div class="region-edit">
          <label class="sr-only" for="rc-${i}">Colour for ${r.name}</label>
          <select id="rc-${i}" data-color="${i}" style="min-height:44px;font-size:14px">${Object.keys(PALETTE).map((k) => html`<option value="${k}" ${r.color === k ? raw('selected') : ''}>${COLOR_NAMES[k]}</option>`)}</select>
          <label class="sr-only" for="rn-${i}">Name</label>
          <input id="rn-${i}" type="text" value="${r.name}" data-name="${i}" style="min-height:44px">
          <button type="button" class="icon-btn bare" data-del="${i}" aria-label="Remove ${r.name}" ${counts.get(r.id) ? raw('disabled') : ''}>${icons.close({ size: 18 })}</button>
        </div>`)}
        <div class="btn-row"><button type="button" class="btn btn-sm" data-act="add-region">${icons.plus({ size: 16 })}Add region</button></div>
      </section>

      <section aria-labelledby="s-backup">
        <h2 id="s-backup">Backup</h2>
        <p class="hint">Download everything as one encrypted file. You’ll need your passphrase to restore it.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="backup">Download encrypted backup</button></div>
      </section>

      <section aria-labelledby="s-about">
        <h2 id="s-about">This device</h2>
        <p class="hint">${usage || 'Storage use unknown'}. ${persisted ? 'Storage is protected from automatic clean-up.' : 'On iPhone and iPad, add this app to your Home Screen so the system keeps its storage.'}</p>
        <p class="hint">Text in images is read on this device. Nothing is uploaded except encrypted sync to your own GitHub repo.</p>
        <div class="btn-row"><button type="button" class="btn btn-danger" data-act="wipe">Erase this device</button></div>
      </section>
    </div>`}`;
    bind();
  };

  function bind() {
    const on = (sel, fn) => main.querySelectorAll(sel).forEach((b) => { b.onclick = (e) => fn(b, e); });
    on('[data-act=sync-now]', async () => { try { await syncNow(); toast('Synced'); } catch (e) { toast(explainError(e)); } draw(); });
    on('[data-act=edit-sync]', () => { editingSync = true; draw(); });
    on('[data-act=cancel-sync]', () => { editingSync = false; draw(); });
    on('[data-act=disconnect]', async () => {
      const ok = await confirmSheet({ title: 'Stop syncing here?', body: 'Notes stay on this device and in GitHub. Changes made here won’t reach your other devices until you connect again.', confirm: 'Stop syncing' });
      if (!ok) return;
      await V.updateDevice({ sync: null });
      await meta.del('lastHead');
      editingSync = true;
      draw();
    });
    const sf = $('#sync-form', main);
    if (sf) {
      sf.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#sync-err', main);
        const cfg = readSyncFields(main, 's', state.device.sync || {});
        if (!cfg.owner || !cfg.repo || !cfg.token) { err.textContent = 'Fill in the owner, repo and token.'; err.hidden = false; return; }
        const btn = sf.querySelector('[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Checking…';
        try {
          const { remoteKeyring } = await probe(cfg);
          if (remoteKeyring && remoteKeyring.vaultId !== state.keyring.vaultId) {
            throw Object.assign(new Error(), { code: 'VAULT_MISMATCH' });
          }
          await V.updateDevice({ sync: cfg });
          await meta.del('lastHead');
          editingSync = false;
          btn.textContent = 'Syncing…';
          await syncNow();
          toast('Connected and synced');
          draw();
        } catch (ex) {
          err.textContent = explainError(ex);
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Connect';
        }
      };
    }
    const al = $('#autolock', main);
    al.onchange = async () => { await V.updateDevice({ autoLockMin: Number(al.value) }); toast('Saved'); };
    on('[data-act=lock]', () => V.lock());
    on('[data-act=pw]', () => { pwOpen = !pwOpen; draw(); });
    const pf = $('#pw-form', main);
    if (pf) {
      pf.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#pw-err', main);
        const a = $('#pw-new', main).value;
        const st = passphraseStrength(a);
        err.hidden = false;
        if (!st.ok) { err.textContent = st.msg; return; }
        if (a !== $('#pw-new2', main).value) { err.textContent = 'The new passphrases don’t match.'; return; }
        try {
          await V.changePassphrase($('#pw-old', main).value, a);
          pwOpen = false;
          toast('Passphrase changed');
          draw();
        } catch (ex) { err.textContent = ex.code === 'WRONG_PASSPHRASE' ? 'Your current passphrase is wrong.' : ex.message; }
      };
    }
    const spf = $('#sealed-form', main);
    if (spf) {
      spf.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#sp-err', main);
        const a = $('#sp1', main).value;
        const st = passphraseStrength(a);
        err.hidden = false;
        if (!st.ok) { err.textContent = st.msg; return; }
        if (a !== $('#sp2', main).value) { err.textContent = 'The passphrases don’t match.'; return; }
        await V.setupSealed(a);
        toast('Sealed notes are ready');
        draw();
      };
    }
    on('[data-act=unseal]', async () => { if (await ctx.unlockSealed()) draw(); });
    on('[data-act=reseal]', () => { V.lockSealed(); toast('Sealed notes locked'); draw(); });

    main.querySelectorAll('[data-color]').forEach((sel) => {
      sel.onchange = async () => {
        const regions = state.config.regions.map((r, i) => (i === Number(sel.dataset.color) ? { ...r, color: sel.value } : r));
        await V.saveConfig({ regions });
      };
    });
    main.querySelectorAll('[data-name]').forEach((inp) => {
      inp.onchange = async () => {
        const name = inp.value.trim();
        if (!name) { inp.value = state.config.regions[Number(inp.dataset.name)].name; return; }
        const regions = state.config.regions.map((r, i) => (i === Number(inp.dataset.name) ? { ...r, name } : r));
        await V.saveConfig({ regions });
        toast('Renamed');
      };
    });
    on('[data-del]', async (b) => {
      const r = state.config.regions[Number(b.dataset.del)];
      const ok = await confirmSheet({ title: `Remove ${r.name}?`, confirm: 'Remove', danger: true });
      if (!ok) return;
      await V.saveConfig({ regions: state.config.regions.filter((x) => x.id !== r.id) });
      draw();
    });
    on('[data-act=add-region]', async () => {
      const used = new Set(state.config.regions.map((r) => r.color));
      const color = Object.keys(PALETTE).find((k) => !used.has(k)) || 'teal';
      const id = `r${Date.now().toString(36)}`;
      await V.saveConfig({ regions: [...state.config.regions, { id, name: 'New region', color, keywords: [] }] });
      await draw();
      const inputs = main.querySelectorAll('[data-name]');
      inputs[inputs.length - 1]?.select();
    });
    on('[data-act=backup]', async () => {
      downloadText(`second-brain-backup-${isoDay()}.json`, await V.exportBackup(), 'application/json');
      toast('Backup downloaded');
    });
    on('[data-act=wipe]', async () => {
      const ok = await confirmSheet({ title: 'Erase this device?', body: 'Removes every note and key from this device. Anything not synced or backed up is gone for good.', confirm: 'Erase', danger: true });
      if (ok) await V.wipeDevice();
    });
  }

  draw();
  return {
    onEvent(evt) {
      if (['sync', 'sealed', 'config', 'device'].includes(evt.type)) {
        if (main.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
        draw();
      }
    },
  };
}

