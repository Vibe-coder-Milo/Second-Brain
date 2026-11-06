// Highlights: everything you highlighted, in one place. For one note
// (#/highlights?note=…), one notebook (?notebook=…) or every note. Each card
// shows a picture of what you marked and the words found under it; tap
// "Go to page" to jump there. Worked out on this device, from your notes as
// they are now, so it always matches them. See js/highlights.js.

import { html, raw, $, toast, esc } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { displayTitle, kindName } from '../model.js';
import { icons } from '../icons.js';
import { confirmSheet } from '../ui.js';
import * as H from '../highlights.js';

const WHY = {
  drift: 'Your highlight drifted off the line. It kept to the words it covered most.',
  high: 'Your highlight sat a little above the words. It took the line it touched most.',
  low: 'Your highlight sat a little below the words. It took the line it touched most.',
};
const HOW = { hand: 'Read from your handwriting, on this device.', ocr: 'Read from the picture, on this device.' };

export function mount(el, params, ctx) {
  let groups = [];
  let colour = 'all';
  let gen = 0;
  let destroyed = false;
  let io = null;

  const scope = () => {
    if (params.note) { const n = state.notes.get(params.note); return { title: n ? displayTitle(n) : 'Highlights', notes: n ? [n] : [], back: n ? `#/note/${n.id}` : null }; }
    if (params.notebook) { const b = state.notebooks.get(params.notebook); return { title: b ? b.title : 'Highlights', notes: b ? V.notesIn(b.id) : [], back: b ? `#/notebook/${b.id}` : null }; }
    return { title: null, notes: [...state.notes.values()], back: null };
  };

  async function load() {
    const my = ++gen;
    const sc = scope();
    const notes = [...sc.notes].sort((a, b) => b.updatedAt - a.updatedAt);
    el.innerHTML = `${html`<div class="page hl-page"><div class="page-head"><div><h1 class="page-title">Highlights</h1><p class="page-sub" id="hl-sub">Looking through your notes…</p></div></div><div id="hl-body"></div></div>`}`;
    const found = await H.gather(notes, { onProgress: (k, n) => { if (my === gen && n > 20 && k % 10 === 0) { const s = $('#hl-sub', el); if (s) s.textContent = `Looking through your notes… ${k} of ${n}`; } } });
    if (destroyed || my !== gen) return;
    groups = found;
    draw();
  }

  function draw() {
    const sc = scope();
    const all = groups.flatMap((g) => g.items);
    const counts = new Map();
    for (const it of all) { const c = H.colourGroup(it.color); counts.set(c, (counts.get(c) || 0) + 1); }
    if (colour !== 'all' && !counts.has(colour)) colour = 'all';
    const show = (it) => colour === 'all' || H.colourGroup(it.color) === colour;
    const sub = `${all.length} highlight${all.length === 1 ? '' : 's'}${sc.title ? ` in ${sc.title}` : groups.length ? ` in ${groups.length} note${groups.length === 1 ? '' : 's'}` : ''}`;
    el.innerHTML = `${html`<div class="page hl-page">
      <div class="page-head">
        <div><h1 class="page-title">Highlights</h1><p class="page-sub">${sub}</p></div>
        <div class="head-actions">${sc.back ? html`<a class="btn btn-sm" href="${sc.back}">Back</a>` : ''}${all.length ? html`<button type="button" class="btn btn-sm" data-act="copy">Copy as text</button>` : ''}</div>
      </div>
      ${counts.size > 1 ? html`<div class="chips scroll hl-chips" role="group" aria-label="Colours">
        <button type="button" class="chip" data-col="all" aria-pressed="${colour === 'all' ? 'true' : 'false'}">All ${all.length}</button>
        ${[...counts].map(([c, k]) => html`<button type="button" class="chip" data-col="${c}" aria-pressed="${colour === c ? 'true' : 'false'}"><span class="dot hl-dot-${c.toLowerCase()}"></span>${c} ${k}</button>`)}
      </div>` : ''}
      ${all.length ? groups.filter((g) => g.items.some(show)).map((g, gi) => html`<section class="hl-src" aria-labelledby="hl-g${gi}">
        <h2 class="hl-src-h" id="hl-g${gi}"><a href="#/note/${g.note.id}">${displayTitle(g.note)}</a><small>${g.note.kind === 'ink' ? (g.note.pages.some((p) => p.pdf) ? 'PDF' : g.note.pages.some((p) => p.bg) ? 'Pictures' : 'Handwritten') : `${kindName(g.note)} note`}</small></h2>
        <ul class="hl-cards">${g.items.map((it, ii) => show(it) ? html`<li class="hl-card" style="--hc:${it.color || '#F7D046'}" data-g="${gi}" data-i="${ii}">
          <span class="hl-bar" aria-hidden="true"></span>
          <div class="hl-main">${it.kind === 'typed'
            ? html`<p class="hl-typed">${raw(typedHtml(it))}</p>`
            : html`<div class="hl-pic" data-pic><span class="hl-wait">Drawing…</span></div><p class="hl-txt" data-txt></p><p class="hl-why" data-why hidden></p>`}</div>
          <div class="hl-acts"><a class="hl-go" href="${it.kind === 'typed' ? `#/note/${g.note.id}` : `#/note/${g.note.id}?page=${it.page.id}`}">${it.kind === 'typed' ? 'Go to it' : `Page ${it.pageNo}`}</a>${it.kind === 'page' ? html`<button type="button" class="link-btn hl-rm" data-rm hidden>Remove</button>` : ''}</div>
        </li>` : '')}</ul>
      </section>`) : html`<div class="empty"><p class="serif">No highlights yet</p><p style="margin:0">Mark things with the highlighter on a PDF or handwritten page, or highlight text in a typed note. They gather here by themselves.</p></div>`}
    </div>`}`;
    el.querySelectorAll('[data-col]').forEach((b) => { b.onclick = () => { colour = b.dataset.col; draw(); }; });
    const cp = el.querySelector('[data-act=copy]');
    if (cp) cp.onclick = () => copyText();
    // Pictures and words, as cards come into view.
    io?.disconnect();
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); }
    }, { rootMargin: '400px 0px' });
    el.querySelectorAll('.hl-card[data-g]').forEach((c) => { if (c.querySelector('[data-pic]')) io.observe(c); });
  }

  function typedHtml(it) {
    const i = it.context.indexOf(it.text);
    if (i < 0) return `<mark>${esc(it.text)}</mark>`;
    const before = it.context.slice(Math.max(0, i - 80), i);
    const after = it.context.slice(i + it.text.length, i + it.text.length + 80);
    return `${i > 80 ? '…' : ''}${esc(before)}<mark>${esc(it.text)}</mark>${esc(after)}${i + it.text.length + 80 < it.context.length ? '…' : ''}`;
  }

  async function fill(card) {
    const it = groups[Number(card.dataset.g)]?.items[Number(card.dataset.i)];
    if (!it || it.kind !== 'page') return;
    const r = await H.readHighlight(it);
    if (destroyed || !card.isConnected) return;
    it.read = r;
    const txt = card.querySelector('[data-txt]');
    const why = card.querySelector('[data-why]');
    if (r.text) txt.textContent = r.text; else txt.remove();
    const msg = r.how === 'none' ? 'No words under this one, so it’s kept as a picture. Remove it if it was a slip.' : [WHY[r.note], HOW[r.how]].filter(Boolean).join(' ');
    if (msg) { why.textContent = msg; why.hidden = false; }
    if (r.how === 'none') {
      const rm = card.querySelector('[data-rm]');
      rm.hidden = false;
      rm.onclick = () => removeHighlight(it);
    }
    const url = await H.highlightPicture(it, r.crop);
    if (destroyed || !card.isConnected) return;
    const pic = card.querySelector('[data-pic]');
    pic.innerHTML = url ? `${html`<img src="${url}" alt="${r.text ? `Highlighted: ${r.text}` : 'A highlight with no words under it'}">`}` : '';
  }

  async function removeHighlight(it) {
    const ok = await confirmSheet({ title: 'Remove this highlight?', body: 'It’s taken off the page too.', confirm: 'Remove', danger: true });
    if (!ok) return;
    const ids = new Set(it.strokes.map((s) => s.id));
    const d = await V.loadPage(it.page.id);
    const sealed = !!it.note.sealed;
    await V.savePage(it.page.id, { ...d, strokes: d.strokes.filter((s) => !ids.has(s.id)), tomb: [...new Set([...(d.tomb || []), ...ids])] }, { sealed });
    const { refreshInkSummary } = await import('../notework.js');
    await refreshInkSummary(it.note.id, { touch: false });
    toast('Highlight removed');
    load();
  }

  async function copyText() {
    const show = (it) => colour === 'all' || H.colourGroup(it.color) === colour;
    const out = [];
    for (const g of groups) {
      const items = g.items.filter(show);
      if (!items.length) continue;
      out.push(`## ${displayTitle(g.note)}`);
      for (const it of items) {
        if (it.kind === 'typed') { out.push(`- ${it.text}`); continue; }
        const r = it.read || await H.readHighlight(it);
        out.push(`- ${r.text || '(a highlight with no words)'} (page ${it.pageNo})`);
      }
      out.push('');
    }
    const text = out.join('\n').trim();
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Couldn’t copy here'); }
  }

  load();
  return {
    update(p) { params = p || {}; colour = 'all'; load(); },
    onEvent(e) { if (['remote', 'sealed', 'delete'].includes(e.type)) load(); },
    destroy() { destroyed = true; io?.disconnect(); },
  };
}
