// Labels: every label you've stuck on a page or a typed note, with a preview of
// the spot, so stickers double as a way to find things.

import { html, raw, $, toast, debounce, fmtDate } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { displayTitle, labelMap, LABEL_COLORS, PAGE_W } from '../model.js';
import { icons } from '../icons.js';
import { openSheet, confirmSheet, labelChipHtml, newLabelSheet } from '../ui.js';
import { docLabels } from '../doc.js';

const PAGE_SIZE = 8;

export function occurrences() {
  const out = [];
  for (const n of state.notes.values()) {
    if (n.kind === 'ink') {
      for (const x of n.labels || []) {
        const pi = n.pages.findIndex((p) => p.id === x.page);
        if (pi < 0) continue;
        out.push({ l: x.l, note: n, page: n.pages[pi], pageNo: pi + 1, box: x, ctx: x.ctx || '' });
      }
    } else if (n.doc) {
      for (const x of docLabels(n.doc)) out.push({ l: x.l, note: n, ctx: x.ctx });
    }
  }
  return out.sort((a, b) => b.note.updatedAt - a.note.updatedAt);
}

export function mount(el, params, ctx) {
  let cur = params.l || null;
  let shown = PAGE_SIZE;

  function draw() {
    const lm = labelMap(state.config);
    const occ = occurrences().filter((o) => lm.has(o.l));
    const counts = new Map();
    for (const o of occ) counts.set(o.l, (counts.get(o.l) || 0) + 1);
    const labels = [...(state.config.labels || [])];
    labels.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
    if (!cur || !labels.some((l) => l.id === cur)) cur = labels.find((l) => counts.get(l.id))?.id || labels[0]?.id || null;
    const sel = labels.find((l) => l.id === cur);
    const hits = occ.filter((o) => o.l === cur);
    el.innerHTML = `${html`<div class="page labels-page">
      <div class="page-head">
        <div><h1 class="page-title">Labels</h1><p class="page-sub">Every label you’ve stuck on a page or note</p></div>
        <button type="button" class="btn btn-sm" data-act="manage">Edit labels</button>
      </div>
      <div class="chips scroll label-chips" role="tablist" aria-label="Labels">
        ${labels.map((l) => html`<button type="button" class="chip label-tab" role="tab" aria-selected="${l.id === cur ? 'true' : 'false'}" aria-pressed="${l.id === cur ? 'true' : 'false'}" data-l="${l.id}" style="--lc:${l.color}"><span class="dot" style="background:${l.color}"></span>${l.name}<span class="n">${counts.get(l.id) || 0}</span></button>`)}
      </div>
      ${sel ? html`<ul class="label-hits" aria-label="${sel.name}">
        ${hits.slice(0, shown).map((o, i) => {
          const nb = o.note.notebook ? state.notebooks.get(o.note.notebook) : null;
          const where = o.page ? `${nb ? nb.title : 'Handwritten'}, page ${o.pageNo}` : `${nb ? `${nb.title}, ` : ''}typed`;
          const href = `#/note/${o.note.id}${o.page ? `?page=${o.page.id}` : ''}`;
          return html`<li><a class="label-hit" href="${href}">
            <span class="lh-prev" data-prev="${i}">${o.page ? '' : html`<span class="lh-typed">${raw(labelChipHtml(sel, 0.5))}<span>${o.ctx || displayTitle(o.note)}</span></span>`}</span>
            <span class="lh-t"><span class="t">${displayTitle(o.note)}</span><span class="m">${where}</span><span class="m">${fmtDate(o.note.updatedAt)}</span></span></a></li>`;
        })}
      </ul>
      ${hits.length > shown ? html`<button type="button" class="link-btn" data-more>Show ${hits.length - shown} more</button>` : ''}
      ${!hits.length ? html`<div class="empty"><p class="serif">Nothing labelled ${sel.name} yet</p><p style="margin:0">Add a label from the sticker drawer on a handwritten page, or with the tag button or / menu in a typed note.</p></div>` : ''}` : html`<div class="empty"><p class="serif">No labels yet</p></div>`}
    </div>`}`;
    el.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => { cur = b.dataset.l; shown = PAGE_SIZE; ctx.navigate(`#/labels?l=${encodeURIComponent(cur)}`, { replace: true, silent: true }); draw(); }; });
    const more = el.querySelector('[data-more]');
    if (more) more.onclick = () => { shown += PAGE_SIZE * 2; draw(); };
    el.querySelector('[data-act=manage]').onclick = () => manageLabels();
    // Previews of the spot on each handwritten page.
    hits.slice(0, shown).forEach(async (o, i) => {
      if (!o.page) return;
      const slot = el.querySelector(`[data-prev="${i}"]`);
      if (!slot) return;
      try {
        const data = await V.loadPage(o.page.id);
        const { renderPageCanvas } = await import('../editor/inkdraw.js');
        const b = o.box;
        const w = Math.min(PAGE_W, Math.max(360, b.w + 260));
        const h = w * 0.5;
        const x = Math.max(0, Math.min(PAGE_W - w, b.x + b.w / 2 - w / 2));
        const y = Math.max(0, Math.min(o.page.h - h, b.y + b.h / 2 - h / 2));
        const c = await renderPageCanvas(o.page, data, 240, { crop: { x, y, w, h } });
        c.className = 'lh-canvas';
        c.setAttribute('aria-hidden', 'true');
        slot.replaceChildren(c);
      } catch { /* not downloaded yet */ }
    });
  }

  draw();
  let gone = false;
  const soon = debounce(() => { if (!gone) draw(); }, 300);
  return {
    destroy() { gone = true; },
    update(p) { if (p.l && p.l !== cur) { cur = p.l; shown = PAGE_SIZE; draw(); } },
    onEvent(evt) { if (['note', 'delete', 'remote', 'sealed', 'config', 'page'].includes(evt.type)) soon(); },
  };
}

// Rename, recolour, add and delete labels.
export function manageLabels() {
  const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>Labels</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Done</button></span></div>
    <ul class="label-edit" id="le-list"></ul>
    <button type="button" class="btn" data-add>${icons.plus({ size: 18 })}New label</button>
    <p class="hint">Renaming a label changes it everywhere it’s stuck. Deleting one leaves the stickers in place, greyed out.</p>`}`, { label: 'Labels' });
  const draw = () => {
    const list = state.config.labels || [];
    $('#le-list', s.el).innerHTML = `${html`${list.map((l) => html`<li data-id="${l.id}">
      <span class="le-prev">${raw(labelChipHtml(l, 0.62))}</span>
      <label class="sr-only" for="le-${l.id}">Name</label><input id="le-${l.id}" type="text" value="${l.name}" maxlength="24" data-name>
      <details class="le-col"><summary class="swatch" style="background:${l.color}" aria-label="Colour"></summary><div class="swatches pop-row wrap">${LABEL_COLORS.map((c) => html`<button type="button" class="swatch sm" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`)}</div></details>
      <button type="button" class="icon-btn bare" data-del aria-label="Delete ${l.name}">${icons.trash({ size: 18 })}</button></li>`)}`}`;
    s.el.querySelectorAll('#le-list li').forEach((li) => {
      const id = li.dataset.id;
      const save = async (patch) => {
        await V.saveConfig({ labels: (state.config.labels || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) });
        draw();
      };
      li.querySelector('[data-name]').onchange = (e) => { const v = e.target.value.trim(); if (v) save({ name: v }); };
      li.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => save({ color: b.dataset.c }); });
      li.querySelector('[data-del]').onclick = async () => {
        const l = (state.config.labels || []).find((x) => x.id === id);
        const ok = await confirmSheet({ title: `Delete ${l?.name}?`, body: 'Stickers with this label stay where they are, in grey, and drop out of the Labels screen.', confirm: 'Delete label', danger: true });
        if (!ok) return;
        await V.saveConfig({ labels: (state.config.labels || []).filter((x) => x.id !== id) });
        draw();
      };
    });
  };
  s.el.querySelector('[data-close]').onclick = () => s.close();
  s.el.querySelector('[data-add]').onclick = async () => { const id = await newLabelSheet(); if (id) { toast('Label added'); draw(); } };
  draw();
}
