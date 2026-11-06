// A whiteboard: cards for your notes, sticky notes, text, shapes, frames,
// photos, arrows and pen on a board you can pan and zoom. Everything on it is
// saved in one encrypted page file, like a handwritten page.

import { html, raw, $, uid, toast, debounce, isWide, fmtDate, downloadBlob } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { newNote, newPage, displayTitle } from '../model.js';
import { icons } from '../icons.js';
import { focusButtonHtml, toggleFocus, enterNote, leaveNote } from '../focus.js';
import { openSheet, menuSheet, confirmSheet, notePicker, passphraseSheet, popover, closePopover, tooltips } from '../ui.js';
import { compressImage } from '../images.js';
import { notebookPicker } from './notebooks.js';
import { PENS, HL, HL_COLORS, INK_COLORS, darkInk } from '../editor/inkdraw.js';
import { isDarkUI } from '../theme.js';
import * as B from '../boarddraw.js';
import { TEXT_SIZE } from '../fonts.js';

const TOOLS = [
  { id: 'select', icon: 'select', name: 'Select and move', key: 'v' },
  { id: 'card', icon: 'notes', name: 'Note card', key: 'n' },
  { id: 'sticky', icon: 'postit', name: 'Sticky note', key: 's' },
  { id: 'text', icon: 'type', name: 'Text', key: 't' },
  { id: 'pen', icon: 'pen', name: 'Pen', key: 'p' },
  { id: 'shape', icon: 'shapes', name: 'Shapes', key: 'r' },
  { id: 'arrow', icon: 'arrow', name: 'Arrow', key: 'a' },
  { id: 'frame', icon: 'frame', name: 'Frame', key: 'f' },
  { id: 'image', icon: 'image', name: 'Photo', key: 'i' },
];
const PEN_KINDS = [
  { id: 'ballpoint', name: 'Pen', sizes: [2.4, 3.6, 6] },
  { id: 'marker', name: 'Marker', sizes: [5, 8, 13] },
  { id: 'hl', name: 'Highlighter', sizes: HL.sizes },
  { id: 'eraser', name: 'Eraser', sizes: [] },
];
const colourName = (c) => INK_COLORS.find((x) => x[1] === c)?.[0] || HL_COLORS.find((x) => x[1] === c)?.[0] || c;
const views = new Map(); // board id -> { tx, ty, z }, kept while the app is open
const clone = (x) => JSON.parse(JSON.stringify(x));
const MINZ = 0.1;
const MAXZ = 4;

export function mount(el, params, ctx) {
  let id = params.id;
  let pageId = null;
  let data = null;
  let createdHere = false;
  let tx = 0; let ty = 0; let z = 1;
  let tool = 'select';
  // Text starts at the size nearest the default text in Settings, until you pick one here.
  const dts = state.config?.text?.size || TEXT_SIZE;
  const opts = { pen: 'ballpoint', ink: '#1B2A38', hl: '#F7D046', size: 1, shape: 'rect', fill: false, sticky: 'yellow', text: dts <= 16 ? 's' : dts >= 24 ? 'l' : 'm', ...(state.device?.board || {}) };
  let sel = new Set(); // object ids, and 's:<id>' for pen strokes
  let editing = null; // { id, fresh }
  const undo = [];
  const redo = [];
  let gesture = null;
  const pointers = new Map();
  const boxes = new Map();
  let penSeen = false;
  let spaceDown = false;
  let pending = false;
  let saving = Promise.resolve();
  let destroyed = false;
  let placeN = 0;
  let stage; let world; let objsEl; let arrowsG; let strokesG; let liveG; let handlesEl; let selbar; let mini; let marquee;

  const note = () => state.notes.get(id);
  const obj = (oid) => data?.objects.find((o) => o.id === oid && !o.del) || null;
  const boxOf = (oid) => boxes.get(oid) || (() => { const o = obj(oid); return o && o.type !== 'arrow' ? { x: o.x, y: o.y, w: o.w, h: o.h } : null; })();
  const elOf = (oid) => objsEl?.querySelector(`[data-id="${CSS.escape(oid)}"]`);
  const titleOf = (oid) => objsEl?.querySelector(`[data-fid="${CSS.escape(oid)}"]`);
  const stroke = (sid) => data.strokes.find((s) => s.id === sid);
  const maxZ = () => Math.max(0, ...data.objects.map((o) => o.z || 0));

  // ---------- Starting ----------
  async function create() {
    const nb = params.notebook ? state.notebooks.get(params.notebook) : null;
    const par = params.parent ? state.notes.get(params.parent) : null;
    const nbx = nb || (par?.notebook ? state.notebooks.get(par.notebook) : null);
    const n = newNote({
      kind: 'board',
      title: `Whiteboard, ${fmtDate(Date.now())}`,
      titleAuto: false,
      notebook: nbx?.id || null,
      section: params.section || par?.section || nbx?.sections?.[0]?.id || null,
      parent: par?.id || null,
      region: nbx?.region || par?.region || params.region || null,
      inbox: !(nbx || par?.notebook || params.region),
      sealed: !!(nbx?.sealed || par?.sealed),
      pages: [newPage({ paper: 'blank' })],
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
      el.innerHTML = `${html`<div class="page"><div class="empty"><p class="serif">This board isn’t here</p><p style="margin:0">It may have been deleted, or it’s sealed and locked.</p><a class="btn" href="#/notebooks">Back to notebooks</a></div></div>`}`;
      return;
    }
    pageId = n.pages[0]?.id;
    if (!pageId) {
      const page = newPage({ paper: 'blank' });
      await V.saveNote({ ...n, pages: [page] });
      pageId = page.id;
    }
    try {
      data = clone(await V.loadPage(pageId));
    } catch (e) {
      el.innerHTML = `${html`<div class="page"><div class="empty"><p class="serif">This board is sealed</p><p style="margin:0">${e.message}</p><button type="button" class="btn" data-unlock>Unlock sealed notes</button></div></div>`}`;
      el.querySelector('[data-unlock]').onclick = async () => { const ok = await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) }); if (ok) start(); };
      return;
    }
    data.objects ||= [];
    data.strokes ||= [];
    data.tomb ||= [];
    draw();
    document.body.classList.add('inking', 'boarding');
    enterNote();
  }

  // ---------- Layout ----------
  function crumbs(n) {
    const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
    const sec = nb?.sections.find((s) => s.id === n.section);
    return { nb, sec };
  }

  function draw() {
    const n = note();
    const { nb, sec } = crumbs(n);
    el.innerHTML = `${html`<div class="bd" id="bd">
      <header class="bd-top">
        <button type="button" class="back" data-act="back">${icons.back()}<span class="hide-sm">${nb ? nb.title : 'Back'}</span></button>
        <div class="bd-title">
          <button type="button" class="bd-name" data-act="rename" aria-label="Rename this board">${displayTitle(n)}</button>
          ${nb ? html`<span class="bd-sub">${nb.title}${sec && nb.sections.length > 1 ? ` › ${sec.name}` : ''}</span>` : ''}
        </div>
        <div class="top-actions">
          ${raw(focusButtonHtml())}
          <button type="button" class="icon-btn bare" data-act="undo" aria-label="Undo">${icons.undo()}</button>
          <button type="button" class="icon-btn bare" data-act="redo" aria-label="Redo">${icons.redo()}</button>
          <button type="button" class="icon-btn bare hide-sm" data-act="export" aria-label="Export">${icons.share()}</button>
          <button type="button" class="icon-btn bare" data-act="more" aria-label="More actions">${icons.more()}</button>
        </div>
      </header>
      <div class="bd-main">
        <div class="bd-stage" id="bd-stage" tabindex="0" role="region" aria-roledescription="whiteboard" aria-label="${displayTitle(n)}. Tab through what’s on the board; arrow keys move the selection.">
          <div class="bd-world" id="bd-world">
            <div class="bd-objs" id="bd-objs"></div>
            <svg class="bd-svg" aria-hidden="true"><g id="bd-arrows"></g><g id="bd-strokes"></g><g id="bd-live"></g></svg>
            <div class="bd-handles" id="bd-handles"></div>
          </div>
          <div class="bd-marquee" id="bd-marquee" hidden></div>
          <div class="bd-empty" id="bd-empty" hidden><p class="serif">An empty board</p><p>Add cards for notes you already have, sticky notes and arrows to think it through.</p></div>
        </div>
        <div class="bd-tools" role="toolbar" aria-label="Board tools" id="bd-tools"></div>
        <div class="bd-opts" id="bd-opts" role="toolbar" hidden></div>
        <div class="bd-selbar" id="bd-selbar" role="toolbar" aria-label="Selection" hidden></div>
        <div class="bd-nav">
          <div class="bd-zoom" role="group" aria-label="Zoom">
            <button type="button" data-act="zoom-out" aria-label="Zoom out">${icons.zoomOut({ size: 18 })}</button>
            <button type="button" data-act="zoom-fit" class="pct" id="bd-pct" aria-label="Zoom to fit">100%</button>
            <button type="button" data-act="zoom-in" aria-label="Zoom in">${icons.zoomIn({ size: 18 })}</button>
          </div>
          <canvas class="bd-mini" id="bd-mini" role="img" aria-label="Board overview. Tap a spot to go there."></canvas>
        </div>
        <input type="file" accept="image/*" class="sr-only" id="bd-file" multiple tabindex="-1" aria-hidden="true">
      </div>
    </div>`}`;
    stage = $('#bd-stage', el);
    world = $('#bd-world', el);
    objsEl = $('#bd-objs', el);
    arrowsG = $('#bd-arrows', el);
    strokesG = $('#bd-strokes', el);
    liveG = $('#bd-live', el);
    handlesEl = $('#bd-handles', el);
    selbar = $('#bd-selbar', el);
    mini = $('#bd-mini', el);
    marquee = $('#bd-marquee', el);
    const on = (a, fn) => { const b = el.querySelector(`[data-act=${a}]`); if (b) b.onclick = fn; };
    on('back', () => leave());
    on('rename', () => rename());
    on('undo', () => doUndo());
    on('redo', () => doRedo());
    on('export', () => exportMenu());
    on('more', () => more());
    on('focus', () => toggleFocus());
    on('zoom-in', () => zoomBy(1.25));
    on('zoom-out', () => zoomBy(0.8));
    on('zoom-fit', () => fit({ animate: true }));
    $('#bd-file', el).onchange = (e) => { const files = [...e.target.files]; e.target.value = ''; addImages(files); };
    bindStage();
    bindMini();
    drawTools();
    render();
    const v = views.get(id);
    if (v) { ({ tx, ty, z } = v); applyView(); } else requestAnimationFrame(() => fit());
    new ResizeObserver(() => { applyView(); }).observe(stage);
  }

  function drawTools() {
    const box = $('#bd-tools', el);
    if (!box) return;
    box.innerHTML = `${html`${TOOLS.map((t) => html`<button type="button" class="tool" data-tool="${t.id}" aria-label="${t.name}" title="${t.name} (${t.key.toUpperCase()})" aria-pressed="${tool === t.id ? 'true' : 'false'}">${raw(icons[t.icon]({ size: 22 }))}</button>`)}`}`;
    box.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => setTool(b.dataset.tool); });
    tooltips(box);
    drawOpts();
  }

  function setTool(t) {
    if (editing) endEdit();
    if (t === 'card') { addCard(); return; }
    if (t === 'image') { $('#bd-file', el).click(); return; }
    tool = t;
    if (t !== 'select') { sel.clear(); renderSel(); }
    stage.dataset.tool = t;
    el.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'));
    drawOpts();
  }

  // Options for the tool in hand: pen kind, colour and thickness; shape; sticky colour.
  function drawOpts() {
    const box = $('#bd-opts', el);
    if (!box) return;
    const sw = (c, on, attr = 'data-col') => html`<button type="button" class="ink-swatch" ${raw(attr)}="${c}" style="--c:${tone(c)}" aria-label="${colourName(c)}" aria-pressed="${on ? 'true' : 'false'}"></button>`;
    let inner = '';
    if (tool === 'pen') {
      const pk = PEN_KINDS.find((k) => k.id === opts.pen) || PEN_KINDS[0];
      const cols = opts.pen === 'hl' ? HL_COLORS.slice(0, 5).map((c) => c[1]) : B.BOARD_INK.slice(0, isWide() ? 7 : 5);
      const cur = opts.pen === 'hl' ? opts.hl : opts.ink;
      inner = html`<div class="tg">${PEN_KINDS.map((k) => html`<button type="button" class="chip sm" data-pen="${k.id}" aria-pressed="${opts.pen === k.id ? 'true' : 'false'}">${k.name}</button>`)}</div>
        ${opts.pen === 'eraser' ? '' : html`<div class="tg" role="group" aria-label="Colour">${cols.map((c) => sw(c, c === cur))}</div>
        <div class="tg" role="group" aria-label="Thickness">${pk.sizes.map((s, i) => html`<button type="button" class="ink-size" data-size="${i}" aria-label="${['Fine', 'Medium', 'Bold'][i]}" aria-pressed="${opts.size === i ? 'true' : 'false'}"><span style="--d:${4 + i * 4}px;--c:${cur}"></span></button>`)}</div>`}`;
    } else if (tool === 'shape') {
      inner = html`<div class="tg">${B.SHAPES.map((s) => html`<button type="button" class="chip sm" data-shape="${s.id}" aria-pressed="${opts.shape === s.id ? 'true' : 'false'}">${s.name}</button>`)}<button type="button" class="chip sm" data-fill aria-pressed="${opts.fill ? 'true' : 'false'}">Filled</button></div>
        <div class="tg" role="group" aria-label="Colour">${B.BOARD_INK.slice(0, isWide() ? 7 : 4).map((c) => sw(c, c === opts.ink))}</div>`;
    } else if (tool === 'sticky') {
      inner = html`<div class="tg" role="group" aria-label="Sticky note colour">${B.STICKY_COLORS.map((c) => html`<button type="button" class="ink-swatch sq" data-sticky="${c.id}" style="--c:${c.bg}" aria-label="${c.id}" aria-pressed="${opts.sticky === c.id ? 'true' : 'false'}"></button>`)}</div><span class="hint">Tap the board to place one</span>`;
    } else if (tool === 'text') {
      inner = html`<div class="tg">${B.TEXT_SIZES.map((s) => html`<button type="button" class="chip sm" data-tsize="${s.id}" aria-pressed="${opts.text === s.id ? 'true' : 'false'}">${s.name}</button>`)}</div><span class="hint">Tap the board to type</span>`;
    } else if (tool === 'arrow') {
      inner = html`<span class="hint">Drag from one thing to another</span>`;
    } else if (tool === 'frame') {
      inner = html`<span class="hint">Drag out a frame to group things</span>`;
    }
    box.hidden = !inner;
    box.innerHTML = `${inner}`;
    box.setAttribute('aria-label', `${TOOLS.find((t) => t.id === tool)?.name || ''} options`);
    const save = () => { V.updateDevice({ board: { ...opts } }).catch(() => {}); drawOpts(); };
    box.querySelectorAll('[data-pen]').forEach((b) => { b.onclick = () => { opts.pen = b.dataset.pen; save(); }; });
    box.querySelectorAll('[data-col]').forEach((b) => { b.onclick = () => { if (tool === 'pen' && opts.pen === 'hl') opts.hl = b.dataset.col; else opts.ink = b.dataset.col; save(); }; });
    box.querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { opts.size = Number(b.dataset.size); save(); }; });
    box.querySelectorAll('[data-shape]').forEach((b) => { b.onclick = () => { opts.shape = b.dataset.shape; save(); }; });
    box.querySelectorAll('[data-fill]').forEach((b) => { b.onclick = () => { opts.fill = !opts.fill; save(); }; });
    box.querySelectorAll('[data-sticky]').forEach((b) => { b.onclick = () => { opts.sticky = b.dataset.sticky; save(); }; });
    box.querySelectorAll('[data-tsize]').forEach((b) => { b.onclick = () => { opts.text = b.dataset.tsize; save(); }; });
  }

  // ---------- View: pan and zoom ----------
  const sRect = () => stage.getBoundingClientRect();
  const toWorld = (cx, cy) => { const r = sRect(); return [(cx - r.left - tx) / z, (cy - r.top - ty) / z]; };

  function applyView() {
    if (!world) return;
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    world.style.setProperty('--z', z);
    const step = 24 * z * (z < 0.45 ? 2 : 1);
    stage.style.backgroundSize = `${step}px ${step}px`;
    stage.style.backgroundPosition = `${tx}px ${ty}px`;
    const pct = $('#bd-pct', el);
    if (pct) { pct.textContent = `${Math.round(z * 100)}%`; pct.setAttribute('aria-label', `Zoom ${Math.round(z * 100)}%. Zoom to fit`); }
    views.set(id, { tx, ty, z });
    drawMini();
    placeSelbar();
  }

  function zoomAt(f, cx, cy) {
    const r = sRect();
    const nz = Math.min(MAXZ, Math.max(MINZ, z * f));
    const wx = (cx - r.left - tx) / z;
    const wy = (cy - r.top - ty) / z;
    z = nz;
    tx = cx - r.left - wx * z;
    ty = cy - r.top - wy * z;
    applyView();
  }
  const zoomBy = (f) => { const r = sRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); };

  function fit({ animate = false } = {}) {
    if (!stage) return;
    const b = B.contentBounds(data, boxOf);
    const r = sRect();
    const pad = isWide() ? 64 : 24;
    const leftUi = isWide() ? 76 : 0;
    const bottomUi = isWide() ? 0 : 64;
    let nz = 1; let ntx; let nty;
    if (!b) { ntx = r.width / 2; nty = r.height / 3; } else {
      nz = Math.min(1, Math.max(MINZ, Math.min((r.width - pad * 2 - leftUi) / b.w, (r.height - pad * 2 - bottomUi) / b.h)));
      ntx = leftUi + (r.width - leftUi - b.w * nz) / 2 - b.x * nz;
      nty = (r.height - bottomUi - b.h * nz) / 2 - b.y * nz;
    }
    if (!animate) { z = nz; tx = ntx; ty = nty; applyView(); return; }
    const [z0, x0, y0] = [z, tx, ty];
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 220);
      const e = 1 - (1 - k) ** 3;
      z = z0 + (nz - z0) * e; tx = x0 + (ntx - x0) * e; ty = y0 + (nty - y0) * e;
      applyView();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Bring a box into view if it's off screen (keyboard and new things).
  function reveal(b) {
    if (!b) return;
    const r = sRect();
    const sx = b.x * z + tx; const sy = b.y * z + ty;
    const sw = b.w * z; const sh = b.h * z;
    const m = 40;
    if (sx < m) tx += m - sx; else if (sx + sw > r.width - m) tx -= Math.min(sx - m, sx + sw - (r.width - m));
    if (sy < m) ty += m - sy; else if (sy + sh > r.height - m) ty -= Math.min(sy - m, sy + sh - (r.height - m));
    applyView();
  }

  // A free spot near the middle of the screen for things added from the toolbar.
  function placeAt(w, h) {
    const r = sRect();
    const [cx, cy] = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const taken = B.live(data).filter((o) => o.type !== 'arrow' && o.type !== 'frame').map((o) => boxOf(o.id)).filter(Boolean);
    const free = (x, y) => !taken.some((b) => x < b.x + b.w + 16 && x + w + 16 > b.x && y < b.y + b.h + 16 && y + h + 16 > b.y);
    const step = 40;
    for (let ring = 0; ring < 14; ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
          const x = Math.round(cx - w / 2 + dx * step * 1.5);
          const y = Math.round(cy - h / 2 + dy * step);
          if (free(x, y)) return { x, y };
        }
      }
    }
    const k = (placeN++ % 6) * 28;
    return { x: Math.round(cx - w / 2 + k), y: Math.round(cy - h / 2 + k) };
  }

  // ---------- Rendering ----------
  // In dark mode the board goes dark too; dark ink shows light.
  function boardDark() { return isDarkUI() && state.device?.darkPaper !== false; }
  function tone(c) { return boardDark() ? darkInk(c) : c; }
  function objHtml(o) {
    const s = sel.has(o.id) ? 'sel' : '';
    const pos = `left:${o.x}px;top:${o.y}px;width:${o.w}px;z-index:${o.type === 'frame' ? 0 : 10 + (o.z || 0)}`;
    if (o.type === 'card') {
      const c = B.cardInfo(o);
      return html`<div class="bo bo-card ${s} ${c.missing ? 'missing' : ''}" data-id="${o.id}" tabindex="0" role="button" aria-label="Note card: ${c.title}" style="${pos};min-height:${o.h}px">
        <div class="bc-meta"><span class="dot" style="background:${c.dot}"></span>${c.meta}${c.sealed ? raw(icons.lock({ size: 12 })) : ''}</div>
        <div class="bc-title">${c.title}</div>${c.excerpt ? html`<div class="bc-ex">${c.excerpt}</div>` : ''}
        ${c.missing ? '' : html`<button type="button" class="bc-open" data-open="${o.note}" tabindex="-1">Open note</button>`}</div>`;
    }
    if (o.type === 'sticky') {
      return html`<div class="bo bo-sticky ${s}" data-id="${o.id}" tabindex="0" role="button" aria-label="Sticky note: ${o.text || 'empty'}" style="${pos};height:${o.h}px;background:${B.stickyBg(o.color)};--rot:${o.rot || 0}deg"><div class="bt">${o.text || ''}</div></div>`;
    }
    if (o.type === 'text') {
      return html`<div class="bo bo-text ${s} ${o.font === 'serif' ? 'serif' : ''}" data-id="${o.id}" tabindex="0" role="button" aria-label="Text: ${o.text || 'empty'}" style="${pos};font-size:${B.textPx(o)}px;color:${tone(o.color || B.PAPER.ink)};font-weight:${o.bold ? 700 : 400}"><div class="bt">${o.text || ''}</div></div>`;
    }
    if (o.type === 'shape') {
      const c = tone(o.color || B.PAPER.ink);
      const fill = o.fill ? `${c}1F` : 'none';
      const g = o.shape === 'ellipse' ? html`<ellipse cx="50" cy="50" rx="49" ry="49" />` : o.shape === 'diamond' ? html`<polygon points="50,1 99,50 50,99 1,50" />` : html`<rect x="1" y="1" width="98" height="98" rx="${Math.min(10, 1000 / Math.max(o.w, 1))}" />`;
      return html`<div class="bo bo-shape ${s}" data-id="${o.id}" tabindex="0" role="button" aria-label="${B.SHAPES.find((x) => x.id === o.shape)?.name || 'Shape'}${o.text ? `: ${o.text}` : ''}" style="${pos};height:${o.h}px"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="stroke:${c};fill:${fill}">${g}</svg><div class="bt">${o.text || ''}</div></div>`;
    }
    if (o.type === 'frame') {
      return html`<div class="bo bo-frame ${s}" data-id="${o.id}" style="${pos};height:${o.h}px"></div>`;
    }
    if (o.type === 'image') {
      return html`<div class="bo bo-image ${s}" data-id="${o.id}" tabindex="0" role="button" aria-label="Photo${o.caption ? `: ${o.caption}` : ''}" style="${pos};height:${o.h}px"><div class="bi"><img alt="" data-file="${o.fileId}" draggable="false"></div>${o.caption ? html`<div class="bi-cap">${o.caption}</div>` : ''}</div>`;
    }
    return '';
  }

  function render() {
    if (!objsEl || !data) return;
    stage.classList.toggle('dark', boardDark());
    const objs = B.live(data);
    const frames = objs.filter((o) => o.type === 'frame');
    const rest = objs.filter((o) => o.type !== 'frame' && o.type !== 'arrow');
    // Frame titles sit above everything, so a card over a frame never hides its name.
    // Keep keyboard focus on the same thing across a redraw.
    const act = document.activeElement;
    const keep = stage.contains(act) ? (act.closest?.('[data-id], [data-fid]') || null) : null;
    const keepId = keep ? (keep.dataset.id ? `[data-id="${CSS.escape(keep.dataset.id)}"]` : `[data-fid="${CSS.escape(keep.dataset.fid)}"]`) : null;
    const hadFocus = stage.contains(act);
    const titles = frames.map((f) => String(html`<div class="bf-title" data-fid="${f.id}" tabindex="0" role="button" aria-label="Frame: ${f.title || 'Frame'}" style="left:${f.x}px;top:${f.y}px"><span class="bt">${f.title || 'Frame'}</span></div>`));
    objsEl.innerHTML = [...frames, ...rest].map((o) => String(objHtml(o))).join('') + titles.join('');
    objsEl.querySelectorAll('img[data-file]').forEach((img) => { V.fileURL(img.dataset.file).then((u) => { if (u) img.src = u; }); });
    objsEl.querySelectorAll('[data-open]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openNote(b.dataset.open); }; });
    objsEl.querySelectorAll('.bo-sticky').forEach(fitSticky);
    if (keepId) (objsEl.querySelector(keepId) || stage).focus({ preventScroll: true });
    else if (hadFocus && document.activeElement === document.body) stage.focus({ preventScroll: true });
    measure();
    renderSvg();
    renderSel();
    const empty = $('#bd-empty', el);
    if (empty) empty.hidden = !!(objs.length || data.strokes.length);
  }

  function fitSticky(elx) {
    const t = elx.querySelector('.bt');
    if (!t) return;
    let px = 26;
    t.style.fontSize = `${px}px`;
    while (px > 11 && t.scrollHeight > t.clientHeight + 1) { px -= 1; t.style.fontSize = `${px}px`; }
  }

  function measure() {
    boxes.clear();
    for (const o of B.live(data)) {
      if (o.type === 'arrow') continue;
      const e = elOf(o.id);
      boxes.set(o.id, { x: o.x, y: o.y, w: o.w, h: e && o.type !== 'frame' ? e.offsetHeight : o.h });
    }
  }

  function renderSvg() {
    if (!arrowsG) return;
    const arrows = B.live(data).filter((o) => o.type === 'arrow');
    arrowsG.innerHTML = arrows.map((a) => {
      const g = B.arrowGeom(a, boxOf);
      const d = B.arrowD(g);
      const c = tone(a.color || B.PAPER.ink);
      const h = B.arrowHead(g).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
      return String(html`<g class="ba ${sel.has(a.id) ? 'sel' : ''}" data-aid="${a.id}"><path class="ba-under" d="${d}"/><path class="ba-line" d="${d}" style="stroke:${c}" ${a.dash ? raw('stroke-dasharray="7 6"') : ''}/><polygon points="${h}" style="fill:${c}"/>${a.label ? html`<text x="${g.mid[0].toFixed(1)}" y="${g.mid[1].toFixed(1)}" class="ba-label" style="fill:${c}">${a.label}</text>` : ''}</g>`);
    }).join('');
    strokesG.innerHTML = data.strokes.map((s) => String(html`<path data-sid="${s.id}" d="${B.strokeD(s)}" style="fill:${tone(s.c)};opacity:${s.t === 'hl' ? (boardDark() ? HL.alphaDark : HL.alpha) : (PENS[s.pen]?.alpha || 1)}"/>`)).join('');
    // Box around selected strokes
    const ss = [...sel].filter((k) => k.startsWith('s:')).map((k) => stroke(k.slice(2))).filter(Boolean);
    if (ss.length) {
      const b = unionBox(ss.map(B.strokeBounds));
      strokesG.insertAdjacentHTML('beforeend', String(html`<rect class="bs-sel" x="${b.x - 4}" y="${b.y - 4}" width="${b.w + 8}" height="${b.h + 8}" rx="4"/>`));
    }
    drawMini();
  }

  const unionBox = (list) => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const b of list) { if (!b) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };

  function selBox() {
    const list = [];
    for (const k of sel) {
      if (k.startsWith('s:')) { const s = stroke(k.slice(2)); if (s) list.push(B.strokeBounds(s)); continue; }
      const o = obj(k);
      if (!o) continue;
      if (o.type === 'arrow') { const g = B.arrowGeom(o, boxOf); list.push(unionBox([g.p0, g.p1, g.mid].map((p) => ({ x: p[0], y: p[1], w: 0, h: 0 })))); } else list.push(boxOf(k));
    }
    return unionBox(list);
  }

  // Selection outlines, resize handle, arrow end handles and the selection bar.
  function renderSel() {
    if (!objsEl) return;
    let grew = false;
    objsEl.querySelectorAll('.bo').forEach((e) => {
      const on = sel.has(e.dataset.id);
      if (e.classList.contains('sel') !== on) { e.classList.toggle('sel', on); if (e.classList.contains('bo-card')) grew = true; }
    });
    // A selected card shows "Open note", so it's taller: arrows follow.
    if (grew && !gesture) { measure(); renderArrowsOnly(); }
    arrowsG?.querySelectorAll('[data-aid]').forEach((e) => e.classList.toggle('sel', sel.has(e.dataset.aid)));
    let hh = '';
    const only = sel.size === 1 ? obj([...sel][0]) : null;
    if (only && !editing && tool === 'select') {
      if (only.type === 'arrow') {
        const g = B.arrowGeom(only, boxOf);
        hh = String(html`<div class="bh bh-end" data-h="from" style="left:${g.p0[0]}px;top:${g.p0[1]}px" aria-hidden="true"></div><div class="bh bh-end" data-h="to" style="left:${g.p1[0]}px;top:${g.p1[1]}px" aria-hidden="true"></div>`);
      } else {
        const b = boxOf(only.id);
        if (b) hh = String(html`<div class="bh bh-se" data-h="se" style="left:${b.x + b.w}px;top:${b.y + b.h}px" aria-hidden="true"></div>`);
      }
    }
    handlesEl.innerHTML = hh;
    drawSelbar();
  }

  function drawSelbar() {
    if (!selbar) return;
    if (!sel.size || editing || gesture?.type === 'move' || gesture?.type === 'resize' || tool !== 'select') { selbar.hidden = true; return; }
    const items = [...sel].map((k) => (k.startsWith('s:') ? { type: 'stroke', id: k.slice(2) } : obj(k))).filter(Boolean);
    if (!items.length) { selbar.hidden = true; return; }
    const one = items.length === 1 ? items[0] : null;
    const types = new Set(items.map((o) => o.type));
    const T = (act, label, ic, pressed = null) => html`<button type="button" class="${ic ? 'icon-btn bare sm' : 'chip sm'}" data-sb="${act}" aria-label="${label}" ${pressed === null ? '' : raw(`aria-pressed="${pressed ? 'true' : 'false'}"`)}>${ic ? raw(icons[ic]({ size: 18 })) : label}</button>`;
    const parts = [];
    if (one?.type === 'card') parts.push(html`<button type="button" class="chip sm strong" data-sb="open">Open note</button>`, T('repick', 'Change note'));
    if (types.size === 1 && types.has('sticky')) parts.push(html`<span class="sb-g" role="group" aria-label="Colour">${B.STICKY_COLORS.map((c) => html`<button type="button" class="ink-swatch sq" data-sbcol="${c.id}" style="--c:${c.bg}" aria-label="${c.id}" aria-pressed="${items.every((o) => o.color === c.id) ? 'true' : 'false'}"></button>`)}</span>`);
    const inky = items.every((o) => ['text', 'shape', 'arrow', 'stroke'].includes(o.type) && !(o.type === 'stroke' && stroke(o.id)?.t === 'hl'));
    if (inky) {
      const cur = items.map((o) => (o.type === 'stroke' ? stroke(o.id)?.c : o.color || B.PAPER.ink));
      parts.push(html`<span class="sb-g" role="group" aria-label="Colour">${B.BOARD_INK.slice(0, isWide() ? 6 : 4).map((c) => html`<button type="button" class="ink-swatch" data-sbcol="${c}" style="--c:${c}" aria-label="${colourName(c)}" aria-pressed="${cur.every((x) => x === c) ? 'true' : 'false'}"></button>`)}</span>`);
    }
    if (one?.type === 'text') parts.push(T('tsize', B.TEXT_SIZES.find((s) => s.id === (one.size || 'm'))?.name || 'Medium'), T('bold', 'Bold', null, !!one.bold));
    if (one?.type === 'shape') parts.push(T('shape', B.SHAPES.find((s) => s.id === one.shape)?.name || 'Shape'), T('fill', 'Filled', null, !!one.fill));
    if (one?.type === 'arrow') parts.push(T('dash', 'Dashed', null, !!one.dash), T('label', one.label ? 'Edit label' : 'Label'));
    if (one?.type === 'image') parts.push(T('caption', one.caption ? 'Edit caption' : 'Caption'));
    if (one && ['sticky', 'text', 'shape'].includes(one.type)) parts.push(T('edit', 'Edit text'));
    if (one?.type === 'frame') parts.push(T('edit', 'Rename'));
    if (items.length > 1 && !types.has('frame')) parts.push(T('wrap', 'Frame them'));
    parts.push(T('dup', 'Duplicate', 'copy'));
    if (!types.has('stroke') || items.length > 1) parts.push(T('front', 'Bring to front', 'front'));
    parts.push(T('delete', 'Delete', 'trash'));
    selbar.innerHTML = parts.map(String).join('');
    selbar.hidden = false;
    selbar.querySelectorAll('[data-sb]').forEach((b) => { b.onclick = (e) => selAction(b.dataset.sb, items, b, e); });
    selbar.querySelectorAll('[data-sbcol]').forEach((b) => { b.onclick = () => recolour(items, b.dataset.sbcol); });
    placeSelbar();
  }

  function placeSelbar() {
    if (!selbar || selbar.hidden) return;
    const b = selBox();
    if (!b) { selbar.hidden = true; return; }
    const host = selbar.offsetParent?.getBoundingClientRect() || sRect();
    const r = sRect();
    const left = r.left - host.left + b.x * z + tx;
    const top = r.top - host.top + b.y * z + ty;
    const w = selbar.offsetWidth;
    const h = selbar.offsetHeight;
    let x = left + (b.w * z) / 2 - w / 2;
    x = Math.max(8, Math.min(x, host.width - w - 8));
    let y = top - h - 14 - (obj([...sel][0])?.type === 'frame' ? 26 : 0);
    if (y < 8) y = Math.min(host.height - h - 8, top + b.h * z + 14);
    selbar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  // ---------- Minimap ----------
  function drawMini() {
    if (!mini || mini.offsetParent === null) return;
    const dpr = window.devicePixelRatio || 1;
    const W = mini.clientWidth; const H = mini.clientHeight;
    if (!W) return;
    if (mini.width !== W * dpr) { mini.width = W * dpr; mini.height = H * dpr; }
    const c = mini.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const r = sRect();
    const vw = { x: -tx / z, y: -ty / z, w: r.width / z, h: r.height / z };
    const b = unionBox([B.contentBounds(data, boxOf), vw]);
    const k = Math.min((W - 12) / b.w, (H - 12) / b.h);
    const ox = (W - b.w * k) / 2 - b.x * k;
    const oy = (H - b.h * k) / 2 - b.y * k;
    mini._map = { k, ox, oy };
    for (const o of B.live(data)) {
      if (o.type === 'arrow') continue;
      const bb = boxOf(o.id);
      c.fillStyle = o.type === 'frame' ? (boardDark() ? 'rgba(120,145,165,0.18)' : 'rgba(201,212,209,0.35)') : o.type === 'sticky' ? B.stickyBg(o.color) : (boardDark() ? '#3A4E60' : '#D5DEDB');
      c.fillRect(bb.x * k + ox, bb.y * k + oy, Math.max(2, bb.w * k), Math.max(2, bb.h * k));
    }
    c.fillStyle = boardDark() ? '#56707F' : '#B9C7C3';
    for (const s of data.strokes) { const sb = B.strokeBounds(s); c.fillRect(sb.x * k + ox, sb.y * k + oy, Math.max(1.5, sb.w * k), Math.max(1.5, sb.h * k)); }
    c.strokeStyle = getComputedStyle(el).getPropertyValue('--ink') || '#1B2A38';
    c.lineWidth = 1.5;
    c.strokeRect(vw.x * k + ox, vw.y * k + oy, vw.w * k, vw.h * k);
  }

  function bindMini() {
    if (!mini) return;
    const go = (e) => {
      const m = mini._map;
      if (!m) return;
      const rr = mini.getBoundingClientRect();
      const wx = (e.clientX - rr.left - m.ox) / m.k;
      const wy = (e.clientY - rr.top - m.oy) / m.k;
      const r = sRect();
      tx = r.width / 2 - wx * z;
      ty = r.height / 2 - wy * z;
      applyView();
    };
    mini.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      mini.setPointerCapture(e.pointerId);
      go(e);
      mini.onpointermove = go;
      mini.onpointerup = () => { mini.onpointermove = null; };
    });
  }

  // ---------- Changes, undo and saving ----------
  const snap = () => clone({ objects: data.objects, strokes: data.strokes });
  function checkpoint() {
    undo.push(snap());
    if (undo.length > 80) undo.shift();
    redo.length = 0;
  }
  const touch = (o) => { o.t = Date.now(); return o; };

  // Move the board to a snapshot, as changes (so other devices merge them).
  function applySnap(target) {
    const now = Date.now();
    const cur = new Map(data.objects.map((o) => [o.id, o]));
    const tgt = new Map(target.objects.map((o) => [o.id, o]));
    const strip = ({ t, ...rest }) => JSON.stringify(rest);
    const out = [];
    for (const [oid, c] of cur) {
      const t = tgt.get(oid);
      if (!t) out.push(c.del ? c : { ...c, del: true, t: now });
      else out.push(strip(t) === strip(c) ? c : { ...t, t: now });
    }
    for (const [oid, t] of tgt) if (!cur.has(oid)) out.push({ ...t, t: now });
    data.objects = out;
    const want = new Map(target.strokes.map((s) => [s.id, s]));
    const tomb = new Set(data.tomb);
    const keep = [];
    for (const s of data.strokes) { if (want.has(s.id)) keep.push(s); else tomb.add(s.id); }
    const have = new Set(keep.map((s) => s.id));
    for (const [sid, s] of want) if (!have.has(sid)) keep.push(tomb.has(sid) ? { ...s, id: uid('k') } : s);
    data.strokes = keep;
    data.tomb = [...tomb];
  }

  function doUndo() {
    if (editing) endEdit();
    const t = undo.pop();
    if (!t) { toast('Nothing to undo'); return; }
    redo.push(snap());
    applySnap(t);
    sel = new Set([...sel].filter((k) => (k.startsWith('s:') ? stroke(k.slice(2)) : obj(k))));
    changed();
  }
  function doRedo() {
    if (editing) endEdit();
    const t = redo.pop();
    if (!t) return;
    undo.push(snap());
    applySnap(t);
    sel = new Set([...sel].filter((k) => (k.startsWith('s:') ? stroke(k.slice(2)) : obj(k))));
    changed();
  }

  function changed({ redraw = true } = {}) {
    if (redraw) render();
    pending = true;
    saveSoon();
  }

  const saveSoon = debounce(() => flush(), 600);
  function flush() {
    saveSoon.cancel();
    if (!pending || !data || !pageId) return saving;
    pending = false;
    const snapshot = clone(data);
    saving = saving.then(async () => {
      const n = note();
      if (!n) return;
      try {
        await V.savePage(pageId, snapshot, { sealed: n.sealed });
        const cur = note();
        const body = B.boardSummary(snapshot, boxOf);
        if (cur) await V.saveNote({ ...cur, body });
      } catch (e) { toast(e.message || 'Couldn’t save this board.'); }
    });
    return saving;
  }

  // ---------- Adding things ----------
  function add(o, { select = true } = {}) {
    const full = touch({ id: uid('o'), z: maxZ() + 1, at: Date.now(), ...o });
    data.objects.push(full);
    if (select) sel = new Set([full.id]);
    return full;
  }

  async function addCard(at = null) {
    const n = note();
    const v = await notePicker({ title: 'Add a note to the board', exclude: [n.id], allowNew: true });
    if (!v) return;
    let noteId = v;
    if (typeof v === 'string' && v.startsWith('new:')) {
      const title = v.slice(4).trim();
      const made = await V.saveNote(newNote({ title, titleAuto: !title, notebook: n.notebook, section: n.section, region: n.region, inbox: n.inbox, sealed: n.sealed }));
      noteId = made.id;
    }
    checkpoint();
    const { w, h } = B.DEFAULTS.card;
    const p = at ? { x: at[0] - w / 2, y: at[1] - 30 } : placeAt(w, h);
    const o = add({ type: 'card', note: noteId, ...p, w, h: 0 });
    setTool('select');
    changed();
    reveal(boxOf(o.id));
    announce(`Added ${displayTitle(state.notes.get(noteId))}`);
  }

  async function addImages(files, at = null) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    const n = note();
    let first = true;
    for (const [i, f] of imgs.entries()) {
      try {
        const img = await compressImage(f, { max: 1800 });
        const fileId = await V.addFile(img.bytes, { sealed: n.sealed, type: img.type });
        const w = Math.min(360, Math.max(160, img.w / 4));
        const h = Math.round((w - 16) * (img.h / img.w)) + 16;
        if (first) { checkpoint(); first = false; }
        const p = at ? { x: at[0] - w / 2 + i * 24, y: at[1] - h / 2 + i * 24 } : placeAt(w, h);
        add({ type: 'image', fileId, ...p, w, h });
      } catch (e) { toast(e.message || 'Couldn’t add that photo.'); }
    }
    if (!first) { setTool('select'); changed(); reveal(selBox()); }
  }

  function addSticky(wx, wy) {
    checkpoint();
    const { w, h } = B.DEFAULTS.sticky;
    const o = add({ type: 'sticky', x: Math.round(wx - w / 2), y: Math.round(wy - h / 2), w, h, color: opts.sticky, text: '', rot: Math.round((Math.random() * 4 - 2) * 10) / 10 });
    setTool('select');
    render();
    beginEdit(o.id, { fresh: true });
  }

  function addText(wx, wy) {
    checkpoint();
    const o = add({ type: 'text', x: Math.round(wx - 4), y: Math.round(wy - B.TEXT_SIZES.find((s) => s.id === opts.text).px * 0.7), w: B.DEFAULTS.text.w, h: 0, text: '', size: opts.text, color: state.config?.text?.color || B.PAPER.ink });
    setTool('select');
    render();
    beginEdit(o.id, { fresh: true });
  }

  // ---------- Pointer input ----------
  function bindStage() {
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onCancel);
    stage.addEventListener('lostpointercapture', (e) => { if (pointers.has(e.pointerId)) onCancel(e); });
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', onDbl);
    stage.addEventListener('keydown', onKey);
    stage.addEventListener('focusin', (e) => {
      const o = e.target.closest?.('[data-id], [data-fid]');
      if (!o || editing || gesture) return;
      const oid = o.dataset.id || o.dataset.fid;
      if (oid && !sel.has(oid)) { sel = new Set([oid]); renderSel(); reveal(boxOf(oid)); }
    });
    stage.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault(); });
    stage.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      addImages(files, toWorld(e.clientX, e.clientY));
    });
    el.addEventListener('paste', onPaste);
    // Pinch-zoom and page scrolling are handled here, not by the browser.
    stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    stage.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  // What's under a point: pen strokes and arrows sit on top, then objects.
  function hitAt(wx, wy, target) {
    const tol = 7 / z;
    for (let i = data.strokes.length - 1; i >= 0; i--) if (B.strokeHit(data.strokes[i], wx, wy, tol)) return `s:${data.strokes[i].id}`;
    const arrows = B.live(data).filter((o) => o.type === 'arrow').reverse();
    for (const a of arrows) if (B.arrowDistance(B.arrowGeom(a, boxOf), wx, wy) < Math.max(tol, 9 / z)) return a.id;
    const ft = target?.closest?.('.bf-title');
    if (ft) return ft.dataset.fid;
    const t = target?.closest?.('[data-id]');
    if (t && !t.classList.contains('bo-frame')) return t.dataset.id;
    // Frame edges
    for (const f of B.live(data).filter((o) => o.type === 'frame').reverse()) {
      const inX = wx > f.x - tol && wx < f.x + f.w + tol;
      const inY = wy > f.y - tol && wy < f.y + f.h + tol;
      const nearEdge = Math.min(Math.abs(wx - f.x), Math.abs(wx - f.x - f.w), Math.abs(wy - f.y), Math.abs(wy - f.y - f.h)) < tol * 1.4;
      if (inX && inY && nearEdge) return f.id;
    }
    return null;
  }

  // The thing an arrow end would attach to at a point (not frames unless nothing else).
  function attachAt(wx, wy, except = null) {
    let best = null;
    for (const o of B.live(data)) {
      if (o.type === 'arrow' || o.id === except) continue;
      const b = boxOf(o.id);
      if (!b || wx < b.x || wx > b.x + b.w || wy < b.y || wy > b.y + b.h) continue;
      const score = (o.type === 'frame' ? 1e9 : 0) + b.w * b.h;
      if (!best || score < best.score) best = { id: o.id, score };
    }
    return best?.id || null;
  }

  function onDown(e) {
    if (e.target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    if (e.target.closest('[data-open]')) return;
    if (e.pointerType === 'pen') penSeen = true;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    e.preventDefault();
    if (document.activeElement !== stage && !stage.contains(document.activeElement)) stage.focus({ preventScroll: true });
    if (editing) endEdit();
    closePopover?.();
    try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const touches = [...pointers.values()].filter((p) => p.type === 'touch');
    if (touches.length >= 2) { abortGesture(); startPinch(); return; }
    if (pointers.size > 1) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, wx, wy, moved: false, ptype: e.pointerType };
    if (e.button === 1 || spaceDown) { gesture = { ...base, type: 'pan', tx0: tx, ty0: ty }; stage.classList.add('panning'); return; }
    if (e.button > 0) return;
    const h = e.target.closest('[data-h]');
    if (h) { startHandle(base, h.dataset.h); return; }
    const fingerPans = e.pointerType === 'touch' && penSeen;
    switch (tool) {
      case 'pen':
        if (fingerPans) { gesture = { ...base, type: 'pan', tx0: tx, ty0: ty }; return; }
        if (opts.pen === 'eraser') { gesture = { ...base, type: 'erase', erased: false }; eraseAt(wx, wy); return; }
        gesture = { ...base, type: 'ink', pts: [wx, wy, e.pressure || 0.5] };
        return;
      case 'arrow': {
        if (fingerPans) { gesture = { ...base, type: 'pan', tx0: tx, ty0: ty }; return; }
        const from = attachAt(wx, wy);
        gesture = { ...base, type: 'arrow', from: from ? { id: from } : { x: wx, y: wy }, to: { x: wx, y: wy } };
        return;
      }
      case 'shape':
      case 'frame':
        if (fingerPans) { gesture = { ...base, type: 'pan', tx0: tx, ty0: ty }; return; }
        gesture = { ...base, type: 'draw' };
        return;
      case 'sticky':
      case 'text':
        gesture = { ...base, type: 'place' };
        return;
      default: break;
    }
    // Select tool
    const hit = hitAt(wx, wy, e.target);
    if (hit) {
      const was = sel.has(hit);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (was) sel.delete(hit); else sel.add(hit);
      } else if (!was) sel = new Set([hit]);
      renderSel();
      gesture = { ...base, type: 'move', hit, was: was && sel.size === 1, onTitle: !!e.target.closest('.bf-title') };
      return;
    }
    if (e.pointerType === 'mouse' && !(e.shiftKey && false)) {
      gesture = { ...base, type: 'marquee', add: e.shiftKey || e.metaKey, base: new Set(sel) };
      return;
    }
    gesture = { ...base, type: 'pan', tx0: tx, ty0: ty, tapClears: true };
  }

  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (gesture?.type === 'pinch') { pinchMove(); return; }
    if (!gesture || gesture.id !== e.pointerId) {
      if (!gesture && tool === 'select' && e.pointerType === 'mouse') hover(e);
      return;
    }
    const dxs = e.clientX - gesture.sx;
    const dys = e.clientY - gesture.sy;
    if (!gesture.moved && Math.hypot(dxs, dys) > (gesture.ptype === 'touch' ? 6 : 3)) gesture.moved = true;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const g = gesture;
    switch (g.type) {
      case 'pan':
        if (!g.moved) return;
        tx = g.tx0 + dxs; ty = g.ty0 + dys;
        applyView();
        return;
      case 'ink': {
        const evs = e.getCoalescedEvents?.() || [e];
        for (const ce of evs) { const [x, y] = toWorld(ce.clientX, ce.clientY); g.pts.push(x, y, ce.pressure || 0.5); }
        if (!g.raf) g.raf = requestAnimationFrame(() => { g.raf = 0; drawLiveInk(); });
        return;
      }
      case 'erase': eraseAt(wx, wy); return;
      case 'arrow': {
        const to = attachAt(wx, wy, g.from.id);
        g.to = to ? { id: to } : { x: wx, y: wy };
        drawLiveArrow();
        return;
      }
      case 'draw': if (g.moved) drawLiveBox(g.wx, g.wy, wx, wy); return;
      case 'marquee': if (g.moved) drawMarquee(g, e); return;
      case 'move': if (g.moved) dragMove(g, wx - g.wx, wy - g.wy); return;
      case 'resize': if (g.moved) dragResize(g, wx - g.wx, wy - g.wy); return;
      case 'end': if (g.moved) dragEnd(g, wx, wy); return;
      default:
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (gesture?.type === 'pinch') { if (pointers.size < 2) gesture = null; return; }
    if (!gesture || gesture.id !== e.pointerId) return;
    const g = gesture;
    gesture = null;
    stage.classList.remove('panning');
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    switch (g.type) {
      case 'pan':
        if (!g.moved && g.tapClears && sel.size) { sel.clear(); renderSel(); }
        return;
      case 'ink': finishInk(g); return;
      case 'erase': if (g.erased) changed(); return;
      case 'arrow': finishArrow(g, wx, wy); return;
      case 'draw': finishBox(g, wx, wy); return;
      case 'place': if (!g.moved) (tool === 'sticky' ? addSticky : addText)(wx, wy); return;
      case 'marquee': finishMarquee(g, e); return;
      case 'move':
        if (g.moved) { commitMove(g); return; }
        // Tapping something already selected: edit its words.
        if (g.was && !g.hit.startsWith('s:')) {
          const o = obj(g.hit);
          if (o && ['sticky', 'text', 'shape'].includes(o.type)) beginEdit(o.id);
          else if (o?.type === 'frame' && g.onTitle) beginEdit(o.id);
        }
        drawSelbar();
        return;
      case 'resize': case 'end':
        if (g.moved) { changed(); } else renderSel();
        return;
      default:
    }
  }

  function onCancel(e) {
    pointers.delete(e.pointerId);
    if (gesture?.type === 'pinch') { if (pointers.size < 2) gesture = null; return; }
    if (gesture?.id === e.pointerId) abortGesture();
  }

  function abortGesture() {
    const g = gesture;
    gesture = null;
    stage?.classList.remove('panning');
    if (!g) return;
    if (liveG) liveG.innerHTML = '';
    if (marquee) marquee.hidden = true;
    if ((g.type === 'move' || g.type === 'resize' || g.type === 'end') && g.moved) { changed(); return; }
    if (g.type === 'erase' && g.erased) changed();
  }

  function hover(e) {
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const tol = 7 / z;
    let over = null;
    for (const s of data.strokes) if (B.strokeHit(s, wx, wy, tol)) { over = 'x'; break; }
    if (!over) for (const a of B.live(data).filter((o) => o.type === 'arrow')) if (B.arrowDistance(B.arrowGeom(a, boxOf), wx, wy) < Math.max(tol, 9 / z)) { over = 'x'; break; }
    stage.classList.toggle('over-thing', !!over);
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX, e.clientY);
    } else {
      const k = e.deltaMode ? 24 : 1;
      tx -= e.deltaX * k; ty -= e.deltaY * k;
      if (e.shiftKey && !e.deltaX) { tx -= e.deltaY * k; ty += e.deltaY * k; }
      applyView();
    }
  }

  function onDbl(e) {
    if (e.target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const hit = hitAt(wx, wy, e.target);
    const o = hit && !hit.startsWith('s:') ? obj(hit) : null;
    if (o?.type === 'card') { openNote(o.note); return; }
    if (o && ['sticky', 'text', 'shape', 'frame'].includes(o.type)) { sel = new Set([o.id]); beginEdit(o.id); return; }
    if (o?.type === 'arrow') { arrowLabel(o); return; }
    if (!hit && tool === 'select') addSticky(wx, wy);
  }

  // Two fingers: pan and zoom together.
  function startPinch() {
    const [a, b] = [...pointers.values()].filter((p) => p.type === 'touch');
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, c0: [(a.x + b.x) / 2, (a.y + b.y) / 2], z0: z, tx0: tx, ty0: ty };
  }
  function pinchMove() {
    const t = [...pointers.values()].filter((p) => p.type === 'touch');
    if (t.length < 2) return;
    const [a, b] = t;
    const g = gesture;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const c = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    const r = sRect();
    const nz = Math.min(MAXZ, Math.max(MINZ, g.z0 * (d / g.d0)));
    const wx = (g.c0[0] - r.left - g.tx0) / g.z0;
    const wy = (g.c0[1] - r.top - g.ty0) / g.z0;
    z = nz;
    tx = c[0] - r.left - wx * z;
    ty = c[1] - r.top - wy * z;
    applyView();
  }

  // ---------- Pen ----------
  const penSize = () => {
    const pk = PEN_KINDS.find((k) => k.id === opts.pen) || PEN_KINDS[0];
    return pk.sizes[Math.min(opts.size, pk.sizes.length - 1)] || 3;
  };
  const liveStroke = (g) => ({ id: 'live', t: opts.pen === 'hl' ? 'hl' : 'pen', pen: opts.pen === 'marker' ? 'marker' : 'ballpoint', s: penSize(), c: opts.pen === 'hl' ? opts.hl : opts.ink, pts: g.pts, sp: g.ptype !== 'pen' });
  function drawLiveInk() {
    const g = gesture;
    if (!g || g.type !== 'ink') return;
    const s = liveStroke(g);
    liveG.innerHTML = String(html`<path d="${B.strokeD({ ...s, pts: [...g.pts] })}" style="fill:${tone(s.c)};opacity:${s.t === 'hl' ? (boardDark() ? HL.alphaDark : HL.alpha) : 1}"/>`);
  }
  function finishInk(g) {
    cancelAnimationFrame(g.raf);
    liveG.innerHTML = '';
    if (g.pts.length < 3) return;
    checkpoint();
    const s = liveStroke(g);
    data.strokes.push({ ...s, id: uid('k'), pts: g.pts.map((v) => Math.round(v * 10) / 10), at: Date.now() });
    changed();
  }
  function eraseAt(wx, wy) {
    const tol = 9 / z;
    const hit = data.strokes.filter((s) => B.strokeHit(s, wx, wy, tol));
    if (!hit.length) return;
    if (!gesture.erased) { checkpoint(); gesture.erased = true; }
    const dead = new Set(hit.map((s) => s.id));
    data.strokes = data.strokes.filter((s) => !dead.has(s.id));
    data.tomb = [...new Set([...data.tomb, ...dead])];
    renderSvg();
  }

  // ---------- Arrows ----------
  function drawLiveArrow() {
    const g = gesture;
    const a = { from: g.from, to: g.to };
    const geo = B.arrowGeom(a, boxOf);
    const h = B.arrowHead(geo).map((p) => p.join(',')).join(' ');
    liveG.innerHTML = String(html`<path class="ba-line live" d="${B.arrowD(geo)}"/><polygon points="${h}" class="ba-head live"/>`);
    objsEl.querySelectorAll('.bo').forEach((e) => e.classList.toggle('target', e.dataset.id === g.to.id || e.dataset.id === g.from.id));
  }
  function finishArrow(g, wx, wy) {
    liveG.innerHTML = '';
    objsEl.querySelectorAll('.target').forEach((e) => e.classList.remove('target'));
    const fp = g.from.id ? null : [g.from.x, g.from.y];
    const far = fp ? Math.hypot(wx - fp[0], wy - fp[1]) : Infinity;
    if (!g.moved || (g.from.id && g.from.id === g.to.id) || (!g.from.id && !g.to.id && far < 24)) return;
    checkpoint();
    add({ type: 'arrow', from: g.from, to: g.to, color: B.PAPER.ink, x: 0, y: 0, w: 0, h: 0 });
    setTool('select');
    changed();
  }

  // ---------- Shapes and frames ----------
  function drawLiveBox(x0, y0, x1, y1) {
    const x = Math.min(x0, x1); const y = Math.min(y0, y1);
    liveG.innerHTML = String(html`<rect class="bd-livebox ${tool}" x="${x}" y="${y}" width="${Math.abs(x1 - x0)}" height="${Math.abs(y1 - y0)}" rx="${tool === 'frame' ? 14 : opts.shape === 'ellipse' ? Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2 : 8}"/>`);
  }
  function finishBox(g, wx, wy) {
    liveG.innerHTML = '';
    const def = B.DEFAULTS[tool === 'frame' ? 'frame' : 'shape'];
    let x; let y; let w; let h;
    if (!g.moved || Math.abs(wx - g.wx) < 16 || Math.abs(wy - g.wy) < 16) { w = def.w; h = def.h; x = g.wx - w / 2; y = g.wy - h / 2; } else {
      x = Math.min(g.wx, wx); y = Math.min(g.wy, wy); w = Math.abs(wx - g.wx); h = Math.abs(wy - g.wy);
    }
    checkpoint();
    const o = tool === 'frame'
      ? add({ type: 'frame', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), title: 'Frame', z: 0 })
      : add({ type: 'shape', shape: opts.shape, fill: opts.fill, color: opts.ink, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), text: '' });
    const wasFrame = tool === 'frame';
    setTool('select');
    changed();
    if (wasFrame) beginEdit(o.id, { fresh: true });
  }

  // ---------- Selecting ----------
  function drawMarquee(g, e) {
    const host = stage.getBoundingClientRect();
    const x = Math.min(g.sx, e.clientX) - host.left;
    const y = Math.min(g.sy, e.clientY) - host.top;
    Object.assign(marquee.style, { left: `${x}px`, top: `${y}px`, width: `${Math.abs(e.clientX - g.sx)}px`, height: `${Math.abs(e.clientY - g.sy)}px` });
    marquee.hidden = false;
  }
  function finishMarquee(g, e) {
    marquee.hidden = true;
    if (!g.moved) { if (!g.add && sel.size) { sel.clear(); renderSel(); } return; }
    const [x0, y0] = toWorld(Math.min(g.sx, e.clientX), Math.min(g.sy, e.clientY));
    const [x1, y1] = toWorld(Math.max(g.sx, e.clientX), Math.max(g.sy, e.clientY));
    const inside = (b) => b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1;
    const touches = (b) => b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
    const next = g.add ? new Set(g.base) : new Set();
    for (const o of B.live(data)) {
      if (o.type === 'arrow') { const ge = B.arrowGeom(o, boxOf); if (inside({ x: Math.min(ge.p0[0], ge.p1[0]), y: Math.min(ge.p0[1], ge.p1[1]), w: Math.abs(ge.p1[0] - ge.p0[0]), h: Math.abs(ge.p1[1] - ge.p0[1]) })) next.add(o.id); continue; }
      const b = boxOf(o.id);
      if (o.type === 'frame' ? inside(b) : touches(b)) next.add(o.id);
    }
    for (const s of data.strokes) if (touches(B.strokeBounds(s))) next.add(`s:${s.id}`);
    sel = next;
    renderSel();
    renderSvg();
    if (sel.size) announce(`${sel.size} selected`);
  }

  // Everything a move carries: the selection, what's inside selected frames,
  // and the loose ends of selected arrows.
  function movingSet() {
    const ids = new Set([...sel].filter((k) => !k.startsWith('s:')));
    const strokesMoving = new Set([...sel].filter((k) => k.startsWith('s:')).map((k) => k.slice(2)));
    const frames = [...ids].map(obj).filter((o) => o?.type === 'frame');
    for (const f of frames) {
      for (const o of B.live(data)) if (B.insideFrame(f, o, boxOf)) ids.add(o.id);
      for (const s of data.strokes) if (B.strokeInFrame(f, s)) strokesMoving.add(s.id);
    }
    return { ids, strokesMoving };
  }

  function dragMove(g, dx, dy) {
    if (!g.set) {
      checkpoint();
      g.set = movingSet();
      g.start = new Map([...g.set.ids].map((oid) => { const o = obj(oid); return [oid, o?.type === 'arrow' ? { from: { ...o.from }, to: { ...o.to } } : { x: o.x, y: o.y }]; }));
      selbar.hidden = true;
      handlesEl.innerHTML = '';
      stage.classList.add('dragging');
    }
    for (const oid of g.set.ids) {
      const o = obj(oid);
      const s0 = g.start.get(oid);
      if (!o || !s0) continue;
      if (o.type === 'arrow') {
        if (!o.from.id) o.from = { x: s0.from.x + dx, y: s0.from.y + dy };
        if (!o.to.id) o.to = { x: s0.to.x + dx, y: s0.to.y + dy };
        continue;
      }
      o.x = Math.round(s0.x + dx);
      o.y = Math.round(s0.y + dy);
      const e = elOf(oid);
      if (e) { e.style.left = `${o.x}px`; e.style.top = `${o.y}px`; }
      if (o.type === 'frame') { const ftl = titleOf(oid); if (ftl) { ftl.style.left = `${o.x}px`; ftl.style.top = `${o.y}px`; } }
      const b = boxes.get(oid);
      if (b) { b.x = o.x; b.y = o.y; }
    }
    g.dx = dx; g.dy = dy;
    strokesG.querySelectorAll('[data-sid]').forEach((p) => { if (g.set.strokesMoving.has(p.dataset.sid)) p.setAttribute('transform', `translate(${dx} ${dy})`); });
    const bs = strokesG.querySelector('.bs-sel');
    if (bs) bs.setAttribute('transform', `translate(${dx} ${dy})`);
    renderArrowsOnly();
  }

  function renderArrowsOnly() {
    for (const gEl of arrowsG.querySelectorAll('[data-aid]')) {
      const a = obj(gEl.dataset.aid);
      if (!a) continue;
      const geo = B.arrowGeom(a, boxOf);
      const d = B.arrowD(geo);
      gEl.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
      gEl.querySelector('polygon').setAttribute('points', B.arrowHead(geo).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
      const t = gEl.querySelector('text');
      if (t) { t.setAttribute('x', geo.mid[0].toFixed(1)); t.setAttribute('y', geo.mid[1].toFixed(1)); }
    }
    drawMini();
  }

  function commitMove(g) {
    stage.classList.remove('dragging');
    if (!g.set) return;
    for (const oid of g.set.ids) { const o = obj(oid); if (o) touch(o); }
    if (g.set.strokesMoving.size && (g.dx || g.dy)) {
      // A moved stroke becomes a new stroke, so other devices don't keep the old one.
      const tomb = new Set(data.tomb);
      const remap = new Map();
      data.strokes = data.strokes.map((s) => {
        if (!g.set.strokesMoving.has(s.id)) return s;
        const nid = uid('k');
        remap.set(s.id, nid);
        tomb.add(s.id);
        const pts = s.pts.map((v, i) => (i % 3 === 0 ? Math.round((v + g.dx) * 10) / 10 : i % 3 === 1 ? Math.round((v + g.dy) * 10) / 10 : v));
        return { ...s, id: nid, pts };
      });
      data.tomb = [...tomb];
      sel = new Set([...sel].map((k) => (k.startsWith('s:') && remap.has(k.slice(2)) ? `s:${remap.get(k.slice(2))}` : k)));
    }
    changed();
  }

  // ---------- Handles ----------
  function startHandle(base, which) {
    const oid = [...sel][0];
    const o = obj(oid);
    if (!o) return;
    if (which === 'se') {
      const b = boxOf(oid);
      gesture = { ...base, type: 'resize', oid, w0: o.w, h0: b.h, ratio: b.h / b.w };
    } else {
      gesture = { ...base, type: 'end', oid, end: which };
    }
  }
  function dragResize(g, dx, dy) {
    if (!g.started) { checkpoint(); g.started = true; selbar.hidden = true; }
    const o = obj(g.oid);
    if (!o) return;
    const min = { card: [200, 0], sticky: [80, 80], text: [60, 0], shape: [24, 24], frame: [120, 80], image: [80, 60] }[o.type] || [40, 40];
    o.w = Math.round(Math.max(min[0], Math.min(o.type === 'card' ? 640 : 6000, g.w0 + dx)));
    if (o.type === 'image') o.h = Math.round(o.w * g.ratio);
    else if (['sticky', 'shape', 'frame'].includes(o.type)) o.h = Math.round(Math.max(min[1], g.h0 + dy));
    touch(o);
    const e = elOf(o.id);
    if (e) {
      e.style.width = `${o.w}px`;
      if (!['card', 'text'].includes(o.type)) e.style.height = `${o.h}px`;
      if (o.type === 'sticky') fitSticky(e);
    }
    boxes.set(o.id, { x: o.x, y: o.y, w: o.w, h: e && o.type !== 'frame' ? e.offsetHeight : o.h });
    const b = boxes.get(o.id);
    const h = handlesEl.querySelector('[data-h=se]');
    if (h) { h.style.left = `${b.x + b.w}px`; h.style.top = `${b.y + b.h}px`; }
    renderArrowsOnly();
  }
  function dragEnd(g, wx, wy) {
    if (!g.started) { checkpoint(); g.started = true; selbar.hidden = true; }
    const a = obj(g.oid);
    if (!a) return;
    const other = g.end === 'from' ? a.to : a.from;
    const target = attachAt(wx, wy, other.id);
    a[g.end] = target ? { id: target } : { x: wx, y: wy };
    touch(a);
    objsEl.querySelectorAll('.bo').forEach((e) => e.classList.toggle('target', e.dataset.id === target));
    renderArrowsOnly();
    const geo = B.arrowGeom(a, boxOf);
    const hEl = handlesEl.querySelector(`[data-h=${g.end}]`);
    const p = g.end === 'from' ? geo.p0 : geo.p1;
    if (hEl) { hEl.style.left = `${p[0]}px`; hEl.style.top = `${p[1]}px`; }
  }

  // ---------- Editing words ----------
  function beginEdit(oid, { fresh = false } = {}) {
    const o = obj(oid);
    const e = o?.type === 'frame' ? titleOf(oid) : elOf(oid);
    const t = e?.querySelector('.bt');
    if (!o || !t) return;
    editing = { id: oid, fresh };
    sel = new Set([oid]);
    e.classList.add('editing');
    t.contentEditable = 'plaintext-only';
    if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
    t.spellcheck = true;
    renderSel();
    t.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(t);
    if (!fresh && o.type !== 'frame') range.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    t.oninput = () => {
      if (o.type === 'sticky') fitSticky(e);
      boxes.set(o.id, { x: o.x, y: o.y, w: o.w, h: o.type === 'frame' ? o.h : e.offsetHeight });
      renderArrowsOnly();
    };
    t.onkeydown = (ev) => {
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey || o.type === 'frame'))) { ev.preventDefault(); endEdit(); stage.focus({ preventScroll: true }); }
      ev.stopPropagation();
    };
    t.onpaste = (ev) => {
      if (t.contentEditable === 'plaintext-only') return;
      ev.preventDefault();
      document.execCommand('insertText', false, ev.clipboardData.getData('text/plain'));
    };
    t.onblur = () => { if (editing?.id === oid) endEdit(); };
  }

  function endEdit() {
    if (!editing) return;
    const { id: oid, fresh } = editing;
    editing = null;
    const o = obj(oid);
    const e = o?.type === 'frame' ? titleOf(oid) : elOf(oid);
    const t = e?.querySelector('.bt');
    if (t) { t.onblur = null; t.oninput = null; t.removeAttribute('contenteditable'); }
    e?.classList.remove('editing');
    window.getSelection()?.removeAllRanges();
    if (!o) return;
    const text = (t?.innerText || '').replace(/ /g, ' ').replace(/\n+$/, '');
    const key = o.type === 'frame' ? 'title' : 'text';
    const before = o[key] || '';
    if (o.type === 'text' && !text.trim()) {
      if (!fresh) checkpoint();
      Object.assign(o, { del: true });
      touch(o);
      sel.delete(oid);
      changed();
      return;
    }
    if (text !== before) {
      if (!fresh) checkpoint();
      o[key] = o.type === 'frame' ? (text.trim() || 'Frame') : text;
      touch(o);
      changed();
      return;
    }
    if (fresh) changed();
    else render();
  }

  // ---------- Selection actions ----------
  async function selAction(act, items, btn) {
    const one = items.length === 1 ? items[0] : null;
    if (act === 'open' && one) { openNote(one.note); return; }
    if (act === 'repick' && one) {
      const v = await notePicker({ title: 'Show a different note', exclude: [id] });
      if (!v) return;
      checkpoint(); one.note = v; touch(one); changed();
      return;
    }
    if (act === 'edit' && one) { beginEdit(one.id); return; }
    if (act === 'tsize' && one) {
      const i = B.TEXT_SIZES.findIndex((s) => s.id === (one.size || 'm'));
      checkpoint(); one.size = B.TEXT_SIZES[(i + 1) % B.TEXT_SIZES.length].id; touch(one); changed();
      return;
    }
    if (act === 'bold' && one) { checkpoint(); one.bold = !one.bold; touch(one); changed(); return; }
    if (act === 'shape' && one) {
      const i = B.SHAPES.findIndex((s) => s.id === one.shape);
      checkpoint(); one.shape = B.SHAPES[(i + 1) % B.SHAPES.length].id; touch(one); changed();
      return;
    }
    if (act === 'fill' && one) { checkpoint(); one.fill = !one.fill; touch(one); changed(); return; }
    if (act === 'dash' && one) { checkpoint(); one.dash = !one.dash; touch(one); changed(); return; }
    if (act === 'label' && one) { arrowLabel(one, btn); return; }
    if (act === 'caption' && one) { askText(btn, 'Caption', one.caption || '', (v) => { checkpoint(); one.caption = v; touch(one); changed(); }); return; }
    if (act === 'dup') { duplicate(); return; }
    if (act === 'front') {
      checkpoint();
      let top = maxZ();
      for (const o of items) if (o.type !== 'stroke') { o.z = ++top; touch(o); }
      changed();
      return;
    }
    if (act === 'wrap') {
      const b = selBox();
      checkpoint();
      const f = add({ type: 'frame', x: Math.round(b.x - 28), y: Math.round(b.y - 28), w: Math.round(b.w + 56), h: Math.round(b.h + 56), title: 'Frame', z: 0 });
      changed();
      beginEdit(f.id, { fresh: true });
      return;
    }
    if (act === 'delete') removeSelection();
  }

  function arrowLabel(a, anchor = null) {
    askText(anchor || selbar, 'Label', a.label || '', (v) => { checkpoint(); a.label = v; touch(a); changed(); });
  }

  function askText(anchor, label, value, done) {
    const p = popover(anchor, `${html`<form class="stack" style="display:flex;gap:8px;align-items:center" novalidate><label class="sr-only" for="bd-ask">${label}</label><input id="bd-ask" type="text" value="${value}" placeholder="${label}" autocomplete="off" style="flex:1"><button type="submit" class="btn btn-sm btn-primary">Done</button></form>`}`, { label, width: 320 });
    const inp = $('#bd-ask', p.el);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
    p.el.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); p.close(); if (v !== value) done(v); };
  }

  function recolour(items, c) {
    checkpoint();
    const tomb = new Set(data.tomb);
    for (const o of items) {
      if (o.type === 'stroke') {
        const s = stroke(o.id);
        if (!s) continue;
        const nid = uid('k');
        data.strokes = data.strokes.map((x) => (x.id === s.id ? { ...x, id: nid, c } : x));
        tomb.add(s.id);
        sel.delete(`s:${s.id}`);
        sel.add(`s:${nid}`);
      } else { o.color = c; touch(o); }
    }
    data.tomb = [...tomb];
    changed();
  }

  function duplicate() {
    if (!sel.size) return;
    checkpoint();
    const map = new Map();
    const next = new Set();
    let top = maxZ();
    const objs = [...sel].filter((k) => !k.startsWith('s:')).map(obj).filter(Boolean);
    for (const o of objs.filter((x) => x.type !== 'arrow')) {
      const c = touch({ ...clone(o), id: uid('o'), x: o.x + 28, y: o.y + 28, z: o.type === 'frame' ? 0 : ++top });
      map.set(o.id, c.id);
      data.objects.push(c);
      next.add(c.id);
    }
    for (const a of objs.filter((x) => x.type === 'arrow')) {
      const end = (p) => (p.id ? (map.has(p.id) ? { id: map.get(p.id) } : { ...p }) : { x: p.x + 28, y: p.y + 28 });
      const c = touch({ ...clone(a), id: uid('o'), from: end(a.from), to: end(a.to), z: ++top });
      data.objects.push(c);
      next.add(c.id);
    }
    for (const k of [...sel].filter((x) => x.startsWith('s:'))) {
      const s = stroke(k.slice(2));
      if (!s) continue;
      const c = { ...clone(s), id: uid('k'), pts: s.pts.map((v, i) => (i % 3 === 2 ? v : v + 28)) };
      data.strokes.push(c);
      next.add(`s:${c.id}`);
    }
    sel = next;
    changed();
    announce('Duplicated');
  }

  function removeSelection() {
    if (!sel.size) return;
    checkpoint();
    const gone = new Set([...sel].filter((k) => !k.startsWith('s:')));
    const now = Date.now();
    for (const o of data.objects) {
      if (o.del) continue;
      if (gone.has(o.id) || (o.type === 'arrow' && (gone.has(o.from?.id) || gone.has(o.to?.id)))) { o.del = true; o.t = now; }
    }
    const deadStrokes = new Set([...sel].filter((k) => k.startsWith('s:')).map((k) => k.slice(2)));
    if (deadStrokes.size) {
      data.strokes = data.strokes.filter((s) => !deadStrokes.has(s.id));
      data.tomb = [...new Set([...data.tomb, ...deadStrokes])];
    }
    const n = sel.size;
    sel.clear();
    changed();
    announce(`${n === 1 ? 'Deleted' : `${n} deleted`}`);
  }

  // ---------- Keyboard and paste ----------
  function onKey(e) {
    if (editing || e.target.closest?.('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 'a') { e.preventDefault(); sel = new Set([...B.live(data).map((o) => o.id), ...data.strokes.map((s) => `s:${s.id}`)]); renderSel(); renderSvg(); return; }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelection(); return; }
    if (e.key === 'Escape') {
      if (tool !== 'select') setTool('select');
      else if (sel.size) { sel.clear(); renderSel(); renderSvg(); }
      return;
    }
    if (e.key === ' ' && !spaceDown) { spaceDown = true; stage.classList.add('space'); e.preventDefault(); return; }
    if (e.key === 'Enter' && sel.size === 1) {
      const o = obj([...sel][0]);
      e.preventDefault();
      if (o?.type === 'card') openNote(o.note);
      else if (o && ['sticky', 'text', 'shape', 'frame'].includes(o.type)) beginEdit(o.id);
      else if (o?.type === 'arrow') arrowLabel(o);
      return;
    }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (nudge && sel.size) {
      e.preventDefault();
      const step = (e.shiftKey ? 40 : 8) / Math.max(z, 0.5);
      const g = { set: null };
      checkpoint();
      g.set = movingSet();
      for (const oid of g.set.ids) { const o = obj(oid); if (o && o.type !== 'arrow') { o.x = Math.round(o.x + nudge[0] * step); o.y = Math.round(o.y + nudge[1] * step); touch(o); } }
      if (g.set.strokesMoving.size) {
        commitMove({ set: g.set, dx: nudge[0] * step, dy: nudge[1] * step });
      } else changed();
      return;
    }
    if (nudge) { e.preventDefault(); tx -= nudge[0] * 60; ty -= nudge[1] * 60; applyView(); return; }
    if (e.key === '+' || e.key === '=') { zoomBy(1.25); return; }
    if (e.key === '-') { zoomBy(0.8); return; }
    if (e.key === '0') { fit({ animate: true }); return; }
    const t = TOOLS.find((x) => x.key === k);
    if (t) { e.preventDefault(); setTool(t.id); }
  }
  const onKeyUp = (e) => { if (e.key === ' ') { spaceDown = false; stage?.classList.remove('space'); } };
  window.addEventListener('keyup', onKeyUp);

  function onPaste(e) {
    if (editing || e.target.closest?.('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addImages(files); return; }
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (!text) return;
    e.preventDefault();
    checkpoint();
    const { w, h } = B.DEFAULTS.sticky;
    const p = placeAt(w, h);
    add({ type: 'sticky', ...p, w, h, color: opts.sticky, text: text.slice(0, 600), rot: 0 });
    changed();
  }

  function announce(msg) {
    const live = $('#bd-live-msg', el) || (() => { const p = document.createElement('p'); p.id = 'bd-live-msg'; p.className = 'sr-only'; p.setAttribute('aria-live', 'polite'); el.querySelector('.bd')?.appendChild(p); return p; })();
    live.textContent = msg;
  }

  // ---------- Board actions ----------
  async function openNote(noteId) {
    await flush();
    ctx.navigate(`#/note/${noteId}`);
  }

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
      const nm = el.querySelector('.bd-name');
      if (nm) nm.textContent = displayTitle(note());
    };
    setTimeout(() => $('#rn-t', s.el)?.select(), 50);
  }

  async function exportMenu() {
    const v = await menuSheet('Export this board', [{ value: 'pdf', label: 'PDF' }, { value: 'png', label: 'Image (PNG)' }]);
    if (v === 'pdf') exportPdf();
    if (v === 'png') exportPng();
  }

  async function exportPng() {
    await flush();
    toast('Drawing the board…');
    try {
      const c = await B.renderBoardCanvas(data, { widthPx: 2400 });
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      downloadBlob(`${displayTitle(note()).replace(/[\\/:*?"<>|]/g, '-')}.png`, blob);
    } catch (e) { console.error(e); toast('Couldn’t draw the board.'); }
  }

  async function exportPdf() {
    await flush();
    toast('Making the PDF…');
    const { exportNotePdf } = await import('../export.js');
    try { await exportNotePdf(note()); } catch (e) { console.error(e); toast('Couldn’t make the PDF.'); }
  }

  async function more() {
    const n = note();
    await flush();
    const act = await menuSheet(displayTitle(n), [
      { value: 'rename', label: 'Rename' },
      { value: 'fit', label: 'Show the whole board' },
      { value: 'notebook', label: n.notebook ? 'Move to another notebook' : 'Move into a notebook' },
      { value: 'history', label: 'Version history' },
      { value: 'pdf', label: 'Export as PDF' },
      { value: 'png', label: 'Export as image' },
      { value: n.sealed ? 'unseal' : 'seal', label: n.sealed ? 'Unseal' : 'Seal this board' },
      { value: 'delete', label: 'Delete board', danger: true },
    ]);
    if (act === 'rename') rename();
    if (act === 'fit') fit({ animate: true });
    if (act === 'pdf') exportPdf();
    if (act === 'png') exportPng();
    if (act === 'history') { const { openHistory } = await import('./history.js'); openHistory(n, ctx, { page: n.pages[0] }); }
    if (act === 'notebook') {
      const dest = await notebookPicker({ title: 'Move to a notebook' });
      if (dest) {
        const nb = state.notebooks.get(dest.notebook);
        await V.saveNote({ ...note(), notebook: dest.notebook, section: dest.section, region: nb?.region || null, inbox: false, parent: null });
        toast(`Moved to ${nb?.title}`);
        draw();
      }
    }
    if (act === 'seal' || act === 'unseal') {
      const sealed = act === 'seal';
      if (V.sealedState() === 'none') { toast('Set up sealed notes in Settings first.'); return; }
      if (V.sealedState() === 'locked') { const ok = await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) }); if (!ok) return; }
      try { await V.setSealed(n.id, sealed); toast(sealed ? 'Sealed' : 'Unsealed'); } catch (e) { toast(e.message); }
    }
    if (act === 'delete') {
      const ok = await confirmSheet({ title: 'Delete this board?', body: 'The notes on it stay; only the board goes. This syncs to your other devices.', confirm: 'Delete', danger: true });
      if (ok) {
        pending = false;
        await V.deleteNote(n.id);
        toast('Deleted');
        ctx.navigate(n.notebook ? `#/notebook/${n.notebook}` : '#/notebooks', { replace: true });
      }
    }
  }

  async function leave() {
    if (editing) endEdit();
    await flush();
    const n = note();
    if (n?.notebook) ctx.navigate(`#/notebook/${n.notebook}`);
    else ctx.back();
  }

  // Throw away a brand-new board that was never used.
  async function discardIfEmpty() {
    const n = note();
    if (!createdHere || !n || !data) return;
    if (!B.live(data).length && !data.strokes.length && n.title.startsWith('Whiteboard, ')) await V.deleteNote(n.id);
  }

  start();

  const onResize = () => { drawOpts(); applyView(); };
  window.addEventListener('resize', onResize);
  const onThemeChange = () => render();
  window.addEventListener('sb-theme', onThemeChange);
  const rerender = debounce(() => { if (!gesture && !editing && !destroyed) render(); }, 250);

  return {
    update(p) {
      if (p.id === id) return;
      flush();
      id = p.id;
      params = p;
      sel.clear();
      undo.length = 0;
      redo.length = 0;
      start();
    },
    onEvent(evt) {
      if (!data || destroyed) return;
      if (evt.type === 'page' && evt.id === pageId && !pending && !gesture && !editing) {
        V.loadPage(pageId).then((d) => {
          if (pending || gesture || editing) return;
          data = clone(d);
          data.objects ||= []; data.strokes ||= []; data.tomb ||= [];
          sel = new Set([...sel].filter((k) => (k.startsWith('s:') ? stroke(k.slice(2)) : obj(k))));
          render();
        }).catch(() => {});
      }
      if ((evt.type === 'note' || evt.type === 'remote') && evt.id !== id && data.objects.some((o) => o.type === 'card' && !o.del)) rerender();
      if (evt.type === 'note' && evt.id === id) { const nm = el.querySelector('.bd-name'); if (nm && note()) nm.textContent = displayTitle(note()); }
    },
    destroy() {
      destroyed = true;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('sb-theme', onThemeChange);
      window.removeEventListener('keyup', onKeyUp);
      if (editing) endEdit();
      flush().then(() => discardIfEmpty());
      document.body.classList.remove('inking', 'boarding');
      leaveNote();
    },
  };
}
