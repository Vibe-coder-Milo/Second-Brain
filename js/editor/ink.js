// The handwriting surface: Apple Pencil (and mouse, or finger when allowed)
// writes; fingers scroll and pinch. Pens, highlighter, eraser, lasso, shapes,
// text boxes, post-its and stickers, with undo.

import { PAGE_W } from '../model.js';
import { fontCss, boxSize, BOX_FONT, BOX_SIZE, TEXT_SIZE } from '../fonts.js';
import { uid, html, raw, toast } from '../util.js';
import { state } from '../vault.js';
import * as V from '../vault.js';
import { pdfTile } from '../pdfview.js';
import { PENS, HL, strokePath, strokeBox, drawStroke, drawPaper, drawContent, fileImage, drawRichText, renderPageCanvas, layerOf, setInkTone, pageDark, darkInk, paperColor } from './inkdraw.js';
import { onTheme } from '../theme.js';
import { getStroke } from '../../vendor/freehand.js';
import { labelDef, POSTIT_COLORS, postitColor, stickerDef } from '../stickers.js';
import { icons } from '../icons.js';
import { compressImage } from '../images.js';

const r2 = (v) => Math.round(v * 100) / 100;
// A pen's smoothing and pressure settings, kept on each stroke it draws.
export const penExtras = (tool, hl = false) => (hl ? {} : { ...(Number.isInteger(tool.smoothing) && tool.smoothing !== 2 ? { sm: tool.smoothing } : {}), ...(tool.pressure === false ? { np: 1 } : {}) });
const MAX_PX = 8_000_000;
// Zoom, against the page fitted to the screen's width.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
let clip = null;

// ---- Shape recognition ------------------------------------------------------------

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function perpDist(p, a, b) {
  const L = dist(a, b);
  if (!L) return dist(p, a);
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
}
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0; let md = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = perpDist(pts[i], pts[0], pts[pts.length - 1]); if (d > md) { md = d; idx = i; } }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
function densify(poly, step = 6) {
  const out = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [a, b] = [poly[i], poly[i + 1]];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, 0.5]);
  }
  const last = poly[poly.length - 1];
  out.push([last[0], last[1], 0.5]);
  return out;
}

// Returns snapped points, or null if it doesn't look like a shape.
export function recognizeShape(pts) {
  if (pts.length < 4) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const diag = Math.hypot(x1 - x0, y1 - y0);
  if (diag < 18) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  // Straight line
  const chord = dist(first, last);
  if (chord > len * 0.9) return { kind: 'line', pts: densify([first, last]) };
  const closed = chord < diag * 0.28;
  if (closed) {
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const rx = (x1 - x0) / 2; const ry = (y1 - y0) / 2;
    let err = 0;
    for (const p of pts) err += Math.abs(Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry) - 1);
    err /= pts.length;
    const poly = simplify(pts, diag * 0.07);
    const corners = poly.length - (dist(poly[0], poly[poly.length - 1]) < diag * 0.3 ? 1 : 0);
    if (err < 0.1 && corners > 4) {
      const out = [];
      for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2 - Math.PI / 2; out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t), 0.5]); }
      return { kind: 'ellipse', pts: out };
    }
    if (corners === 3 || corners === 4) {
      const ring = poly.slice(0, corners);
      // Nearly axis-aligned four-siders become tidy rectangles.
      if (corners === 4) {
        const flat = ring.every((p, i) => { const q = ring[(i + 1) % 4]; const ang = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2); return ang < 0.2 || ang > Math.PI / 2 - 0.2; });
        if (flat) return { kind: 'rect', pts: densify([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]) };
      }
      return { kind: 'polygon', pts: densify([...ring, ring[0]]) };
    }
    if (err < 0.18) {
      const out = [];
      for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2 - Math.PI / 2; out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t), 0.5]); }
      return { kind: 'ellipse', pts: out };
    }
    return null;
  }
  const poly = simplify(pts, diag * 0.06);
  if (poly.length <= 4) return { kind: 'polyline', pts: densify(poly) };
  return null;
}

// ---- Point-in-polygon and hit tests -----------------------------------------------

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const objBox = (o) => (o.type === 'postit' && o.collapsed ? { x: o.x, y: o.y, w: 64, h: 64 } : { x: o.x, y: o.y, w: o.w, h: o.type === 'text' ? (o._h || o.h || 40) : o.h });
function hitObject(o, x, y, pad = 6) {
  const b = objBox(o);
  let px = x; let py = y;
  if (o.rot) {
    const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
    const c = Math.cos(-o.rot); const s = Math.sin(-o.rot);
    px = cx + (x - cx) * c - (y - cy) * s;
    py = cy + (x - cx) * s + (y - cy) * c;
  }
  return px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;
}

// ---- Mine stickers ----------------------------------------------------------------

export async function makePhotoSticker(file) {
  try {
    const img = await compressImage(file, { max: 640, quality: 0.88 });
    const fileId = await V.addFile(img.bytes, { type: 'image/jpeg' });
    const id = uid('m');
    await V.saveConfig({ myStickers: [...(state.config.myStickers || []), { id, fileId, w: img.w, h: img.h, kind: 'photo', name: file.name || 'Photo' }] });
    toast('Added to your stickers');
    return id;
  } catch {
    toast('Couldn’t make a sticker from that photo.');
    return null;
  }
}

// ---- The surface ------------------------------------------------------------------

export class InkSurface {
  constructor(host, opts) {
    this.host = host;
    this.opts = opts; // { getTool, onChange, onSelection, onTextEditing, onZoom, readOnly }
    this.zoom = 1;
    this.page = null;
    this.data = null;
    this.undoStack = [];
    this.redoStack = [];
    this.sel = null;
    this.editing = null;
    this.drawing = null;
    this.penSeen = false;
    this.layers = { hidden: new Set(), locked: new Set(), active: 'ink', paperHidden: false, names: {} };
    host.innerHTML = `<div class="ink-scroll"><div class="ink-page"><canvas class="ink-bg"></canvas><canvas class="ink-main"></canvas><canvas class="ink-wet"></canvas><canvas class="ink-laser" aria-hidden="true"></canvas><div class="ink-overlay"></div></div></div>`;
    this.scroll = host.querySelector('.ink-scroll');
    this.pageEl = host.querySelector('.ink-page');
    this.bg = host.querySelector('.ink-bg');
    this.main = host.querySelector('.ink-main');
    this.wet = host.querySelector('.ink-wet');
    this.laser = host.querySelector('.ink-laser');
    this.lasers = [];
    this.overlay = host.querySelector('.ink-overlay');
    this.raf = 0;
    this.view = { x: 0, y: 0, w: 1, h: 1 };
    this.bind();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.scroll);
    // Dark mode switched on or off: redraw in the new colours.
    this.offTheme = onTheme(() => { if (this.page) this.layout(); });
    // Only the part of the page near the screen has canvas pixels, so long
    // pages and deep zoom stay sharp. Scrolling moves that window along.
    this.onScroll = () => {
      if (this.scrollRaf) return;
      this.scrollRaf = requestAnimationFrame(() => {
        this.scrollRaf = 0;
        if (!this.page || this.viewCovers()) return;
        this.placeCanvases();
        this.renderNow();
      });
    };
    this.scroll.addEventListener('scroll', this.onScroll, { passive: true });
  }

  // ---------- Page ----------
  setPage(page, data, { keepScroll = false } = {}) {
    this.endEdit();
    this.clearSelection();
    this.page = page;
    this.data = { ...data, strokes: [...(data.strokes || [])], objects: [...(data.objects || [])], tomb: [...(data.tomb || [])] };
    this.undoStack = [];
    this.redoStack = [];
    this.layout();
    if (!keepScroll) this.scroll.scrollTop = 0;
  }
  replaceData(data) {
    // A newer copy arrived from another device while this page is open.
    this.data = { ...data, strokes: [...(data.strokes || [])], objects: [...(data.objects || [])], tomb: [...(data.tomb || [])] };
    this.render();
  }

  // ---------- Layers ----------
  setLayers(ls) {
    const key = (l) => JSON.stringify([[...(l.hidden || [])].sort(), [...(l.locked || [])].sort(), !!l.paperHidden]);
    const same = this.layers && key(this.layers) === key({ hidden: new Set(), locked: new Set(), ...ls });
    this.layers = { hidden: new Set(), locked: new Set(), active: 'ink', paperHidden: false, names: {}, ...ls };
    // Saving the note calls this too; only redraw (and drop the selection)
    // when what's shown or locked actually changed.
    if (same) return;
    const hidden = this.layers.hidden;
    this.visible = hidden.size ? (it) => !hidden.has(layerOf(it)) : null;
    if (this.sel && this.drawing?.kind !== 'move') this.clearSelection();
    this.render();
  }
  // Can this stroke or object be erased, selected or edited right now?
  editable(it) {
    const l = layerOf(it);
    return !this.layers.hidden.has(l) && !this.layers.locked.has(l);
  }
  // Why writing is blocked on the current layer, or null.
  writeBlocked() {
    const a = this.layers.active;
    const name = this.layers.names?.[a] || 'This layer';
    if (this.layers.hidden.has(a)) return `${name} is hidden. Show it, or pick another layer to write on.`;
    if (this.layers.locked.has(a)) return `${name} is locked. Unlock it, or pick another layer to write on.`;
    return null;
  }
  stamp(it, isHl = false) {
    const a = this.layers.active || 'ink';
    if (a === 'ink' || (a === 'hl' && isHl)) return it;
    return { ...it, l: a };
  }

  // ---------- Writing window ----------
  // The dashed box on the page that the writing window writes into.
  setZoomBox(b) {
    this.zbox = b;
    this.drawZoomBox();
  }
  drawZoomBox() {
    let el = this.overlay.querySelector('.zbox');
    if (!this.zbox || !this.page) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'zbox';
      el.setAttribute('aria-hidden', 'true');
      this.overlay.appendChild(el);
      // Drag the box to write somewhere else.
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const sx = e.clientX; const sy = e.clientY;
        const b0 = { ...this.zbox };
        const mv = (ev) => {
          const nb = { ...b0, x: b0.x + (ev.clientX - sx) / this.scale, y: b0.y + (ev.clientY - sy) / this.scale };
          this.zbox = nb;
          this.drawZoomBox();
        };
        const upf = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', upf); this.onZoomBoxMove?.(this.zbox); };
        el.addEventListener('pointermove', mv);
        el.addEventListener('pointerup', upf);
      });
    }
    const s = this.scale;
    const b = this.zbox;
    Object.assign(el.style, { left: `${b.x * s}px`, top: `${b.y * s}px`, width: `${b.w * s}px`, height: `${b.h * s}px` });
  }
  revealBox(b) {
    const s = this.scale;
    const sc = this.scroll;
    const top = this.pageEl.offsetTop + b.y * s;
    const bottom = top + b.h * s;
    if (top < sc.scrollTop + 40 || bottom > sc.scrollTop + sc.clientHeight - 40) sc.scrollTo({ top: Math.max(0, top - sc.clientHeight * 0.35), behavior: 'smooth' });
    const left = this.pageEl.offsetLeft + b.x * s;
    const right = left + b.w * s;
    if (left < sc.scrollLeft || right > sc.scrollLeft + sc.clientWidth) sc.scrollTo({ left: Math.max(0, left - 20), behavior: 'smooth' });
  }
  // A stroke written somewhere else (the writing window) lands on this page.
  addStroke(s) {
    const blocked = this.writeBlocked();
    if (blocked) { toast(blocked); return; }
    this.snapshot();
    this.data.strokes.push(this.stamp(s, s.t === 'hl'));
    this.renderMain();
    this.changed();
  }
  beginExternalErase() { this.snapshot(); this.drawing = { pointerId: -1, kind: 'erase', any: false }; }
  endExternalErase() {
    const d = this.drawing;
    this.drawing = null;
    if (d?.any) this.changed(); else this.undoStack.pop();
    const w = this.ctxFor(this.wet);
    w.clearRect(0, 0, PAGE_W, this.page?.h || 2000);
  }

  get baseWidth() {
    const w = this.scroll.clientWidth;
    const pad = w > 700 ? 48 : 16;
    // With the side panel hidden (focus), the page can grow bigger.
    const cap = document.body.classList.contains('focus') ? 1240 : 900;
    return Math.max(280, Math.min(w - pad, cap));
  }
  get scale() { return (this.baseWidth * this.zoom) / PAGE_W; }

  // The window of the page (in screen pixels from its top left) to draw:
  // what's visible plus a margin either side.
  wantedView() {
    const s = this.scale;
    const W = Math.round(PAGE_W * s);
    const Hh = Math.round(this.page.h * s);
    const sc = this.scroll;
    const vw = sc.clientWidth || W;
    const vh = sc.clientHeight || Hh;
    const visL = sc.scrollLeft - this.pageEl.offsetLeft;
    const visT = sc.scrollTop - this.pageEl.offsetTop;
    const mx = vw * 0.25;
    const my = vh * 0.5;
    const x0 = Math.max(0, Math.floor(visL - mx));
    const y0 = Math.max(0, Math.floor(visT - my));
    const x1 = Math.min(W, Math.ceil(visL + vw + mx));
    const y1 = Math.min(Hh, Math.ceil(visT + vh + my));
    if (x1 - x0 < 2 || y1 - y0 < 2) return { x: 0, y: 0, w: Math.min(W, vw), h: Math.min(Hh, vh) };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // Is everything on screen inside the drawn window?
  viewCovers() {
    const v = this.view;
    const sc = this.scroll;
    const s = this.scale;
    const visL = Math.max(0, sc.scrollLeft - this.pageEl.offsetLeft);
    const visT = Math.max(0, sc.scrollTop - this.pageEl.offsetTop);
    const visR = Math.min(PAGE_W * s, sc.scrollLeft - this.pageEl.offsetLeft + sc.clientWidth);
    const visB = Math.min(this.page.h * s, sc.scrollTop - this.pageEl.offsetTop + sc.clientHeight);
    if (visR <= visL || visB <= visT) return true; // page not on screen
    return visL >= v.x && visT >= v.y && visR <= v.x + v.w && visB <= v.y + v.h;
  }
  placeCanvases() {
    const v = this.wantedView();
    this.view = v;
    let dpr = window.devicePixelRatio || 1;
    if (v.w * v.h * dpr * dpr > MAX_PX) dpr = Math.sqrt(MAX_PX / (v.w * v.h));
    this.dpr = dpr;
    for (const c of [this.bg, this.main, this.wet, this.laser]) {
      c.width = Math.max(1, Math.round(v.w * dpr));
      c.height = Math.max(1, Math.round(v.h * dpr));
      Object.assign(c.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${v.w}px`, height: `${v.h}px` });
    }
  }
  // The drawn window in page units (for skipping what's off screen).
  get area() {
    const s = this.scale;
    return { x: this.view.x / s, y: this.view.y / s, w: this.view.w / s, h: this.view.h / s };
  }

  layout() {
    if (!this.page) return;
    // In the continuous view the other pages resize first, so this page's
    // place on screen is right when its canvases are placed.
    this.opts.onLayout?.();
    const s = this.scale;
    const w = Math.round(PAGE_W * s);
    const h = Math.round(this.page.h * s);
    this.pageEl.style.width = `${w}px`;
    this.pageEl.style.height = `${h}px`;
    this.overlay.style.setProperty('--u', String(s));
    this.placeCanvases();
    this.render();
    this.positionEditor();
    this.drawSelection();
    this.drawZoomBox();
  }

  ctxFor(c) {
    const ctx = c.getContext('2d');
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, -this.view.x * this.dpr, -this.view.y * this.dpr);
    return ctx;
  }

  render() {
    if (!this.page) return;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.renderNow());
  }
  renderNow() {
    if (!this.page) return;
    cancelAnimationFrame(this.raf);
    const bgImg = this.page.bg ? fileImage(this.page.bg, () => this.render()) : null;
    const b = this.ctxFor(this.bg);
    b.clearRect(0, 0, PAGE_W, this.page.h);
    this.dark = pageDark(this.page);
    this.host.classList.toggle('paper-dark', this.dark);
    setInkTone(this.dark);
    this.pageEl.style.background = this.page.bg ? '#FFFFFF' : paperColor(this.page).bg;
    if (this.layers.paperHidden) drawPaper(b, { ...this.page, paper: 'blank', bg: null }, this.scale, null, this.area);
    else {
      // A page from a PDF: the part on screen, drawn from the PDF at this size.
      const sharp = this.page.pdf ? pdfTile(this.page.pdf, this.scale * this.dpr, this.area, () => this.render()) : null;
      drawPaper(b, this.page, this.scale, bgImg, this.area, sharp);
    }
    this.renderMain();
    if (this.drawing?.kind === 'stroke') this.drawWet();
  }

  renderMain() {
    setInkTone(this.dark);
    const m = this.ctxFor(this.main);
    m.clearRect(0, 0, PAGE_W, this.page.h);
    const skip = new Set();
    if (this.editing) skip.add(this.editing.id);
    if (this.sel?.moving) for (const id of this.sel.objects) skip.add(id);
    drawContent(m, this.data, { redraw: () => this.renderMainSoon(), skip, hidden: this.sel?.moving ? this.sel.strokes : null, dim: this.dim, visible: this.visible, area: this.area });
    // Text boxes report their laid-out height; keep it for hit testing.
    for (const o of this.data.objects) if (o.type === 'text' && o._h) o.h = o._h;
  }
  renderMainSoon() { cancelAnimationFrame(this.raf2); this.raf2 = requestAnimationFrame(() => this.renderMain()); }

  // ---------- History ----------
  snapshot() {
    this.undoStack.push({ strokes: this.data.strokes.slice(), objects: structuredClone(this.data.objects.map(strip)), tomb: this.data.tomb.slice() });
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = [];
  }
  restore(from, to) {
    const snap = from.pop();
    if (!snap) return;
    to.push({ strokes: this.data.strokes.slice(), objects: structuredClone(this.data.objects.map(strip)), tomb: this.data.tomb.slice() });
    // Anything that comes back from undo gets a fresh place in sync's memory.
    const alive = new Set([...snap.strokes.map((s) => s.id), ...snap.objects.map((o) => o.id)]);
    const tomb = [...new Set([...this.data.tomb, ...this.data.strokes.map((s) => s.id).filter((x) => !alive.has(x)), ...this.data.objects.map((o) => o.id).filter((x) => !alive.has(x))])].filter((x) => !alive.has(x));
    const now = Date.now();
    this.data = { ...this.data, strokes: snap.strokes, objects: snap.objects.map((o) => ({ ...o, t: now })), tomb };
    this.endEdit(false);
    this.clearSelection();
    this.render();
    this.changed();
  }
  undo() { this.restore(this.undoStack, this.redoStack); }
  redo() { this.restore(this.redoStack, this.undoStack); }

  changed() { this.opts.onChange?.(this.data); }

  // ---------- Input ----------
  toPage(e) {
    const r = this.pageEl.getBoundingClientRect();
    const s = this.scale;
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
  }

  bind() {
    const el = this.pageEl;
    const fingerDraws = () => (!!this.opts.getTool().fingerDraw || this.opts.getTool().tool === 'laser') && !this.penSeen;
    const moving = () => this.opts.getTool().tool === 'move';
    const updateTouchAction = () => {
      el.style.touchAction = fingerDraws() || this.drawing || moving() ? 'none' : 'pan-x pan-y';
      this.scroll.style.setProperty('--page-touch', el.style.touchAction);
    };
    this.updateTouchAction = updateTouchAction;
    updateTouchAction();

    // Stop the Pencil from scrolling the page; fingers still scroll.
    const blockStylus = (e) => {
      if (this.opts.readOnly) return;
      const stylus = [...e.touches].some((t) => t.touchType === 'stylus');
      if (stylus || ((fingerDraws() || moving()) && e.touches.length === 1 && !e.target.closest('.tb-edit, .postit-edit, .sel-bar'))) e.preventDefault();
    };
    el.addEventListener('touchstart', blockStylus, { passive: false });
    el.addEventListener('touchmove', blockStylus, { passive: false });

    // Which kind of pointer each one is (a finger, the Pencil, a mouse).
    this.ptypes = new Map();
    el.addEventListener('pointerdown', (e) => { this.ptypes.set(e.pointerId, e.pointerType); if (this.ptypes.size > 20) this.ptypes.delete(this.ptypes.keys().next().value); this.down(e); });
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));

    // Pinch with two fingers: the page grows around your fingers and follows
    // them as they move (like Photos). Ctrl/cmd + scroll wheel (and a
    // trackpad pinch) zooms around the pointer.
    this.bindPinch();
  }

  // ---------- Zoom ----------
  // The element that grows with a pinch (all pages in the continuous view).
  get zoomEl() { return this.zoomTarget || this.pageEl; }
  // What's under a point on screen: the page (or the continuous view's page
  // slot) and where on it, as fractions, so it can be put back under the
  // fingers after the zoom.
  anchorAt(cx, cy) {
    let el = this.pageEl;
    if (this.zoomTarget) {
      const slots = [...this.zoomTarget.querySelectorAll(':scope > .ink-slot')];
      let best = null;
      let bd = Infinity;
      for (const sl of slots) {
        const r = sl.getBoundingClientRect();
        const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
        if (d < bd) { bd = d; best = sl; }
        if (d === 0) break;
      }
      if (best) el = best;
    }
    const r = el.getBoundingClientRect();
    return { el, fx: (cx - r.left) / Math.max(1, r.width), fy: (cy - r.top) / Math.max(1, r.height) };
  }
  // Set the zoom so the spot that was under `from` (screen point, or the
  // anchor from anchorAt) ends up under `to`. Without a point: the middle.
  setZoom(z, at = null, to = null) {
    const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const sc = this.scroll;
    const sr = sc.getBoundingClientRect();
    const from = at || { x: sr.left + sc.clientWidth / 2, y: sr.top + sc.clientHeight / 2 };
    const anchor = from.el ? from : this.anchorAt(from.x, from.y);
    const dest = to || (from.el ? null : from) || { x: sr.left + sc.clientWidth / 2, y: sr.top + sc.clientHeight / 2 };
    const changed = Math.abs(nz - this.zoom) >= 0.005;
    this.zoom = nz;
    // The continuous view keeps its own place on resize; here the fingers decide.
    this.zoomAnchored = true;
    if (changed) this.layout();
    this.zoomAnchored = false;
    const r = anchor.el.getBoundingClientRect();
    sc.scrollLeft += r.left + anchor.fx * r.width - dest.x;
    sc.scrollTop += r.top + anchor.fy * r.height - dest.y;
    if (changed) this.opts.onZoom?.(nz);
    this.showZoom();
  }
  // A small "150%" while zooming; tap it to fit the page to the screen again.
  showZoom(z = this.zoom) {
    let pill = this.host.querySelector('.zoom-pill');
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'zoom-pill';
      pill.addEventListener('click', () => this.setZoom(1));
      this.host.appendChild(pill);
    }
    const pct = Math.round(z * 100);
    pill.textContent = `${pct}%`;
    pill.setAttribute('aria-label', pct === 100 ? 'Zoom 100%' : `Zoom ${pct}%. Tap to fit the page`);
    pill.classList.add('on');
    clearTimeout(this.pillTimer);
    if (pct !== 100) this.pillTimer = setTimeout(() => pill.classList.remove('on'), 2500);
    else this.pillTimer = setTimeout(() => pill.classList.remove('on'), 900);
  }

  bindPinch() {
    const sc = this.scroll;
    const fingers = (e) => [...e.touches].filter((t) => t.touchType !== 'stylus');
    const mid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    const gap = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    let p = null; // the pinch in progress
    const start = (e) => {
      const f = fingers(e);
      if (f.length !== 2 || [...e.touches].some((t) => t.touchType === 'stylus')) return;
      // A finger stroke or drag the first finger started gives way to the pinch.
      if (this.drawing) this.dropFingerAction();
      this.tap = null;
      const m = mid(f[0], f[1]);
      const t = this.zoomEl;
      const tr = t.getBoundingClientRect();
      p = { d0: Math.max(10, gap(f[0], f[1])), m0: m, m, z0: this.zoom, z: this.zoom, anchor: this.anchorAt(m.x, m.y), sl0: sc.scrollLeft, st0: sc.scrollTop };
      t.style.transformOrigin = `${m.x - tr.left}px ${m.y - tr.top}px`;
      t.style.willChange = 'transform';
      e.preventDefault();
    };
    const move = (e) => {
      if (!p) return;
      const f = fingers(e);
      if (f.length < 2) return;
      e.preventDefault();
      p.m = mid(f[0], f[1]);
      p.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, p.z0 * gap(f[0], f[1]) / p.d0));
      if (p.raf) return;
      p.raf = requestAnimationFrame(() => {
        if (!p) return;
        p.raf = 0;
        // Whatever the browser scrolled meanwhile is undone by the translate.
        const tx = p.m.x - p.m0.x + (sc.scrollLeft - p.sl0);
        const ty = p.m.y - p.m0.y + (sc.scrollTop - p.st0);
        this.zoomEl.style.transform = `translate(${tx}px, ${ty}px) scale(${p.z / p.z0})`;
        this.showZoom(p.z);
      });
    };
    const end = (e) => {
      if (!p || fingers(e).length >= 2) return;
      const q = p;
      p = null;
      cancelAnimationFrame(q.raf);
      const t = this.zoomEl;
      t.style.transform = '';
      t.style.transformOrigin = '';
      t.style.willChange = '';
      this.setZoom(q.z, q.anchor, q.m);
    };
    sc.addEventListener('touchstart', start, { passive: false });
    sc.addEventListener('touchmove', move, { passive: false });
    sc.addEventListener('touchend', end);
    sc.addEventListener('touchcancel', end);
    // Safari's own page zoom stays off; the pinch above does the zooming.
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) sc.addEventListener(ev, (e) => e.preventDefault());
    // Ctrl/cmd + wheel, and trackpad pinches (which arrive as ctrl + wheel).
    let wz = null;
    sc.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const k = Math.exp(-Math.max(-100, Math.min(100, dy)) * 0.002);
      if (!wz) wz = { z: this.zoom, at: { x: e.clientX, y: e.clientY } };
      wz.z *= k;
      wz.at = { x: e.clientX, y: e.clientY };
      if (wz.raf) return;
      wz.raf = requestAnimationFrame(() => { const w = wz; wz = null; this.setZoom(w.z, w.at); });
    }, { passive: false });
  }
  // Drop what a single finger was doing (writing with a finger, dragging the
  // page) when a second finger lands to pinch.
  dropFingerAction() {
    const d = this.drawing;
    if (!d) return;
    // The Pencil (or a mouse) keeps going; only a finger's action gives way.
    if (d.pointerId === -1 || this.ptypes.get(d.pointerId) !== 'touch') return;
    clearTimeout(this.holdTimer);
    this.drawing = null;
    if (d.kind === 'erase') { if (d.any) this.undo(); else this.undoStack.pop(); }
    if (d.kind === 'move') this.endMove(d);
    if (d.kind === 'laser') d.trail.end = performance.now();
    this.clearWet();
    this.updateTouchAction();
  }

  isDrawPointer(e) {
    if (e.pointerType === 'pen') { if (!this.penSeen) { this.penSeen = true; this.updateTouchAction(); } return true; }
    if (e.pointerType === 'mouse') return e.button === 0;
    const t = this.opts.getTool();
    return (!!t.fingerDraw || t.tool === 'laser') && !this.penSeen;
  }

  // Replay mode: writing after the playback point fades, and a tap on writing
  // reports where it is so the audio can jump there.
  setReplay(dim, onTap) {
    this.dim = dim;
    this.replayTap = onTap;
    this.endEdit();
    this.clearSelection();
    this.renderMain();
  }

  strokeNear(x, y, r = 14) {
    let best = null;
    let bd = Infinity;
    for (const s of this.data.strokes) {
      const b = strokeBox(s);
      if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
      for (let i = 0; i < s.pts.length; i += 3) {
        const d = Math.hypot(s.pts[i] - x, s.pts[i + 1] - y);
        if (d < bd) { bd = d; best = s; }
      }
    }
    if (best && bd <= r + best.s) return best;
    const o = this.objectAt(x, y);
    return o || null;
  }

  down(e) {
    if (this.replayTap) {
      const [x, y] = this.toPage(e);
      if (e.pointerType === 'touch' && !this.opts.getTool().fingerDraw) { this.tap = { x, y, t: Date.now(), cx: e.clientX, cy: e.clientY, id: e.pointerId, replay: true }; return; }
      this.replayTap(x, y);
      return;
    }
    if (!this.page || this.opts.readOnly) return;
    if (e.target.closest('.tb-edit, .postit-edit, .sel-bar, .sel-handle, .zbox')) return;
    const tool = this.opts.getTool();
    const [x, y] = this.toPage(e);
    // Palm rejection: while the Pencil is down, other touches are ignored.
    if (this.drawing && this.drawing.pointerId !== e.pointerId) return;
    if (e.pointerType === 'pen' && !this.penSeen) { this.penSeen = true; this.updateTouchAction(); }

    // Move: press on anything to drag it there and then; on bare paper, drag to scroll.
    if (tool.tool === 'move') {
      if (e.button > 0) return;
      e.preventDefault();
      this.pageEl.setPointerCapture?.(e.pointerId);
      if (this.editing) this.endEdit();
      const o = this.objectAt(x, y);
      // Keep dragging what's selected, unless you pressed on something else.
      if (this.sel && this.inSelection(x, y) && (!o || this.sel.objects.has(o.id))) { this.startMove(e, x, y, 'move'); return; }
      const st = o ? null : this.strokeAt(x, y);
      if (o || st) {
        this.select(st ? new Set([st.id]) : new Set(), o ? new Set([o.id]) : new Set());
        this.startMove(e, x, y, 'move');
        return;
      }
      if (this.sel) this.clearSelection();
      this.drawing = { pointerId: e.pointerId, kind: 'pan', sx: e.clientX, sy: e.clientY, st: this.scroll.scrollTop, sl: this.scroll.scrollLeft };
      return;
    }
    const drawPtr = this.isDrawPointer(e);

    // Dragging the current selection, with a finger or with the lasso.
    if (this.sel && this.inSelection(x, y) && !(drawPtr && ['pen', 'hl', 'eraser', 'shapes', 'laser'].includes(tool.tool))) {
      e.preventDefault();
      this.pageEl.setPointerCapture?.(e.pointerId);
      this.startMove(e, x, y, 'move');
      return;
    }

    // Fingers (when they don't draw) tap objects: edit text and post-its, select the rest.
    if (!drawPtr) {
      this.tap = { x, y, t: Date.now(), cx: e.clientX, cy: e.clientY, id: e.pointerId };
      return;
    }
    if (this.editing) { this.endEdit(); if (tool.tool !== 'text') return; }
    if (this.sel) this.clearSelection();

    e.preventDefault();
    this.pageEl.setPointerCapture?.(e.pointerId);
    const pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
    const t = tool.tool;
    if (t === 'laser') { this.laserDown(e, x, y); return; }
    if (['pen', 'shapes', 'hl', 'text'].includes(t) && this.writeBlocked()) { toast(this.writeBlocked()); return; }
    if (t === 'pen' || t === 'shapes' || t === 'hl') {
      const hl = t === 'hl';
      this.drawing = {
        pointerId: e.pointerId, kind: 'stroke', t0: Date.now(),
        stroke: { id: uid('k'), at: Date.now(), t: hl ? 'hl' : 'pen', pen: hl ? null : tool.pen, c: hl ? tool.hlColor : tool.color, s: hl ? tool.hlSize : tool.size, sp: e.pointerType === 'pen' ? 0 : 1, pts: [], ...penExtras(tool, hl) },
        pts: [[x, y, pr]], last: [x, y], still: Date.now(), shapes: t === 'shapes',
      };
      this.armHold();
      this.drawWet();
    } else if (t === 'eraser') {
      this.snapshot();
      this.drawing = { pointerId: e.pointerId, kind: 'erase', any: false };
      this.eraseAt(x, y, tool);
    } else if (t === 'lasso') {
      this.drawing = { pointerId: e.pointerId, kind: 'lasso', poly: [[x, y]], t0: Date.now() };
    } else if (t === 'text') {
      this.drawing = { pointerId: e.pointerId, kind: 'tap', x, y };
    } else if (t === 'hand') {
      this.drawing = { pointerId: e.pointerId, kind: 'pan', sx: e.clientX, sy: e.clientY, st: this.scroll.scrollTop, sl: this.scroll.scrollLeft };
    }
    this.updateTouchAction();
  }

  move(e) {
    const d = this.drawing;
    if (!d || d.pointerId !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (d.kind === 'stroke') {
      if (d.snapped) return;
      for (const ev of (evs.length ? evs : [e])) {
        const [x, y] = this.toPage(ev);
        const pr = ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5;
        if (dist([x, y], d.pts[d.pts.length - 1]) < 0.4) continue;
        d.pts.push([x, y, pr]);
        if (dist([x, y], d.last) > 2.5 / this.scale) { d.last = [x, y]; d.still = Date.now(); this.armHold(); }
      }
      this.drawWet();
    } else if (d.kind === 'laser') {
      const now = performance.now();
      for (const ev of (evs.length ? evs : [e])) d.trail.pts.push([...this.toPage(ev), now]);
      this.laserLoop();
    } else if (d.kind === 'erase') {
      const tool = this.opts.getTool();
      for (const ev of (evs.length ? evs : [e])) { const [x, y] = this.toPage(ev); this.eraseAt(x, y, tool); }
    } else if (d.kind === 'lasso') {
      for (const ev of (evs.length ? evs : [e])) d.poly.push(this.toPage(ev));
      this.drawLasso();
    } else if (d.kind === 'move') {
      const [x, y] = this.toPage(e);
      this.dragMove(x, y);
    } else if (d.kind === 'pan') {
      this.scroll.scrollTop = d.st - (e.clientY - d.sy);
      this.scroll.scrollLeft = d.sl - (e.clientX - d.sx);
    }
  }

  up(e) {
    if (this.tap && this.tap.id === e.pointerId) {
      const moved = Math.hypot(e.clientX - this.tap.cx, e.clientY - this.tap.cy);
      const t = this.tap;
      this.tap = null;
      if (moved < 8 && Date.now() - t.t < 450) { if (t.replay) this.replayTap?.(t.x, t.y); else this.tapAt(t.x, t.y, { finger: true }); }
      return;
    }
    const d = this.drawing;
    if (!d || d.pointerId !== e.pointerId) return;
    clearTimeout(this.holdTimer);
    this.drawing = null;
    this.updateTouchAction();
    if (d.kind === 'laser') { d.trail.end = performance.now(); this.laserLoop(); return; }
    if (d.kind === 'stroke') this.commitStroke(d);
    else if (d.kind === 'erase') { if (d.any) this.changed(); else this.undoStack.pop(); }
    else if (d.kind === 'lasso') this.finishLasso(d);
    else if (d.kind === 'move') this.endMove(d);
    else if (d.kind === 'tap') this.tapAt(d.x, d.y, { tool: 'text' });
    this.clearWet();
  }

  cancel(e) {
    if (this.tap?.id === e.pointerId) this.tap = null;
    const d = this.drawing;
    if (!d || d.pointerId !== e.pointerId) return;
    // A cancelled Pencil stroke still counts; the system sometimes cancels at the end.
    if (d.kind === 'stroke' && d.pts.length > 2) { this.up(e); return; }
    clearTimeout(this.holdTimer);
    this.drawing = null;
    this.updateTouchAction();
    if (d.kind === 'laser') { d.trail.end = performance.now(); return; }
    if (d.kind === 'move') this.endMove(d);
    this.clearWet();
  }

  // ---------- Laser pointer ----------
  // A glowing line to point things out while you talk. It isn't saved: the
  // tail fades as you go, and the whole line a moment after you lift.
  laserDown(e, x, y) {
    const trail = { pts: [[x, y, performance.now()]], end: null };
    this.lasers.push(trail);
    this.drawing = { pointerId: e.pointerId, kind: 'laser', trail };
    this.laserLoop();
  }
  laserLoop() {
    if (this.laserRaf) return;
    const frame = () => {
      this.laserRaf = 0;
      if (!this.page) return;
      const now = performance.now();
      const HOLD = 1400; // after lifting, stays this long
      const FADE = 700; // then fades over this long
      const TAIL = 3000; // while drawing, older parts of the line fade
      const c = this.ctxFor(this.laser);
      c.clearRect(0, 0, PAGE_W, this.page.h);
      this.lasers = this.lasers.filter((tr) => !tr.end || now - tr.end < HOLD + FADE);
      const k = this.dpr || 1;
      for (const tr of this.lasers) {
        const life = tr.end ? Math.max(0, Math.min(1, 1 - (now - tr.end - HOLD) / FADE)) : 1;
        const p = tr.pts;
        if (!p.length) continue;
        c.save();
        c.lineCap = 'round';
        c.lineJoin = 'round';
        const seg = (core) => {
          for (let i = 1; i < p.length; i++) {
            const age = tr.end ? 0 : now - p[i][2];
            const a = life * (age > TAIL ? Math.max(0, 1 - (age - TAIL) / 900) : 1);
            if (a <= 0.01) continue;
            c.globalAlpha = a;
            c.beginPath();
            c.moveTo(p[i - 1][0], p[i - 1][1]);
            c.lineTo(p[i][0], p[i][1]);
            c.stroke();
          }
          if (p.length === 1) { c.globalAlpha = life; c.beginPath(); c.arc(p[0][0], p[0][1], core ? 1.2 : 3.2, 0, 6.3); c.fill(); }
        };
        // Red glow, then a bright core.
        c.shadowColor = 'rgba(255, 40, 40, 0.95)';
        c.shadowBlur = 14 * k;
        c.strokeStyle = c.fillStyle = '#FF3B30';
        c.lineWidth = 5.5;
        seg(false);
        c.shadowBlur = 0;
        c.strokeStyle = c.fillStyle = '#FFE1DE';
        c.lineWidth = 1.8;
        seg(true);
        c.restore();
      }
      if (this.lasers.length) this.laserRaf = requestAnimationFrame(frame);
    };
    this.laserRaf = requestAnimationFrame(frame);
  }

  // ---------- Strokes ----------
  armHold() {
    clearTimeout(this.holdTimer);
    const d = this.drawing;
    if (!d || d.kind !== 'stroke' || d.stroke.t === 'hl' && false) return;
    this.holdTimer = setTimeout(() => {
      if (this.drawing !== d || d.snapped || d.pts.length < 6) return;
      const sh = recognizeShape(d.pts);
      if (sh) { d.pts = sh.pts; d.snapped = sh.kind; this.drawWet(); }
    }, 480);
  }

  wetStroke(d) {
    const s = { ...d.stroke, pts: d.pts.flat().map(r2) };
    if (d.snapped) { s.shape = d.snapped; s.sp = 0; }
    return s;
  }

  drawWet() {
    const d = this.drawing;
    const w = this.ctxFor(this.wet);
    w.clearRect(0, 0, PAGE_W, this.page.h);
    if (!d || d.kind !== 'stroke') return;
    setInkTone(this.dark);
    const s = this.wetStroke(d);
    if (s.t === 'hl') {
      w.save();
      w.globalAlpha = this.dark ? HL.alphaDark : HL.alpha;
      w.fillStyle = this.dark ? darkInk(s.c) : s.c;
      const outline = getStroke(d.pts, { size: s.s, thinning: 0, smoothing: 0.5, streamline: 0.55, simulatePressure: false, last: false });
      const p = new Path2D();
      if (outline.length) { p.moveTo(outline[0][0], outline[0][1]); for (const q of outline) p.lineTo(q[0], q[1]); p.closePath(); }
      w.fill(p);
      w.restore();
    } else drawStroke(w, s);
  }
  clearWet() { const w = this.ctxFor(this.wet); w.clearRect(0, 0, PAGE_W, this.page?.h || 2000); this.drawSelection(); }

  commitStroke(d) {
    let pts = d.pts;
    let shape = d.snapped || null;
    if (d.shapes && !shape) {
      const sh = recognizeShape(pts);
      if (sh) { pts = sh.pts; shape = sh.kind; }
    }
    // Highlighter lines snap straight when nearly straight.
    if (d.stroke.t === 'hl' && !shape && pts.length > 3) {
      const a = pts[0]; const b = pts[pts.length - 1];
      if (Math.abs(a[1] - b[1]) < 14 && Math.max(...pts.map((p) => Math.abs(p[1] - a[1]))) < 16) { pts = densify([a, [b[0], a[1]]]); shape = 'line'; }
    }
    let s = { ...d.stroke, pts: pts.flat().map(r2) };
    if (shape) { s.shape = shape; s.sp = 0; }
    s = this.stamp(s, s.t === 'hl');
    this.snapshot();
    this.data.strokes.push(s);
    this.renderMain();
    this.changed();
  }

  eraseAt(x, y, tool) {
    const r = (tool.eraserSize || 14) / 2;
    const hlOnly = !!tool.hlOnly;
    const precise = tool.eraserMode === 'precise';
    let changed = false;
    const next = [];
    for (const s of this.data.strokes) {
      if ((hlOnly && s.t !== 'hl') || !this.editable(s)) { next.push(s); continue; }
      const b = strokeBox(s);
      if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) { next.push(s); continue; }
      const rr = r + s.s / 2;
      let hit = false;
      for (let i = 0; i < s.pts.length; i += 3) if (Math.hypot(s.pts[i] - x, s.pts[i + 1] - y) <= rr) { hit = true; break; }
      if (!hit) { next.push(s); continue; }
      changed = true;
      this.data.tomb.push(s.id);
      if (!precise) continue;
      // Keep the parts of the stroke outside the eraser.
      let seg = [];
      const flush = () => { if (seg.length >= 6) next.push({ ...s, id: uid('k'), pts: seg }); seg = []; };
      for (let i = 0; i < s.pts.length; i += 3) {
        if (Math.hypot(s.pts[i] - x, s.pts[i + 1] - y) <= rr) flush();
        else seg.push(s.pts[i], s.pts[i + 1], s.pts[i + 2]);
      }
      flush();
    }
    if (changed) {
      this.data.strokes = next;
      this.drawing.any = true;
      this.renderMain();
    }
    const w = this.ctxFor(this.wet);
    w.clearRect(0, 0, PAGE_W, this.page.h);
    w.strokeStyle = 'rgba(27,42,56,0.5)';
    w.lineWidth = 1 / this.scale;
    w.beginPath(); w.arc(x, y, r, 0, 6.3); w.stroke();
  }

  // ---------- Lasso and selection ----------
  drawLasso() {
    const d = this.drawing;
    const w = this.ctxFor(this.wet);
    w.clearRect(0, 0, PAGE_W, this.page.h);
    w.save();
    w.strokeStyle = '#2B5684';
    w.lineWidth = 1.6 / this.scale;
    w.setLineDash([6 / this.scale, 5 / this.scale]);
    w.fillStyle = 'rgba(43,86,132,0.06)';
    w.beginPath();
    d.poly.forEach((p, i) => (i ? w.lineTo(p[0], p[1]) : w.moveTo(p[0], p[1])));
    w.closePath();
    w.fill();
    w.stroke();
    w.restore();
  }

  finishLasso(d) {
    const poly = d.poly;
    let len = 0;
    for (let i = 1; i < poly.length; i++) len += dist(poly[i - 1], poly[i]);
    if (len < 12) { this.tapAt(poly[0][0], poly[0][1], { tool: 'lasso' }); return; }
    const strokes = new Set();
    for (const s of this.data.strokes) {
      if (!this.editable(s)) continue;
      const b = strokeBox(s);
      let inside = 0; let n = 0;
      for (let i = 0; i < s.pts.length; i += 3) { n++; if (inPoly(s.pts[i], s.pts[i + 1], poly)) inside++; }
      if (n && inside / n >= 0.6 && b) strokes.add(s.id);
    }
    const objects = new Set();
    for (const o of this.data.objects) {
      if (!this.editable(o)) continue;
      const b = objBox(o);
      if (inPoly(b.x + b.w / 2, b.y + b.h / 2, poly)) objects.add(o.id);
    }
    if (!strokes.size && !objects.size) { this.clearSelection(); return; }
    this.select(strokes, objects);
  }

  select(strokes, objects) {
    this.sel = { strokes, objects, moving: false };
    this.sel.box = this.selBox();
    this.drawSelection();
    this.opts.onSelection?.(this.sel);
  }

  selBox() {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    const grow = (b) => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); };
    for (const s of this.data.strokes) if (this.sel.strokes.has(s.id)) grow(strokeBox(s));
    for (const o of this.data.objects) if (this.sel.objects.has(o.id)) grow(objBox(o));
    return { x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 };
  }

  inSelection(x, y) {
    const b = this.sel?.box;
    return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  clearSelection() {
    if (!this.sel) return;
    this.sel = null;
    this.overlay.querySelector('.sel-box')?.remove();
    this.overlay.querySelector('.sel-bar')?.remove();
    this.opts.onSelection?.(null);
  }

  singleObject() {
    if (!this.sel || this.sel.strokes.size || this.sel.objects.size !== 1) return null;
    const id = [...this.sel.objects][0];
    return this.data.objects.find((o) => o.id === id) || null;
  }

  drawSelection() {
    this.overlay.querySelector('.sel-box')?.remove();
    this.overlay.querySelector('.sel-bar')?.remove();
    if (!this.sel || !this.page) return;
    const s = this.scale;
    const b = this.sel.box;
    const one = this.singleObject();
    const box = document.createElement('div');
    box.className = 'sel-box';
    Object.assign(box.style, { left: `${b.x * s}px`, top: `${b.y * s}px`, width: `${b.w * s}px`, height: `${b.h * s}px` });
    if (one?.rot) { box.style.transform = `rotate(${one.rot}rad)`; }
    box.innerHTML = `<button type="button" class="sel-handle br" aria-label="Resize"></button>${one && one.type !== 'text' && one.type !== 'postit' ? '<button type="button" class="sel-handle rot" aria-label="Rotate"></button>' : ''}`;
    this.overlay.appendChild(box);
    const handle = (cls, mode) => {
      const h = box.querySelector(cls);
      if (!h) return;
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const [x, y] = this.toPage(e);
        this.pageEl.setPointerCapture?.(e.pointerId);
        this.startMove(e, x, y, mode);
      });
    };
    handle('.br', 'scale');
    handle('.rot', 'rotate');
    if (this.sel.moving) return;
    const bar = document.createElement('div');
    bar.className = 'sel-bar';
    const items = [];
    if (one?.type === 'text') items.push(['edit', 'Edit text', icons.textbox()]);
    if (one?.type === 'table' && this.opts.editTable) items.push(['table', 'Rows and columns', icons.table()]);
    if (one?.type === 'postit') items.push(['edit', 'Edit', icons.postit()]);
    if (this.sel.strokes.size && this.opts.readHandwriting) items.push(['read', 'Convert to text', icons.type()]);
    if (this.sel.strokes.size || one?.type === 'image') items.push(['hl', 'Add to highlights', icons.highlighter()]);
    if (this.sel.strokes.size) items.push(['colour', 'Colour', raw('<span class="sel-col"></span>')]);
    items.push(['copy', 'Copy', icons.copy()], ['cut', 'Cut', raw('✂︎')], ['dup', 'Duplicate', icons.plus()]);
    if (this.sel.strokes.size || one?.type === 'image') items.push(['sticker', 'Save as sticker', icons.sticker()]);
    if (this.opts.pickLayer && Object.keys(this.layers.names || {}).length > 3) items.push(['layer', 'Layer', icons.layers()]);
    items.push(['delete', 'Delete', icons.trash()]);
    bar.innerHTML = String(html`${items.map(([a, l, ic]) => html`<button type="button" data-sel="${a}" aria-label="${l}">${ic}<span>${l}</span></button>`)}`);
    const top = b.y * s - 56;
    Object.assign(bar.style, { left: `${Math.max(4, b.x * s)}px`, top: `${top < 4 ? (b.y + b.h) * s + 10 : top}px` });
    this.overlay.appendChild(bar);
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.querySelectorAll('[data-sel]').forEach((btn) => { btn.onclick = (e) => this.selAction(btn.dataset.sel, btn, e); });
  }

  async selAction(act, btn) {
    const one = this.singleObject();
    if (act === 'edit' && one) { this.clearSelection(); this.edit(one); return; }
    if (act === 'table' && one) { this.opts.editTable?.(one, btn); return; }
    if (act === 'delete') { this.deleteSelection(); return; }
    if (act === 'copy') { this.copySelection(); toast('Copied'); return; }
    if (act === 'cut') { this.copySelection(); this.deleteSelection(); return; }
    if (act === 'dup') { this.copySelection(); this.paste(24); return; }
    if (act === 'colour') { this.opts.pickColour?.(btn, (c) => c && this.recolour(c)); return; }
    if (act === 'layer') { const l = await this.opts.pickLayer?.(btn); if (l) this.moveToLayer(l); return; }
    if (act === 'read') { this.opts.readHandwriting?.(this.data.strokes.filter((s) => this.sel.strokes.has(s.id)), { ...this.sel.box }); return; }
    if (act === 'sticker') { await this.saveSelectionAsSticker(); }
    if (act === 'hl') this.highlightSelection();
  }

  // "Add to highlights": highlight what's selected (a circle, an underline,
  // a picture), so it's gathered with the rest. One highlighter stroke per line
  // of writing, or bands across the selection for anything else.
  async highlightSelection() {
    if (!this.sel) return;
    const t = this.opts.getTool();
    const c = t.hlColor || '#F7D046';
    const chosen = this.data.strokes.filter((s) => this.sel.strokes.has(s.id) && s.t !== 'hl');
    let rows = [];
    if (chosen.length) {
      const { groupLines } = await import('../handwriting.js');
      rows = groupLines(chosen).map((l) => l.box);
    }
    const lined = rows.length > 0;
    if (!lined) rows = [{ ...this.sel.box }];
    const now = Date.now();
    const made = [];
    for (const b of rows) {
      const size = Math.max(12, Math.min(30, b.h * (lined ? 0.8 : 1)));
      const bands = lined ? 1 : Math.max(1, Math.ceil(b.h / (size * 0.9)));
      for (let k = 0; k < bands; k++) {
        const y = b.y + (bands === 1 ? b.h / 2 : (k + 0.5) * (b.h / bands));
        const pts = [];
        for (let x = b.x - 4; x <= b.x + b.w + 4; x += 6) pts.push(x, y, 0.5);
        made.push(this.stamp({ id: uid('k'), at: now, t: 'hl', pen: null, c, s: size, sp: 1, pts }, true));
      }
    }
    this.snapshot();
    this.data.strokes.push(...made);
    this.clearSelection();
    this.renderMain();
    this.changed();
    toast('Added to your highlights');
  }

  copySelection() {
    if (!this.sel) return;
    clip = {
      strokes: this.data.strokes.filter((s) => this.sel.strokes.has(s.id)).map((s) => ({ ...s })),
      objects: structuredClone(this.data.objects.filter((o) => this.sel.objects.has(o.id)).map(strip)),
    };
  }

  paste(offset = 24) {
    if (!clip) return;
    this.snapshot();
    const now = Date.now();
    const strokes = clip.strokes.map((s) => ({ ...s, id: uid('k'), pts: s.pts.map((v, i) => (i % 3 === 2 ? v : r2(v + offset))) }));
    const objects = clip.objects.map((o) => ({ ...structuredClone(o), id: uid('o'), x: o.x + offset, y: o.y + offset, t: now }));
    this.data.strokes.push(...strokes);
    this.data.objects.push(...objects);
    this.renderMain();
    this.changed();
    this.select(new Set(strokes.map((s) => s.id)), new Set(objects.map((o) => o.id)));
  }
  get canPaste() { return !!clip; }

  deleteSelection() {
    if (!this.sel) return;
    this.snapshot();
    const { strokes, objects } = this.sel;
    this.data.strokes = this.data.strokes.filter((s) => !strokes.has(s.id));
    this.data.objects = this.data.objects.filter((o) => !objects.has(o.id));
    this.data.tomb.push(...strokes, ...objects);
    this.clearSelection();
    this.renderMain();
    this.changed();
  }

  // Swap the selected handwriting for a text box saying the same thing.
  replaceSelectionWithText(text, box, ids = null) {
    if ((!this.sel && !ids) || !text.trim()) return;
    const lines = text.split('\n');
    const size = Math.max(14, Math.min(40, Math.round((box.h / Math.max(1, lines.length)) * 0.55)));
    const doc = { type: 'doc', content: lines.map((l) => (l.trim() ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) };
    const now = Date.now();
    const x = Math.max(10, box.x + 6);
    const o = this.stamp({ id: uid('o'), at: now, t: now, type: 'text', x, y: box.y + 4, w: Math.max(160, Math.min(PAGE_W - x - 10, box.w + 40)), h: Math.max(40, box.h), size, doc });
    this.snapshot();
    const gone = ids ? new Set(ids) : this.sel.strokes;
    this.data.strokes = this.data.strokes.filter((s) => { if (gone.has(s.id)) { this.data.tomb.push(s.id); return false; } return true; });
    this.data.objects.push(o);
    this.clearSelection();
    this.renderMain();
    this.changed();
    return o;
  }

  // Change a table's rows, columns or header (keeps its row height).
  updateTable(id, patchIn) {
    const o = this.data.objects.find((x) => x.id === id);
    if (!o) return;
    this.snapshot();
    const rowH = o.h / o.rows;
    const colW = o.w / o.cols;
    const rows = Math.max(1, Math.min(20, patchIn.rows ?? o.rows));
    const cols = Math.max(1, Math.min(10, patchIn.cols ?? o.cols));
    Object.assign(o, { rows, cols, header: patchIn.header ?? o.header, h: rowH * rows, w: Math.min(PAGE_W - o.x - 10, colW * cols), t: Date.now() });
    if (this.sel) this.sel.box = this.selBox();
    this.renderMain();
    this.drawSelection();
    this.changed();
  }

  // Put the selection on another layer.
  moveToLayer(layer) {
    if (!this.sel) return;
    this.snapshot();
    const now = Date.now();
    const put = (it) => { const n = { ...it }; delete n.l; return layer === layerOf(n) ? n : { ...n, l: layer }; };
    const ids = new Set();
    this.data.strokes = this.data.strokes.map((s) => {
      if (!this.sel.strokes.has(s.id)) return s;
      const n = { ...put(s), id: uid('k') };
      this.data.tomb.push(s.id);
      ids.add(n.id);
      return n;
    });
    this.data.objects = this.data.objects.map((o) => (this.sel.objects.has(o.id) ? { ...put(o), t: now } : o));
    this.sel.strokes = ids;
    const hidden = this.layers.hidden.has(layer) || this.layers.locked.has(layer);
    if (hidden) this.clearSelection();
    this.renderMain();
    if (!hidden) this.drawSelection();
    this.changed();
    toast(`Moved to ${this.layers.names?.[layer] || 'that layer'}`);
  }

  recolour(c) {
    if (!this.sel) return;
    this.snapshot();
    const ids = new Set();
    this.data.strokes = this.data.strokes.map((s) => {
      if (!this.sel.strokes.has(s.id)) return s;
      const n = { ...s, id: uid('k'), c };
      this.data.tomb.push(s.id);
      ids.add(n.id);
      return n;
    });
    this.sel.strokes = ids;
    this.renderMain();
    this.changed();
  }

  // Writing and stickers sitting inside a table move with it.
  carried(table) {
    const inside = (b) => { const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; return cx > table.x && cx < table.x + table.w && cy > table.y && cy < table.y + table.h; };
    return {
      strokes: new Set(this.data.strokes.filter((s) => this.editable(s) && inside(strokeBox(s))).map((s) => s.id)),
      objects: new Set(this.data.objects.filter((o) => o.id !== table.id && o.type !== 'table' && this.editable(o) && inside(objBox(o))).map((o) => o.id)),
    };
  }

  startMove(e, x, y, mode) {
    this.snapshot();
    const b = this.sel.box;
    const one = this.singleObject();
    if (one?.type === 'table' && mode !== 'rotate') {
      const c = this.carried(one);
      for (const id of c.strokes) this.sel.strokes.add(id);
      for (const id of c.objects) this.sel.objects.add(id);
      this.sel.carriedFor = one.id;
    }
    this.drawing = { pointerId: e.pointerId, kind: 'move', mode, x0: x, y0: y, box: { ...b }, rot0: one?.rot || 0, dx: 0, dy: 0, k: 1, rot: one?.rot || 0 };
    this.sel.moving = true;
    this.updateTouchAction();
    this.renderMain();
    this.dragMove(x, y);
  }

  dragMove(x, y) {
    const d = this.drawing;
    const b = d.box;
    if (d.mode === 'move') { d.dx = x - d.x0; d.dy = y - d.y0; }
    if (d.mode === 'scale') d.k = Math.max(0.2, Math.min(6, Math.max((x - b.x) / b.w, (y - b.y) / b.h)));
    if (d.mode === 'rotate') {
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
      d.rot = Math.atan2(y - cy, x - cx) + Math.PI / 2;
    }
    // Preview on the wet layer.
    const w = this.ctxFor(this.wet);
    w.clearRect(0, 0, PAGE_W, this.page.h);
    w.save();
    if (d.mode === 'rotate') {
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
      w.translate(cx, cy); w.rotate(d.rot - d.rot0); w.translate(-cx, -cy);
    } else {
      w.translate(b.x + d.dx, b.y + d.dy);
      w.scale(d.k, d.k);
      w.translate(-b.x, -b.y);
    }
    setInkTone(this.dark);
    drawContent(w, {
      strokes: this.data.strokes.filter((s) => this.sel.strokes.has(s.id)),
      objects: this.data.objects.filter((o) => this.sel.objects.has(o.id)),
    }, { redraw: () => {} });
    w.restore();
    const s = this.scale;
    const box = this.overlay.querySelector('.sel-box');
    if (box) {
      Object.assign(box.style, { left: `${(b.x + d.dx) * s}px`, top: `${(b.y + d.dy) * s}px`, width: `${b.w * d.k * s}px`, height: `${b.h * d.k * s}px` });
      if (d.mode === 'rotate') box.style.transform = `rotate(${d.rot}rad)`;
    }
    this.overlay.querySelector('.sel-bar')?.remove();
  }

  endMove(d) {
    this.drawing = null;
    const sel = this.sel;
    if (!sel || !d) return;
    const b = d.box;
    const moved = d.dx || d.dy || d.k !== 1 || d.rot !== d.rot0;
    const dropCarried = () => {
      // After moving a table, only the table stays selected.
      if (!sel.carriedFor) return;
      sel.strokes = new Set();
      sel.objects = new Set([sel.carriedFor]);
      sel.carriedFor = null;
      sel.box = this.selBox();
    };
    if (!moved) {
      this.undoStack.pop();
      sel.moving = false;
      dropCarried();
      this.renderMain();
      this.drawSelection();
      return;
    }
    const tx = (vx) => b.x + d.dx + (vx - b.x) * d.k;
    const ty = (vy) => b.y + d.dy + (vy - b.y) * d.k;
    const ids = new Set();
    this.data.strokes = this.data.strokes.map((s) => {
      if (!sel.strokes.has(s.id)) return s;
      const pts = s.pts.map((v, i) => (i % 3 === 0 ? r2(tx(v)) : i % 3 === 1 ? r2(ty(v)) : v));
      const n = { ...s, id: uid('k'), pts, s: r2(s.s * d.k) };
      if (d.mode === 'rotate') {
        const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const a = d.rot - d.rot0;
        const c = Math.cos(a); const sn = Math.sin(a);
        for (let i = 0; i < n.pts.length; i += 3) {
          const x = s.pts[i] - cx; const y = s.pts[i + 1] - cy;
          n.pts[i] = r2(cx + x * c - y * sn); n.pts[i + 1] = r2(cy + x * sn + y * c);
        }
        n.s = s.s;
      }
      this.data.tomb.push(s.id);
      ids.add(n.id);
      return n;
    });
    const now = Date.now();
    this.data.objects = this.data.objects.map((o) => {
      if (!sel.objects.has(o.id)) return o;
      if (d.mode === 'rotate') return { ...o, rot: d.rot, t: now };
      const n = { ...o, x: tx(o.x), y: ty(o.y), w: o.w * d.k, h: o.h * d.k, t: now };
      if (o.type === 'text') n.size = (o.size || BOX_SIZE) * d.k;
      return n;
    });
    sel.strokes = ids;
    sel.moving = false;
    sel.box = this.selBox();
    dropCarried();
    this.updateTouchAction();
    this.renderMain();
    this.clearWet();
    this.changed();
  }

  async saveSelectionAsSticker() {
    if (!this.sel) return;
    const b = this.sel.box;
    const k = 2;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(b.w * k));
    c.height = Math.max(1, Math.round(b.h * k));
    const ctx = c.getContext('2d');
    ctx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
    setInkTone(false);
    drawContent(ctx, { strokes: this.data.strokes.filter((s) => this.sel.strokes.has(s.id)), objects: this.data.objects.filter((o) => this.sel.objects.has(o.id)) });
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const fileId = await V.addFile(new Uint8Array(await blob.arrayBuffer()), { type: 'image/png' });
    const id = uid('m');
    await V.saveConfig({ myStickers: [...(state.config.myStickers || []), { id, fileId, w: Math.round(b.w), h: Math.round(b.h), kind: 'ink', name: 'My sticker' }] });
    toast('Saved to your stickers (Mine)');
  }

  // The topmost stroke near a point that can be moved (Move tool).
  strokeAt(x, y, r = 10) {
    for (let i = this.data.strokes.length - 1; i >= 0; i--) {
      const s = this.data.strokes[i];
      if (!this.editable(s)) continue;
      const b = strokeBox(s);
      if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
      const rr = r + s.s / 2;
      for (let k = 0; k < s.pts.length; k += 3) if (Math.hypot(s.pts[k] - x, s.pts[k + 1] - y) <= rr) return s;
    }
    return null;
  }

  // ---------- Objects ----------
  objectAt(x, y) {
    const order = { postit: 6, sticker: 5, label: 5, mine: 5, text: 4, tape: 2, image: 1, table: 0 };
    const hits = this.data.objects.filter((o) => this.editable(o) && hitObject(o, x, y));
    return hits.sort((a, b) => (order[b.type] || 0) - (order[a.type] || 0))[0] || null;
  }

  tapAt(x, y, { finger = false, tool } = {}) {
    const o = this.objectAt(x, y);
    const t = tool || this.opts.getTool().tool;
    if (this.editing) { this.endEdit(); if (!o) return; }
    if (o) {
      if (o.type === 'postit' && o.collapsed) { this.snapshot(); o.collapsed = false; o.t = Date.now(); this.renderMain(); this.changed(); this.edit(o); return; }
      if ((o.type === 'text' || o.type === 'postit') && (t === 'text' || finger)) { this.edit(o); return; }
      this.select(new Set(), new Set([o.id]));
      return;
    }
    if (this.sel) { this.clearSelection(); return; }
    if (t === 'text') this.addText(x, y);
  }

  centerPoint() {
    const r = this.pageEl.getBoundingClientRect();
    const sr = this.scroll.getBoundingClientRect();
    const s = this.scale;
    const cx = ((sr.left + sr.width / 2) - r.left) / s;
    const cy = ((sr.top + Math.min(sr.height, window.innerHeight) / 2) - r.top) / s;
    return [Math.max(40, Math.min(PAGE_W - 40, cx)), Math.max(40, Math.min(this.page.h - 40, cy))];
  }

  place(v, at = null) {
    const [cx, cy] = at || this.centerPoint();
    const now = Date.now();
    let o = null;
    if (v.type === 'label') {
      const l = (state.config.labels || []).find((x) => x.id === v.label) || { name: v.label };
      const d = labelDef(l);
      o = { type: 'label', label: v.label, w: d.w, h: d.h };
    } else if (v.type === 'sticker') {
      const d = stickerDef(v.pack, v.key);
      if (!d) return;
      o = { type: 'sticker', pack: v.pack, key: v.key, w: d.w, h: d.h };
    } else if (v.type === 'tape') {
      o = { type: 'tape', key: v.key, w: 240, h: 34, rot: (Math.random() - 0.5) * 0.12 };
    } else if (v.type === 'postit') {
      o = { type: 'postit', color: v.color, text: '', w: 220, h: 200, rot: (Math.random() - 0.5) * 0.05, collapsed: false };
    } else if (v.type === 'mine') {
      const m = (state.config.myStickers || []).find((x) => x.id === v.id);
      if (!m) return;
      const k = Math.min(1, 220 / Math.max(m.w, m.h));
      o = { type: 'mine', mine: m.id, w: m.w * k, h: m.h * k };
    } else if (v.type === 'image') {
      const k = Math.min(1, 520 / v.w, 520 / v.h);
      o = { type: 'image', fileId: v.fileId, w: v.w * k, h: v.h * k };
    } else if (v.type === 'table') {
      const rows = Math.max(1, Math.min(20, v.rows || 3));
      const cols = Math.max(1, Math.min(10, v.cols || 3));
      o = { type: 'table', rows, cols, header: v.header !== false, c: v.c || '#4A6E8C', w: Math.min(820, Math.max(320, cols * 210)), h: rows * 72 };
    }
    if (!o) return;
    if (this.writeBlocked()) { toast(this.writeBlocked()); return; }
    o = this.stamp(o);
    // Don't stack a new sticker exactly on top of the last one.
    let px = cx;
    let py = cy;
    for (let i = 0; i < 12 && this.data.objects.some((x) => Math.abs(x.x + x.w / 2 - px) < 24 && Math.abs(x.y + (x.h || 40) / 2 - py) < 24); i++) { px += 36; py += 36; }
    px = Math.min(PAGE_W - o.w / 2, px);
    py = Math.min(this.page.h - o.h / 2, py);
    o = { id: uid('o'), x: px - o.w / 2, y: py - o.h / 2, rot: 0, t: now, at: now, ...o };
    if (o.type === 'table') {
      // Sit tables on the paper's lines or dots.
      const paper = this.page.paper;
      const dots = paper === 'dotted' || paper === 'grid';
      const g = dots ? 25 : paper === 'narrow' ? 28 : 36;
      const top = dots ? 25 : 120;
      if (dots) { o.h = o.rows * 75; o.w = Math.round(o.w / 25) * 25; }
      o.x = Math.max(paper === 'ruled' || paper === 'narrow' ? 124 : 50, Math.min(PAGE_W - o.w - 30, o.x));
      if (dots) o.x = Math.round(o.x / 25) * 25;
      o.y = Math.max(top, top + Math.round((o.y - top) / g) * g);
    }
    this.snapshot();
    this.data.objects.push(o);
    this.renderMain();
    this.changed();
    if (o.type === 'postit') this.edit(o);
    else this.select(new Set(), new Set([o.id]));
    return o;
  }

  addText(x, y) {
    // New text boxes start in the default text from Settings; boxes already on
    // the page keep theirs, so they don't shift over the writing around them.
    const dt = state.config?.text || {};
    const extra = { ...(dt.font ? { font: dt.font } : {}), ...(dt.color ? { color: dt.color } : {}) };
    const size = boxSize(dt.size || TEXT_SIZE);
    const o = this.stamp({ id: uid('o'), at: Date.now(), type: 'text', x: Math.min(x, PAGE_W - 240), y: y - 14, w: Math.min(520, PAGE_W - Math.min(x, PAGE_W - 240) - 30), h: 40, size, ...extra, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, t: Date.now(), fresh: true });
    this.snapshot();
    this.data.objects.push(o);
    this.edit(o);
  }

  // ---------- Editing text boxes and post-its ----------
  async edit(o) {
    this.endEdit();
    this.clearSelection();
    this.editing = o;
    this.renderMain();
    const s = this.scale;
    if (o.type === 'text') {
      const box = document.createElement('div');
      box.className = 'tb-edit';
      box.innerHTML = '<div class="tb-host"></div><div class="tb-actions"><button type="button" class="tb-done">Done</button><button type="button" class="tb-del" aria-label="Delete text box">' + icons.trash({ size: 16 }) + '</button></div><button type="button" class="tb-width" aria-label="Change width"></button>';
      this.overlay.appendChild(box);
      this.editorBox = box;
      this.positionEditor();
      const R = await import('./rich.js');
      if (this.editing !== o) { box.remove(); return; }
      const ed = R.createRichEditor(box.querySelector('.tb-host'), { doc: o.doc, editable: true, placeholder: 'Type here' });
      ed.view.dom.classList.add('tb-rich');
      this.textEditor = ed;
      box.querySelector('.tb-done').onclick = () => this.endEdit();
      box.querySelector('.tb-del').onclick = () => { this.snapshot(); this.data.objects = this.data.objects.filter((x) => x.id !== o.id); this.data.tomb.push(o.id); this.endEdit(false); this.changed(); };
      // Drag the right edge to change width.
      const wh = box.querySelector('.tb-width');
      wh.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX; const w0 = o.w;
        const mv = (ev) => { o.w = Math.max(120, Math.min(PAGE_W - o.x - 10, w0 + (ev.clientX - startX) / this.scale)); this.positionEditor(); };
        const upf = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf); };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', upf);
      });
      this.opts.onTextEditing?.(ed);
      setTimeout(() => ed.commands.focus('end'), 30);
    } else if (o.type === 'postit') {
      const c = postitColor(o.color);
      const box = document.createElement('div');
      box.className = 'postit-edit';
      box.style.setProperty('--pi', c.bg);
      box.innerHTML = String(html`<div class="pe-bar">${POSTIT_COLORS.map((pc) => html`<button type="button" class="swatch sm" data-pc="${pc.id}" style="background:${pc.bg}" aria-label="${pc.id} post-it" aria-pressed="${pc.id === o.color ? 'true' : 'false'}"></button>`)}
        <button type="button" data-fold aria-label="Fold away">Fold</button><button type="button" data-del aria-label="Delete post-it">${icons.trash({ size: 16 })}</button><button type="button" data-done>Done</button></div>
        <textarea aria-label="Post-it text" placeholder="Write a note">${o.text || ''}</textarea>`);
      this.overlay.appendChild(box);
      this.editorBox = box;
      this.positionEditor();
      const ta = box.querySelector('textarea');
      box.querySelectorAll('[data-pc]').forEach((b) => { b.onclick = () => { o.color = b.dataset.pc; box.style.setProperty('--pi', postitColor(o.color).bg); box.querySelectorAll('[data-pc]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); }; });
      box.querySelector('[data-fold]').onclick = () => { o.collapsed = true; this.endEdit(); };
      box.querySelector('[data-del]').onclick = () => { this.snapshot(); this.data.objects = this.data.objects.filter((x) => x.id !== o.id); this.data.tomb.push(o.id); this.endEdit(false); this.changed(); };
      box.querySelector('[data-done]').onclick = () => this.endEdit();
      setTimeout(() => ta.focus(), 30);
      void s;
    }
  }

  positionEditor() {
    const o = this.editing;
    const box = this.editorBox;
    if (!o || !box) return;
    const s = this.scale;
    if (o.type === 'text') {
      Object.assign(box.style, { left: `${o.x * s}px`, top: `${o.y * s}px`, width: `${o.w * s}px` });
      box.style.setProperty('--fs', `${(o.size || BOX_SIZE) * s}px`);
      if (o.font) box.style.setProperty('--tbf', fontCss(o.font, BOX_FONT)); else box.style.removeProperty('--tbf');
      if (o.color) box.style.setProperty('--tbc', this.dark ? darkInk(o.color) : o.color); else box.style.removeProperty('--tbc');
    } else {
      Object.assign(box.style, { left: `${o.x * s}px`, top: `${o.y * s}px`, width: `${Math.max(o.w * s, 200)}px`, minHeight: `${o.h * s}px` });
      box.style.setProperty('--fs', `${30 * s}px`);
    }
  }

  endEdit(save = true) {
    const o = this.editing;
    if (!o) return;
    this.editing = null;
    const box = this.editorBox;
    this.editorBox = null;
    if (o.type === 'text' && this.textEditor) {
      const ed = this.textEditor;
      this.textEditor = null;
      const doc = ed.getJSON();
      const empty = !ed.getText().trim() && !JSON.stringify(doc).includes('labelChip') && !JSON.stringify(doc).includes('"sticker"');
      const domH = box ? box.querySelector('.tb-host').offsetHeight / this.scale : o.h;
      ed.destroy();
      this.opts.onTextEditing?.(null);
      if (save) {
        if (empty) {
          this.data.objects = this.data.objects.filter((x) => x.id !== o.id);
          if (!o.fresh) { this.data.tomb.push(o.id); this.changed(); } else this.undoStack.pop();
        } else if (JSON.stringify(doc) !== JSON.stringify(o.doc) || o.fresh) {
          if (!o.fresh) this.snapshot();
          const i = this.data.objects.findIndex((x) => x.id === o.id);
          if (i >= 0) this.data.objects[i] = { ...strip(o), doc, h: domH, t: Date.now() };
          this.changed();
        }
      }
    } else if (o.type === 'postit') {
      const text = box?.querySelector('textarea')?.value ?? o.text;
      if (save) {
        const i = this.data.objects.findIndex((x) => x.id === o.id);
        if (i >= 0) {
          if (!this.undoStack.length || text !== o.text) this.snapshot();
          this.data.objects[i] = { ...strip(o), text, t: Date.now() };
          this.changed();
        }
      }
    }
    box?.remove();
    this.renderMain();
  }

  async insertImage(file) {
    const img = await compressImage(file, { max: 1600 });
    const fileId = await V.addFile(img.bytes, { sealed: !!this.opts.sealed?.() });
    this.place({ type: 'image', fileId, w: img.w / 2, h: img.h / 2 });
  }

  // Make the page taller (endless scroll), keeping your place.
  setPageHeight(h) {
    if (!this.page || h <= this.page.h) return;
    this.page = { ...this.page, h };
    this.layout();
  }

  destroy() {
    cancelAnimationFrame(this.laserRaf);
    this.offTheme?.();
    this.scroll.removeEventListener('scroll', this.onScroll);
    this.endEdit();
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    this.host.innerHTML = '';
  }
}

function strip(o) {
  const { fresh, _h, ...rest } = o;
  return rest;
}

export { renderPageCanvas, drawRichText, strokePath };
