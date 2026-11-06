// Recently deleted: notes, boards and notebooks you deleted in the last 30
// days. Put one back with a tap, or delete it for good. After 30 days they go
// by themselves (vault.purgeBin).

import { html, toast, fmtAgo } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { displayTitle, kindName } from '../model.js';
import { icons } from '../icons.js';
import { confirmSheet } from '../ui.js';

const what = (x) => (x.kind === 'notebook' ? 'Notebook' : x.kind === 'board' ? 'Whiteboard' : `${kindName(x)} note`);
const titleOf = (x) => (x.kind === 'notebook' ? x.title : displayTitle(x)) || 'Untitled';

export function mount(el, params, ctx) {
  function draw() {
    const items = V.binItems();
    el.innerHTML = `${html`<div class="page deleted-page">
      <div class="page-head">
        <div><h1 class="page-title">Recently deleted</h1><p class="page-sub">Kept for ${V.BIN_DAYS} days, so you can put things back</p></div>
        ${items.length ? html`<button type="button" class="btn btn-sm btn-danger" data-act="empty">Empty</button>` : ''}
      </div>
      ${items.length ? html`<ul class="bin-list" aria-label="Recently deleted">
        ${items.map(({ item: x, with: kids, daysLeft }) => html`<li class="bin-row">
          <span class="bin-ic" aria-hidden="true">${x.kind === 'notebook' ? icons.notebooks() : icons.notes()}</span>
          <span class="bin-t"><span class="t">${titleOf(x)}</span>
            <span class="m">${what(x)}${kids.length ? `, with ${kids.length} note${kids.length === 1 ? '' : 's'}` : ''}. Deleted ${fmtAgo(x.binnedAt)}</span>
            <span class="m">${daysLeft <= 1 ? 'Goes for good tomorrow' : `Goes for good in ${daysLeft} days`}</span></span>
          <span class="bin-acts">
            <button type="button" class="btn btn-sm" data-restore="${x.id}">Put back</button>
            <button type="button" class="btn btn-sm btn-ghost" data-forever="${x.id}" aria-label="Delete ${titleOf(x)} for good">Delete now</button>
          </span>
        </li>`)}
      </ul>` : html`<div class="empty"><p class="serif">Nothing here</p><p style="margin:0">When you delete a note, board or notebook, it waits here for ${V.BIN_DAYS} days before it goes for good.</p></div>`}
      ${state.hiddenSealed ? html`<p class="hint">Sealed notes you deleted show here once sealed notes are unlocked.</p>` : ''}
    </div>`}`;
    el.querySelectorAll('[data-restore]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        const back = await V.restore(b.dataset.restore);
        toast(back ? `Put back: ${titleOf(back)}` : 'Couldn’t put that back');
      };
    });
    el.querySelectorAll('[data-forever]').forEach((b) => {
      b.onclick = async () => {
        const x = state.bin.get(b.dataset.forever);
        if (!x) return;
        const ok = await confirmSheet({ title: 'Delete for good?', body: `${titleOf(x)} can’t be put back after this, on any of your devices.`, confirm: 'Delete for good', danger: true });
        if (!ok) return;
        await V.deleteForever(x.id);
        toast('Deleted for good');
      };
    });
    const empty = el.querySelector('[data-act=empty]');
    if (empty) {
      empty.onclick = async () => {
        const n = V.binItems().length;
        const ok = await confirmSheet({ title: 'Empty Recently deleted?', body: `${n === 1 ? 'This item' : `All ${n} items`} go for good, on all your devices.`, confirm: 'Empty', danger: true });
        if (!ok) return;
        for (const { item } of V.binItems()) await V.deleteForever(item.id);
        toast('Recently deleted is empty');
      };
    }
  }
  draw();
  return {
    update() { draw(); },
    onEvent(e) { if (['note', 'delete', 'notebook', 'remote', 'sealed', 'sync'].includes(e.type)) draw(); },
    destroy() {},
  };
}
