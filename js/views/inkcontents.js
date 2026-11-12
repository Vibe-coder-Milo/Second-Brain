// Contents for a handwritten note that came from a document: the sections of
// a Word file (its headings), a PowerPoint (sections and slide titles) or a
// PDF (its bookmarks), with the page each starts on and "You're here" on the
// one you're reading. Tap one to go to its page. It looks like the Contents
// of a typed note (views/contents.js).

import { html, raw } from '../util.js';
import { openSheet, popover } from '../ui.js';
import { resolve } from '../docsections.js';

// Whether the note has sections to list (pages that are gone don't count).
export const hasContents = (n) => resolve(n).length > 0;

export function openInkContents(anchor, { note, pageIdx, wide, goTo }) {
  const items = resolve(note);
  // The section you're in: the last one that starts on or before this page.
  let cur = -1;
  items.forEach((s, k) => { if (s.index <= pageIdx) cur = k; });
  const minLevel = Math.min(...items.map((s) => s.level), 3);
  const body = `${html`<div class="cts-head"><h2>Contents</h2><span class="muted">${items.length} section${items.length === 1 ? '' : 's'}</span></div>
    <ul class="cts-list">${items.map((s, k) => html`<li><button type="button" class="cts-item lv${Math.min(3, s.level - minLevel + 1)}" data-s="${k}" ${k === cur ? raw('aria-current="location"') : ''}><span class="cts-t">${s.title}</span>${k === cur ? html`<span class="cts-here">You’re here</span>` : ''}<span class="cts-min">p. ${s.index + 1}</span></button></li>`)}</ul>
    <p class="hint" style="margin:10px 8px 0">PowerPoint sections and slide titles. For Word: its headings. For PDFs: their bookmarks.</p>`}`;
  const box = wide ? popover(anchor, body, { label: 'Contents', width: 340, cls: 'cts-pop' }) : openSheet(body, { label: 'Contents' });
  box.el.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { box.close(); goTo(items[Number(b.dataset.s)].index); }; });
  box.el.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest' });
  return box;
}
