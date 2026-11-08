// Settings: sync, security, sealed notes, regions, backup.

import { html, raw, $, fmtAgo, toast, downloadText, isoDay } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { meta } from '../db.js';
import { PALETTE, TEXT_DEFAULT_COLORS, REGION_COLOUR_NAMES, regionColors } from '../model.js';
import { FONT_IDS, TEXT_SIZES, TEXT_SIZE, fontCss } from '../fonts.js';
import { passphraseStrength } from '../crypto.js';
import { probe, syncNow, explainError } from '../sync.js';
import { confirmSheet, openSheet, popover } from '../ui.js';
import * as C from '../crypto.js';
import * as B from '../deviceunlock.js';
import { syncFields, readSyncFields } from './gate.js';
import { icons } from '../icons.js';
import { themePref, applyTheme } from '../theme.js';
import { appVersion, checkForUpdate } from '../appupdate.js';

// Default text: font, size and colour for new typed text (synced to every device).
function textPrefsHtml() {
  const t = state.config.text || {};
  const size = t.size || TEXT_SIZE;
  return String(html`
    <div class="set-row"><label for="s-text-font">Font</label>
      <select id="s-text-font" class="text-font-pick">
        <option value="" ${!t.font ? raw('selected') : ''}>Usual (Spectral in notes)</option>
        ${FONT_IDS.map((f) => html`<option value="${f}" ${t.font === f ? raw('selected') : ''}>${f}</option>`)}
      </select></div>
    <div class="set-row"><span id="s-text-size-l">Size</span>
      <div class="seg text-sizes" role="radiogroup" aria-labelledby="s-text-size-l">${TEXT_SIZES.map((n) => html`<button type="button" role="radio" data-text-size="${n}" aria-checked="${n === size ? 'true' : 'false'}" aria-label="${n} point">${n}</button>`)}</div></div>
    <div class="set-row"><span id="s-text-col-l">Colour</span>
      <div class="text-colours" role="radiogroup" aria-labelledby="s-text-col-l">
        <button type="button" role="radio" class="swatch usual" data-text-colour="" aria-checked="${!t.color ? 'true' : 'false'}" aria-label="Usual ink (follows light and dark)"></button>
        ${TEXT_DEFAULT_COLORS.map(([n, c]) => html`<button type="button" role="radio" class="swatch" data-text-colour="${c}" style="background:${c}" aria-checked="${t.color === c ? 'true' : 'false'}" aria-label="${n}"></button>`)}
      </div></div>
    <p class="rich text-sample" id="s-text-sample" style="font-family:${t.font ? fontCss(t.font) : 'var(--serif)'}">This is how your typed text will look.</p>`);
}
function bindTextPrefs(main) {
  const host = $('#s-text', main);
  if (!host) return;
  const save = async (patch) => {
    await V.saveConfig({ text: { ...state.config.text, ...patch } });
    host.innerHTML = textPrefsHtml();
  };
  host.addEventListener('change', (e) => { if (e.target.id === 's-text-font') save({ font: e.target.value || null }); });
  host.addEventListener('click', (e) => {
    const sz = e.target.closest('[data-text-size]');
    if (sz) { save({ size: Number(sz.dataset.textSize) }); return; }
    const col = e.target.closest('[data-text-colour]');
    if (col) save({ color: col.dataset.textColour || null });
  });
}

// Turning on Touch ID / Face ID: check the passphrase, make a passkey, then
// lock a copy of the key with it. Each step that asks for Touch ID or Face ID
// starts from a tap (Safari needs that).
function bioSetup() {
  return new Promise((resolve) => {
    let opener = null;
    let credId = null;
    let done = false;
    const s = openSheet(`${html`<div class="stack bio-setup" style="display:flex;flex-direction:column;gap:16px">
      <h2 class="page-title" style="font-size:26px">Unlock with ${B.bioName}</h2>
      <ol class="bio-steps"><li>Enter your passphrase, to show it’s you.</li><li>Confirm with ${B.bioName}.</li></ol>
      <form id="bio-f" style="display:flex;flex-direction:column;gap:14px" novalidate>
        <div class="field"><label for="bio-p">Passphrase</label><input id="bio-p" type="password" autocomplete="current-password"></div>
        <button class="btn btn-primary btn-block" type="submit">Continue</button>
      </form>
      <div id="bio-go" hidden style="display:flex;flex-direction:column;gap:12px">
        <p class="muted" id="bio-msg" style="margin:0">Now confirm with ${B.bioName}.</p>
        <button class="btn btn-primary btn-block btn-bio" type="button" id="bio-btn">${icons.fingerprint({ size: 22 })}Use ${B.bioName}</button>
      </div>
      <p class="error" id="bio-err" role="alert" hidden></p>
      <button class="btn btn-ghost btn-block" type="button" data-cancel>Cancel</button>
    </div>`}`, { label: `Unlock with ${B.bioName}`, onClose: () => { opener?.discard(); resolve(done); } });
    const $s = (sel) => s.el.querySelector(sel);
    const fail = (e) => { $s('#bio-err').textContent = e.message || 'That didn’t work.'; $s('#bio-err').hidden = false; };
    $s('[data-cancel]').onclick = () => s.close();
    $s('#bio-f').onsubmit = async (e) => {
      e.preventDefault();
      const p = $s('#bio-p').value;
      if (!p) return;
      const sub = $s('#bio-f [type=submit]');
      sub.disabled = true;
      sub.textContent = 'Checking…';
      $s('#bio-err').hidden = true;
      try {
        opener = await C.openForDevice(state.keyring.main, p);
        $s('#bio-f').hidden = true;
        $s('#bio-go').hidden = false;
        $s('#bio-btn').focus();
      } catch (ex) {
        fail(ex.code === 'WRONG_PASSPHRASE' ? { message: 'That passphrase doesn’t match.' } : ex);
        sub.disabled = false;
        sub.textContent = 'Continue';
      }
    };
    $s('#bio-btn').onclick = async () => {
      const b = $s('#bio-btn');
      b.disabled = true;
      $s('#bio-err').hidden = true;
      try {
        if (!credId) credId = await B.register();
        try {
          await B.finish(opener, credId);
        } catch (ex) {
          // Safari wants a fresh tap for the second ask.
          if (ex.code !== 'NotAllowedError') throw ex;
          $s('#bio-msg').textContent = `One more time to finish: confirm with ${B.bioName} again.`;
          b.disabled = false;
          return;
        }
        done = true;
        s.close();
      } catch (ex) {
        fail(ex);
        b.disabled = false;
      }
    };
  });
}

const COLOR_NAMES = REGION_COLOUR_NAMES;

export function mount(main, params, ctx) {
  let editingSync = !state.device?.sync;
  let pwOpen = false;
  const cleanups = [];

  const draw = async () => {
    cleanups.splice(0).forEach((f) => f());
    const sync = state.device?.sync;
    const s = state.sync;
    const sealed = V.sealedState();
    let usage = '';
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage) usage = `${(est.usage / 1048576).toFixed(1)} MB used on this device`;
    } catch { /* ignore */ }
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    const bioOk = await B.available().catch(() => false);
    const bioOn = !!(await B.enrolment().catch(() => null));
    const counts = new Map();
    for (const n of state.notes.values()) if (n.region) counts.set(n.region, (counts.get(n.region) || 0) + 1);

    main.innerHTML = `${html`<div class="page settings" style="gap:0">
      <div class="page-head" style="padding-bottom:18px"><h1 class="page-title">Settings</h1></div>

      <section aria-labelledby="s-sync">
        <h2 id="s-sync">Sync with GitHub</h2>
        ${sync && !editingSync ? html`
          <p class="status-line ${s.state === 'error' ? 'error' : ''}">${s.state === 'error' ? icons.cloudErr({ size: 18 }) : icons.cloud({ size: 18 })}
            ${s.state === 'syncing' ? 'Syncing…' : s.state === 'uploading' ? `Uploading in batches${s.left ? `, ${s.left} left` : ''}` : s.state === 'error' ? s.message : s.state === 'offline' ? 'Offline. Changes will sync when you’re back online.' : `Synced ${fmtAgo(s.lastSyncAt)}`}</p>
          ${s.state === 'uploading' ? html`<p class="hint">GitHub accepts about 500 uploads an hour, so after a big import (lots of PDF pages) the rest goes up in batches${s.resumeAt && s.resumeAt - Date.now() > 90000 ? `, next at ${new Date(s.resumeAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. New edits go first. It carries on whenever the app is open.</p>` : ''}
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

      <section aria-labelledby="s-look">
        <h2 id="s-look">Appearance</h2>
        <div class="set-row"><span id="s-theme-l">Colours</span>
          <div class="seg" role="radiogroup" aria-labelledby="s-theme-l">${[['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, n]) => html`<button type="button" role="radio" data-theme-pick="${v}" aria-checked="${themePref() === v ? 'true' : 'false'}">${n}</button>`)}</div></div>
        <label class="check"><input type="checkbox" id="s-darkpaper" ${state.device?.darkPaper !== false ? raw('checked') : ''}> In dark mode, show handwritten pages and whiteboards dark too</label>
        <p class="hint">Easier on the eyes at night. Dark ink shows light, and colours are brightened a little. PDFs and images you export always use light paper.</p>
        <h3 class="set-sub" id="s-text-h">Default text</h3>
        <p class="hint">Typed notes and Today’s note use it, including notes you already have (except text you’ve given its own font, size or colour). New text boxes on handwritten pages and whiteboards start with it; ones already placed stay as they are, so they don’t shift over your writing.</p>
        <div id="s-text">${raw(textPrefsHtml())}</div>
      </section>

      <section aria-labelledby="s-sec">
        <h2 id="s-sec">Security</h2>
        <div class="field"><label for="autolock">Lock automatically after</label>
          <select id="autolock">${[2, 5, 10, 30, 60].map((m) => html`<option value="${m}" ${state.device.autoLockMin === m ? raw('selected') : ''}>${m} minutes of no use</option>`)}</select></div>
        <div class="bio-box">
          <label class="check"><input type="checkbox" id="s-bio" ${bioOn ? raw('checked') : ''} ${bioOk || bioOn ? '' : raw('disabled')}> Unlock with ${B.bioName} on this device</label>
          <p class="hint">${bioOn
            ? `On. Your passphrase is still asked for every ${B.PASS_EVERY_DAYS} days so you don’t forget it, and sealed notes always need theirs. This device’s passcode can stand in for ${B.bioName}, so keep the passcode to yourself.`
            : bioOk ? `Quicker than typing your passphrase. A passkey on this device, opened by ${B.bioName}, locks a copy of your key that never leaves this device.`
              : 'Not available in this browser. On iPad and iPhone it needs iPadOS or iOS 18 or later.'}</p>
        </div>
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
          <button type="button" class="region-colour" data-color="${i}" aria-label="Colour for ${r.name}: ${COLOR_NAMES[r.color] || 'none'}. Change"><span class="dot lg" style="background:${regionColors(r).dot}"></span><span class="rc-name">${COLOR_NAMES[r.color] || 'Colour'}</span></button>
          <label class="sr-only" for="rn-${i}">Name</label>
          <input id="rn-${i}" type="text" value="${r.name}" data-name="${i}" style="min-height:44px">
          <button type="button" class="icon-btn bare" data-del="${i}" aria-label="Remove ${r.name}" ${counts.get(r.id) ? raw('disabled') : ''}>${icons.close({ size: 18 })}</button>
        </div>`)}
        <div class="btn-row"><button type="button" class="btn btn-sm" data-act="add-region">${icons.plus({ size: 16 })}Add region</button></div>
      </section>

      <section aria-labelledby="s-labels">
        <h2 id="s-labels">Labels</h2>
        <p class="hint">The label stickers you can put on pages and notes, and find again on the Labels screen.</p>
        <div class="chips">${(state.config.labels || []).map((l) => html`<span class="chip static"><span class="dot" style="background:${l.color}"></span>${l.name}</span>`)}</div>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-act="labels">Edit labels</button></div>
      </section>

      <section aria-labelledby="s-ai">
        <h2 id="s-ai">On-device intelligence</h2>
        <p class="hint">Search by meaning, related notes, reading handwriting and transcribing recordings run on this device with small models that come with the app. Nothing you write or record is sent anywhere.</p>
        <label class="check"><input type="checkbox" id="s-sem" ${state.device?.semantic !== false ? raw('checked') : ''}> Search by meaning and related notes</label>
        <label class="check"><input type="checkbox" id="s-autolink" ${state.device?.autoLink === true ? raw('checked') : ''}> Link notes that are very alike by themselves (you can undo each link in the inbox)</label>
        <label class="check"><input type="checkbox" id="s-org" ${state.device?.organise !== false ? raw('checked') : ''}> Organise new notes on the map by themselves: file each in the region it fits, and add a region (like Property & home) when nothing fits</label>
        <p class="status-line" id="s-sem-status" aria-live="polite"></p>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-act="sem-rebuild">Rebuild the index</button></div>
        <label class="check"><input type="checkbox" id="s-hand" ${state.device?.readHand !== false ? raw('checked') : ''}> Read my handwriting, so it can be searched</label>
        <p class="hint">Pages are read a few seconds after you stop writing. The text syncs with the note, so each page is only read once.</p>
        <p class="status-line" id="s-hand-status" aria-live="polite"></p>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-act="hand-all">Read handwriting in all notes</button></div>
      </section>

      <section aria-labelledby="s-backup">
        <h2 id="s-backup">Backup</h2>
        <p class="hint">Download everything as one encrypted file. You’ll need your passphrase to restore it.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="backup">Download encrypted backup</button></div>
        <p class="hint">Or take your notes anywhere: every note as a Markdown file, with images and handwritten pages as pictures, in one zip. This copy is <strong>not</strong> encrypted, so keep it somewhere safe.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="export-md">Export everything as Markdown</button></div>
        <p class="hint">Deleted something by mistake? <a href="#/deleted">Recently deleted</a> keeps notes, boards and notebooks for 30 days.</p>
      </section>

      <section aria-labelledby="s-about">
        <h2 id="s-about">This device</h2>
        <p class="hint">${usage || 'Storage use unknown'}. ${persisted ? 'Storage is protected from automatic clean-up.' : 'On iPhone and iPad, add this app to your Home Screen so the system keeps its storage.'}</p>
        <p class="hint">Text in images is read on this device. Nothing is uploaded except encrypted sync to your own GitHub repo.</p>
        <div class="set-row"><span class="hint" id="s-version" style="font-weight:400">Version …</span><button type="button" class="btn btn-sm" data-act="check-update">Check for updates</button></div>
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
    const bioBox = $('#s-bio', main);
    if (bioBox) {
      bioBox.onchange = async () => {
        if (bioBox.checked) {
          const ok = await bioSetup();
          if (ok) { toast(`${B.bioName} unlock is on for this device`); draw(); } else bioBox.checked = false;
        } else {
          await B.disable();
          toast(`${B.bioName} unlock is off for this device`);
          draw();
        }
      };
    }
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

    // Region colour: a grid of every colour, the ones other regions use marked.
    main.querySelectorAll('[data-color]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.color);
        const cur = state.config.regions[idx];
        const taken = new Map(state.config.regions.filter((_, i) => i !== idx).map((r) => [r.color, r.name]));
        const p = popover(btn, `${html`<div class="pop-head">Colour for ${cur.name}</div>
          <div class="rc-grid" role="radiogroup" aria-label="Colour for ${cur.name}">${Object.keys(COLOR_NAMES).filter((k) => PALETTE[k]).map((k) => html`<button type="button" class="rc-swatch" role="radio" data-pick="${k}" aria-checked="${cur.color === k ? 'true' : 'false'}" aria-label="${COLOR_NAMES[k]}${taken.has(k) ? `, used by ${taken.get(k)}` : ''}" title="${COLOR_NAMES[k]}${taken.has(k) ? ` (${taken.get(k)})` : ''}"><span class="dot" style="background:${regionColors({ color: k }).dot}"></span>${taken.has(k) ? html`<span class="rc-used" aria-hidden="true"></span>` : ''}</button>`)}</div>
          <p class="hint" style="margin:8px 4px 2px">A small mark means another region uses it.</p>`}`, { label: `Colour for ${cur.name}`, width: 276 });
        p.el.querySelectorAll('[data-pick]').forEach((b) => {
          b.onclick = async () => {
            p.close();
            const regions = state.config.regions.map((r, i) => (i === idx ? { ...r, color: b.dataset.pick } : r));
            await V.saveConfig({ regions });
          };
        });
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
    import('../semantic.js').then((S) => {
      const st = $('#s-sem-status', main);
      const paint = (x) => {
        if (!st) return;
        if (!S.semanticOn()) { st.textContent = 'Off on this device.'; return; }
        st.textContent = x.error ? `Stopped: ${x.error}` : x.building ? `Reading your notes: ${x.done} of ${x.total}` : x.total ? `Ready: ${x.total} notes` : 'Starts shortly after you unlock.';
      };
      paint(S.semState);
      const off = S.onSemantic(paint);
      cleanups.push(off);
      const sem = $('#s-sem', main);
      if (!sem) return; // left Settings before this loaded
      sem.onchange = async (e) => {
        await V.updateDevice({ semantic: e.target.checked });
        if (e.target.checked) S.buildSoon(0); else await S.clearIndex();
        paint(S.semState);
      };
      on('[data-act=sem-rebuild]', async () => { await S.clearIndex(); S.buildSoon(0); toast('Rebuilding'); });
    });
    $('#s-hand', main).onchange = async (e) => { await V.updateDevice({ readHand: e.target.checked }); };
    $('#s-org', main).onchange = async (e) => { await V.updateDevice({ organise: e.target.checked }); };
    $('#s-autolink', main).onchange = async (e) => {
      await V.updateDevice({ autoLink: e.target.checked });
      if (e.target.checked) { const n = await (await import('../mapassist.js')).autoLink(); if (n) toast(`Linked ${n} pair${n === 1 ? '' : 's'} of notes`); }
    };
    appVersion().then((v) => { const e = $('#s-version', main); if (e) e.textContent = v; });
    on('[data-act=check-update]', async (b) => {
      b.disabled = true;
      const coming = await checkForUpdate();
      b.disabled = false;
      toast(coming ? 'Downloading the new version…' : 'You have the latest version.');
    });
    main.querySelectorAll('[data-theme-pick]').forEach((x) => {
      x.onclick = () => {
        applyTheme(x.dataset.themePick);
        main.querySelectorAll('[data-theme-pick]').forEach((y) => y.setAttribute('aria-checked', y === x ? 'true' : 'false'));
      };
    });
    bindTextPrefs(main);
    $('#s-darkpaper', main).onchange = async (e) => { await V.updateDevice({ darkPaper: e.target.checked }); window.dispatchEvent(new Event('sb-theme')); };
    on('[data-act=hand-all]', async (b) => {
      const st = $('#s-hand-status', main);
      if (state.device?.readHand === false) { toast('Turn on reading handwriting first.'); return; }
      b.disabled = true;
      const { readAll } = await import('../handwriting.js');
      try {
        await readAll((i, n) => { if (st.isConnected) st.textContent = `Reading note ${i} of ${n}…`; });
        if (st.isConnected) st.textContent = 'Done. Your handwriting can be searched.';
      } catch (err) { if (st.isConnected) st.textContent = `Stopped: ${err.message}`; }
      b.disabled = false;
    });
    on('[data-act=labels]', async () => { const { manageLabels } = await import('./labels.js'); manageLabels(); });
    on('[data-act=export-md]', async (b) => {
      b.disabled = true;
      b.textContent = 'Exporting…';
      try {
        const { exportAllMarkdown } = await import('../export.js');
        const n = await exportAllMarkdown();
        toast(`Exported ${n} notes`);
      } catch (e) { console.error(e); toast('Couldn’t make the export.'); }
      b.disabled = false;
      b.textContent = 'Export everything as Markdown';
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
    destroy() { cleanups.splice(0).forEach((f) => f()); },
    onEvent(evt) {
      if (['sync', 'sealed', 'config', 'device'].includes(evt.type)) {
        if (main.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
        draw();
      }
    },
  };
}

