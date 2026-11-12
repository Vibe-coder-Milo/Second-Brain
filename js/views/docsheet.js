// The "Mark up a document" sheet: pick a PDF, Word or PowerPoint file or some
// pictures to write, draw and highlight on. The files come back through
// `onFiles`; where they go (one note, or a note each) is up to the caller.

import { html } from '../util.js';
import { openSheet } from '../ui.js';
import { icons } from '../icons.js';
import { DOC_ACCEPT } from '../docintake.js';

const TILES = [
  { icon: 'pdf', name: 'PDF', hint: 'Exactly as it is' },
  { icon: 'lines', name: 'Word', hint: '.docx, A4 pages' },
  { icon: 'table', name: 'PowerPoint', hint: '.pptx, a page per slide' },
  { icon: 'image', name: 'Pictures', hint: 'A page each' },
];

export function markupSheet({ onFiles }) {
  const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>Mark up a document</h2><span class="side"></span></div>
    <div class="imp-body">
      <p class="muted" style="margin:0">Pick a file to write, draw and highlight on. It opens as pages to write on, in a new note.</p>
      <ul class="doc-tiles">${TILES.map((t) => html`<li class="doc-tile">${icons[t.icon]({ size: 22 })}<b>${t.name}</b><small>${t.hint}</small></li>`)}</ul>
      <label class="btn btn-primary btn-block doc-choose">${icons.plus({ size: 18 })}Choose files<input type="file" class="sr-only" accept="${DOC_ACCEPT}" multiple data-doc-input></label>
      <p class="hint" style="margin:0;text-align:center">or drop them here. Several documents become a note each; several pictures become one note, a page each.</p>
      <p class="hint">Word and PowerPoint look close to the original, worked out on this device so nothing leaves it. For the exact look, save as PDF in Word or PowerPoint first. Headings, slide titles and sections show in Contents by themselves.</p>
      <button type="button" class="btn btn-ghost btn-block" data-close>Cancel</button>
    </div>`}`, { label: 'Mark up a document' });
  const take = (files) => { const list = [...(files || [])]; if (!list.length) return; s.close(); onFiles(list); };
  s.el.querySelector('[data-close]').onclick = () => s.close();
  s.el.querySelector('[data-doc-input]').onchange = (e) => take(e.target.files);
  s.el.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault(); });
  s.el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); take(e.dataTransfer?.files); });
  return s;
}
