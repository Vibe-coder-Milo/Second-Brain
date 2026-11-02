// Continuous view: every page of a handwritten note one under another, like a
// PDF reader. The page you're on is the live page you write on (the
// InkSurface); the others show a picture of themselves, drawn as they come
// near the screen and dropped when they're far away, so a 300-page PDF costs
// about the same as a 3-page one. Writing on another page makes it the live
// page there and then, so the stroke isn't lost.

import { PAGE_W } from '../model.js';
import { renderPageCanvas, pageDark, paperColor, setInkTone } from './inkdraw.js';

// Pixels per page picture (about 14 MB each at most).
const MAX_PX = 3.6e6;

export class PageStack {
  // o: {
  //   pages(): the note's pages
  //   data(pageId): Promise of a page's data
  //   cached(pageId): a page's data if it's already loaded, else null
  //   view(): layer options for drawing ({ visible, paperHidden })
  //   viewKey(): a string that changes when shown layers change
  //   canSwitch(): false while writing, typing or with something selected
  //   onWant(i): make page i the live page (when scrolling settles there)
  //   onActivateNow(i, data): make page i the live page right now
  //   onIndicator(i): the page in view changed (while scrolling)
  // }
  constructor(surface, o) {
    this.s = surface;
    this.o = o;
    this.slots = [];
    this.active = -1;
    this.ids = '';
    this.heights = '';
    this.gen = 0;
    this.ver = new Map(); // pageId -> bumped when its picture is out of date
    this.queue = new Set();
    this.busy = false;
    this.el = document.createElement('div');
    this.el.className = 'ink-stack';
    surface.scroll.insertBefore(this.el, surface.scroll.firstChild);
    surface.zoomTarget = this.el;
    this.byPaper = new Map();
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const sl = this.byPaper.get(e.target);
        if (!sl) continue;
        sl.near = e.isIntersecting;
        if (sl.near) { this.o.data(sl.p.id).catch(() => {}); this.want(sl.i); } else if (sl.i !== this.active) this.drop(sl);
      }
    }, { root: surface.scroll, rootMargin: '100% 0px 100% 0px' });

    // Scrolling: say which page is in view, and make it the live page once
    // scrolling settles there.
    this.onScroll = () => {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        const i = this.focusIndex();
        if (i !== this.shown) { this.shown = i; this.o.onIndicator?.(i); }
        clearTimeout(this.settle);
        this.settle = setTimeout(() => {
          const j = this.focusIndex();
          if (j >= 0 && j !== this.active && this.o.canSwitch()) this.o.onWant(j);
        }, 160);
      });
    };
    surface.scroll.addEventListener('scroll', this.onScroll, { passive: true });

    // Writing on a page that isn't the live one makes it live at once and
    // hands the stroke over. A finger tap does the same for taps.
    this.onDown = (e) => {
      const sl = this.slotOf(e.target);
      if (!sl || sl.i === this.active || this.s.replayTap) return;
      const t = this.s.opts.getTool();
      const draws = this.s.isDrawPointer(e) || (t.tool === 'move' && (e.pointerType !== 'mouse' || e.button === 0));
      if (!draws) {
        if (e.pointerType === 'touch') this.tap = { i: sl.i, id: e.pointerId, x: e.clientX, y: e.clientY, at: Date.now() };
        return;
      }
      e.preventDefault();
      if (this.s.drawing) return;
      const d = this.o.cached(sl.p.id);
      if (!d) { this.o.onWant(sl.i); return; }
      this.o.onActivateNow(sl.i, d);
      if (this.active !== sl.i) return;
      this.s.down(e);
      try { this.s.pageEl.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    };
    this.onUp = (e) => {
      const tp = this.tap;
      if (!tp || tp.id !== e.pointerId) return;
      this.tap = null;
      if (Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > 8 || Date.now() - tp.at > 450) return;
      const sl = this.slots[tp.i];
      if (!sl || tp.i === this.active) return;
      const d = this.o.cached(sl.p.id);
      if (!d) { this.o.onWant(tp.i); return; }
      this.o.onActivateNow(tp.i, d);
      if (this.active !== tp.i) return;
      const [x, y] = this.s.toPage(e);
      this.s.tapAt(x, y, { finger: true });
    };
    this.onCancel = (e) => { if (this.tap?.id === e.pointerId) this.tap = null; };
    // The Pencil never scrolls; fingers do (unless they write).
    this.onTouch = (e) => {
      if (e.target.closest?.('.ink-page') || !e.target.closest?.('.ink-slot')) return;
      const t = this.s.opts.getTool();
      const stylus = [...e.touches].some((x) => x.touchType === 'stylus');
      const fingerDraws = (!!t.fingerDraw || t.tool === 'laser') && !this.s.penSeen;
      if (stylus || ((fingerDraws || t.tool === 'move') && e.touches.length === 1)) e.preventDefault();
    };
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('pointercancel', this.onCancel);
    this.el.addEventListener('touchstart', this.onTouch, { passive: false });
    this.el.addEventListener('touchmove', this.onTouch, { passive: false });
  }

  slotOf(target) {
    const el = target.closest?.('.ink-slot');
    if (!el || target.closest('.ink-page')) return null;
    return this.slots[Number(el.dataset.i)] || null;
  }

  // ---------- Building ----------
  // Make (or remake) the slots when pages are added, removed or reordered;
  // otherwise just resize them. Returns true if the slots were remade.
  sync(activeIdx) {
    const pages = this.o.pages();
    const ids = pages.map((p) => p.id).join(',');
    const heights = pages.map((p) => p.h).join(',');
    if (ids === this.ids) {
      if (heights !== this.heights) {
        this.heights = heights;
        pages.forEach((p, i) => { if (this.slots[i]) this.slots[i].p = p; });
        this.sizeAll();
      }
      return false;
    }
    this.build(pages, activeIdx);
    return true;
  }

  build(pages, activeIdx) {
    this.gen++;
    this.io.disconnect();
    this.byPaper.clear();
    this.queue.clear();
    for (const sl of this.slots) this.drop(sl);
    this.el.textContent = '';
    this.ids = pages.map((p) => p.id).join(',');
    this.heights = pages.map((p) => p.h).join(',');
    const n = pages.length;
    this.slots = pages.map((p, i) => {
      const slot = document.createElement('div');
      slot.className = 'ink-slot';
      slot.dataset.i = String(i);
      const paper = document.createElement('div');
      paper.className = 'slot-paper';
      paper.setAttribute('role', 'img');
      paper.setAttribute('aria-label', `Page ${i + 1} of ${n}`);
      slot.appendChild(paper);
      this.el.appendChild(slot);
      const sl = { i, p, slot, paper, img: null, key: '', near: false };
      this.byPaper.set(paper, sl);
      return sl;
    });
    this.active = -1;
    this.sizeAll();
    this.place(activeIdx, null);
    for (const sl of this.slots) this.io.observe(sl.paper);
  }

  // Slots take the size the page has on screen (it changes with zoom).
  size(sl) {
    const s = this.s.scale;
    const dark = pageDark(sl.p);
    sl.paper.style.width = `${Math.round(PAGE_W * s)}px`;
    sl.paper.style.height = `${Math.round(sl.p.h * s)}px`;
    setInkTone(dark);
    sl.paper.style.background = sl.p.bg ? '#FFFFFF' : paperColor(sl.p).bg;
    setInkTone(false);
    sl.paper.classList.toggle('dark', dark);
  }
  sizeAll() {
    // When the pages change size (zoom, a wider window), stay at the same
    // spot of the same page.
    const scale = this.s.scale;
    const sc = this.s.scroll;
    let anchor = null;
    if (this.lastScale && Math.abs(scale - this.lastScale) > 1e-4 && this.slots.length) {
      const i = this.focusIndex();
      const sl = this.slots[i];
      const line = sc.scrollTop + sc.clientHeight * 0.4;
      if (sl) anchor = { i, frac: (line - sl.slot.offsetTop) / Math.max(1, sl.slot.offsetHeight) };
    }
    this.lastScale = scale;
    for (const sl of this.slots) this.size(sl);
    if (anchor) {
      // After the live page has its new size too.
      queueMicrotask(() => {
        const sl = this.slots[anchor.i];
        if (sl) sc.scrollTop = sl.slot.offsetTop + anchor.frac * sl.slot.offsetHeight - sc.clientHeight * 0.4;
      });
    }
    this.refresh();
  }
  // Redraw the pictures that are near the screen and out of date.
  refresh() {
    for (const sl of this.slots) if (sl.near && sl.i !== this.active && sl.key !== this.keyFor(sl)) this.want(sl.i);
  }
  // A page changed (written on, or arrived from another device).
  invalidate(pageId) {
    this.ver.set(pageId, (this.ver.get(pageId) || 0) + 1);
    this.refresh();
  }
  keyFor(sl) {
    return `${this.s.scale.toFixed(4)}|${pageDark(sl.p) ? 1 : 0}|${this.o.viewKey()}|${this.ver.get(sl.p.id) || 0}|${sl.p.h}`;
  }

  // ---------- The live page ----------
  // Put the live page into slot i. The page it leaves keeps a picture of
  // what was on screen straight away, then gets a full one.
  place(i, old) {
    const sl = this.slots[i];
    if (!sl) return;
    if (this.active === i) { sl.paper.hidden = true; if (this.s.pageEl.parentNode !== sl.slot) sl.slot.appendChild(this.s.pageEl); return; }
    const prev = this.slots[this.active];
    sl.paper.hidden = true;
    sl.slot.appendChild(this.s.pageEl);
    if (prev) {
      this.size(prev);
      if (old?.page) this.snapshot(prev, old.page);
      prev.paper.hidden = false;
      this.ver.set(prev.p.id, (this.ver.get(prev.p.id) || 0) + 1);
    }
    this.active = i;
    this.shown = i;
    if (prev) {
      // Hidden, it was never "near"; and if it stays far, no change is
      // reported, so check now (and let go of the picture if it's far away).
      prev.near = this.isNear(prev);
      if (prev.near) this.want(prev.i); else this.drop(prev);
    }
  }

  isNear(sl) {
    const sc = this.s.scroll;
    const top = sl.slot.offsetTop;
    const bottom = top + sl.slot.offsetHeight;
    return bottom > sc.scrollTop - sc.clientHeight && top < sc.scrollTop + 2 * sc.clientHeight;
  }

  // A quick copy of the live page's canvases (only the part near the screen
  // is drawn), over the picture it had before.
  snapshot(sl, page) {
    const s = this.s;
    const v = s.view;
    if (!v || !s.bg.width) return;
    const cssW = Math.round(PAGE_W * s.scale);
    const cssH = Math.round(page.h * s.scale);
    const k = this.res(cssW, cssH);
    const c = document.createElement('canvas');
    c.className = 'slot-img';
    c.width = Math.max(1, Math.round(cssW * k));
    c.height = Math.max(1, Math.round(cssH * k));
    const ctx = c.getContext('2d');
    if (sl.img) ctx.drawImage(sl.img, 0, 0, c.width, c.height);
    try {
      for (const src of [s.bg, s.main]) ctx.drawImage(src, v.x * k, v.y * k, v.w * k, v.h * k);
    } catch { /* canvases not ready */ }
    this.setImg(sl, c, '');
  }

  res(cssW, cssH) {
    let k = Math.min(window.devicePixelRatio || 1, 2);
    if (cssW * cssH * k * k > MAX_PX) k = Math.sqrt(MAX_PX / (cssW * cssH));
    return k;
  }

  setImg(sl, c, key) {
    if (sl.img && sl.img !== c) { sl.img.width = 0; sl.img.height = 0; sl.img.remove(); }
    if (c.parentNode !== sl.paper) sl.paper.appendChild(c);
    sl.img = c;
    sl.key = key;
  }
  drop(sl) {
    if (!sl.img) return;
    sl.img.width = 0;
    sl.img.height = 0;
    sl.img.remove();
    sl.img = null;
    sl.key = '';
  }

  // ---------- Pictures of the other pages ----------
  want(i) {
    this.queue.add(i);
    this.pump();
  }
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.size) {
        // Nearest the page in view first.
        const f = this.focusIndex();
        const i = [...this.queue].sort((a, b) => Math.abs(a - f) - Math.abs(b - f))[0];
        this.queue.delete(i);
        const sl = this.slots[i];
        if (!sl || !sl.near || i === this.active) continue;
        const key = this.keyFor(sl);
        if (sl.key === key) continue;
        const gen = this.gen;
        try {
          const data = await this.o.data(sl.p.id);
          const cssW = Math.round(PAGE_W * this.s.scale);
          const cssH = Math.round(sl.p.h * this.s.scale);
          const k = this.res(cssW, cssH);
          const c = await renderPageCanvas(sl.p, data, Math.round(cssW * k), { ...this.o.view(), dark: pageDark(sl.p) });
          if (gen !== this.gen || !sl.near || i === this.active || this.keyFor(sl) !== key) { c.width = 0; continue; }
          c.className = 'slot-img';
          this.setImg(sl, c, key);
        } catch (e) { console.warn('page picture', e); }
      }
    } finally { this.busy = false; }
  }

  // ---------- Where things are ----------
  // The page under a line 40% down the screen.
  focusIndex() {
    const sc = this.s.scroll;
    const y = sc.scrollTop + sc.clientHeight * 0.4;
    for (const sl of this.slots) if (sl.slot.offsetTop + sl.slot.offsetHeight > y) return sl.i;
    return this.slots.length - 1;
  }
  top(i) {
    const sl = this.slots[i];
    return sl ? sl.slot.offsetTop : 0;
  }
  scrollToPage(i, { smooth = false } = {}) {
    const sc = this.s.scroll;
    const to = Math.max(0, this.top(i) - 12);
    if (smooth) sc.scrollTo({ top: to, behavior: 'smooth' }); else sc.scrollTop = to;
  }

  destroy() {
    this.gen++;
    this.io.disconnect();
    clearTimeout(this.settle);
    cancelAnimationFrame(this.raf);
    this.s.scroll.removeEventListener('scroll', this.onScroll);
    for (const sl of this.slots) this.drop(sl);
    // The live page goes back where it lives in the one-page view.
    this.s.scroll.insertBefore(this.s.pageEl, this.s.scroll.firstChild);
    this.el.remove();
    this.s.zoomTarget = null;
    this.slots = [];
  }
}
