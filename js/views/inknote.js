// A handwritten note: pages you write on with Apple Pencil, with text boxes,
// stickers, post-its, photos and imported PDF pages.

import { html, raw, $, fmtDate, toast, debounce, isWide, uid, copyText } from '../util.js';
import { readStrokes, readNote, handOn } from '../handwriting.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { newNote, newPage, displayTitle, PAPERS, PAPER_COLORS, PAGE_W, A4_H } from '../model.js';
import { refreshInkSummary } from '../notework.js';
import { icons } from '../icons.js';
import { focusButtonHtml, toggleFocus, enterNote, leaveNote } from '../focus.js';
import { openSheet, menuSheet, confirmSheet, popover, stickerDrawer, notePicker, passphraseSheet, labelPicker, tooltips } from '../ui.js';
import { InkSurface, penExtras } from '../editor/ink.js';
import { ZoomStrip } from '../editor/zoomstrip.js';
import { PageStack } from '../editor/pagestack.js';
import { startRecording, stopRecording, isRecording, recordingTime } from '../recorder.js';
import { mountPlayer } from './recordings.js';
import { PENS, HL, INK_COLORS, HL_COLORS, DEFAULT_FAVS, mm, renderPageCanvas, layerView, noteLayers, layerOf, drawStroke, drawPaper, SMOOTHING, strokeBox, setInkTone, pageDark, darkInk, fileImage } from '../editor/inkdraw.js';
import { isDarkUI } from '../theme.js';
import { linkedWith, mentions, related, subNotes } from '../connections.js';
import { miniMapHtml } from '../minimap.js';
import { notebookPicker, textSheet } from './notebooks.js';
import { BOX_FONT, TEXT_SIZE } from '../fonts.js';

const activeLayers = new Map(); // note id -> the layer you're writing on (this session)

const DEFAULT_TOOL = { tool: 'pen', pen: 'fountain', color: '#1B2A38', size: 3.4, smoothing: 2, pressure: true, hlColor: '#F7D046', hlSize: 18, eraserMode: 'stroke', hlOnly: false, eraserSize: 16, fingerDraw: false };

export function mount(el, params, ctx) {
  let id = params.id;
  let surface = null;
  let pageIdx = 0;
  let createdHere = false;
  let fmt = null;
  let suggest = null;
  let unfloat = null;
  let saving = Promise.resolve();
  let zoom = null;
  const tool = { ...DEFAULT_TOOL, fingerDraw: !navigator.maxTouchPoints || !/iPad|Macintosh/.test(navigator.userAgent) ? false : false, ...(state.device?.ink || {}) };
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) tool.fingerDraw = false;

  const note = () => state.notes.get(id);
  const thumbCache = new Map();
  // Continuous view: every page one under another (see pagestack.js).
  let stack = null;
  const fresh = new Map(); // pageId -> newest data of pages written on and left, until saved
  const continuousOn = () => (state.device?.pageView || 'continuous') === 'continuous';
  const pageData = async (pid) => fresh.get(pid) || V.loadPage(pid);
  const cachedData = (pid) => fresh.get(pid) || V.peekPage(pid);
  // The last page open in each note, on this device.
  const LAST_KEY = 'sb-last-pages';
  const lastPages = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch { return {}; } };
  const rememberPage = (pageId) => {
    try {
      const m = lastPages();
      delete m[id];
      m[id] = pageId;
      const keys = Object.keys(m);
      for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete m[k];
      localStorage.setItem(LAST_KEY, JSON.stringify(m));
    } catch { /* private mode */ }
  };
  const favs = () => state.config.favColors || DEFAULT_FAVS;

  async function create() {
    const nb = params.notebook ? state.notebooks.get(params.notebook) : null;
    const par = params.parent ? state.notes.get(params.parent) : null;
    const nbx = nb || (par?.notebook ? state.notebooks.get(par.notebook) : null);
    const page = newPage({ paper: nbx?.paper || state.device?.paper || 'dotted', color: nbx?.paperColor || state.device?.paperColor || 'white' });
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
    else {
      // Open where you left off (long PDFs especially).
      const last = lastPages()[id];
      const at = last ? n.pages.findIndex((p) => p.id === last) : -1;
      if (at > 0) pageIdx = at;
    }
    draw();
    document.body.classList.add('inking');
    enterNote();
    // A PDF handed over from a notebook or Capture: its pages to mark up.
    const { takeHandOff } = await import('../handoff.js');
    const pdf = takeHandOff();
    if (pdf) await importPdf(pdf);
    // Catch up on reading pages written before (or on another device).
    if (handOn()) setTimeout(() => { if (note()) readNote(id).catch(() => {}); }, 2000);
  }

  function crumbs(n) {
    const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
    const sec = nb?.sections.find((s) => s.id === n.section);
    return { nb, sec };
  }

  function draw() {
    const n = note();
    const { nb, sec } = crumbs(n);
    stack?.destroy();
    stack = null;
    el.innerHTML = `${html`<div class="inkview" id="iv">
      <header class="ink-top">
        <button type="button" class="back" data-act="back">${icons.back()}<span class="hide-sm">${nb ? nb.title : 'Back'}</span></button>
        <div class="ink-title">
          <button type="button" class="ink-name" data-act="rename" aria-label="Rename this note">${displayTitle(n)}</button>
          <span class="ink-sub" id="iv-sub">${nb ? `${nb.title}${sec && nb.sections.length > 1 ? ` › ${sec.name}` : ''}, ` : ''}page ${pageIdx + 1} of ${n.pages.length}</span>
        </div>
        <div class="top-actions">
          <button type="button" class="icon-btn bare show-sm-flex" data-act="undo" aria-label="Undo">${icons.undo()}</button>
          <button type="button" class="icon-btn bare show-sm-flex" data-act="redo" aria-label="Redo">${icons.redo()}</button>
          <button type="button" class="icon-btn bare" data-act="replay" aria-label="Replay recordings" aria-pressed="false" ${n.recordings.length ? '' : raw('hidden')}>${icons.headphones()}</button>
          ${raw(focusButtonHtml())}
          <button type="button" class="icon-btn bare" data-act="pages" aria-label="All pages">${icons.pages()}</button>
          <button type="button" class="icon-btn bare hide-sm" data-act="link" aria-label="Link to another note">${icons.link()}</button>
          <button type="button" class="icon-btn bare hide-sm" data-act="export" aria-label="Export as PDF">${icons.share()}</button>
          <button type="button" class="icon-btn bare" data-act="more" aria-label="More actions">${icons.more()}</button>
        </div>
      </header>
      <div class="ink-bars"><div class="ink-tools" role="toolbar" aria-label="Writing tools" id="iv-tools"></div>
      <div class="ink-props" role="toolbar" aria-label="Settings for this tool" id="iv-props" hidden></div></div>
      <div class="ink-host" id="iv-host"></div>
      <div class="zs" id="iv-zs" role="region" aria-label="Writing window" hidden></div>
    </div>`}`;
    el.querySelector('[data-act=back]').onclick = () => leave();
    el.querySelector('[data-act=rename]').onclick = () => rename();
    el.querySelector('[data-act=pages]').onclick = () => pagesSheet();
    el.querySelector('[data-act=focus]').onclick = () => toggleFocus();
    el.querySelector('[data-act=replay]').onclick = () => (replay ? exitReplay() : enterReplay());
    el.querySelector('[data-act=link]').onclick = () => linkTo();
    el.querySelector('[data-act=export]').onclick = () => exportPdf();
    el.querySelector('[data-act=more]').onclick = () => more();
    tooltips(el.querySelector('.ink-top'));
    drawTools();
    surface = new InkSurface($('#iv-host', el), {
      getTool: () => tool,
      onChange: (data) => { queueSave(data); zoom?.render(); maybeGrow(data); },
      pickLayer: (anchor) => pickLayer(anchor),
      readHandwriting: (strokes, box) => convertSheet(strokes, box),
      editTable: (o, btn) => tableSheet(btn, o),
      onSelection: () => {},
      onTextEditing: (ed) => textEditing(ed),
      pickColour: (anchor, cb) => colourPop(anchor, cb),
      sealed: () => !!note()?.sealed,
      onLayout: () => stack?.sizeAll(),
    });
    $('#iv-host', el).insertAdjacentHTML('beforeend', `<button type="button" class="ink-pageind" id="iv-ind" aria-label="All pages" hidden></button>`);
    $('#iv-ind', el).onclick = () => pagesSheet();
    applyLayers();
    showPage(pageIdx);
    bindPageTurns(surface.scroll);
  }

  // ---------- Turning pages ----------
  // Scroll on past the end of a page for the next one (and back past the top
  // for the one before), like a PDF reader. Page Up/Down and arrows work too.
  let turning = false;
  async function turn(dir) {
    const n = note();
    if (turning || !n) return;
    const to = pageIdx + dir;
    if (to < 0 || to >= n.pages.length) return;
    turning = true;
    try {
      await showPage(to);
      const sc = surface?.scroll;
      if (sc && dir < 0 && !stack) sc.scrollTop = sc.scrollHeight;
    } finally { turning = false; }
  }
  function bindPageTurns(sc) {
    const atEnd = () => sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
    const atTop = () => sc.scrollTop <= 2;
    let pull = 0;
    let quiet = null;
    let held = false; // after a turn, the rest of that flick doesn't scroll the new page
    sc.addEventListener('wheel', (e) => {
      if (stack || e.ctrlKey || e.metaKey || note()?.pages.length < 2) return;
      clearTimeout(quiet);
      quiet = setTimeout(() => { pull = 0; held = false; }, 300);
      if (held) { e.preventDefault(); return; }
      if ((e.deltaY > 0 && atEnd()) || (e.deltaY < 0 && atTop())) {
        pull += e.deltaY;
        const dir = pull > 220 ? 1 : pull < -220 ? -1 : 0;
        if (dir) { pull = 0; held = true; turn(dir); }
      } else pull = 0;
    }, { passive: false });
    // Touch: drag on past the end (when fingers scroll rather than write).
    let t0 = null;
    sc.addEventListener('touchstart', (e) => {
      const scrolls = !stack && (surface?.pageEl.style.touchAction || '').includes('pan');
      t0 = e.touches.length === 1 && scrolls ? { y: e.touches[0].clientY, end: atEnd(), top: atTop() } : null;
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if (!t0 || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - t0.y;
      t0.dy = dy;
      if (!atEnd()) t0.end = false;
      if (!atTop()) t0.top = false;
    }, { passive: true });
    sc.addEventListener('touchend', () => {
      if (!t0) return;
      if (t0.end && atEnd() && t0.dy < -90) turn(1);
      else if (t0.top && atTop() && t0.dy > 90) turn(-1);
      t0 = null;
    });
  }
  const onPageKeys = (e) => {
    if (e.defaultPrevented || e.target.closest?.('input, textarea, [contenteditable=true], .tb-edit, .postit-edit')) return;
    if (surface?.sel || surface?.editing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('.overlay, .popover')) return; // a sheet or menu is open
    if (el.closest('.split-pane:not(.active)')) return; // side by side: the other side has the keys
    if (e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
    if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
  };
  document.addEventListener('keydown', onPageKeys);

  // ---------- Endless scroll ----------
  // In endless layout the page gets longer as you near the bottom.
  function maybeGrow(data) {
    const n = note();
    if (n?.layout !== 'scroll') return;
    const page = n.pages[pageIdx];
    if (!page) return;
    let bottom = 0;
    for (const s of data.strokes) { const b = strokeBox(s); bottom = Math.max(bottom, b.y + b.h); }
    for (const o of data.objects) bottom = Math.max(bottom, o.y + (o.h || o._h || 40));
    if (bottom > page.h - 450) growPage(Math.ceil((bottom + 900) / 100) * 100);
  }
  async function growPage(h, i = pageIdx) {
    const n = note();
    const page = n?.pages[i];
    if (!page || h <= page.h) return;
    await V.saveNote({ ...n, pages: n.pages.map((p, k) => (k === i ? { ...p, h } : p)) });
    if (i === pageIdx) surface?.setPageHeight(h);
    drawPageBar();
  }
  async function setLayout(layout) {
    const n = note();
    if (!n || n.layout === layout) return;
    await V.saveNote({ ...n, layout });
    if (layout === 'scroll') {
      toast('Endless scroll: the page grows as you write.');
      const d = surface?.data;
      if (d) maybeGrow(d);
    } else toast('A4 pages. Pages already made longer stay as they are.');
    drawPageBar();
  }

  // ---------- Layers ----------
  const activeLayer = () => {
    const a = activeLayers.get(id) || 'ink';
    return noteLayers(note()).some((l) => l.id === a && a !== 'paper') ? a : 'ink';
  };
  function applyLayers() {
    const n = note();
    if (!n || !surface) return;
    stack?.refresh();
    const ls = noteLayers(n);
    surface.setLayers({
      hidden: new Set(ls.filter((l) => l.hidden).map((l) => l.id)),
      locked: new Set(ls.filter((l) => l.locked && l.id !== 'paper').map((l) => l.id)),
      active: activeLayer(),
      paperHidden: !!ls.find((l) => l.id === 'paper')?.hidden,
      names: Object.fromEntries(ls.map((l) => [l.id, l.name])),
    });
    zoom?.render();
    const b = el.querySelector('[data-act=layers]');
    if (b) b.classList.toggle('dot', ls.some((l) => l.hidden));
  }
  async function saveLayers(list, extra = {}) {
    await V.saveNote({ ...note(), layers: list, ...extra });
    applyLayers();
  }

  function layersPop(anchor) {
    const n = note();
    const ls = noteLayers(n);
    const act = activeLayer();
    const status = (l) => (l.id === act ? 'Writing here' : l.hidden ? 'Hidden' : l.locked ? 'Locked' : '');
    const p = popover(anchor, `${html`<div class="lay-head"><span class="pop-title">Layers</span><button type="button" class="btn btn-sm" data-ladd>${icons.plus({ size: 15 })}Add layer</button></div>
      <ul class="lay-list">${ls.map((l) => html`<li class="${l.id === act ? 'on' : ''} ${l.hidden ? 'off' : ''}">
        <button type="button" class="lay-eye" data-leye="${l.id}" aria-label="${l.hidden ? 'Show' : 'Hide'} ${l.name}" aria-pressed="${l.hidden ? 'false' : 'true'}">${l.hidden ? icons.eyeOff({ size: 18 }) : l.id === 'paper' ? icons.lock({ size: 17 }) : icons.eye({ size: 18 })}</button>
        <button type="button" class="lay-name" data-lpick="${l.id}" ${l.id === 'paper' ? raw('aria-disabled="true"') : ''}>${l.name}${l.locked && l.id !== 'paper' ? raw(icons.lock({ size: 13 })) : ''}</button>
        <span class="lay-st">${status(l)}</span>
        ${l.id === 'paper' ? '' : html`<button type="button" class="lay-more" data-lmore="${l.id}" aria-label="${l.name} options">${icons.more({ size: 16 })}</button>`}</li>`)}</ul>
      <label class="check lay-exp"><input type="checkbox" id="lay-exp" ${n.exportAllLayers ? '' : raw('checked')}> Export visible layers only</label>`}`, { label: 'Layers', width: 330, keepFocus: false });
    const redraw = () => { p.close(); layersPop(anchor); };
    p.el.querySelectorAll('[data-leye]').forEach((b) => {
      b.onclick = async () => {
        const lid = b.dataset.leye;
        const list = noteLayers(note()).map((l) => (l.id === lid ? { ...l, hidden: !l.hidden } : l));
        await saveLayers(list);
        redraw();
      };
    });
    p.el.querySelectorAll('[data-lpick]').forEach((b) => {
      b.onclick = async () => {
        const lid = b.dataset.lpick;
        if (lid === 'paper') { toast('The paper is the page itself: its lines and any PDF or photo behind your writing.'); return; }
        activeLayers.set(id, lid);
        const l = noteLayers(note()).find((x) => x.id === lid);
        if (l?.hidden) await saveLayers(noteLayers(note()).map((x) => (x.id === lid ? { ...x, hidden: false } : x)));
        else applyLayers();
        if (l?.locked) toast(`${l.name} is locked. Unlock it to write on it.`);
        redraw();
      };
    });
    p.el.querySelectorAll('[data-lmore]').forEach((b) => { b.onclick = () => { p.close(); layerMenu(b.dataset.lmore, anchor); }; });
    p.el.querySelector('[data-ladd]').onclick = async () => {
      p.close();
      const list = noteLayers(note());
      const name = await textSheet({ title: 'New layer', label: 'Name', value: `Layer ${list.length}`, confirm: 'Add layer' });
      if (!name) return;
      const nl = { id: uid('L'), name };
      const at = list.findIndex((l) => l.id === 'paper');
      list.splice(at < 0 ? list.length : at, 0, nl);
      activeLayers.set(id, nl.id);
      await saveLayers(list);
      toast(`Writing on ${name}`);
    };
    p.el.querySelector('#lay-exp').onchange = (e) => saveLayers(noteLayers(note()), { exportAllLayers: !e.target.checked });
  }

  async function layerMenu(lid, anchor) {
    const l = noteLayers(note()).find((x) => x.id === lid);
    if (!l) return;
    const custom = !['ink', 'hl', 'paper'].includes(lid);
    const items = [{ value: 'lock', label: l.locked ? 'Unlock' : 'Lock, so nothing on it changes' }, { value: 'rename', label: 'Rename' }];
    if (custom) items.push({ value: 'merge', label: 'Merge into Ink' }, { value: 'delete', label: 'Delete layer and its writing', danger: true });
    const act = await menuSheet(l.name, items);
    if (act === 'lock') await saveLayers(noteLayers(note()).map((x) => (x.id === lid ? { ...x, locked: !x.locked } : x)));
    if (act === 'rename') {
      const name = await textSheet({ title: 'Rename layer', label: 'Name', value: l.name, confirm: 'Save' });
      if (name) await saveLayers(noteLayers(note()).map((x) => (x.id === lid ? { ...x, name } : x)));
    }
    if (act === 'merge' || act === 'delete') {
      if (act === 'delete') {
        const ok = await confirmSheet({ title: `Delete ${l.name}?`, body: 'Everything written on this layer goes, on every page of this note.', confirm: 'Delete', danger: true });
        if (!ok) return;
      }
      await flush();
      const n = note();
      for (const pg of n.pages) {
        let d;
        try { d = await V.loadPage(pg.id); } catch { continue; }
        const mine = (it) => layerOf(it) === lid;
        if (!d.strokes.some(mine) && !d.objects.some(mine)) continue;
        const tomb = [...d.tomb];
        const now = Date.now();
        let strokes;
        let objects;
        if (act === 'delete') {
          strokes = d.strokes.filter((s) => { if (mine(s)) { tomb.push(s.id); return false; } return true; });
          objects = d.objects.filter((o) => { if (mine(o)) { tomb.push(o.id); return false; } return true; });
        } else {
          const un = (it) => { const c = { ...it }; delete c.l; return c; };
          strokes = d.strokes.map((s) => { if (!mine(s)) return s; tomb.push(s.id); return { ...un(s), id: uid('k'), ...(s.t === 'hl' ? { l: 'ink' } : {}) }; });
          objects = d.objects.map((o) => (mine(o) ? { ...un(o), t: now } : o));
        }
        await V.savePage(pg.id, { ...d, strokes, objects, tomb }, { sealed: n.sealed });
      }
      if (activeLayers.get(id) === lid) activeLayers.delete(id);
      await saveLayers(noteLayers(note()).filter((x) => x.id !== lid));
      await showPage(pageIdx);
      toast(act === 'delete' ? 'Layer deleted' : `Merged into Ink`);
    }
    void anchor;
  }

  function pickLayer(anchor) {
    return new Promise((resolve) => {
      const ls = noteLayers(note()).filter((l) => l.id !== 'paper');
      const p = popover(anchor, `${html`<div class="pop-head">Move to layer</div>${ls.map((l) => html`<button type="button" class="pop-item" data-l="${l.id}">${l.name}${l.hidden ? ' (hidden)' : l.locked ? ' (locked)' : ''}</button>`)}`}`, { label: 'Move to layer', width: 260, onClose: (v) => resolve(v || null) });
      p.el.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => p.close(b.dataset.l); });
    });
  }

  // ---------- Writing window ----------
  function toggleZoom() {
    if (zoom) { closeZoom(); return; }
    if (!surface?.page) return;
    if (tool.tool !== 'pen' && tool.tool !== 'hl' && tool.tool !== 'eraser') { tool.tool = 'pen'; saveTool(); }
    zoom = new ZoomStrip(surface, $('#iv-zs', el), { getTool: () => tool, onClose: () => closeZoom() });
    el.querySelector('#iv')?.classList.add('zooming');
    drawTools();
  }
  function closeZoom() {
    zoom?.destroy();
    zoom = null;
    el.querySelector('#iv')?.classList.remove('zooming');
    drawTools();
  }

  // ---------- Tools ----------
  // Two rows: the tools (always the same, so nothing jumps around), and
  // below them the settings for the tool in hand.
  function drawTools() {
    if (fmt) return; // a text box is being edited; its toolbar is showing
    const box = $('#iv-tools', el);
    const props = $('#iv-props', el);
    if (!box) return;
    const wide = isWide() || window.innerWidth >= 700;
    const T = (t, ic, label) => html`<button type="button" class="tool" data-tool="${t}" aria-label="${label}" aria-pressed="${tool.tool === t ? 'true' : 'false'}">${raw(icons[ic]({ size: 22 }))}</button>`;
    const A = (act, ic, label, extra = '') => html`<button type="button" class="tool" data-act="${act}" aria-label="${label}" ${raw(extra)}>${raw(icons[ic]({ size: 22 }))}</button>`;
    const penName = PENS[tool.pen]?.name || 'Fountain';
    box.innerHTML = `${html`
      ${wide ? html`<div class="tg">${A('undo', 'undo', 'Undo')}${A('redo', 'redo', 'Redo')}</div>` : ''}
      <div class="tg">${T('move', 'hand', 'Move: drag stickers, post-its, tables and writing')}${T('pen', 'pen', `Pen (${penName})`)}${T('hl', 'highlighter', 'Highlighter')}${T('eraser', 'eraser', 'Eraser')}${T('lasso', 'lasso', 'Lasso: select by drawing around')}${wide ? T('laser', 'laser', 'Laser pointer: point things out, it fades away') : ''}${wide ? T('shapes', 'shapes', 'Shapes: lines and boxes come out straight') : ''}${T('text', 'textbox', 'Text box')}</div>
      <div class="tg">${A('label', 'tag', 'Add a label you can search for')}${A('insert', 'plus', 'Insert: post-it, sticker, table, photo, scan')}</div>
      ${wide ? html`<div class="tg">${A('record', 'mic', isRecording() ? 'Stop recording' : 'Record audio', `aria-pressed="${isRecording() ? 'true' : 'false'}"`)}<button type="button" class="tool wide" data-act="layers" aria-label="Layers">${icons.layers({ size: 20 })}<span>Layers</span></button><button type="button" class="tool wide" data-act="zoomstrip" aria-label="Writing window: write large, it lands small" aria-pressed="${zoom ? 'true' : 'false'}">${icons.zoomBox({ size: 20 })}<span>Zoom</span></button></div>` : ''}`}`;
    box.querySelector('[data-act=record]')?.classList.add('rec-tool');
    const lb = box.querySelector('[data-act=layers]');
    if (lb) lb.classList.toggle('dot', noteLayers(note()).some((l) => l.hidden));
    drawProps(props, wide);
    box.querySelectorAll('[data-tool]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.tool;
        if (tool.tool === t && (t === 'pen' || t === 'shapes')) { penPop(b); return; }
        if (tool.tool === t && t === 'hl') { hlPop(b); return; }
        if (tool.tool === t && t === 'eraser') { eraserPop(b); return; }
        setTool(t);
      };
    });
    const on = (a, fn) => { const b = box.querySelector(`[data-act=${a}]`); if (b) b.onclick = () => fn(b); };
    on('undo', () => surface?.undo());
    on('redo', () => surface?.redo());
    on('record', () => record());
    on('layers', (b) => layersPop(b));
    on('zoomstrip', () => toggleZoom());
    on('label', (b) => addLabel(b));
    on('insert', (b) => insertMenu(b, wide));
    tooltips(box);
    // Undo and redo sit in the header on phones.
    const hu = el.querySelector('.ink-top [data-act=undo]');
    if (hu) hu.onclick = () => surface?.undo();
    const hr = el.querySelector('.ink-top [data-act=redo]');
    if (hr) hr.onclick = () => surface?.redo();
  }

  function setTool(t) {
    tool.tool = t;
    saveTool();
    surface?.updateTouchAction?.();
    if (t !== 'move' && t !== 'lasso') surface?.clearSelection();
    drawTools();
  }

  function drawProps(props, wide) {
    if (!props) return;
    const t = tool.tool;
    const hl = t === 'hl';
    const colours = hl ? HL_COLORS.slice(0, 5).map((c) => c[1]) : favs().slice(0, wide ? 6 : 4);
    const sizes = hl ? HL.sizes : (PENS[tool.pen] || PENS.fountain).sizes;
    const curSize = hl ? tool.hlSize : tool.size;
    const curCol = hl ? tool.hlColor : tool.color;
    // On a dark page, show colours as they'll appear there.
    const darkPage = pageDark(note()?.pages[pageIdx]);
    const shown = (c) => (darkPage ? darkInk(c) : c);
    const colourName = (c) => INK_COLORS.find((x) => x[1] === c)?.[0] || HL_COLORS.find((x) => x[1] === c)?.[0] || c;
    let inner = '';
    if (t === 'pen' || t === 'shapes' || hl) {
      inner = html`<button type="button" class="pen-chip" data-act="penpanel" aria-label="${hl ? 'Highlighter settings' : 'Pen settings'}"><span class="dot" style="background:${shown(curCol)}"></span><span>${hl ? 'Highlighter' : `${PENS[tool.pen]?.name || 'Fountain'}${t === 'shapes' ? ' shapes' : ''}`}, ${mm(curSize)}</span>${raw(icons.chevron({ size: 14 }))}</button>
        ${!hl && savedPens().length ? html`<div class="tg pens" role="group" aria-label="Your pens">${savedPens().map((sp, i) => ({ sp, i })).slice(wide ? -4 : -2).map(({ sp, i }) => html`<button type="button" class="pen-fav" data-usepen="${i}" aria-label="Your pen: ${penLabel(sp)}" aria-pressed="${sp.pen === tool.pen && sp.color === tool.color && Math.abs(sp.size - tool.size) < 0.05 ? 'true' : 'false'}"><canvas width="44" height="20" aria-hidden="true"></canvas></button>`)}</div>` : ''}
        <div class="tg colours" role="group" aria-label="Colours">${colours.map((c) => html`<button type="button" class="ink-swatch" data-col="${c}" style="--c:${shown(c)}" aria-label="${colourName(c)}" aria-pressed="${c === curCol ? 'true' : 'false'}"></button>`)}<button type="button" class="ink-swatch more" data-act="colours" aria-label="More colours"></button></div>
        <div class="tg sizes" role="group" aria-label="Thickness">${sizes.map((sz, i) => html`<button type="button" class="ink-size" data-size="${sz}" aria-label="${['Fine', 'Medium', 'Bold'][i]}, ${mm(sz)}" aria-pressed="${Math.abs(sz - curSize) < 0.01 ? 'true' : 'false'}"><span style="--d:${Math.round(4 + i * 4)}px;--c:${shown(curCol)}"></span></button>`)}</div>`;
    } else if (t === 'eraser') {
      inner = html`<div class="tg" role="radiogroup" aria-label="Eraser"><button type="button" class="chip sm" data-em="stroke" aria-pressed="${tool.eraserMode !== 'precise' ? 'true' : 'false'}">Whole strokes</button><button type="button" class="chip sm" data-em="precise" aria-pressed="${tool.eraserMode === 'precise' ? 'true' : 'false'}">Precise</button></div><div class="tg"><button type="button" class="chip sm" aria-pressed="${tool.hlOnly ? 'true' : 'false'}" data-act="hl-only">Only highlights</button></div>`;
    } else if (t === 'lasso') {
      inner = html`<span class="props-hint">Draw around writing to select it${surface?.canPaste ? '' : '. Then move, copy, recolour or convert it to text'}</span>${surface?.canPaste ? html`<button type="button" class="chip sm" data-act="paste">Paste</button>` : ''}`;
    } else if (t === 'move') {
      inner = html`<span class="props-hint">Drag anything to move it. Tap it for more options.</span>`;
    } else if (t === 'text') {
      inner = html`<span class="props-hint">Tap the page where the text box should go</span>`;
    } else if (t === 'laser') {
      inner = html`<span class="props-hint laser-hint"><span class="laser-dot"></span>Draw to point things out. It fades away, nothing is saved</span>${wide ? '' : html`<button type="button" class="chip sm" data-act="laser-off">Done</button>`}`;
    }
    props.hidden = !inner;
    props.innerHTML = `${inner}`;
    props.querySelectorAll('.pen-fav').forEach((b) => {
      const sp = savedPens()[Number(b.dataset.usepen)];
      requestAnimationFrame(() => penPreview(b.querySelector('canvas'), sp));
      b.onclick = () => usePen(sp);
    });
    props.querySelectorAll('[data-col]').forEach((b) => { b.onclick = () => { if (tool.tool === 'hl') tool.hlColor = b.dataset.col; else tool.color = b.dataset.col; saveTool(); drawTools(); }; });
    props.querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { if (tool.tool === 'hl') tool.hlSize = Number(b.dataset.size); else tool.size = Number(b.dataset.size); saveTool(); drawTools(); }; });
    props.querySelectorAll('[data-em]').forEach((b) => { b.onclick = () => { tool.eraserMode = b.dataset.em; saveTool(); drawTools(); }; });
    const on = (a, fn) => { const b = props.querySelector(`[data-act=${a}]`); if (b) b.onclick = () => fn(b); };
    on('penpanel', (b) => (tool.tool === 'hl' ? hlPop(b) : penPop(b)));
    on('colours', (b) => (tool.tool === 'hl' ? hlPop(b) : penPop(b)));
    on('hl-only', () => { tool.hlOnly = !tool.hlOnly; saveTool(); drawTools(); });
    on('paste', () => surface?.paste(30));
    on('laser-off', () => setTool('pen'));
    tooltips(props);
  }

  // ---------- Adding things to the page ----------
  async function addLabel(anchor) {
    const l = await labelPicker(anchor, { title: 'Add a label' });
    if (l) placeSticker({ type: 'label', label: l });
  }

  function pickFile(accept, fn) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => { const f = inp.files?.[0]; if (f) fn(f); };
    inp.click();
  }

  function insertMenu(anchor, wide) {
    const I = (act, ic, name, hint = '') => html`<button type="button" class="pop-item ins-item" data-ins="${act}">${raw(icons[ic]({ size: 20 }))}<span class="ins-t">${name}${hint ? html`<small>${hint}</small>` : ''}</span></button>`;
    const p = popover(anchor, `${html`<div class="pop-head">Add to this page</div>
      ${I('postit', 'postit', 'Post-it', 'Write on it, fold it away')}
      ${I('sticker', 'sticker', 'Sticker', 'Decoration, tape and marks')}
      ${I('table', 'table', 'Table', 'Rows and columns to write in')}
      ${I('photo', 'image', 'Photo')}
      ${I('scan', 'scan', 'Scan paper', 'Adds pages after this one')}
      ${I('pdf', 'pdf', 'PDF', 'Adds its pages to write on')}
      ${wide ? '' : html`<div class="pop-head">More tools</div>
      ${I('shapes', 'shapes', 'Shapes', 'Lines and boxes come out straight')}
      ${I('laser', 'laser', 'Laser pointer', 'Point things out; it fades away')}
      ${I('zoomstrip', 'zoomBox', zoom ? 'Close the writing window' : 'Writing window', 'Write large, it lands small')}
      ${I('layers', 'layers', 'Layers')}
      ${I('record', 'mic', isRecording() ? 'Stop recording' : 'Record audio')}`}`}`, { label: 'Insert', width: 300, cls: 'tall' });
    p.el.querySelectorAll('[data-ins]').forEach((b) => {
      b.onclick = async () => {
        const a = b.dataset.ins;
        if (a === 'photo') { pickFile('image/*', async (f) => { try { await surface.insertImage(f); afterPlace(); } catch { toast('Couldn’t add that image.'); } }); p.close(); return; }
        if (a === 'pdf') { pickFile('application/pdf', (f) => importPdf(f)); p.close(); return; }
        p.close();
        if (a === 'postit') { const v = await stickerDrawer({ tab: 'postits', title: 'Post-its' }); if (v) placeSticker(v); }
        if (a === 'sticker') { const v = await stickerDrawer({ tab: 'marks', title: 'Stickers' }); if (v) placeSticker(v); }
        if (a === 'table') tableSheet(anchor);
        if (a === 'scan') scanPages();
        if (a === 'shapes') setTool('shapes');
        if (a === 'laser') setTool('laser');
        if (a === 'zoomstrip') toggleZoom();
        if (a === 'layers') layersPop(anchor);
        if (a === 'record') record();
      };
    });
  }

  // Choose a table size, then place it on the page.
  function tableSheet(anchor, existing = null) {
    let rows = existing?.rows || 3;
    let cols = existing?.cols || 3;
    let header = existing ? !!existing.header : true;
    const p = popover(anchor, `${html`<div class="pop-head">${existing ? 'Rows and columns' : 'Table'}</div>
      <div class="tbl-steps"><span>Rows</span><button type="button" class="icon-btn sm" data-r="-1" aria-label="Fewer rows">−</button><strong id="tb-r">${rows}</strong><button type="button" class="icon-btn sm" data-r="1" aria-label="More rows">+</button></div>
      <div class="tbl-steps"><span>Columns</span><button type="button" class="icon-btn sm" data-c="-1" aria-label="Fewer columns">−</button><strong id="tb-c">${cols}</strong><button type="button" class="icon-btn sm" data-c="1" aria-label="More columns">+</button></div>
      <label class="pp-switch"><span>Shaded header row</span><input type="checkbox" role="switch" id="tb-h" ${header ? raw('checked') : ''}></label>
      <div class="tbl-preview" id="tb-p" aria-hidden="true"></div>
      ${existing ? '' : html`<button type="button" class="btn btn-primary btn-block" data-go>Add table</button>`}`}`, { label: 'Table', width: 280, keepFocus: false });
    let applied = `${rows}/${cols}/${header}`;
    const paint = () => {
      $('#tb-r', p.el).textContent = rows;
      $('#tb-c', p.el).textContent = cols;
      $('#tb-p', p.el).innerHTML = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr)">${Array.from({ length: rows * cols }, (_, i) => `<span class="${header && i < cols ? 'h' : ''}"></span>`).join('')}</div>`;
      const now = `${rows}/${cols}/${header}`;
      if (existing && now !== applied) { applied = now; surface?.updateTable(existing.id, { rows, cols, header }); }
    };
    p.el.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { rows = Math.max(1, Math.min(20, rows + Number(b.dataset.r))); paint(); }; });
    p.el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { cols = Math.max(1, Math.min(10, cols + Number(b.dataset.c))); paint(); }; });
    $('#tb-h', p.el).onchange = (e) => { header = e.target.checked; paint(); };
    const go = p.el.querySelector('[data-go]');
    if (go) go.onclick = () => { p.close(); placeSticker({ type: 'table', rows, cols, header }); };
    paint();
  }

  // After adding something, switch to Move so it can be dragged into place.
  function afterPlace() {
    if (tool.tool !== 'move') setTool('move');
  }

  function placeSticker(v) {
    if (!surface) return;
    const o = surface.place(v);
    if (o) afterPlace();
  }

  const saveTool = debounce(() => V.updateDevice({ ink: { ...tool } }).catch(() => {}), 600);

  // A small picture of a stroke with given pen settings.
  function penPreview(canvas, settings) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || Number(canvas.getAttribute('width')) || 60;
    const h = canvas.clientHeight || Number(canvas.getAttribute('height')) || 24;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    setInkTone(isDarkUI());
    const pts = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(6 + t * (w - 12), h / 2 + Math.sin(t * Math.PI * 2) * (h * 0.26), 0.25 + 0.65 * Math.sin(t * Math.PI));
    }
    const size = Math.min(settings.size, h / 3);
    drawStroke(ctx, { id: 'preview', t: 'pen', pen: settings.pen, c: settings.color, s: size, sp: 0, pts, ...penExtras(settings) });
  }

  const savedPens = () => state.config.penFavs || [];
  const penLabel = (p) => `${PENS[p.pen]?.name || 'Pen'}, ${INK_COLORS.find((x) => x[1] === p.color)?.[0] || p.color}, ${mm(p.size)}`;

  function penPop(anchor) {
    const pen = PENS[tool.pen] || PENS.fountain;
    const sm = Number.isInteger(tool.smoothing) ? tool.smoothing : 2;
    const pressure = tool.pressure !== false;
    const p = popover(anchor, `${html`<div class="pp-head"><span class="pp-title">${pen.name} pen</span><button type="button" class="btn btn-sm" data-savepen>${icons.bookmark({ size: 15 })}Save as favourite</button></div>
      ${savedPens().length ? html`<div class="pop-head">Your pens</div><div class="pp-saved">${savedPens().map((sp, i) => html`<span class="pp-fav"><button type="button" class="pp-use" data-usepen="${i}" aria-label="Use ${penLabel(sp)}"><canvas width="64" height="22" aria-hidden="true"></canvas></button><button type="button" class="pp-x" data-delpen="${i}" aria-label="Remove ${penLabel(sp)}">${icons.close({ size: 12 })}</button></span>`)}</div>` : ''}
      <div class="pop-head">Pen</div>
      <div class="pen-cards" role="radiogroup" aria-label="Pen type">${Object.entries(PENS).map(([k, v]) => html`<button type="button" role="radio" aria-checked="${tool.pen === k ? 'true' : 'false'}" data-pen="${k}"><canvas width="56" height="22" aria-hidden="true" data-prev="${k}"></canvas><span>${v.name}</span></button>`)}</div>
      <div class="pop-head">Colour</div>
      <div class="pop-row wrap" id="pp-favs"><span class="pp-sub">Favourites</span>${favs().map((c) => html`<button type="button" class="swatch" data-c="${c}" style="background:${c}" aria-label="${INK_COLORS.find((x) => x[1] === c)?.[0] || c}" aria-pressed="${c === tool.color ? 'true' : 'false'}"></button>`)}</div>
      <div class="colour-grid sq">${INK_COLORS.map(([n, c]) => html`<button type="button" class="swatch sm" data-c="${c}" style="background:${c}" aria-label="${n}" aria-pressed="${c === tool.color ? 'true' : 'false'}"></button>`)}</div>
      <div class="pop-row"><label for="pp-hex" class="sr-only">Colour code</label><input id="pp-hex" type="text" value="${tool.color}" maxlength="7" style="min-height:36px;padding:4px 10px;flex:1;min-width:0" autocapitalize="off"><button type="button" class="btn btn-sm" data-fav>${favs().includes(tool.color) ? 'Remove favourite' : 'Add to favourites'}</button></div>
      <div class="pop-head">Thickness <span id="pp-mm">${mm(tool.size)}</span></div>
      <input type="range" id="pp-size" min="1" max="${pen.sizes[2] * 2.2}" step="0.1" value="${tool.size}" aria-label="Thickness">
      <canvas class="pp-line" id="pp-line" width="290" height="28" aria-hidden="true"></canvas>
      <label class="pp-switch"><span>Pressure changes thickness</span><input type="checkbox" role="switch" id="pp-pr" ${pressure ? raw('checked') : ''}></label>
      <div class="pp-smooth"><span id="pp-sm-l">Smoothing</span><div class="seg" role="radiogroup" aria-labelledby="pp-sm-l">${SMOOTHING.map((x, i) => html`<button type="button" role="radio" aria-checked="${i === sm ? 'true' : 'false'}" data-sm="${i}">${x.name}</button>`)}</div></div>
      ${tool.pen === 'calligraphy' ? html`<p class="hint" style="padding:0 6px 6px">A slanted nib: strokes are thick or thin by direction.</p>` : ''}`}`, { label: 'Pen settings', width: 340, keepFocus: false, cls: 'tall' });
    const cur = () => ({ pen: tool.pen, color: tool.color, size: tool.size, smoothing: Number.isInteger(tool.smoothing) ? tool.smoothing : 2, pressure: tool.pressure !== false });
    const paint = () => {
      p.el.querySelectorAll('[data-prev]').forEach((c) => penPreview(c, { ...cur(), pen: c.dataset.prev, size: (PENS[c.dataset.prev] || pen).sizes[1] }));
      penPreview($('#pp-line', p.el), cur());
      p.el.querySelectorAll('[data-usepen]').forEach((b) => penPreview(b.querySelector('canvas'), savedPens()[Number(b.dataset.usepen)]));
    };
    requestAnimationFrame(paint);
    const reopen = () => { p.close(); penPop(el.querySelector('[data-tool=pen]') || anchor); };
    p.el.querySelectorAll('[data-pen]').forEach((b) => { b.onclick = () => { tool.pen = b.dataset.pen; tool.size = PENS[tool.pen].sizes[1]; if (tool.tool !== 'shapes') tool.tool = 'pen'; saveTool(); drawTools(); reopen(); }; });
    p.el.querySelectorAll('[data-c]').forEach((b) => {
      b.onclick = () => {
        tool.color = b.dataset.c;
        $('#pp-hex', p.el).value = tool.color;
        saveTool(); drawTools();
        p.el.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.c === tool.color ? 'true' : 'false'));
        paint();
      };
    });
    $('#pp-hex', p.el).onchange = (e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { tool.color = v.toUpperCase(); saveTool(); drawTools(); paint(); } else toast('Use a colour code like #2B5684'); };
    p.el.querySelector('[data-fav]').onclick = async () => {
      const f = favs();
      const next = f.includes(tool.color) ? f.filter((c) => c !== tool.color) : [...f, tool.color].slice(-8);
      await V.saveConfig({ favColors: next });
      drawTools();
      reopen();
    };
    $('#pp-size', p.el).oninput = (e) => { tool.size = Number(e.target.value); $('#pp-mm', p.el).textContent = mm(tool.size); saveTool(); paint(); };
    $('#pp-size', p.el).onchange = () => drawTools();
    $('#pp-pr', p.el).onchange = (e) => { tool.pressure = e.target.checked; saveTool(); paint(); };
    p.el.querySelectorAll('[data-sm]').forEach((b) => {
      b.onclick = () => {
        tool.smoothing = Number(b.dataset.sm);
        saveTool();
        p.el.querySelectorAll('[data-sm]').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
        paint();
      };
    });
    p.el.querySelector('[data-savepen]').onclick = async () => {
      const mine = cur();
      const list = savedPens().filter((x) => !(x.pen === mine.pen && x.color === mine.color && Math.abs(x.size - mine.size) < 0.05 && x.smoothing === mine.smoothing && x.pressure === mine.pressure));
      await V.saveConfig({ penFavs: [...list, mine].slice(-8) });
      toast('Saved to your pens');
      drawTools();
      reopen();
    };
    p.el.querySelectorAll('[data-usepen]').forEach((b) => { b.onclick = () => { usePen(savedPens()[Number(b.dataset.usepen)]); reopen(); }; });
    p.el.querySelectorAll('[data-delpen]').forEach((b) => { b.onclick = async () => { const list = savedPens().slice(); list.splice(Number(b.dataset.delpen), 1); await V.saveConfig({ penFavs: list }); drawTools(); reopen(); }; });
  }

  function usePen(sp) {
    if (!sp) return;
    Object.assign(tool, { tool: 'pen', pen: sp.pen, color: sp.color, size: sp.size, smoothing: sp.smoothing, pressure: sp.pressure });
    saveTool();
    drawTools();
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

  // ---------- Recording and replay ----------
  async function record() {
    if (isRecording()) { stopRecording(); return; }
    const nid = id;
    const n = note();
    if (replay) exitReplay();
    const p = startRecording({ sealed: !!n?.sealed, label: displayTitle(n) });
    setTimeout(drawTools, 300);
    const rec = await p;
    drawTools();
    if (!rec) return;
    const cur = state.notes.get(nid);
    if (!cur) { V.deleteFile(rec.fileId).catch(() => {}); return; }
    await V.saveNote({ ...cur, recordings: [...cur.recordings, rec] });
    toast('Recording saved. Tap the headphones to replay it with your writing.');
    const b = el.querySelector('[data-act=replay]');
    if (b && nid === id) b.hidden = false;
  }

  let replay = null;
  async function enterReplay(index = null) {
    const n = note();
    if (!n?.recordings.length || !surface) return;
    surface.endEdit();
    await flush();
    const view = el.querySelector('.inkview');
    const dock = document.createElement('div');
    dock.className = 'replay-dock';
    view.appendChild(dock);
    view.classList.add('replaying');
    el.querySelector('[data-act=replay]')?.setAttribute('aria-pressed', 'true');
    let tNow = 0;
    let rec = null;
    let ranges = null;
    // When each page was written during this recording, to turn pages as it plays.
    const loadRanges = async (r) => {
      const out = [];
      for (const p of note().pages) {
        let lo = Infinity;
        let hi = -Infinity;
        try {
          const d = await V.loadPage(p.id);
          for (const x of [...d.strokes, ...d.objects]) { const t = recordingTime(r, x.at); if (t !== null) { lo = Math.min(lo, t); hi = Math.max(hi, t); } }
        } catch { /* not downloaded */ }
        out.push(lo <= hi ? [lo, hi] : null);
      }
      return out;
    };
    const after = (x) => { if (!rec) return false; const t = recordingTime(rec, x.at); return t !== null && t > tNow + 0.05; };
    const player = mountPlayer(dock, id, {
      index: index ?? n.recordings.length - 1,
      onClose: () => exitReplay(),
      onTime: async (t, r) => {
        if (r !== rec) { rec = r; ranges = null; ranges = await loadRanges(r); }
        tNow = t;
        surface?.renderMainSoon();
        if (!ranges) return;
        const cur = ranges[pageIdx];
        if (cur && t >= cur[0] - 1 && t <= cur[1] + 1) return;
        let best = -1;
        ranges.forEach((g, k) => { if (g && g[0] <= t + 0.5) best = best < 0 || g[0] >= ranges[best][0] ? k : best; });
        if (best >= 0 && best !== pageIdx && !(cur && t < cur[0])) showPage(best);
      },
    });
    surface.setReplay(after, (x, y) => {
      const hit = surface.strokeNear(x, y);
      const t = hit && rec ? recordingTime(rec, hit.at) : null;
      if (t !== null) player.seek(Math.max(0, t - 1.5));
      else toast('That wasn’t written during this recording.');
    });
    replay = { player, dock };
  }

  function exitReplay() {
    if (!replay) return;
    replay.player.destroy();
    replay.dock.remove();
    replay = null;
    surface?.setReplay(null, null);
    el.querySelector('.inkview')?.classList.remove('replaying');
    el.querySelector('[data-act=replay]')?.setAttribute('aria-pressed', 'false');
  }

  // ---------- Text box formatting ----------
  // Typing in a text box: the toolbar becomes the typed-note toolbar, in the
  // same place, and comes back when you're done.
  async function textEditing(ed) {
    const had = !!fmt;
    fmt?.destroy();
    fmt = null;
    suggest?.close();
    suggest = null;
    unfloat?.();
    unfloat = null;
    if (!ed) { document.body.classList.remove('editing'); if (had) drawTools(); return; }
    const T = await import('../editor/toolbar.js');
    const tools = $('#iv-tools', el);
    const props = $('#iv-props', el);
    if (!tools || !props) return;
    document.body.classList.add('editing');
    fmt = T.mountNoteBars(tools, props, ed, {
      baseSize: TEXT_SIZE, // text boxes size their text against the box's own size
      wide: isWide() || window.innerWidth >= 700,
      hideKeyboard: !isWide(),
      dark: () => !!surface?.dark,
      tone: darkInk,
      noteFont: () => surface?.editing?.font || BOX_FONT,
      sealed: () => !!note()?.sealed,
      onHideKeyboard: () => surface?.endEdit(),
    });
    suggest = T.attachSuggest(ed, { noteId: () => id });
  }

  // ---------- Pages ----------
  async function showPage(i, { reveal = true } = {}) {
    const n = note();
    if (!n || !surface) return;
    flush();
    await saving;
    const idx = Math.max(0, Math.min(n.pages.length - 1, i));
    const page = n.pages[idx];
    let data;
    try { data = await pageData(page.id); } catch (e) { console.warn(e); data = V.emptyPageData(); }
    if (!surface || !note()) return;
    activate(idx, data, { reveal });
  }

  // Make page idx the live page (data already loaded). In the continuous
  // view this is also called straight from a Pencil touch on another page.
  function activate(idx, data, { reveal = false } = {}) {
    const n = note();
    if (!n || !surface) return;
    if (pending) flush();
    const prev = surface.page;
    const page = n.pages[idx];
    if (!page) return;
    if (prev && prev.id !== page.id && surface.data) fresh.set(prev.id, surface.data);
    pageIdx = idx;
    syncStack();
    if (stack) stack.place(idx, prev && prev.id !== page.id ? { page: prev } : null);
    surface.setPage(page, data, { keepScroll: !!stack });
    if (stack && reveal) stack.scrollToPage(idx);
    zoom?.reset();
    drawPageBar();
    rememberPage(page.id);
    // Get the pages either side ready, so turning the page is instant.
    for (const k of [idx + 1, idx - 1]) {
      const p = n.pages[k];
      if (!p) continue;
      pageData(p.id).catch(() => {});
      if (p.bg) fileImage(p.bg);
    }
    showWhere(idx);
  }

  // The continuous view is on (and has more than one page to show): make
  // sure the stack of pages matches the note.
  function syncStack() {
    const n = note();
    if (!surface || !n) return;
    const want = continuousOn() && n.pages.length > 1;
    if (!want) {
      if (stack) { stack.destroy(); stack = null; }
      return;
    }
    if (!stack) {
      stack = new PageStack(surface, {
        pages: () => note()?.pages || [],
        data: pageData,
        cached: cachedData,
        view: () => layerView(note()),
        viewKey: () => noteLayers(note()).filter((l) => l.hidden).map((l) => l.id).join(','),
        canSwitch: () => !!surface && !surface.drawing && !surface.editing && !surface.sel && !zoom && !replay,
        onWant: (i) => wantPage(i),
        onActivateNow: (i, d) => activate(i, d),
        onIndicator: (i) => { showWhere(i); flashIndicator(i); },
      });
    }
    stack.sync(pageIdx);
  }

  // Scrolling settled on another page: make it the live one (the latest ask wins).
  let wanted = -1;
  let wanting = false;
  async function wantPage(i) {
    wanted = i;
    if (wanting) return;
    wanting = true;
    try {
      while (wanted !== pageIdx && wanted >= 0) {
        const t = wanted;
        await showPage(t, { reveal: false });
        if (wanted === t) break;
      }
    } finally { wanting = false; wanted = -1; }
  }

  // "page 3 of 40" under the title, and the page pill while scrolling.
  function showWhere(i) {
    const n = note();
    const sub = $('#iv-sub', el);
    if (!sub || !n) return;
    const { nb, sec } = crumbs(n);
    sub.textContent = `${nb ? `${nb.title}${sec && nb.sections.length > 1 ? ` › ${sec.name}` : ''}, ` : ''}page ${i + 1} of ${n.pages.length}`;
  }
  let indTimer = null;
  function flashIndicator(i) {
    const ind = $('#iv-ind', el);
    const n = note();
    if (!ind || !n) return;
    ind.textContent = `${i + 1} / ${n.pages.length}`;
    ind.hidden = false;
    ind.classList.add('on');
    clearTimeout(indTimer);
    indTimer = setTimeout(() => ind.classList.remove('on'), 1400);
  }

  function drawPageBar() {
    const n = note();
    const scroll = el.querySelector('.ink-scroll');
    if (!scroll || !n) return;
    scroll.querySelector('.ink-pagenav')?.remove();
    const nav = document.createElement('div');
    nav.className = 'ink-pagenav';
    if (stack) {
      // Every page is above; just the count (tap for all pages) and Add page.
      nav.innerHTML = String(html`<button type="button" class="btn btn-sm btn-ghost pg-label" data-pg="all" aria-label="${n.pages.length} pages. See all pages">${n.pages.length} pages</button><button type="button" class="btn btn-sm" data-pg="add">${icons.plus({ size: 16 })}Add page</button>`);
      scroll.appendChild(nav);
      nav.querySelector('[data-pg=all]').onclick = () => pagesSheet();
      nav.querySelector('[data-pg=add]').onclick = () => addPage({}, note().pages.length);
      return;
    }
    const endless = n.layout === 'scroll';
    nav.innerHTML = String(html`${n.pages.length > 1 || !endless ? html`<button type="button" class="btn btn-sm" data-pg="prev" ${pageIdx === 0 ? raw('disabled') : ''}>${icons.back({ size: 16 })}Previous</button>` : ''}
      ${endless && n.pages.length === 1 ? html`<span class="muted">Endless page</span>` : html`<button type="button" class="btn btn-sm btn-ghost pg-label" data-pg="all" aria-label="Page ${pageIdx + 1} of ${n.pages.length}. See all pages">Page ${pageIdx + 1} of ${n.pages.length}</button>`}
      ${pageIdx < n.pages.length - 1 ? html`<button type="button" class="btn btn-sm" data-pg="next">Next${icons.chevron({ size: 16 })}</button>` : endless ? html`<button type="button" class="btn btn-sm" data-pg="more">${icons.plus({ size: 16 })}More paper</button>` : html`<button type="button" class="btn btn-sm" data-pg="add">${icons.plus({ size: 16 })}Add page</button>`}`);
    scroll.appendChild(nav);
    const pv = nav.querySelector('[data-pg=prev]');
    if (pv) pv.onclick = () => showPage(pageIdx - 1);
    const mp = nav.querySelector('[data-pg=more]');
    if (mp) mp.onclick = () => { const pg = note().pages[pageIdx]; growPage(pg.h + 707); };
    const nx = nav.querySelector('[data-pg=next]');
    if (nx) nx.onclick = () => showPage(pageIdx + 1);
    const ad = nav.querySelector('[data-pg=add]');
    if (ad) ad.onclick = () => addPage();
    const all = nav.querySelector('[data-pg=all]');
    if (all) all.onclick = () => pagesSheet();
    if (pageIdx < n.pages.length - 1 && n.pages.length > 1) nav.insertAdjacentHTML('beforeend', '<p class="pg-hint">Keep scrolling for the next page</p>');
  }

  async function addPage(fields = {}, at = pageIdx + 1) {
    const n = note();
    const cur = n.pages[pageIdx];
    const page = newPage({ paper: cur?.bg ? (state.device?.paper || 'dotted') : cur?.paper || 'dotted', color: cur?.color || 'white', ...fields });
    const pages = [...n.pages];
    pages.splice(at, 0, page);
    await V.saveNote({ ...n, pages });
    await showPage(at);
    return page;
  }

  // A page's thumbnail, kept until the page changes.
  async function thumbFor(p) {
    const data = await V.loadPage(p.id);
    const key = `${p.id}:${data.at || 0}:${p.paper}:${p.color}:${pageDark(p) ? 1 : 0}`;
    const hit = thumbCache.get(key);
    const c = hit || await renderPageCanvas(p, data, 220, { ...layerView(note()), crop: { x: 0, y: 0, w: PAGE_W, h: Math.min(p.h, A4_H) }, dark: pageDark(p), thumb: true });
    if (!hit) { thumbCache.set(key, c); while (thumbCache.size > 120) thumbCache.delete(thumbCache.keys().next().value); }
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    out.className = 'thumb-canvas';
    out.getContext('2d').drawImage(c, 0, 0);
    return out;
  }

  function pagesSheet() {
    const n = note();
    const here = n.pages[pageIdx] && !n.pages[pageIdx].bg ? n.pages[pageIdx] : n.pages.find((p) => !p.bg);
    const curPaper = { paper: here?.paper || state.device?.paper || 'dotted', color: here?.color || state.device?.paperColor || 'white' };
    const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>${displayTitle(n)}, ${n.pages.length} page${n.pages.length === 1 ? '' : 's'}</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Done</button></span></div>
      <ul class="page-grid" id="pg-grid">${n.pages.map((p, i) => html`<li><button type="button" class="page-thumb ${i === pageIdx ? 'current' : ''}" data-i="${i}" aria-label="Page ${i + 1}${i === pageIdx ? ', current page' : ''}${p.bookmark ? ', bookmarked' : ''}"><canvas data-thumb="${i}" width="10" height="14"></canvas>${p.bookmark ? html`<span class="bm">${icons.bookmark({ size: 16 })}</span>` : ''}</button><button type="button" class="pg-more" data-pm="${i}" aria-label="Page ${i + 1} options">${i + 1} ${icons.more({ size: 16 })}</button></li>`)}
        <li><button type="button" class="page-thumb add" data-add>${icons.plus({ size: 24 })}<span>Add page</span></button></li></ul>
      <section class="paper-pick"><h3>Layout</h3>
        <div class="chips" role="radiogroup" aria-label="Layout"><button type="button" class="chip" role="radio" aria-checked="${n.layout !== 'scroll' ? 'true' : 'false'}" aria-pressed="${n.layout !== 'scroll' ? 'true' : 'false'}" data-layout="pages">A4 pages</button><button type="button" class="chip" role="radio" aria-checked="${n.layout === 'scroll' ? 'true' : 'false'}" aria-pressed="${n.layout === 'scroll' ? 'true' : 'false'}" data-layout="scroll">Endless scroll</button></div>
        <p class="hint">${n.layout === 'scroll' ? 'One long page that grows as you write. PDFs print it as A4 pieces.' : 'Fixed A4 pages. Endless scroll makes one long page that grows as you write.'}</p>
        <h3>Showing pages</h3>
        <div class="chips" role="radiogroup" aria-label="Showing pages"><button type="button" class="chip" role="radio" aria-checked="${continuousOn() ? 'true' : 'false'}" aria-pressed="${continuousOn() ? 'true' : 'false'}" data-view="continuous">One under another</button><button type="button" class="chip" role="radio" aria-checked="${continuousOn() ? 'false' : 'true'}" aria-pressed="${continuousOn() ? 'false' : 'true'}" data-view="single">One at a time</button></div>
        <p class="hint">One under another: scroll through every page, like a PDF reader. One at a time: turn the pages. Applies to every note on this device.</p>
        <h3>Paper</h3>
        <div class="paper-tiles" role="radiogroup" aria-label="Paper">${PAPERS.map((p) => html`<button type="button" class="paper-tile" role="radio" aria-checked="${p.id === curPaper.paper ? 'true' : 'false'}" data-paper="${p.id}"><canvas width="66" height="92" aria-hidden="true" data-pprev="${p.id}"></canvas><span>${p.name}</span></button>`)}</div>
        <div class="chips" role="radiogroup" aria-label="Paper colour">${PAPER_COLORS.map((c) => html`<button type="button" class="chip" role="radio" aria-pressed="${c.id === curPaper.color ? 'true' : 'false'}" data-pcol="${c.id}"><span class="dot lg" style="background:${c.bg};border:1px solid var(--field)"></span>${c.name}</button>`)}</div>
        <p class="hint">Changes every page of this note (except PDF and photo pages) and becomes the paper for new notes.${isDarkUI() && state.device?.darkPaper !== false ? ' In dark mode, pages show dark automatically.' : ''}</p>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-add2>${icons.plus({ size: 16 })}Add after page ${pageIdx + 1}</button>
          <label class="btn btn-sm">${icons.pdf({ size: 16 })}Import PDF<input type="file" accept="application/pdf" class="sr-only" data-pdf></label>
          <button type="button" class="btn btn-sm" data-scan>${icons.scan({ size: 16 })}Scan paper</button></div>
      </section>`}`, { label: 'Pages' });
    s.el.classList.add('wide-sheet');
    s.el.querySelector('[data-close]').onclick = () => s.close();
    s.el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { s.close(); showPage(Number(b.dataset.i)); }; });
    const pick = () => ({ paper: curPaper.paper, color: curPaper.color });
    s.el.querySelector('[data-add]').onclick = async () => { s.close(); await addPage(pick(), note().pages.length); };
    s.el.querySelector('[data-add2]').onclick = async () => { s.close(); await addPage(pick()); };
    // Paper: the whole note changes, and new notes use it too.
    const setPaper = async (patch) => {
      Object.assign(curPaper, patch);
      const cur = note();
      const pages = cur.pages.map((p) => (p.bg ? p : { ...p, paper: curPaper.paper, color: curPaper.color }));
      await V.saveNote({ ...cur, pages });
      await V.updateDevice({ paper: curPaper.paper, paperColor: curPaper.color });
      if (cur.notebook) { const nb = state.notebooks.get(cur.notebook); if (nb && (nb.paper !== curPaper.paper || nb.paperColor !== curPaper.color)) await V.saveNotebook({ ...nb, paper: curPaper.paper, paperColor: curPaper.color }); }
      s.el.querySelectorAll('[data-paper]').forEach((x) => x.setAttribute('aria-checked', x.dataset.paper === curPaper.paper ? 'true' : 'false'));
      s.el.querySelectorAll('[data-pcol]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.pcol === curPaper.color ? 'true' : 'false'));
      paintPaperTiles();
      await showPage(pageIdx);
    };
    s.el.querySelectorAll('[data-paper]').forEach((b) => { b.onclick = () => setPaper({ paper: b.dataset.paper }); });
    s.el.querySelectorAll('[data-pcol]').forEach((b) => { b.onclick = () => setPaper({ color: b.dataset.pcol }); });
    const paintPaperTiles = () => s.el.querySelectorAll('[data-pprev]').forEach((c) => {
      const dpr = window.devicePixelRatio || 1;
      c.width = 66 * dpr; c.height = 92 * dpr;
      const ctx = c.getContext('2d');
      const k = (66 * dpr) / 330;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const pg = { paper: c.dataset.pprev, color: curPaper.color, h: 460, bg: null };
      setInkTone(pageDark(pg));
      drawPaper(ctx, pg, k / dpr);
      setInkTone(false);
    });
    paintPaperTiles();
    s.el.querySelectorAll('[data-layout]').forEach((b) => { b.onclick = async () => { await setLayout(b.dataset.layout); s.close(); }; });
    s.el.querySelectorAll('[data-view]').forEach((b) => {
      b.onclick = async () => {
        s.close();
        if ((state.device?.pageView || 'continuous') === b.dataset.view) return;
        await V.updateDevice({ pageView: b.dataset.view });
        syncStack();
        await showPage(pageIdx);
      };
    });
    s.el.querySelector('[data-pdf]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; s.close(); await importPdf(f); };
    s.el.querySelector('[data-scan]').onclick = async () => { s.close(); await scanPages(); };
    s.el.querySelectorAll('[data-pm]').forEach((b) => { b.onclick = () => pageMenu(Number(b.dataset.pm), s); });
    // Thumbnails: drawn as they scroll into view, a couple at a time, small.
    const queue = [];
    let busy = 0;
    const pump = () => {
      while (busy < 2 && queue.length) {
        const i = queue.shift();
        const p = note()?.pages[i];
        const slot = s.el.querySelector(`[data-thumb="${i}"]`);
        if (!p || !slot) continue;
        busy++;
        thumbFor(p).then((c) => { if (c && slot.isConnected) slot.replaceWith(c); }).catch(() => {}).finally(() => { busy--; pump(); });
      }
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        queue.push(Number(e.target.dataset.thumb));
      }
      pump();
    }, { root: s.el, rootMargin: '300px' });
    s.el.querySelectorAll('[data-thumb]').forEach((c) => io.observe(c));
    s.el.querySelector(`[data-i="${pageIdx}"]`)?.scrollIntoView({ block: 'center' });
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
      // The original PDF goes once none of its pages are left.
      if (p.pdf && !V.pdfInUse(p.pdf.file, { page: p.id }) && !pages.some((x) => x.pdf?.file === p.pdf.file)) await V.deleteFile(p.pdf.file);
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

  async function scanPages() {
    const { openScanner } = await import('./scanner.js');
    const pages = await openScanner({ title: 'Scan pages', done: 'Add' });
    if (!pages.length) return;
    const n = note();
    let at = pageIdx + 1;
    const add = [];
    for (const pg of pages) {
      const bg = await V.addFile(pg.bytes, { sealed: n.sealed, type: pg.type });
      add.push(newPage({ paper: 'blank', bg, h: Math.round((1000 * pg.h) / pg.w) }));
    }
    const cur = note();
    const all = [...cur.pages];
    all.splice(at, 0, ...add);
    await V.saveNote({ ...cur, pages: all });
    toast(`Added ${add.length} scanned page${add.length === 1 ? '' : 's'}`);
    await showPage(at);
    // Read the scanned text on this device so the pages turn up in search.
    try {
      const { ocrImage } = await import('../ocr.js');
      const texts = [];
      for (const pg of pages) texts.push(await ocrImage(pg.bytes));
      const words = texts.filter(Boolean).join('\n\n');
      if (words) {
        const latest = note();
        await refreshInkSummary(id, { pdfText: [latest.pdfText, words].filter(Boolean).join('\n\n') });
      }
    } catch { /* search just won't see these pages */ }
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
        if (fresh.get(job.pageId) === job.data) fresh.delete(job.pageId);
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
    readSoon();
  }

  // ---------- Reading handwriting ----------
  // A little after you stop writing, the page is read on this device so the
  // handwriting can be searched, linked and asked about.
  const readSoon = debounce(() => {
    const n = note();
    if (!n || !handOn() || surface?.drawing) return;
    const pg = n.pages[pageIdx]?.id;
    if (pg) readNote(n.id, { pages: [pg] }).catch((e) => console.warn('handwriting', e));
  }, 2500);

  async function convertSheet(strokes, box) {
    const ids = strokes.map((s) => s.id);
    const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>Convert to text</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Cancel</button></span></div>
      <p class="hint" id="cv-msg" aria-live="polite">Reading your writing on this device…</p>
      <div class="field" id="cv-f" hidden><label for="cv-t">Reads as</label><textarea id="cv-t" rows="4" autocapitalize="sentences"></textarea></div>
      <p class="hint" id="cv-fix" hidden>Fix anything it misread, then use it.</p>
      <div class="btn-row" id="cv-b" hidden><button type="button" class="btn btn-primary" data-rep style="flex:1">Replace with text</button><button type="button" class="btn" data-copy>Copy text</button></div>`}`, { label: 'Convert to text' });
    s.el.querySelector('[data-close]').onclick = () => s.close();
    const msg = $('#cv-msg', s.el);
    const { aiState } = await import('../ai.js');
    if (aiState.hand !== 'ready') msg.textContent = 'Getting the handwriting reader ready. The first time, it downloads about 21 MB from this site…';
    try {
      const r = await readStrokes(strokes);
      if (!s.el.isConnected) return;
      const ta = $('#cv-t', s.el);
      ta.value = r.text;
      msg.textContent = r.text ? '' : 'Couldn’t make out any words here. Type them in if you like.';
      msg.hidden = !!r.text;
      ['#cv-f', '#cv-fix', '#cv-b'].forEach((q) => { $(q, s.el).hidden = false; });
      setTimeout(() => ta.focus(), 50);
      s.el.querySelector('[data-copy]').onclick = async () => { await copyText(ta.value.trim()); toast('Copied'); };
      s.el.querySelector('[data-rep]').onclick = () => {
        const t = ta.value.trim();
        if (!t) { toast('There’s no text to use.'); return; }
        surface?.replaceSelectionWithText(t, box, ids);
        s.close();
        toast('Replaced with text');
      };
    } catch (e) {
      msg.textContent = e.message || 'Couldn’t read this.';
    }
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
      ${raw(miniMapHtml(n.id, { wide: isWide() }))}
      ${kids.length ? html`<h3 class="section-title">Sub-notes</h3><ul class="links-list">${kids.map((k) => html`<li><a href="#/note/${k.id}">${icons.sub({ size: 16 })}<span style="flex:1">${displayTitle(k)}</span></a></li>`)}</ul>` : ''}
      ${linked.length ? html`<h3 class="section-title">Linked</h3><ul class="links-list">${linked.map((x) => html`<li><a href="#/note/${x.note.id}"><span style="flex:1">${displayTitle(x.note)}</span></a>${isWide() ? html`<button type="button" class="btn btn-sm btn-ghost" data-beside="${x.note.id}" aria-label="Open ${displayTitle(x.note)} beside this note">Beside</button>` : ''}</li>`)}</ul>` : ''}
      ${ment.length ? html`<h3 class="section-title">Mentioned, not linked</h3><ul class="links-list">${ment.map((m) => html`<li><a href="#/note/${m.note.id}"><span style="flex:1">${displayTitle(m.note)}</span></a><button type="button" class="btn btn-sm" data-acc="${m.note.id}">Link</button></li>`)}</ul>` : ''}
      ${rel.length ? html`<h3 class="section-title">Related, found on this device</h3><ul class="links-list">${rel.map((x) => html`<li><a href="#/note/${x.note.id}"><span style="flex:1">${displayTitle(x.note)}</span></a>${isWide() ? html`<button type="button" class="btn btn-sm btn-ghost" data-beside="${x.note.id}" aria-label="Open ${displayTitle(x.note)} beside this note">Beside</button>` : ''}<button type="button" class="btn btn-sm" data-acc="${x.note.id}">Link</button></li>`)}</ul>` : ''}
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
      { value: 'highlights', label: 'Highlights in this note' },
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
    if (act === 'highlights') ctx.navigate(`#/highlights?note=${n.id}`);
    if (act === 'history') { const { openHistory } = await import('./history.js'); openHistory(n, ctx, { page: n.pages[pageIdx] }); }
    if (act === 'pdf') exportPdf();
    if (act === 'seal' || act === 'unseal') {
      const sealed = act === 'seal';
      if (V.sealedState() === 'none') { toast('Set up sealed notes in Settings first.'); return; }
      if (V.sealedState() === 'locked') { const ok = await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) }); if (!ok) return; }
      try { await V.setSealed(n.id, sealed); toast(sealed ? 'Sealed' : 'Unsealed'); } catch (e) { toast(e.message); }
    }
    if (act === 'delete') {
      const ok = await confirmSheet({ title: 'Delete this note?', body: `It goes to Recently deleted for 30 days, with all ${n.pages.length} page${n.pages.length === 1 ? '' : 's'}, on all your devices, so you can put it back.`, confirm: 'Delete', danger: true });
      if (ok) {
        surface?.destroy();
        surface = null;
        await V.binNote(n.id);
        toast('Moved to Recently deleted');
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
  // Dark mode on or off: the swatches show colours as they'll look on the page.
  const onThemeChange = () => { drawTools(); zoom?.render(); };
  window.addEventListener('sb-theme', onThemeChange);

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
      // Pens and colours are shared (side by side, or another device's change):
      // pick up the latest, unless you're writing right now.
      if (evt.type === 'device' && state.device?.ink && !surface?.drawing && JSON.stringify({ ...tool, ...state.device.ink }) !== JSON.stringify(tool)) {
        Object.assign(tool, state.device.ink);
        drawTools();
      }
      if (evt.type === 'page' && evt.id === n.pages[pageIdx]?.id && !pending && !surface?.drawing && !surface?.editing) {
        V.loadPage(evt.id).then((d) => surface?.replaceData(d));
      }
      if (evt.type === 'page' && evt.id !== n.pages[pageIdx]?.id) { fresh.delete(evt.id); stack?.invalidate(evt.id); }
      if (evt.type === 'remote' || evt.type === 'note' || evt.type === 'sealed') {
        const sub = $('#iv-sub', el);
        // Pages added, removed or moved: keep the live page the same page.
        const live = surface?.page ? n.pages.findIndex((p) => p.id === surface.page.id) : -1;
        if (sub && live < 0 && surface?.page) showPage(Math.min(pageIdx, n.pages.length - 1));
        else if (sub && pageIdx >= n.pages.length) showPage(n.pages.length - 1);
        else if (sub) {
          if (live >= 0) pageIdx = live;
          const had = !!stack;
          syncStack();
          if (stack && !had) surface.layout();
          else if (stack) stack.place(pageIdx, null);
          drawPageBar();
          showWhere(pageIdx);
        }
      }
      if (evt.type === 'config') surface?.render();
      if ((evt.type === 'note' || evt.type === 'remote') && evt.id === id) applyLayers();
      if (evt.type === 'note' || evt.type === 'remote') {
        const rb = el.querySelector('[data-act=replay]');
        if (rb) rb.hidden = !n.recordings.length;
      }
    },
    destroy() {
      zoom?.destroy();
      zoom = null;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('sb-theme', onThemeChange);
      document.removeEventListener('keydown', onPageKeys);
      clearTimeout(indTimer);
      exitReplay();
      surface?.endEdit();
      flush().then(() => discardIfEmpty());
      fmt?.destroy();
      stack?.destroy();
      stack = null;
      surface?.destroy();
      surface = null;
      document.body.classList.remove('inking', 'editing');
      leaveNote();
    },
  };
}
