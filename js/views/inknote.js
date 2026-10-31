// A handwritten note: pages you write on with Apple Pencil, with text boxes,
// stickers, post-its, photos and imported PDF pages.

import { html, raw, $, fmtDate, toast, debounce, isWide } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { newNote, newPage, displayTitle, PAPERS, PAPER_COLORS } from '../model.js';
import { refreshInkSummary } from '../notework.js';
import { icons } from '../icons.js';
import { openSheet, menuSheet, confirmSheet, popover, stickerDrawer, notePicker, passphraseSheet } from '../ui.js';
import { InkSurface } from '../editor/ink.js';
import { PENS, HL, INK_COLORS, HL_COLORS, DEFAULT_FAVS, mm, renderPageCanvas } from '../editor/inkdraw.js';
import { linkedWith, mentions, related, subNotes } from '../connections.js';
import { notebookPicker } from './notebooks.js';

const DEFAULT_TOOL = { tool: 'pen', pen: 'fountain', color: '#1B2A38', size: 3.4, hlColor: '#F7D046', hlSize: 18, eraserMode: 'stroke', hlOnly: false, eraserSize: 16, fingerDraw: false };

export function mount(el, params, ctx) {
  let id = params.id;
  let surface = null;
  let pageIdx = 0;
  let createdHere = false;
  let fmt = null;
  let suggest = null;
  let unfloat = null;
  let saving = Promise.resolve();
  const tool = { ...DEFAULT_TOOL, fingerDraw: !navigator.maxTouchPoints || !/iPad|Macintosh/.test(navigator.userAgent) ? false : false, ...(state.device?.ink || {}) };
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) tool.fingerDraw = false;

  const note = () => state.notes.get(id);
  const favs = () => state.config.favColors || DEFAULT_FAVS;

  async function create() {
    const nb = params.notebook ? state.notebooks.get(params.notebook) : null;
    const par = params.parent ? state.notes.get(params.parent) : null;
    const nbx = nb || (par?.notebook ? state.notebooks.get(par.notebook) : null);
    const page = newPage({ paper: nbx?.paper || 'ruled', color: nbx?.paperColor || 'white' });
    const n = newNote({
      kind: 'ink',
      title: `Notes, ${fmtDate(Date.now())}`,
      titleAuto: false,
      notebook: nbx?.id || null,
      section: params.section || par?.section || nbx?.sections?.[0]?.id || null,
      parent: par?.id || null,
      region: nbx?.region || par?.region || params.region || null,
      inbox: !(nbx || par?.notebook || params.region),
      sealed: !!(nbx?.sealed || par?.sealed),
      pages: [page],
    });
    const saved = await V.saveNote(n);
    id = saved.id;
    createdHere = true;
    ctx.navigate(`#/note/${saved.id}`, { replace: true, silent: true });
  }

  async function start() {
    if (id === 'new') {
      try { await create(); } catch (e) { el.innerHTML = `${html`<div class="page"><p class="error">${e.message}</p></div>`}`; return; }
    }
    const n = note();
    if (!n) {
      el.innerHTML = `${html`<div class="page"><div class="empty"><p class="serif">This note isn’t here</p><p style="margin:0">It may have been deleted, or it’s sealed and locked.</p><a class="btn" href="#/notebooks">Back to notebooks</a></div></div>`}`;
      return;
    }
    if (params.page) pageIdx = Math.max(0, n.pages.findIndex((p) => p.id === params.page));
    draw();
    document.body.classList.add('inking');
  }

  function crumbs(n) {
    const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
    const sec = nb?.sections.find((s) => s.id === n.section);
    return { nb, sec };
  }

  function draw() {
    const n = note();
    const { nb, sec } = crumbs(n);
    el.innerHTML = `${html`<div class="inkview" id="iv">
      <header class="ink-top">
        <button type="button" class="back" data-act="back">${icons.back()}<span class="hide-sm">${nb ? nb.title : 'Back'}</span></button>
        <div class="ink-title">
          <button type="button" class="ink-name" data-act="rename" aria-label="Rename this note">${displayTitle(n)}</button>
          <span class="ink-sub" id="iv-sub">${nb ? `${nb.title}${sec && nb.sections.length > 1 ? ` › ${sec.name}` : ''}, ` : ''}page ${pageIdx + 1} of ${n.pages.length}</span>
        </div>
        <div class="top-actions">
          <button type="button" class="icon-btn bare" data-act="pages" aria-label="All pages">${icons.pages()}</button>
          <button type="button" class="icon-btn bare hide-sm" data-act="link" aria-label="Link to another note">${icons.link()}</button>
          <button type="button" class="icon-btn bare hide-sm" data-act="export" aria-label="Export as PDF">${icons.share()}</button>
          <button type="button" class="icon-btn bare" data-act="more" aria-label="More actions">${icons.more()}</button>
        </div>
      </header>
      <div class="ink-tools" role="toolbar" aria-label="Writing tools" id="iv-tools"></div>
      <div class="ink-host" id="iv-host"></div>
      <div class="fmtbar tb-fmt" id="iv-fmt" role="toolbar" aria-label="Text box formatting" hidden></div>
    </div>`}`;
    el.querySelector('[data-act=back]').onclick = () => leave();
    el.querySelector('[data-act=rename]').onclick = () => rename();
    el.querySelector('[data-act=pages]').onclick = () => pagesSheet();
    el.querySelector('[data-act=link]').onclick = () => linkTo();
    el.querySelector('[data-act=export]').onclick = () => exportPdf();
    el.querySelector('[data-act=more]').onclick = () => more();
    drawTools();
    surface = new InkSurface($('#iv-host', el), {
      getTool: () => tool,
      onChange: (data) => queueSave(data),
      onSelection: () => {},
      onTextEditing: (ed) => textEditing(ed),
      pickColour: (anchor, cb) => colourPop(anchor, cb),
      sealed: () => !!note()?.sealed,
    });
    showPage(pageIdx);
  }

  // ---------- Tools ----------
  function drawTools() {
    const box = $('#iv-tools', el);
    if (!box) return;
    const T = (t, ic, label) => html`<button type="button" class="tool" data-tool="${t}" aria-label="${label}" aria-pressed="${tool.tool === t ? 'true' : 'false'}">${raw(icons[ic]({ size: 22 }))}</button>`;
    const colours = tool.tool === 'hl' ? HL_COLORS.slice(0, 4).map((c) => c[1]) : favs().slice(0, isWide() ? 6 : 4);
    const sizes = tool.tool === 'hl' ? HL.sizes : (PENS[tool.pen] || PENS.fountain).sizes;
    const curSize = tool.tool === 'hl' ? tool.hlSize : tool.size;
    const curCol = tool.tool === 'hl' ? tool.hlColor : tool.color;
    box.innerHTML = `${html`
      <div class="tg"><button type="button" class="tool" data-act="undo" aria-label="Undo">${icons.undo({ size: 22 })}</button><button type="button" class="tool" data-act="redo" aria-label="Redo">${icons.redo({ size: 22 })}</button></div>
      <div class="tg">${T('pen', 'pen', `Pen: ${PENS[tool.pen]?.name || 'Fountain'}`)}${T('hl', 'highlighter', 'Highlighter')}${T('eraser', 'eraser', 'Eraser')}${T('lasso', 'lasso', 'Lasso')}${T('shapes', 'shapes', 'Shapes')}${T('text', 'textbox', 'Text box')}</div>
      <div class="tg"><button type="button" class="tool" data-act="postit" aria-label="Post-it note">${icons.postit({ size: 22 })}</button><button type="button" class="tool" data-act="sticker" aria-label="Stickers">${icons.sticker({ size: 22 })}</button><label class="tool" aria-label="Insert image">${icons.image({ size: 22 })}<input type="file" accept="image/*" class="sr-only" id="iv-img"></label></div>
      ${['pen', 'shapes', 'hl'].includes(tool.tool) ? html`<div class="tg colours" role="group" aria-label="Colours">${colours.map((c) => html`<button type="button" class="ink-swatch" data-col="${c}" style="--c:${c}" aria-label="Colour ${INK_COLORS.find((x) => x[1] === c)?.[0] || HL_COLORS.find((x) => x[1] === c)?.[0] || c}" aria-pressed="${c === curCol ? 'true' : 'false'}"></button>`)}<button type="button" class="ink-swatch more" data-act="colours" aria-label="More colours"></button></div>
      <div class="tg sizes" role="group" aria-label="Thickness">${sizes.map((s, i) => html`<button type="button" class="ink-size" data-size="${s}" aria-label="${['Fine', 'Medium', 'Bold'][i]}, ${mm(s)}" aria-pressed="${Math.abs(s - curSize) < 0.01 ? 'true' : 'false'}"><span style="--d:${Math.round(4 + i * 4)}px;--c:${curCol}"></span></button>`)}</div>` : ''}
      ${tool.tool === 'eraser' ? html`<div class="tg"><button type="button" class="chip sm" data-act="eraser-mode">${tool.eraserMode === 'precise' ? 'Precise' : 'Whole strokes'}</button><button type="button" class="chip sm" aria-pressed="${tool.hlOnly ? 'true' : 'false'}" data-act="hl-only">Only highlights</button></div>` : ''}
      ${tool.tool === 'lasso' && surface?.canPaste ? html`<div class="tg"><button type="button" class="chip sm" data-act="paste">Paste</button></div>` : ''}
      <div class="tg zoom hide-sm"><button type="button" class="tool" data-act="zoom-out" aria-label="Zoom out">${icons.zoomOut({ size: 20 })}</button><button type="button" class="tool" data-act="zoom-in" aria-label="Zoom in">${icons.zoomIn({ size: 20 })}</button></div>`}`;
    box.querySelectorAll('[data-tool]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.tool;
        if (tool.tool === t && (t === 'pen' || t === 'shapes')) { penPop(b); return; }
        if (tool.tool === t && t === 'hl') { hlPop(b); return; }
        if (tool.tool === t && t === 'eraser') { eraserPop(b); return; }
        tool.tool = t;
        saveTool();
        drawTools();
      };
    });
    box.querySelectorAll('[data-col]').forEach((b) => { b.onclick = () => { if (tool.tool === 'hl') tool.hlColor = b.dataset.col; else tool.color = b.dataset.col; saveTool(); drawTools(); }; });
    box.querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { if (tool.tool === 'hl') tool.hlSize = Number(b.dataset.size); else tool.size = Number(b.dataset.size); saveTool(); drawTools(); }; });
    const on = (a, fn) => { const b = box.querySelector(`[data-act=${a}]`); if (b) b.onclick = () => fn(b); };
    on('undo', () => surface?.undo());
    on('redo', () => surface?.redo());
    on('colours', (b) => (tool.tool === 'hl' ? hlPop(b) : penPop(b)));
    on('eraser-mode', () => { tool.eraserMode = tool.eraserMode === 'precise' ? 'stroke' : 'precise'; saveTool(); drawTools(); });
    on('hl-only', () => { tool.hlOnly = !tool.hlOnly; saveTool(); drawTools(); });
    on('paste', () => surface?.paste(30));
    on('zoom-in', () => surface?.setZoom(surface.zoom * 1.25));
    on('zoom-out', () => surface?.setZoom(surface.zoom / 1.25));
    on('postit', async () => { const v = await stickerDrawer({ tab: 'postits', title: 'Post-its and stickers' }); if (v) placeSticker(v); });
    on('sticker', async () => { const v = await stickerDrawer({ tab: 'labels' }); if (v) placeSticker(v); });
    const img = $('#iv-img', box);
    if (img) img.onchange = async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { await surface.insertImage(f); } catch { toast('Couldn’t add that image.'); } } };
  }

  function placeSticker(v) {
    if (!surface) return;
    surface.place(v);
    if (tool.tool === 'pen' || tool.tool === 'hl' || tool.tool === 'eraser') { tool.tool = 'lasso'; drawTools(); }
  }

  const saveTool = debounce(() => V.updateDevice({ ink: { ...tool } }).catch(() => {}), 600);

  function penPop(anchor) {
    const pen = PENS[tool.pen] || PENS.fountain;
    const p = popover(anchor, `${html`<div class="pop-head">Pen</div>
      <div class="pen-types" role="radiogroup" aria-label="Pen type">${Object.entries(PENS).map(([k, v]) => html`<button type="button" role="radio" aria-checked="${tool.pen === k ? 'true' : 'false'}" data-pen="${k}">${v.name}</button>`)}</div>
      <div class="pop-head">Favourites</div>
      <div class="pop-row wrap" id="pp-favs">${favs().map((c) => html`<button type="button" class="swatch" data-c="${c}" style="background:${c}" aria-label="${INK_COLORS.find((x) => x[1] === c)?.[0] || c}" aria-pressed="${c === tool.color ? 'true' : 'false'}"></button>`)}</div>
      <details class="all-colours"><summary>All colours</summary><div class="colour-grid">${INK_COLORS.map(([n, c]) => html`<button type="button" class="swatch sm" data-c="${c}" style="background:${c}" aria-label="${n}"></button>`)}</div></details>
      <div class="pop-row"><label for="pp-hex" class="muted" style="font-size:13px">Colour code</label><input id="pp-hex" type="text" value="${tool.color}" maxlength="7" style="min-height:36px;padding:4px 10px;width:110px" autocapitalize="off"><button type="button" class="btn btn-sm" data-fav>${favs().includes(tool.color) ? 'Remove favourite' : 'Add to favourites'}</button></div>
      <div class="pop-head">Thickness <span class="muted" id="pp-mm">${mm(tool.size)}</span></div>
      <input type="range" id="pp-size" min="1" max="${pen.sizes[2] * 2.2}" step="0.1" value="${tool.size}" aria-label="Thickness">
      <p class="hint" style="padding:0 6px 6px">${tool.pen === 'calligraphy' ? 'A slanted nib: strokes are thick or thin by direction.' : 'Press harder with Apple Pencil for a thicker line.'}</p>`}`, { label: 'Pen settings', width: 330, keepFocus: false });
    p.el.querySelectorAll('[data-pen]').forEach((b) => { b.onclick = () => { tool.pen = b.dataset.pen; tool.size = PENS[tool.pen].sizes[1]; if (tool.tool !== 'shapes') tool.tool = 'pen'; saveTool(); drawTools(); p.close(); penPop(el.querySelector('[data-tool=pen]')); }; });
    p.el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { tool.color = b.dataset.c; $('#pp-hex', p.el).value = tool.color; saveTool(); drawTools(); p.el.querySelectorAll('#pp-favs [data-c]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.c === tool.color ? 'true' : 'false')); }; });
    $('#pp-hex', p.el).onchange = (e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { tool.color = v.toUpperCase(); saveTool(); drawTools(); } else toast('Use a colour code like #2B5684'); };
    p.el.querySelector('[data-fav]').onclick = async () => {
      const f = favs();
      const next = f.includes(tool.color) ? f.filter((c) => c !== tool.color) : [...f, tool.color].slice(-8);
      await V.saveConfig({ favColors: next });
      drawTools();
      p.close();
    };
    $('#pp-size', p.el).oninput = (e) => { tool.size = Number(e.target.value); $('#pp-mm', p.el).textContent = mm(tool.size); saveTool(); };
    $('#pp-size', p.el).onchange = () => drawTools();
  }

  function hlPop(anchor) {
    const p = popover(anchor, `${html`<div class="pop-head">Highlighter</div>
      <div class="pop-row wrap">${HL_COLORS.map(([n, c]) => html`<button type="button" class="swatch" data-c="${c}" style="background:${c}" aria-label="${n}" aria-pressed="${c === tool.hlColor ? 'true' : 'false'}"></button>`)}</div>
      <div class="pop-head">Thickness <span class="muted" id="hp-mm">${mm(tool.hlSize)}</span></div>
      <input type="range" id="hp-size" min="6" max="40" step="1" value="${tool.hlSize}" aria-label="Thickness">
      <p class="hint" style="padding:0 6px 6px">Highlights sit under your ink, and snap straight across a line.</p>`}`, { label: 'Highlighter', width: 300, keepFocus: false });
    p.el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { tool.hlColor = b.dataset.c; saveTool(); drawTools(); p.close(); }; });
    $('#hp-size', p.el).oninput = (e) => { tool.hlSize = Number(e.target.value); $('#hp-mm', p.el).textContent = mm(tool.hlSize); saveTool(); };
  }

  function eraserPop(anchor) {
    const p = popover(anchor, `${html`<div class="pop-head">Eraser</div>
      <button type="button" class="pop-item" data-m="stroke" aria-pressed="${tool.eraserMode !== 'precise'}">Whole strokes</button>
      <button type="button" class="pop-item" data-m="precise" aria-pressed="${tool.eraserMode === 'precise'}">Precise (only what you rub out)</button>
      <label class="check" style="padding:0 6px"><input type="checkbox" id="ep-hl" ${tool.hlOnly ? raw('checked') : ''}> Only erase highlights</label>
      <div class="pop-head">Size</div><input type="range" id="ep-size" min="6" max="60" step="1" value="${tool.eraserSize}" aria-label="Eraser size">`}`, { label: 'Eraser', width: 300, keepFocus: false });
    p.el.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { tool.eraserMode = b.dataset.m; saveTool(); drawTools(); p.close(); }; });
    $('#ep-hl', p.el).onchange = (e) => { tool.hlOnly = e.target.checked; saveTool(); drawTools(); };
    $('#ep-size', p.el).oninput = (e) => { tool.eraserSize = Number(e.target.value); saveTool(); };
  }

  function colourPop(anchor, cb) {
    const p = popover(anchor, `${html`<div class="pop-head">Colour</div><div class="colour-grid">${INK_COLORS.map(([n, c]) => html`<button type="button" class="swatch sm" data-c="${c}" style="background:${c}" aria-label="${n}"></button>`)}</div>`}`, { label: 'Colour', width: 300, onClose: (v) => cb(v) });
    p.el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => p.close(b.dataset.c); });
  }

  // ---------- Text box formatting ----------
  async function textEditing(ed) {
    const bar = $('#iv-fmt', el);
    fmt?.destroy();
    fmt = null;
    suggest?.close();
    suggest = null;
    if (!bar) return;
    unfloat?.();
    unfloat = null;
    if (!ed) { bar.hidden = true; bar.innerHTML = ''; document.body.classList.remove('editing'); return; }
    const T = await import('../editor/toolbar.js');
    bar.hidden = false;
    bar.classList.toggle('phone', !isWide());
    document.body.classList.add('editing');
    fmt = T.mountFormatBar(bar, ed, { compact: true, hideKeyboard: !isWide(), sealed: () => !!note()?.sealed, onHideKeyboard: () => surface?.endEdit() });
    suggest = T.attachSuggest(ed, { noteId: () => id });
    unfloat = T.floatBar(bar);
  }

  // ---------- Pages ----------
  async function showPage(i) {
    const n = note();
    if (!n || !surface) return;
    await saving;
    pageIdx = Math.max(0, Math.min(n.pages.length - 1, i));
    const page = n.pages[pageIdx];
    let data;
    try { data = await V.loadPage(page.id); } catch (e) { console.warn(e); data = V.emptyPageData(); }
    surface.setPage(page, data);
    drawPageBar();
    const sub = $('#iv-sub', el);
    if (sub) {
      const { nb, sec } = crumbs(n);
      sub.textContent = `${nb ? `${nb.title}${sec && nb.sections.length > 1 ? ` › ${sec.name}` : ''}, ` : ''}page ${pageIdx + 1} of ${n.pages.length}`;
    }
  }

  function drawPageBar() {
    const n = note();
    const scroll = el.querySelector('.ink-scroll');
    if (!scroll || !n) return;
    scroll.querySelector('.ink-pagenav')?.remove();
    const nav = document.createElement('div');
    nav.className = 'ink-pagenav';
    nav.innerHTML = String(html`<button type="button" class="btn btn-sm" data-pg="prev" ${pageIdx === 0 ? raw('disabled') : ''}>${icons.back({ size: 16 })}Previous</button>
      <span class="muted">Page ${pageIdx + 1} of ${n.pages.length}</span>
      ${pageIdx < n.pages.length - 1 ? html`<button type="button" class="btn btn-sm" data-pg="next">Next${icons.chevron({ size: 16 })}</button>` : html`<button type="button" class="btn btn-sm" data-pg="add">${icons.plus({ size: 16 })}Add page</button>`}`);
    scroll.appendChild(nav);
    nav.querySelector('[data-pg=prev]').onclick = () => showPage(pageIdx - 1);
    const nx = nav.querySelector('[data-pg=next]');
    if (nx) nx.onclick = () => showPage(pageIdx + 1);
    const ad = nav.querySelector('[data-pg=add]');
    if (ad) ad.onclick = () => addPage();
  }

  async function addPage(fields = {}, at = pageIdx + 1) {
    const n = note();
    const cur = n.pages[pageIdx];
    const page = newPage({ paper: cur?.bg ? 'ruled' : cur?.paper || 'ruled', color: cur?.color || 'white', ...fields });
    const pages = [...n.pages];
    pages.splice(at, 0, page);
    await V.saveNote({ ...n, pages });
    await showPage(at);
    return page;
  }

  function pagesSheet() {
    const n = note();
    const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>${displayTitle(n)}, ${n.pages.length} page${n.pages.length === 1 ? '' : 's'}</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Done</button></span></div>
      <ul class="page-grid" id="pg-grid">${n.pages.map((p, i) => html`<li><button type="button" class="page-thumb ${i === pageIdx ? 'current' : ''}" data-i="${i}" aria-label="Page ${i + 1}${i === pageIdx ? ', current page' : ''}${p.bookmark ? ', bookmarked' : ''}"><canvas data-thumb="${i}" width="10" height="14"></canvas>${p.bookmark ? html`<span class="bm">${icons.bookmark({ size: 16 })}</span>` : ''}</button><button type="button" class="pg-more" data-pm="${i}" aria-label="Page ${i + 1} options">${i + 1} ${icons.more({ size: 16 })}</button></li>`)}
        <li><button type="button" class="page-thumb add" data-add>${icons.plus({ size: 24 })}<span>Add page</span></button></li></ul>
      <section class="paper-pick"><h3>Paper for new pages</h3>
        <div class="chips" role="radiogroup" aria-label="Paper">${PAPERS.map((p) => html`<button type="button" class="chip" role="radio" aria-checked="${p.id === (state.device?.paper || 'ruled')}" aria-pressed="${p.id === (state.device?.paper || 'ruled') ? 'true' : 'false'}" data-paper="${p.id}">${p.name}</button>`)}</div>
        <div class="chips" role="radiogroup" aria-label="Paper colour">${PAPER_COLORS.map((c) => html`<button type="button" class="chip" role="radio" aria-pressed="${c.id === (state.device?.paperColor || 'white') ? 'true' : 'false'}" data-pcol="${c.id}"><span class="dot lg" style="background:${c.bg};border:1px solid var(--field)"></span>${c.name}</button>`)}</div>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-add2>${icons.plus({ size: 16 })}Add after page ${pageIdx + 1}</button>
          <label class="btn btn-sm">${icons.pdf({ size: 16 })}Import PDF<input type="file" accept="application/pdf" class="sr-only" data-pdf></label>
          <label class="btn btn-sm">${icons.camera({ size: 16 })}Photo of paper<input type="file" accept="image/*" capture="environment" class="sr-only" data-photo></label></div>
      </section>`}`, { label: 'Pages' });
    s.el.classList.add('wide-sheet');
    s.el.querySelector('[data-close]').onclick = () => s.close();
    s.el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { s.close(); showPage(Number(b.dataset.i)); }; });
    const pick = () => ({ paper: state.device?.paper || 'ruled', color: state.device?.paperColor || 'white' });
    s.el.querySelector('[data-add]').onclick = async () => { s.close(); await addPage(pick(), note().pages.length); };
    s.el.querySelector('[data-add2]').onclick = async () => { s.close(); await addPage(pick()); };
    s.el.querySelectorAll('[data-paper]').forEach((b) => { b.onclick = async () => { await V.updateDevice({ paper: b.dataset.paper }); s.el.querySelectorAll('[data-paper]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); }; });
    s.el.querySelectorAll('[data-pcol]').forEach((b) => { b.onclick = async () => { await V.updateDevice({ paperColor: b.dataset.pcol }); s.el.querySelectorAll('[data-pcol]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); }; });
    s.el.querySelector('[data-pdf]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; s.close(); await importPdf(f); };
    s.el.querySelector('[data-photo]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; s.close(); await photoPage(f); };
    s.el.querySelectorAll('[data-pm]').forEach((b) => { b.onclick = () => pageMenu(Number(b.dataset.pm), s); });
    // Thumbnails
    n.pages.forEach(async (p, i) => {
      try {
        const data = await V.loadPage(p.id);
        const c = await renderPageCanvas(p, data, 220);
        const slot = s.el.querySelector(`[data-thumb="${i}"]`);
        if (slot) slot.replaceWith(Object.assign(c, { className: 'thumb-canvas' }));
      } catch { /* not downloaded yet */ }
    });
  }

  async function pageMenu(i, sheet) {
    const n = note();
    const p = n.pages[i];
    const items = [
      { value: 'bookmark', label: p.bookmark ? 'Remove bookmark' : 'Bookmark this page' },
      { value: 'paper', label: 'Change paper' },
    ];
    if (i > 0) items.push({ value: 'left', label: 'Move earlier' });
    if (i < n.pages.length - 1) items.push({ value: 'right', label: 'Move later' });
    if (n.pages.length > 1) items.push({ value: 'delete', label: 'Delete page', danger: true });
    const act = await menuSheet(`Page ${i + 1}`, items);
    if (!act) return;
    sheet?.close();
    const pages = [...n.pages];
    if (act === 'bookmark') pages[i] = { ...p, bookmark: !p.bookmark };
    if (act === 'left' || act === 'right') { const j = act === 'left' ? i - 1 : i + 1; [pages[i], pages[j]] = [pages[j], pages[i]]; }
    if (act === 'paper') {
      const paper = await menuSheet('Paper', PAPERS.map((x) => ({ value: x.id, label: x.name })));
      if (!paper) return;
      const color = await menuSheet('Paper colour', PAPER_COLORS.map((x) => ({ value: x.id, label: x.name })));
      pages[i] = { ...p, paper, color: color || p.color };
    }
    if (act === 'delete') {
      const ok = await confirmSheet({ title: `Delete page ${i + 1}?`, body: 'Its writing, stickers and text boxes go too. This syncs to your other devices.', confirm: 'Delete page', danger: true });
      if (!ok) return;
      pages.splice(i, 1);
      const data = await V.loadPage(p.id).catch(() => null);
      for (const o of data?.objects || []) if (o.fileId) await V.deleteFile(o.fileId);
      if (p.bg) await V.deleteFile(p.bg);
      await V.deleteFile(p.id);
      V.forgetPageCache(p.id);
      await V.saveNote({ ...n, pages, pageTomb: [...(n.pageTomb || []), p.id] });
      await summarise();
      await showPage(Math.min(pageIdx, pages.length - 1));
      return;
    }
    await V.saveNote({ ...n, pages });
    await showPage(act === 'left' ? i - 1 : act === 'right' ? i + 1 : i);
  }

  async function photoPage(file) {
    try {
      const { compressImage } = await import('../images.js');
      const img = await compressImage(file, { max: 2200, quality: 0.85 });
      const bg = await V.addFile(img.bytes, { sealed: note().sealed });
      await addPage({ paper: 'blank', bg, h: Math.round((1000 * img.h) / img.w) });
      toast('Added a page from your photo');
    } catch { toast('Couldn’t use that photo.'); }
  }

  async function importPdf(file) {
    const { importPdfPages } = await import('../pdf.js');
    const n = note();
    const prog = openSheet(`${html`<h2 class="page-title" style="font-size:24px">Importing ${file.name}</h2><p class="muted" id="pdf-prog" style="margin:0">Reading the PDF…</p>`}`, { label: 'Importing PDF' });
    try {
      const { pages, text } = await importPdfPages(file, { sealed: n.sealed, onProgress: (i, t) => { const p = $('#pdf-prog', prog.el); if (p) p.textContent = `Page ${i} of ${t}`; } });
      const cur = note();
      const all = [...cur.pages];
      const empty = all.length === 1 && !(await V.loadPage(all[0].id)).strokes.length && !(await V.loadPage(all[0].id)).objects.length && !all[0].bg;
      const at = empty ? 0 : pageIdx + 1;
      if (empty) all.splice(0, 1);
      all.splice(at, 0, ...pages);
      await V.saveNote({ ...cur, pages: all, source: cur.source || 'pdf', pdfText: undefined, title: cur.title.startsWith('Notes, ') ? file.name.replace(/\.pdf$/i, '') : cur.title });
      await summarise(text);
      prog.close();
      toast(`Imported ${pages.length} page${pages.length === 1 ? '' : 's'}`);
      await showPage(at);
      draw();
    } catch (e) {
      console.error(e);
      prog.close();
      toast(e.message || 'Couldn’t read that PDF.');
    }
  }

  // ---------- Saving ----------
  let pending = null;
  const flushSoon = debounce(() => flush(), 600);
  function queueSave(data) {
    pending = { pageId: note()?.pages[pageIdx]?.id, data };
    flushSoon();
  }
  function flush() {
    flushSoon.cancel();
    const job = pending;
    pending = null;
    if (!job?.pageId) return saving;
    saving = saving.then(async () => {
      const n = note();
      if (!n) return;
      try {
        await V.savePage(job.pageId, job.data, { sealed: n.sealed });
        await summarise();
      } catch (e) { toast(e.message || 'Couldn’t save this page.'); }
    });
    return saving;
  }

  // The note keeps a summary of its pages (text, labels, tasks), so search,
  // links, Tasks and Labels work without opening every page.
  async function summarise(pdfText = null) {
    if (!note()) return;
    await refreshInkSummary(id, { pdfText });
  }

  // ---------- Actions ----------
  async function rename() {
    const n = note();
    const s = openSheet(`${html`<form class="stack" style="display:flex;flex-direction:column;gap:16px" novalidate>
      <h2 class="page-title" style="font-size:26px">Rename</h2>
      <div class="field"><label for="rn-t">Title</label><input id="rn-t" type="text" value="${n.title}" autocomplete="off"></div>
      <button class="btn btn-primary btn-block" type="submit">Save</button><button class="btn btn-ghost btn-block" type="button" data-cancel>Cancel</button></form>`}`, { label: 'Rename' });
    s.el.querySelector('[data-cancel]').onclick = () => s.close();
    s.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const t = $('#rn-t', s.el).value.trim();
      await V.saveNote({ ...note(), title: t, titleAuto: !t });
      s.close();
      el.querySelector('.ink-name').textContent = displayTitle(note());
    };
    setTimeout(() => $('#rn-t', s.el)?.select(), 50);
  }

  async function linkTo() {
    const n = note();
    const other = await notePicker({ exclude: [n.id, ...n.links] });
    if (other) { await V.linkNotes(n.id, other); toast('Linked'); }
  }

  async function exportPdf() {
    await flush();
    toast('Making the PDF…');
    const { exportNotePdf } = await import('../export.js');
    try { await exportNotePdf(note()); } catch (e) { console.error(e); toast('Couldn’t make the PDF.'); }
  }

  function connectionsSheet() {
    const n = note();
    const linked = linkedWith(n);
    const ment = mentions(n);
    const rel = related(n);
    const kids = subNotes(n);
    const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>Connections</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Done</button></span></div>
      ${kids.length ? html`<h3 class="section-title">Sub-notes</h3><ul class="links-list">${kids.map((k) => html`<li><a href="#/note/${k.id}">${icons.sub({ size: 16 })}<span style="flex:1">${displayTitle(k)}</span></a></li>`)}</ul>` : ''}
      ${linked.length ? html`<h3 class="section-title">Linked</h3><ul class="links-list">${linked.map((x) => html`<li><a href="#/note/${x.note.id}"><span style="flex:1">${displayTitle(x.note)}</span></a></li>`)}</ul>` : ''}
      ${ment.length ? html`<h3 class="section-title">Mentioned, not linked</h3><ul class="links-list">${ment.map((m) => html`<li><a href="#/note/${m.note.id}"><span style="flex:1">${displayTitle(m.note)}</span></a><button type="button" class="btn btn-sm" data-acc="${m.note.id}">Link</button></li>`)}</ul>` : ''}
      ${rel.length ? html`<h3 class="section-title">Related, found on this device</h3><ul class="links-list">${rel.map((x) => html`<li><a href="#/note/${x.note.id}"><span style="flex:1">${displayTitle(x.note)}</span></a><button type="button" class="btn btn-sm" data-acc="${x.note.id}">Link</button></li>`)}</ul>` : ''}
      ${!kids.length && !linked.length && !ment.length && !rel.length ? html`<p class="hint">No connections yet. Text boxes can link notes with [[ ]].</p>` : ''}
      <div class="btn-row"><button type="button" class="btn btn-sm" data-sub="note">${icons.plus({ size: 16 })}Typed sub-note</button><button type="button" class="btn btn-sm" data-sub="ink">${icons.pen({ size: 16 })}Handwritten sub-note</button></div>`}`, { label: 'Connections' });
    s.el.querySelector('[data-close]').onclick = () => s.close();
    s.el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => s.close()));
    s.el.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = async () => { await V.linkNotes(n.id, b.dataset.acc); toast('Linked'); b.remove(); }; });
    s.el.querySelectorAll('[data-sub]').forEach((b) => { b.onclick = () => { s.close(); ctx.navigate(`#/note/new?parent=${n.id}${b.dataset.sub === 'ink' ? '&kind=ink' : ''}`); }; });
  }

  async function more() {
    const n = note();
    await flush();
    const items = [
      { value: 'rename', label: 'Rename' },
      { value: 'connections', label: 'Connections and sub-notes' },
      { value: 'link', label: 'Link to another note' },
      { value: 'finger', label: tool.fingerDraw ? 'Fingers scroll (Pencil writes)' : 'Draw with finger' },
      { value: 'notebook', label: n.notebook ? 'Move to another notebook' : 'Move into a notebook' },
      { value: 'history', label: 'Version history' },
      { value: 'pdf', label: 'Export as PDF' },
      { value: n.sealed ? 'unseal' : 'seal', label: n.sealed ? 'Unseal' : 'Seal this note' },
      { value: 'delete', label: 'Delete note', danger: true },
    ];
    const act = await menuSheet(displayTitle(n), items);
    if (act === 'rename') rename();
    if (act === 'connections') connectionsSheet();
    if (act === 'link') linkTo();
    if (act === 'finger') { tool.fingerDraw = !tool.fingerDraw; surface.penSeen = false; surface.updateTouchAction(); saveTool(); toast(tool.fingerDraw ? 'Your finger writes now. Two fingers or the page bar to move around.' : 'Fingers scroll. Apple Pencil writes.'); }
    if (act === 'notebook') {
      const dest = await notebookPicker({ title: 'Move to a notebook' });
      if (dest) {
        const nb = state.notebooks.get(dest.notebook);
        await V.saveNote({ ...note(), notebook: dest.notebook, section: dest.section, region: nb?.region || null, inbox: false, parent: null });
        toast(`Moved to ${nb?.title}`);
        draw();
      }
    }
    if (act === 'history') { const { openHistory } = await import('./history.js'); openHistory(n, ctx, { page: n.pages[pageIdx] }); }
    if (act === 'pdf') exportPdf();
    if (act === 'seal' || act === 'unseal') {
      const sealed = act === 'seal';
      if (V.sealedState() === 'none') { toast('Set up sealed notes in Settings first.'); return; }
      if (V.sealedState() === 'locked') { const ok = await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) }); if (!ok) return; }
      try { await V.setSealed(n.id, sealed); toast(sealed ? 'Sealed' : 'Unsealed'); } catch (e) { toast(e.message); }
    }
    if (act === 'delete') {
      const ok = await confirmSheet({ title: 'Delete this note?', body: `All ${n.pages.length} page${n.pages.length === 1 ? '' : 's'} go too. This syncs to your other devices.`, confirm: 'Delete', danger: true });
      if (ok) {
        surface?.destroy();
        surface = null;
        await V.deleteNote(n.id);
        toast('Deleted');
        ctx.navigate(n.notebook ? `#/notebook/${n.notebook}` : '#/notebooks', { replace: true });
      }
    }
  }

  async function leave() {
    surface?.endEdit();
    await flush();
    const n = note();
    if (n?.notebook) ctx.navigate(`#/notebook/${n.notebook}`);
    else ctx.back();
  }

  // Throw away a brand-new note that was never written on.
  async function discardIfEmpty() {
    const n = note();
    if (!createdHere || !n || n.pages.length !== 1 || n.pages[0].bg) return;
    const d = await V.loadPage(n.pages[0].id).catch(() => null);
    if (d && !d.strokes.length && !d.objects.length && n.title.startsWith('Notes, ')) await V.deleteNote(n.id);
  }

  start();

  const onResize = () => drawTools();
  window.addEventListener('resize', onResize);

  return {
    update(p) {
      if (p.id === id) { if (p.page) { const i = note()?.pages.findIndex((x) => x.id === p.page); if (i >= 0) showPage(i); } return; }
      flush();
      surface?.destroy();
      surface = null;
      id = p.id;
      params = p;
      pageIdx = 0;
      start();
    },
    onEvent(evt) {
      const n = note();
      if (!n) return;
      if (evt.type === 'page' && evt.id === n.pages[pageIdx]?.id && !pending && !surface?.drawing && !surface?.editing) {
        V.loadPage(evt.id).then((d) => surface?.replaceData(d));
      }
      if (evt.type === 'remote' || evt.type === 'note' || evt.type === 'sealed') {
        const sub = $('#iv-sub', el);
        if (sub && pageIdx >= n.pages.length) showPage(n.pages.length - 1);
        else if (sub) drawPageBar();
      }
      if (evt.type === 'config') surface?.render();
    },
    destroy() {
      window.removeEventListener('resize', onResize);
      surface?.endEdit();
      flush().then(() => discardIfEmpty());
      fmt?.destroy();
      surface?.destroy();
      surface = null;
      document.body.classList.remove('inking', 'editing');
    },
  };
}
