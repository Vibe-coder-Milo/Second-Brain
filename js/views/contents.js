// Finding your way in a long typed note: Contents (its headings, the one
// you're reading marked; tap to jump) and Pages (the note as printed pages,
// like a handwritten note's pages; tap one to go there). A note shown as A4
// pages (editor/pages.js) lists its own pages, exactly; an endless one the
// pages it would print as, placed by their share of the note.

import { html, raw } from '../util.js';
import { displayTitle } from '../model.js';
import { openSheet, popover } from '../ui.js';
import { icons } from '../icons.js';

const WORDS_PER_MIN = 200;
const wordsIn = (node) => {
  let n = 0;
  node.descendants((c) => { if (c.isText) n += (c.text.match(/\S+/g) || []).length; return true; });
  return n;
};

// The scrolling box the note sits in (the page, or a notebook's pane).
function scroller(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
  }
  return document.scrollingElement;
}

// How far down the toolbar reaches, so a jump lands just below it.
const stickyBottom = (host) => {
  const s = host.querySelector('#n-sticky');
  return s ? Math.max(0, s.getBoundingClientRect().bottom) : 0;
};

function jumpTo(host, target, block = 'start', pager = null) {
  if (!target) return;
  pager?.reveal(target); // Next page: turn to the page it's on first
  const sc = scroller(target);
  const r0 = target.getBoundingClientRect();
  // A block moved to the top of a page sits below a see-through border: aim at its text.
  const pushed = block === 'start' ? parseFloat(target.style?.getPropertyValue('--pg')) || 0 : 0;
  const r = { top: r0.top + pushed, bottom: r0.bottom };
  const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
  const by = block === 'end' ? r.bottom - (sc === document.scrollingElement ? window.innerHeight : sc.getBoundingClientRect().bottom) + 24 : r.top - Math.max(top, stickyBottom(host)) - 12;
  // A long way: go straight there (a long smooth scroll takes seconds). A short way: glide.
  sc.scrollBy({ top: by, behavior: Math.abs(by) > window.innerHeight * 1.5 ? 'auto' : 'smooth' });
}

// Top-level blocks of the editor with their elements.
function blocks(editor) {
  const out = [];
  editor.state.doc.forEach((node, offset) => {
    const dom = editor.view.nodeDOM(offset);
    out.push({ node, dom: dom instanceof Element ? dom : dom?.parentElement || null });
  });
  return out;
}

// The headings, each with its reading time (up to the next heading at its level or above).
export function sections(editor) {
  const bs = blocks(editor);
  const heads = [];
  bs.forEach((b, i) => { if (b.node.type.name === 'heading') heads.push({ i, level: b.node.attrs.level || 1, text: b.node.textContent.trim() || 'Untitled', dom: b.dom }); });
  for (const h of heads) {
    let words = 0;
    for (let j = h.i + 1; j < bs.length; j++) {
      const b = bs[j];
      if (b.node.type.name === 'heading' && (b.node.attrs.level || 1) <= h.level) break;
      words += wordsIn(b.node);
    }
    h.mins = Math.round(words / WORDS_PER_MIN);
  }
  return heads;
}

// Next page: the last heading on or before the page shown.
function lastBefore(heads, pg) {
  let cur = -1;
  heads.forEach((h, k) => { if (h.dom && pg.sheetOf(h.dom) <= pg.page) cur = k; });
  return cur;
}

// The heading you're reading: the last one above the top of the view.
function currentIndex(host, heads) {
  const line = stickyBottom(host) + 40;
  let cur = -1;
  heads.forEach((h, k) => { if (h.dom && h.dom.getBoundingClientRect().top <= line) cur = k; });
  return cur;
}

// The note's pages, if it shows as A4 pages (null while endless).
const pagerOf = (pager) => { const p = typeof pager === 'function' ? pager() : pager; return p && p.mode !== 'endless' ? p : null; };

export function openContents(anchor, { host, editor, note, flush, wide, pager }) {
  const pg = pagerOf(pager);
  const heads = sections(editor);
  const cur = pg?.mode === 'next' ? lastBefore(heads, pg) : currentIndex(host, heads);
  const minLevel = Math.min(...heads.map((h) => h.level), 3);
  const body = `${html`<div class="cts-head"><h2>Contents</h2><span class="muted">${heads.length ? `${heads.length} section${heads.length === 1 ? '' : 's'}` : ''}</span></div>
    ${heads.length ? html`<ul class="cts-list">${heads.map((h, k) => html`<li><button type="button" class="cts-item lv${Math.min(3, h.level - minLevel + 1)}" data-h="${k}" ${k === cur ? raw('aria-current="location"') : ''}><span class="cts-t">${h.text}</span>${k === cur ? html`<span class="cts-here">You’re here</span>` : h.mins >= 1 ? html`<span class="cts-min">${h.mins} min</span>` : ''}</button></li>`)}</ul>`
      : html`<p class="hint cts-none">No headings yet. Start a line with # (or pick Heading from the style menu) and it shows here. Pages works now.</p>`}
    <div class="cts-foot">
      <button type="button" class="btn btn-sm" data-top>Back to top</button>
      <button type="button" class="btn btn-sm" data-end>To the end</button>
      <button type="button" class="btn btn-sm" data-pages>${icons.pages({ size: 16 })}Pages</button>
    </div>`}`;
  const box = wide ? popover(anchor, body, { label: 'Contents', width: 340, cls: 'cts-pop' }) : openSheet(body, { label: 'Contents' });
  const close = () => box.close();
  const root = box.el;
  root.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => { close(); jumpTo(host, heads[Number(b.dataset.h)].dom, 'start', pg); }; });
  const bs = blocks(editor);
  root.querySelector('[data-top]').onclick = () => { close(); jumpTo(host, host.querySelector('#n-head') || bs[0]?.dom, 'start', pg); };
  root.querySelector('[data-end]').onclick = () => { close(); jumpTo(host, bs[bs.length - 1]?.dom, 'end', pg); };
  root.querySelector('[data-pages]').onclick = () => { close(); openPages({ host, editor, note, flush, wide, pager }); };
  return box;
}

// Where each page starts in the note on screen: the export lays the title,
// pictures and text out the same way, so a page's share of that layout is
// its share of the note from its title to the end of the text.
function domSpan(host) {
  const a = host.querySelector('#n-head');
  const b = host.querySelector('#n-rich');
  if (!a || !b) return null;
  const top = a.getBoundingClientRect().top;
  return { top, height: Math.max(1, b.getBoundingClientRect().bottom - top) };
}

export async function openPages({ host, editor, note, flush, wide, pager }) {
  if (pagerOf(pager)) return openSheets({ host, editor, note, flush, wide, pager });
  const n = note();
  const s = openSheet(`${html`<div class="sheet-head"><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-cts>${icons.lines({ size: 16 })}Contents</button></span><h2>${displayTitle(n)}</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Done</button></span></div>
    <p class="hint" id="pv-sub" style="margin:0 0 12px">Laying out the pages…</p>
    <ul class="page-grid pv-grid" id="pv-grid"></ul>`}`, { label: 'Pages' });
  s.el.classList.add('pages-sheet');
  s.el.querySelector('[data-close]').onclick = () => s.close();
  s.el.querySelector('[data-cts]').onclick = () => { s.close(); openContents(host.querySelector('[data-act=contents]') || host, { host, editor, note, flush, wide, pager }); };
  await flush?.();
  const { typedPages } = await import('../export.js');
  const pages = await typedPages(note() || n, { px: 360 });
  if (!s.el.isConnected) return;
  const span = domSpan(host);
  const heads = sections(editor).map((h) => ({ ...h, frac: span && h.dom ? (h.dom.getBoundingClientRect().top - span.top) / span.height : 0 }));
  // The page you're reading: where the top of the view falls.
  const viewFrac = span ? (stickyBottom(host) + 40 - span.top) / span.height : 0;
  const total = pages[0]?.range[2] || 1;
  const info = pages.map((c, i) => {
    const [from, to] = c.range;
    const f0 = from / total; const f1 = to / total;
    const starts = heads.filter((h) => h.frac >= f0 - 0.002 && h.frac < f1);
    const before = heads.filter((h) => h.frac < f0 - 0.002).pop();
    return { i, f0, f1, label: (starts[0] || before)?.text || (i === 0 ? displayTitle(n) : ''), here: viewFrac >= f0 && (viewFrac < f1 || i === pages.length - 1) };
  });
  s.el.querySelector('#pv-sub').textContent = `${pages.length} page${pages.length === 1 ? '' : 's'} if printed. Tap a page to go there.`;
  const grid = s.el.querySelector('#pv-grid');
  grid.innerHTML = info.map((p) => String(html`<li><button type="button" class="page-thumb ${p.here ? 'current' : ''}" data-pg="${p.i}" aria-label="Page ${p.i + 1}${p.label ? `, ${p.label}` : ''}${p.here ? ', you’re here' : ''}"></button><span class="pv-label">${p.i + 1}${p.label ? ` · ${p.label}` : ''}</span></li>`)).join('');
  grid.querySelectorAll('[data-pg]').forEach((b) => {
    const i = Number(b.dataset.pg);
    pages[i].className = 'thumb-canvas';
    b.appendChild(pages[i]);
    b.onclick = () => {
      s.close();
      const sp = domSpan(host);
      if (!sp) return;
      // The first block that starts on that page (or the page's heading).
      const want = info[i].f0;
      const target = blocks(editor).map((x) => x.dom).find((d) => d && (d.getBoundingClientRect().top - sp.top) / sp.height >= want - 0.004);
      jumpTo(host, i === 0 ? host.querySelector('#n-head') : target || host.querySelector('#n-rich'));
    };
  });
  grid.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
}

// A note shown as A4 pages: its own pages, page i = page i on screen. The
// pictures come from the PDF layout when it has the same number of pages
// (it nearly always does on an iPad or computer), else the words that start
// each page.
async function openSheets({ host, editor, note, flush, wide, pager }) {
  const pg = pagerOf(pager);
  const n = note();
  const s = openSheet(`${html`<div class="sheet-head"><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-cts>${icons.lines({ size: 16 })}Contents</button></span><h2>${displayTitle(n)}</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Done</button></span></div>
    <p class="hint" id="pv-sub" style="margin:0 0 12px"></p>
    <ul class="page-grid pv-grid" id="pv-grid"></ul>`}`, { label: 'Pages' });
  s.el.classList.add('pages-sheet');
  s.el.querySelector('[data-close]').onclick = () => s.close();
  s.el.querySelector('[data-cts]').onclick = () => { s.close(); openContents(host.querySelector('[data-act=contents]') || host, { host, editor, note, flush, wide, pager }); };
  const count = pg.count;
  const here = pg.current();
  const heads = sections(editor).map((h) => ({ ...h, sheet: h.dom ? pg.sheetOf(h.dom) : 0 }));
  const words = Array.from({ length: count }, () => '');
  for (const b of blocks(editor)) {
    if (!b.dom) continue;
    const i = pg.sheetOf(b.dom);
    if (i < count && words[i].length < 90) words[i] = `${words[i]} ${b.node.textContent}`.trim().slice(0, 90);
  }
  const info = Array.from({ length: count }, (_, i) => {
    const on = heads.filter((h) => h.sheet === i);
    const before = heads.filter((h) => h.sheet < i).pop();
    return { i, label: (on[0] || before)?.text || (i === 0 ? displayTitle(n) : ''), here: i === here };
  });
  s.el.querySelector('#pv-sub').textContent = `${count} page${count === 1 ? '' : 's'}, as printed. Tap a page to go there.`;
  const grid = s.el.querySelector('#pv-grid');
  grid.innerHTML = info.map((p) => String(html`<li><button type="button" class="page-thumb ${p.here ? 'current' : ''}" data-pg="${p.i}" aria-label="Page ${p.i + 1}${p.label ? `, ${p.label}` : ''}${p.here ? ', you’re here' : ''}"><span class="pv-words">${words[p.i]}</span></button><span class="pv-label">${p.i + 1}${p.label ? ` · ${p.label}` : ''}</span></li>`)).join('');
  grid.querySelectorAll('[data-pg]').forEach((b) => { b.onclick = () => { s.close(); pg.goTo(Number(b.dataset.pg)); }; });
  grid.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  // Pictures of the pages, when the printed layout matches.
  await flush?.();
  const { typedPages } = await import('../export.js');
  const pics = await typedPages(note() || n, { px: 360 });
  if (!s.el.isConnected || pics.length !== count) return;
  grid.querySelectorAll('[data-pg]').forEach((b) => {
    const c = pics[Number(b.dataset.pg)];
    c.className = 'thumb-canvas';
    b.querySelector('.pv-words')?.remove();
    b.appendChild(c);
  });
}
