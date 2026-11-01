// Sheets, menus and pickers that slide up over the current screen.

import { html, esc, raw, $ } from './util.js';
import { state } from './vault.js';
import { displayTitle, regionColors, searchNotes, LABEL_COLORS } from './model.js';
import { icons } from './icons.js';
import { PACKS, POSTIT_COLORS, TAPE, stickerDef, stickerSVG, labelDef } from './stickers.js';
import * as V from './vault.js';

const stack = [];

export function openSheet(content, { label = 'Dialog', onClose } = {}) {
  const layer = document.getElementById('layer');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="grabber"></div>${content}</div>`;
  layer.appendChild(overlay);
  const sheet = overlay.querySelector('.sheet');
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (value) => {
    if (closed) return;
    closed = true;
    overlay.remove();
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    document.removeEventListener('keydown', onKey);
    try { prevFocus?.focus?.(); } catch { /* ignore */ }
    onClose?.(value);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && stack[stack.length - 1] === api) close(undefined);
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(undefined); });
  const api = { el: sheet, close };
  stack.push(api);
  requestAnimationFrame(() => {
    const f = sheet.querySelector('[autofocus], input, textarea, select, button:not(.side)');
    f?.focus?.({ preventScroll: true });
  });
  return api;
}

export const closeAllSheets = () => [...stack].forEach((s) => s.close());

export function confirmSheet({ title, body = '', confirm = 'Confirm', danger = false, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const s = openSheet(
      `${html`<h2 class="page-title" style="font-size:26px">${title}</h2>${body ? html`<p class="muted" style="margin:0">${body}</p>` : ''}
      <div class="btn-row"><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-yes>${confirm}</button>
      <button type="button" class="btn btn-ghost btn-block" data-no>${cancel}</button></div>`}`,
      { label: title, onClose: (v) => resolve(!!v) },
    );
    s.el.querySelector('[data-yes]').onclick = () => s.close(true);
    s.el.querySelector('[data-no]').onclick = () => s.close(false);
  });
}

export function menuSheet(title, items) {
  return new Promise((resolve) => {
    const s = openSheet(
      `${html`<div class="sheet-head"><h2>${title}</h2></div>
      <ul class="menu">${items.map((it, i) => html`<li><button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}${it.label}</button></li>`)}</ul>
      <button type="button" class="btn btn-ghost btn-block" data-cancel>Cancel</button>`}`,
      { label: title, onClose: (v) => resolve(v ?? null) },
    );
    s.el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => s.close(items[Number(b.dataset.i)].value); });
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
  });
}

export function regionPicker({ title = 'File in', allowInbox = true } = {}) {
  const items = state.config.regions.map((r) => ({ value: r.id, label: r.name, icon: html`<span class="dot lg" style="background:${regionColors(r).dot}"></span>` }));
  if (allowInbox) items.push({ value: '__inbox', label: 'Inbox (sort later)', icon: html`<span class="dot lg" style="background:${regionColors(null).dot}"></span>` });
  return menuSheet(title, items);
}

// Resolves with a note id, or 'new:<title>' when `allowNew` and you chose to make one.
export function notePicker({ title = 'Link to a note', exclude = [], allowNew = false } = {}) {
  return new Promise((resolve) => {
    const s = openSheet(
      `${html`<div class="sheet-head"><span class="side"></span><h2>${title}</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button></span></div>
      <div class="search">${icons.search()}<label class="sr-only" for="np-q">Search notes</label><input id="np-q" type="search" placeholder="Search your notes" autocomplete="off"></div>
      <ul class="picker-list" id="np-list"></ul>`}`,
      { label: title, onClose: (v) => resolve(v ?? null) },
    );
    const list = $('#np-list', s.el);
    const q = $('#np-q', s.el);
    const pool = [...state.notes.values()].filter((n) => !exclude.includes(n.id));
    const draw = () => {
      const found = q.value.trim() ? searchNotes(pool, q.value, 60) : pool.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60);
      const make = allowNew ? html`<li><button type="button" data-new class="np-new">${icons.plus({ size: 16 })}${q.value.trim() ? html`New note: <strong>${q.value.trim()}</strong>` : 'New typed note'}</button></li>`.s : '';
      list.innerHTML = make + (found.length
        ? found.map((n) => {
          const r = state.config.regions.find((x) => x.id === n.region);
          return html`<li><button type="button" data-id="${n.id}"><span class="dot" style="background:${regionColors(n.inbox ? null : r).dot}"></span>${displayTitle(n)}</button></li>`;
        }).join('')
        : html`<li class="hint" style="padding:16px 2px">No notes match.</li>`.s);
      list.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => s.close(b.dataset.id); });
      const nb = list.querySelector('[data-new]');
      if (nb) nb.onclick = () => s.close(`new:${q.value.trim()}`);
    };
    q.addEventListener('input', draw);
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
    draw();
  });
}

export function passphraseSheet({ title, body = '', confirmLabel = 'Unlock', check }) {
  return new Promise((resolve) => {
    const s = openSheet(
      `${html`<form class="stack" style="display:flex;flex-direction:column;gap:16px" novalidate>
        <h2 class="page-title" style="font-size:26px">${title}</h2>
        ${body ? html`<p class="muted" style="margin:0">${body}</p>` : ''}
        <div class="field"><label for="ps-p">Passphrase</label><input id="ps-p" type="password" autocomplete="current-password" required></div>
        <p class="error" id="ps-err" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">${confirmLabel}</button>
        <button class="btn btn-ghost btn-block" type="button" data-cancel>Cancel</button>
      </form>`}`,
      { label: title, onClose: (v) => resolve(v ?? null) },
    );
    const form = s.el.querySelector('form');
    const err = $('#ps-err', s.el);
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const p = $('#ps-p', s.el).value;
      if (!p) return;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        if (check) await check(p);
        s.close(p);
      } catch (ex) {
        err.textContent = ex.message || 'That didn’t work.';
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = confirmLabel;
      }
    };
  });
}

// ---- Popovers -------------------------------------------------------------------
// A small floating panel next to a button (or a point). Taps inside don't steal
// focus from the editor, so the keyboard stays up on iPhone and iPad.

let openPop = null;
export function closePopover() { openPop?.close(); }

export function popover(anchor, content, { label = 'Options', width = 300, onClose, keepFocus = true, place = 'auto', cls = '' } = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = `popover ${cls}`.trim();
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', label);
  el.style.width = `${Math.min(width, window.innerWidth - 16)}px`;
  el.innerHTML = String(content);
  document.body.appendChild(el);
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y + (anchor.h || 0), width: 0 };
  const vv = window.visualViewport;
  const vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
  const h = el.offsetHeight;
  const w = el.offsetWidth;
  let left = Math.max(8, Math.min(r.left + (r.width || 0) / 2 - w / 2, window.innerWidth - w - 8));
  let top = r.bottom + 8;
  if (place === 'above' || (place === 'auto' && top + h > vh - 8 && r.top - h - 8 > 8)) top = r.top - h - 8;
  top = Math.max(8, Math.min(top, vh - h - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top + (window.scrollY || 0)}px`;
  if (keepFocus) el.addEventListener('pointerdown', (e) => { if (!e.target.closest('input, textarea, select')) e.preventDefault(); });
  let closed = false;
  const outside = (e) => { if (!el.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) api.close(); };
  const onKey = (e) => { if (e.key === 'Escape') api.close(); };
  const api = {
    el,
    close(v) {
      if (closed) return;
      closed = true;
      el.remove();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', onKey);
      if (openPop === api) openPop = null;
      onClose?.(v);
    },
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  document.addEventListener('keydown', onKey);
  openPop = api;
  return api;
}

// ---- Labels ---------------------------------------------------------------------

const labelChipHtml = (l, size = 0.62) => {
  const d = labelDef(l);
  return stickerSVG(d, { w: Math.round(d.w * size), h: Math.round(d.h * size) });
};
export { labelChipHtml };

export function newLabelSheet() {
  return new Promise((resolve) => {
    let color = LABEL_COLORS[0];
    const s = openSheet(`${html`<form class="stack" style="display:flex;flex-direction:column;gap:16px" novalidate>
      <h2 class="page-title" style="font-size:26px">New label</h2>
      <div class="field"><label for="nl-name">Name</label><input id="nl-name" type="text" maxlength="24" required placeholder="For example Kyoto"></div>
      <div class="field"><span class="label">Colour</span><div class="swatches" role="radiogroup" aria-label="Label colour">${LABEL_COLORS.map((c, i) => html`<button type="button" class="swatch" role="radio" aria-checked="${i === 0 ? 'true' : 'false'}" aria-label="Colour ${i + 1}" data-c="${c}" style="background:${c}"></button>`)}</div></div>
      <div class="label-preview" id="nl-prev" aria-hidden="true"></div>
      <button class="btn btn-primary btn-block" type="submit">Add label</button>
      <button class="btn btn-ghost btn-block" type="button" data-cancel>Cancel</button>
    </form>`}`, { label: 'New label', onClose: (v) => resolve(v ?? null) });
    const name = $('#nl-name', s.el);
    const prev = () => { $('#nl-prev', s.el).innerHTML = labelChipHtml({ name: name.value.trim() || 'Label', color }, 1); };
    name.addEventListener('input', prev);
    s.el.querySelectorAll('[data-c]').forEach((b) => {
      b.onclick = () => { color = b.dataset.c; s.el.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false')); prev(); };
    });
    prev();
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
    s.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) { name.focus(); return; }
      const labels = state.config.labels || [];
      const existing = labels.find((l) => l.name.toLowerCase() === n.toLowerCase());
      if (existing) { s.close(existing.id); return; }
      let id = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'label';
      while (labels.some((l) => l.id === id)) id += '-2';
      await V.saveConfig({ labels: [...labels, { id, name: n, color }] });
      s.close(id);
    };
  });
}

export function labelPicker(anchor, { title = 'Labels' } = {}) {
  return new Promise((resolve) => {
    const labels = state.config.labels || [];
    let handoff = false;
    const p = popover(anchor, `${html`<div class="pop-head">${title}</div>
      <div class="label-grid">${labels.map((l) => html`<button type="button" class="label-pick" data-l="${l.id}" aria-label="${l.name}">${raw(labelChipHtml(l))}</button>`)}</div>
      <button type="button" class="pop-item" data-new>${icons.plus({ size: 18 })}New label</button>`}`, { label: title, width: 320, onClose: (v) => { if (!handoff) resolve(v ?? null); } });
    p.el.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => p.close(b.dataset.l); });
    p.el.querySelector('[data-new]').onclick = async () => { handoff = true; p.close(null); resolve(await newLabelSheet()); };
  });
}

// ---- Dates ----------------------------------------------------------------------

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function datePicker(anchor, current = null) {
  return new Promise((resolve) => {
    const t = new Date();
    const add = (n) => { const d = new Date(t); d.setDate(d.getDate() + n); return isoOf(d); };
    const sat = (6 - t.getDay() + 7) % 7 || 7;
    const mon = (8 - t.getDay()) % 7 || 7;
    const quick = [['Today', add(0)], ['Tomorrow', add(1)], ['This weekend', add(sat)], ['Next week', add(mon)]];
    const p = popover(anchor, `${html`<div class="pop-head">Due date</div>
      ${quick.map(([n, d]) => html`<button type="button" class="pop-item" data-d="${d}">${n}<span class="muted" style="margin-left:auto">${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></button>`)}
      <label class="pop-item" style="gap:10px">Pick a date<input type="date" id="dp-in" value="${current || ''}" style="margin-left:auto;width:auto;min-height:36px;padding:4px 8px"></label>
      ${current ? html`<button type="button" class="pop-item danger" data-clear>Remove date</button>` : ''}`}`, { label: 'Due date', width: 300, onClose: (v) => resolve(v) });
    p.el.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => p.close(b.dataset.d); });
    $('#dp-in', p.el).addEventListener('change', (e) => { if (e.target.value) p.close(e.target.value); });
    const c = p.el.querySelector('[data-clear]');
    if (c) c.onclick = () => p.close(null);
  });
}

// ---- Sticker drawer ------------------------------------------------------------
// Returns what to place: { type: 'label', label } | { type: 'sticker', pack, key }
// | { type: 'tape', key } | { type: 'postit', color } | { type: 'mine', id }.

export function stickerDrawer({ tab = 'labels', allowTape = true, allowPostits = true, title = 'Stickers' } = {}) {
  return new Promise((resolve) => {
    const packs = PACKS.filter((p) => (allowTape || !p.tape));
    const tabs = [...(allowPostits ? [{ id: 'postits', name: 'Post-its' }] : []), ...packs];
    let cur = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
    const recent = (state.device?.recentStickers || []).slice(0, 8);
    const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>${title}</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Done</button></span></div>
      <p class="hint" style="margin-top:-10px">Labels show up in search and on the Labels screen.</p>
      <div class="chips scroll" role="tablist" aria-label="Sticker packs" id="sd-tabs"></div>
      <div id="sd-body" class="sticker-grid"></div>`}`, { label: title, onClose: (v) => resolve(v ?? null) });
    s.el.classList.add('sticker-sheet');
    const pick = (v) => {
      const key = JSON.stringify(v);
      const rec = [key, ...(state.device?.recentStickers || []).filter((x) => x !== key)].slice(0, 12);
      V.updateDevice({ recentStickers: rec }).catch(() => {});
      s.close(v);
    };
    const drawTabs = () => {
      $('#sd-tabs', s.el).innerHTML = `${html`${recent.length ? html`<button type="button" class="chip" role="tab" aria-selected="${cur === 'recent'}" aria-pressed="${cur === 'recent' ? 'true' : 'false'}" data-t="recent">Recent</button>` : ''}${tabs.map((t) => html`<button type="button" class="chip" role="tab" aria-selected="${cur === t.id}" aria-pressed="${cur === t.id ? 'true' : 'false'}" data-t="${t.id}">${t.name}</button>`)}`}`;
      s.el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { cur = b.dataset.t; drawTabs(); drawBody(); }; });
    };
    const itemHtml = (v) => {
      if (v.type === 'label') {
        const l = (state.config.labels || []).find((x) => x.id === v.label);
        return l ? html`<button type="button" class="sticker-cell wide" data-v="${JSON.stringify(v)}" aria-label="Place ${l.name}">${raw(labelChipHtml(l, 0.7))}</button>` : '';
      }
      if (v.type === 'sticker') {
        const d = stickerDef(v.pack, v.key);
        if (!d) return '';
        const sc = 56 / Math.max(d.w, d.h);
        return html`<button type="button" class="sticker-cell" data-v="${JSON.stringify(v)}" aria-label="Place ${d.name || v.key}">${raw(stickerSVG(d, { w: Math.round(d.w * sc), h: Math.round(d.h * sc) }))}</button>`;
      }
      if (v.type === 'tape') return html`<button type="button" class="sticker-cell wide tape-cell" data-v="${JSON.stringify(v)}" aria-label="Place ${v.key} washi tape"><span class="tape-swatch" style="background:${TAPE[v.key].css}"></span></button>`;
      if (v.type === 'postit') return html`<button type="button" class="sticker-cell" data-v="${JSON.stringify(v)}" aria-label="Place a ${v.color} post-it"><span class="postit-swatch" style="background:${POSTIT_COLORS.find((c) => c.id === v.color).bg}"></span></button>`;
      if (v.type === 'mine') {
        const m = (state.config.myStickers || []).find((x) => x.id === v.id);
        return m ? html`<button type="button" class="sticker-cell" data-v="${JSON.stringify(v)}" aria-label="Place your sticker ${m.name || ''}"><img data-mine="${m.id}" alt="" width="56" height="56"></button>` : '';
      }
      return '';
    };
    const drawBody = () => {
      const body = $('#sd-body', s.el);
      let items = [];
      if (cur === 'recent') items = recent.map((k) => { try { return JSON.parse(k); } catch { return null; } }).filter(Boolean);
      else if (cur === 'labels') items = (state.config.labels || []).map((l) => ({ type: 'label', label: l.id }));
      else if (cur === 'postits') items = POSTIT_COLORS.map((c) => ({ type: 'postit', color: c.id }));
      else if (cur === 'tape') items = Object.keys(TAPE).map((k) => ({ type: 'tape', key: k }));
      else if (cur === 'mine') items = (state.config.myStickers || []).map((m) => ({ type: 'mine', id: m.id }));
      else items = Object.keys(PACKS.find((p) => p.id === cur)?.items || {}).map((k) => ({ type: 'sticker', pack: cur, key: k }));
      if (!allowTape) items = items.filter((v) => v.type !== 'tape');
      if (!allowPostits) items = items.filter((v) => v.type !== 'postit');
      body.innerHTML = `${html`${items.map(itemHtml)}${cur === 'labels' ? html`<button type="button" class="sticker-cell wide add" data-newlabel>${icons.plus({ size: 18 })}New label</button>` : ''}`}`;
      if (cur === 'mine' && !items.length) body.innerHTML = `${html`<p class="hint" style="grid-column:1/-1">Circle some of your writing with the lasso and choose “Save as sticker”, or add a photo.</p>`}`;
      if (cur === 'mine') body.insertAdjacentHTML('beforeend', `${html`<label class="sticker-cell add">${icons.image({ size: 20 })}<span>Photo</span><input type="file" accept="image/*" class="sr-only" data-photo></label>`}`);
      body.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => pick(JSON.parse(b.dataset.v)); });
      body.querySelectorAll('img[data-mine]').forEach(async (img) => {
        const m = (state.config.myStickers || []).find((x) => x.id === img.dataset.mine);
        const u = m?.fileId ? await V.fileURL(m.fileId) : null;
        if (u) img.src = u;
      });
      const nl = body.querySelector('[data-newlabel]');
      if (nl) nl.onclick = async () => { const id = await newLabelSheet(); if (id) pick({ type: 'label', label: id }); };
      const ph = body.querySelector('[data-photo]');
      if (ph) {
        ph.onchange = async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const { makePhotoSticker } = await import('./editor/ink.js');
          const id = await makePhotoSticker(f);
          if (id) pick({ type: 'mine', id });
        };
      }
    };
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
    drawTabs();
    drawBody();
  });
}
