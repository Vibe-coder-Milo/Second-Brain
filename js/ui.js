// Sheets, menus and pickers that slide up over the current screen.

import { html, esc, $ } from './util.js';
import { state } from './vault.js';
import { displayTitle, regionColors, searchNotes } from './model.js';
import { icons } from './icons.js';

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

export function notePicker({ title = 'Link to a note', exclude = [] } = {}) {
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
      list.innerHTML = found.length
        ? found.map((n) => {
          const r = state.config.regions.find((x) => x.id === n.region);
          return html`<li><button type="button" data-id="${n.id}"><span class="dot" style="background:${regionColors(n.inbox ? null : r).dot}"></span>${displayTitle(n)}</button></li>`;
        }).join('')
        : html`<li class="hint" style="padding:16px 2px">No notes match.</li>`.s;
      list.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => s.close(b.dataset.id); });
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
