// The writing window: write large in a strip at the bottom of the screen and
// it lands small on the page, inside the dashed box. Lifting the Pencil in the
// shaded end of the strip moves the box along; at the end of a line it wraps.

import { html, raw, uid, toast } from '../util.js';
import { PAGE_W } from '../model.js';
import { icons } from '../icons.js';
import { drawPaper, drawContent, drawStroke, fileImage, paperColor } from './inkdraw.js';

const GAP = { ruled: 36, cornell: 36, narrow: 28, grid: 25, dotted: 25, blank: 36 };
const TOP = { ruled: 120, cornell: 120, narrow: 120, grid: 25, dotted: 25, blank: 120 };
const ADVANCE = 0.84; // lifting the pen beyond this part of the strip moves on

export class ZoomStrip {
  constructor(surface, host, { getTool, onClose }) {
    this.s = surface;
    this.host = host;
    this.getTool = getTool;
    this.onClose = onClose;
    this.box = null;
    this.drawing = null;
    host.hidden = false;
    host.innerHTML = String(html`<div class="zs-bar">
        <button type="button" class="icon-btn bare sm" data-z="prev" aria-label="Move the box back">${icons.back({ size: 18 })}</button>
        <button type="button" class="icon-btn bare sm" data-z="next" aria-label="Move the box on">${icons.chevron({ size: 18 })}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-z="nl">${raw('↵')} New line</button>
        <span class="zs-hint"><span class="hide-sm">Write large here, it lands small on the page</span><span class="show-sm">Write large, it lands small</span></span>
        <button type="button" class="icon-btn bare sm" data-z="close" aria-label="Close the writing window">${icons.close({ size: 18 })}</button>
      </div>
      <div class="zs-pad"><canvas aria-label="Writing window. Write here; it lands in the box on the page." role="img"></canvas><div class="zs-adv" aria-hidden="true">${icons.arrow({ size: 20 })}</div></div>`);
    this.canvas = host.querySelector('canvas');
    this.pad = host.querySelector('.zs-pad');
    host.querySelector('[data-z=prev]').onclick = () => this.step(-1);
    host.querySelector('[data-z=next]').onclick = () => this.step(1);
    host.querySelector('[data-z=nl]').onclick = () => this.newLine();
    host.querySelector('[data-z=close]').onclick = () => this.onClose?.();
    this.bind();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.pad);
    this.s.onZoomBoxMove = (b) => { this.setBox({ ...this.box, x: b.x, y: this.snapY(b.y + this.box.h * 0.8) }); };
    this.reset();
  }

  get page() { return this.s.page; }
  get gap() { return GAP[this.page?.paper] || 36; }
  get top() { return TOP[this.page?.paper] || 120; }
  get margin() { return ['ruled', 'narrow'].includes(this.page?.paper) ? 122 : 40; }
  get right() { return PAGE_W - 30; }
  get k() { return (this.pad.clientHeight || 200) / this.box.h; }

  // Baseline nearest to y.
  snapY(y) { return this.top + Math.max(0, Math.round((y - this.top) / this.gap)) * this.gap; }
  boxAt(x, baseline) {
    const h = this.gap * 1.3;
    const w = (this.pad.clientWidth || 600) / ((this.pad.clientHeight || 200) / h);
    return { x: Math.max(4, Math.min(x, PAGE_W - w - 4)), y: baseline - h * 0.8, w, h, base: baseline };
  }

  // Start at the first empty line in view.
  reset() {
    if (!this.page) return;
    const sc = this.s.scroll;
    const visTop = Math.max(0, (sc.scrollTop - this.s.pageEl.offsetTop) / this.s.scale);
    const strokes = this.s.data?.strokes || [];
    let base = this.snapY(Math.max(this.top + this.gap, visTop + this.gap * 2));
    for (let i = 0; i < 60 && base < this.page.h - 40; i++, base += this.gap) {
      const busy = strokes.some((st) => {
        for (let j = 1; j < st.pts.length; j += 3) if (st.pts[j] > base - this.gap * 0.9 && st.pts[j] < base + 2) return true;
        return false;
      });
      if (!busy) break;
    }
    this.setBox(this.boxAt(this.margin, base));
  }

  setBox(b) {
    this.box = this.boxAt(b.x, b.base ?? this.snapY(b.y + b.h * 0.8));
    this.s.setZoomBox(this.box);
    this.s.revealBox(this.box);
    this.render();
  }

  step(dir) {
    const b = this.box;
    const move = b.w * 0.62;
    let x = b.x + dir * move;
    let base = b.base;
    if (dir > 0 && x + b.w > this.right + b.w * 0.3) { x = this.margin; base += this.gap; }
    if (dir < 0 && x < this.margin - b.w * 0.3) { x = this.right - b.w; base -= this.gap; }
    if (base > this.page.h - 30) { toast('That’s the end of the page.'); return; }
    if (base < this.top) base = this.top;
    this.setBox({ ...b, x, base });
  }
  newLine() {
    if (this.box.base + this.gap > this.page.h - 30) { toast('That’s the end of the page.'); return; }
    this.setBox({ ...this.box, x: this.margin, base: this.box.base + this.gap });
  }

  layout() {
    if (!this.box) return;
    const w = this.pad.clientWidth;
    const h = this.pad.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.box = this.boxAt(this.box.x, this.box.base);
    this.s.setZoomBox(this.box);
    this.render();
  }

  ctx() {
    const c = this.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const k = this.k;
    c.setTransform(k * dpr, 0, 0, k * dpr, -this.box.x * k * dpr, -this.box.y * k * dpr);
    return c;
  }

  render(wet = null) {
    if (!this.box || !this.page || !this.s.data) return;
    const c = this.ctx();
    const b = this.box;
    c.save();
    c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip();
    if (this.s.layers?.paperHidden) drawPaper(c, { ...this.page, paper: 'blank', bg: null }, this.k, null);
    else drawPaper(c, this.page, this.k, this.page.bg ? fileImage(this.page.bg, () => this.render()) : null);
    // The baseline, stronger than the paper's own lines.
    c.strokeStyle = 'rgba(43,86,132,0.35)';
    c.lineWidth = 1.2 / this.k;
    c.beginPath(); c.moveTo(b.x, b.base); c.lineTo(b.x + b.w, b.base); c.stroke();
    drawContent(c, this.s.data, { redraw: () => this.render(), visible: this.s.visible });
    if (wet) drawStroke(c, wet);
    c.restore();
    void paperColor;
  }

  wetStroke(d) { return { ...d.stroke, pts: d.pts.flat() }; }

  bind() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.s.isDrawPointer(e)) return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      const tool = this.getTool();
      const [x, y] = this.toPage(e);
      if (tool.tool === 'eraser') {
        this.s.beginExternalErase();
        this.drawing = { id: e.pointerId, erase: true };
        this.s.eraseAt(x, y, tool);
        this.render();
        return;
      }
      const blocked = this.s.writeBlocked();
      if (blocked) { toast(blocked); return; }
      const hl = tool.tool === 'hl';
      this.drawing = {
        id: e.pointerId,
        stroke: { id: uid('k'), at: Date.now(), t: hl ? 'hl' : 'pen', pen: hl ? null : tool.pen, c: hl ? tool.hlColor : tool.color, s: hl ? tool.hlSize : tool.size, sp: e.pointerType === 'pen' ? 0 : 1, pts: [] },
        pts: [[x, y, e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5]],
        maxSx: e.offsetX,
      };
    });
    cv.addEventListener('pointermove', (e) => {
      const d = this.drawing;
      if (!d || d.id !== e.pointerId) return;
      const evs = e.getCoalescedEvents?.() || [e];
      for (const ev of evs.length ? evs : [e]) {
        const [x, y] = this.toPage(ev);
        if (d.erase) { this.s.eraseAt(x, y, this.getTool()); continue; }
        d.pts.push([x, y, ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5]);
      }
      if (d.erase) { this.render(); return; }
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; if (this.drawing === d) this.render(this.wetStroke(d)); });
    });
    const up = (e) => {
      const d = this.drawing;
      if (!d || d.id !== e.pointerId) return;
      this.drawing = null;
      if (d.erase) { this.s.endExternalErase(); this.render(); return; }
      if (d.pts.length < 2) d.pts.push([d.pts[0][0] + 0.3, d.pts[0][1], d.pts[0][2]]);
      const s = { ...d.stroke, pts: d.pts.flat().map((v) => Math.round(v * 100) / 100) };
      this.s.addStroke(s);
      // Lifted at the far end: move the box along.
      const r = this.canvas.getBoundingClientRect();
      if ((e.clientX - r.left) / r.width > ADVANCE) this.step(1);
      else this.render();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    // Keep the Pencil from scrolling anything while writing here.
    cv.addEventListener('touchstart', (e) => { if ([...e.touches].some((t) => t.touchType === 'stylus') || this.s.isFingerDrawing?.()) e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  toPage(e) {
    const r = this.canvas.getBoundingClientRect();
    const k = this.k;
    return [this.box.x + (e.clientX - r.left) / k, this.box.y + (e.clientY - r.top) / k];
  }

  destroy() {
    this.ro.disconnect();
    this.s.setZoomBox(null);
    this.s.onZoomBoxMove = null;
    this.host.innerHTML = '';
    this.host.hidden = true;
  }
}
