// Typed notes shown as A4 pages: "Scroll down" (pages one under another) or
// "Next page" (one at a time, with Previous and Next). There is still one
// editor for the whole note, so typing, selecting, undo, the iPad keyboard and
// Scribble work as before; the pages are only how it is laid out. After each
// change the blocks are measured, and a block that would cross the bottom of a
// page is moved to the top of the next one by a see-through top border (a
// ProseMirror node decoration, which never touches the text or the undo
// history). The pages are drawn behind the text. A page break block always
// starts a new page. PDF export lays pages out the same way (`flow`, below).

import { Plugin, PluginKey, Decoration, DecorationSet, TextSelection } from '../../vendor/editor.bundle.js';
import { isTypingTarget } from '../clipimages.js';

export const A4 = 1414 / 1000; // height of an A4 page for its width
export const MARGIN = 0.07; // page margin, as a share of the page width
export const GAP = 40; // space between pages in Scroll down (holds "Page 2 of 3")
// The note column on an iPad or computer. PDF export draws pages in the same
// proportions, so a printed page holds what a page on that screen holds.
export const REF_W = 688;
// The page width each note last had on this device's screen (iPad sizes
// only): PDF export uses it, so the PDF has exactly the pages you saw.
export const seenWidth = new Map();

export const PAGE_MODES = [
  { id: 'down', name: 'Scroll down', hint: 'A4 pages, one under another. Text flows onto the next page by itself.' },
  { id: 'next', name: 'Next page', hint: 'A4 pages, one at a time. Turn them with Previous and Next.' },
  { id: 'endless', name: 'Endless', hint: 'One long page that grows as you write.' },
];
export const modeOf = (n) => (n?.kind === 'note' && !n.daily && (n.pageMode === 'down' || n.pageMode === 'next') ? n.pageMode : 'endless');

const LISTS = new Set(['bulletList', 'orderedList', 'taskList']);
// Boxes with their own border or background move down by their top margin
// instead (a border would change their look).
const BY_MARGIN = new Set(['table', 'callout', 'postit', 'blockquote']);

// Where a new page may start: each top-level block, and each item of a
// top-level list (a long list carries on over the page). Works on editor
// nodes (forEach) and on saved documents (JSON).
export function unitsOfJson(doc) {
  const out = [];
  for (const b of doc?.content || []) {
    if (LISTS.has(b.type) && (b.content || []).length) (b.content || []).forEach((item, i) => out.push({ node: item, list: b, index: i }));
    else out.push({ node: b });
  }
  return out;
}
function unitsOf(doc) {
  const out = [];
  doc.forEach((node, off) => {
    if (LISTS.has(node.type.name) && node.childCount) node.forEach((item, o) => out.push({ pos: off + 1 + o, node: item }));
    else out.push({ pos: off, node });
  });
  return out;
}
const kindOf = (type) => (type === 'pageBreak' ? 'break' : type === 'heading' ? 'heading' : 'block');

// The page layout, shared by the screen and PDF export. `items` are the
// blocks with their natural top and height (as if on one endless page, in
// the same units as H); returns how far each moves down, the page each lands
// on, and the number of pages. Rules: a block that would cross the bottom
// margin goes to the next page (unless it is taller than a page: then it
// starts where it is and runs over); a heading goes along with the block
// after it; nothing starts in a margin; after a page break, a new page.
export function flow(items, { H, P, G = 0, first = 0 }) {
  const pitch = H + G;
  const top = (s) => s * pitch + P;
  const bot = (s) => s * pitch + H - P;
  const room = H - 2 * P;
  const sheetAt = (y) => Math.max(0, Math.floor(y / pitch));
  const n = items.length;
  const push = new Array(n).fill(0);
  const sheet = new Array(n).fill(0);
  const at = new Array(n).fill(0);
  let shift = 0;
  let forced = -1;
  let end = first;
  for (let i = 0; i < n; i++) {
    const it = items[i];
    let y = it.top + shift;
    const s = sheetAt(y);
    let p = 0;
    if (it.kind === 'break') { /* stays where it is */ }
    else if (forced >= 0 && y < top(forced) - 0.5) p = top(forced) - y;
    else if (y > bot(s) + 0.5) p = top(s + 1) - y; // in the bottom margin or the gap
    else if (s > 0 && y < top(s) - 0.5) p = top(s) - y; // in the top margin
    else if (y + it.h > bot(s) + 0.5 && it.h <= room && y > top(s) + 0.5) {
      const j = i - 1;
      const hd = j >= 0 && items[j].kind === 'heading' && sheet[j] === s && at[j] > top(s) + 0.5 && items[j].h + it.h + (y - at[j] - items[j].h) <= room;
      if (hd) {
        const d = top(s + 1) - at[j];
        push[j] += d; at[j] += d; sheet[j] = s + 1; shift += d; y += d;
      } else p = top(s + 1) - y;
    }
    forced = -1;
    push[i] = p;
    shift += p;
    y += p;
    at[i] = y;
    sheet[i] = y > bot(sheetAt(y)) && it.kind !== 'break' ? sheetAt(y) + 1 : sheetAt(y);
    if (it.kind === 'break') forced = sheetAt(y) + 1;
    end = Math.max(end, y + it.h);
  }
  const count = Math.max(1, sheetAt(Math.max(0, end - 1)) + 1, forced >= 0 ? forced + 1 : 0);
  return { push, sheet, at, count, top, bot, pitch, sheetAt };
}

const key = new PluginKey('typedPages');

// The scrolling box the note sits in (the page, or a notebook's pane).
function scroller(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
  }
  return document.scrollingElement;
}

// editor: the Tiptap editor; wrap: the box around the title, pictures and
// text (#n-sheets). Returns the controls the note screen and Contents use.
export function mountPager(editor, wrap, { mode = 'down', host = null, noteId = null } = {}) {
  const view = editor.view;
  let alive = true;
  let raf = 0;
  let cur = 0; // the page shown in Next page
  let count = 1;
  let g = null; // { W, H, P, G }
  let lay = null; // the last layout from flow()
  let firstPos = [0]; // where each page starts in the text
  let painted = '';
  let ownScroll = false;
  const stats = { last: 0, max: 0, runs: 0 };

  const layer = document.createElement('div');
  layer.className = 'pg-layer';
  layer.setAttribute('aria-hidden', 'true');
  wrap.prepend(layer);
  const nav = document.createElement('div');
  nav.className = 'pg-nav';
  nav.innerHTML = '<button type="button" class="btn btn-sm" data-pg="prev">Previous</button><span class="pg-of" aria-live="polite"></span><button type="button" class="btn btn-sm" data-pg="next">Next</button>';
  wrap.after(nav);
  nav.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  nav.querySelector('[data-pg=prev]').onclick = () => turn(-1);
  nav.querySelector('[data-pg=next]').onclick = () => turn(1);

  const plugin = new Plugin({
    key,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) { const m = tr.getMeta(key); return m || set.map(tr.mapping, tr.doc); },
    },
    props: { decorations(st) { return key.getState(st); } },
    view: () => ({
      update(v, prev) {
        if (!v.state.doc.eq(prev.doc)) schedule();
        else if (mode === 'next' && !v.state.selection.eq(prev.selection)) followCaret();
      },
    }),
  });
  editor.registerPlugin(plugin);

  const schedule = () => {
    if (!alive || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paginate(); });
  };
  const ro = new ResizeObserver(() => schedule());
  ro.observe(wrap);
  ro.observe(view.dom);
  const onFonts = () => schedule();
  document.fonts?.addEventListener?.('loadingdone', onFonts);
  const onComp = () => schedule();
  view.dom.addEventListener('compositionend', onComp);

  function geometry() {
    const W = wrap.getBoundingClientRect().width;
    const H = Math.round(W * A4);
    const P = Math.max(16, Math.round(W * MARGIN));
    return { W, H, P, G: mode === 'next' ? 0 : GAP };
  }

  function applyMode() {
    wrap.classList.add('pg-on');
    wrap.classList.toggle('pg-next', mode === 'next');
    wrap.classList.toggle('pg-down', mode === 'down');
    nav.hidden = mode !== 'next';
  }

  // Lay the pages out again. Safe to call any time; does nothing while the
  // iPad keyboard is composing a word.
  function paginate() {
    if (!alive || !wrap.isConnected || editor.isDestroyed) return;
    if (view.composing) return; // picked up again at compositionend
    const t0 = performance.now();
    g = geometry();
    if (g.W < 50) return;
    const nid = noteId?.();
    if (nid && nid !== 'new') seenWidth.set(nid, g.W);
    wrap.style.setProperty('--pg-p', `${g.P}px`);
    wrap.style.setProperty('--pg-h', `${g.H}px`);
    const oy = wrap.getBoundingClientRect().top - wrap.scrollTop;
    const set = key.getState(view.state);
    const old = new Map();
    for (const d of set.find()) old.set(d.from, d.spec);
    const us = unitsOf(view.state.doc);
    const items = [];
    let cum = 0;
    for (const u of us) {
      const el = view.nodeDOM(u.pos);
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      const sp = old.get(u.pos);
      const own = sp?.push || 0;
      const top = r.top - oy - cum;
      const bottom = r.bottom - oy - cum - own;
      cum += own;
      items.push({ top, h: Math.max(0, bottom - top), kind: kindOf(u.node.type.name), u, el, sp });
    }
    // The title and pictures above the text sit on the first page.
    const headEnd = Math.max(0, (wrap.querySelector('#n-rich')?.getBoundingClientRect().top ?? oy) - oy);
    lay = flow(items, { H: g.H, P: g.P, G: g.G, first: headEnd });
    // New decorations, if anything moved.
    let changed = false;
    const decos = [];
    items.forEach((it, i) => {
      const p = lay.push[i];
      const was = it.sp?.push || 0;
      if (Math.abs(p - was) > 0.5) changed = true;
      if (p <= 0.5) return;
      const table = BY_MARGIN.has(it.u.node.type.name);
      const base = table ? (it.sp?.base ?? (parseFloat(getComputedStyle(it.el).marginTop) || 0)) : 0;
      const attrs = table ? { class: 'pg-push-m', style: `margin-top:${(base + p).toFixed(1)}px` } : { class: 'pg-push', style: `--pg:${p.toFixed(1)}px` };
      decos.push(Decoration.node(it.u.pos, it.u.pos + it.u.node.nodeSize, attrs, { push: p, base }));
    });
    if (changed) {
      const tr = view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decos)).setMeta('addToHistory', false);
      view.dispatch(tr);
    }
    count = lay.count;
    firstPos = new Array(count).fill(null);
    items.forEach((it, i) => { const s = lay.sheet[i]; if (s < count && firstPos[s] === null) firstPos[s] = it.u.pos; });
    for (let s = 0; s < count; s++) if (firstPos[s] === null) firstPos[s] = s ? firstPos[s - 1] : 0;
    paint();
    const ms = performance.now() - t0;
    stats.last = ms; stats.max = Math.max(stats.max, ms); stats.runs++;
    if (mode === 'next') { if (cur > count - 1) cur = count - 1; followCaret(true); show(cur); }
  }

  // The pages behind the text.
  function paint() {
    const sig = `${mode}|${count}|${g.W}|${g.H}`;
    const total = (count - 1) * (g.H + g.G) + g.H;
    wrap.style.minHeight = mode === 'next' ? '' : `${total}px`;
    wrap.style.height = mode === 'next' ? `${g.H}px` : '';
    if (sig === painted) return;
    painted = sig;
    let out = '';
    for (let i = 0; i < count; i++) {
      const t = i * (g.H + g.G);
      out += `<div class="pg-sheet" style="top:${t}px;height:${g.H}px"></div>`;
      if (i && mode === 'down') out += `<div class="pg-label" style="top:${t - g.G}px;height:${g.G}px"><span>Page ${i + 1} of ${count}</span></div>`;
    }
    layer.innerHTML = out;
    layer.style.height = `${total}px`;
    updateNav();
  }

  function updateNav() {
    nav.querySelector('.pg-of').textContent = `Page ${cur + 1} of ${count}`;
    nav.querySelector('[data-pg=prev]').disabled = cur <= 0;
    nav.querySelector('[data-pg=next]').disabled = cur >= count - 1;
  }

  // Next page: show page i (the box is clipped to one page and scrolled to it).
  function show(i) {
    if (mode !== 'next' || !g) return;
    cur = Math.max(0, Math.min(count - 1, i));
    const want = cur * g.H;
    if (Math.abs(wrap.scrollTop - want) > 0.5) { ownScroll = true; wrap.scrollTop = want; }
    updateNav();
  }
  // Typing (or the arrow keys) went onto another page: show that page.
  function followCaret(now = false) {
    if (mode !== 'next' || !g || !view.hasFocus()) return;
    const go = () => {
      try {
        const c = view.coordsAtPos(view.state.selection.head);
        const y = c.top - (wrap.getBoundingClientRect().top - wrap.scrollTop);
        const s = sheetOfY(y);
        if (s !== cur) show(s);
      } catch { /* position not drawn yet */ }
    };
    if (now) go(); else requestAnimationFrame(go);
  }
  const onScroll = () => {
    if (ownScroll) { ownScroll = false; return; }
    if (mode !== 'next' || !g) return;
    // Something else scrolled the page box (the editor bringing the cursor
    // into view): settle on whole pages.
    requestAnimationFrame(() => {
      if (view.hasFocus()) followCaret(true);
      const want = cur * g.H;
      if (Math.abs(wrap.scrollTop - want) > 0.5) show(view.hasFocus() ? cur : Math.floor((wrap.scrollTop + 1) / g.H));
    });
  };
  wrap.addEventListener('scroll', onScroll);

  function sheetOfY(y) {
    if (!lay) return 0;
    let s = lay.sheetAt(y);
    if (y > lay.bot(s)) s += 1;
    return Math.max(0, Math.min(count - 1, s));
  }
  // The page an element of the note is on.
  function sheetOf(el) {
    if (!el || !g) return 0;
    const r = el.getBoundingClientRect();
    const oy = wrap.getBoundingClientRect().top - wrap.scrollTop;
    const pushed = el.classList?.contains('pg-push') ? parseFloat(el.style.getPropertyValue('--pg')) || 0 : 0;
    return sheetOfY(r.top - oy + pushed + 1);
  }

  // Turn to the previous or next page (Next page), putting the cursor at the
  // top of that page while typing.
  function turn(d) {
    goTo(cur + d);
  }
  function goTo(i, { caret = true } = {}) {
    i = Math.max(0, Math.min(count - 1, i));
    if (mode === 'next') {
      const typing = caret && view.hasFocus() && editor.isEditable;
      show(i);
      if (typing && firstPos[i] != null) {
        try {
          const $p = view.state.doc.resolve(Math.min(view.state.doc.content.size, firstPos[i] + 1));
          view.dispatch(view.state.tr.setSelection(TextSelection.near($p)));
        } catch { /* ignore */ }
      }
      const sc = scroller(wrap);
      const top = wrap.getBoundingClientRect().top;
      const bar = stickyBottom();
      if (top < bar || top > window.innerHeight * 0.6) sc.scrollBy({ top: top - bar - 8, behavior: 'auto' });
      return;
    }
    if (!g) return;
    const sc = scroller(wrap);
    const y = wrap.getBoundingClientRect().top + i * (g.H + g.G);
    sc.scrollBy({ top: y - stickyBottom() - 8, behavior: Math.abs(y) > window.innerHeight * 1.5 ? 'auto' : 'smooth' });
  }
  const stickyBottom = () => {
    const s = (host || document).querySelector('#n-sticky');
    return s ? Math.max(0, s.getBoundingClientRect().bottom) : 0;
  };
  // The page you're reading.
  function current() {
    if (mode === 'next') return cur;
    if (!g) return 0;
    const oy = wrap.getBoundingClientRect().top;
    return sheetOfY(stickyBottom() + 40 - oy);
  }
  // Make sure an element of the note is on the page shown (Next page).
  function reveal(el) {
    if (mode === 'next') show(sheetOf(el));
  }

  // Keys while reading in Next page: Page Up/Down and the left and right arrows.
  const onKey = (e) => {
    if (mode !== 'next' || !wrap.isConnected || document.querySelector('.overlay')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const pane = wrap.closest('.split-pane');
    if (pane && !pane.classList.contains('active')) return;
    const typing = isTypingTarget(e.target);
    const k = e.key;
    let d = 0;
    if (k === 'PageDown' || (!typing && k === 'ArrowRight')) d = 1;
    if (k === 'PageUp' || (!typing && k === 'ArrowLeft')) d = -1;
    if (!d || (typing && !view.dom.contains(e.target))) return;
    e.preventDefault();
    turn(d);
  };
  document.addEventListener('keydown', onKey);

  applyMode();
  paginate();

  return {
    get mode() { return mode; },
    get count() { return count; },
    get page() { return current(); },
    stats,
    geometry: () => ({ ...g }),
    setMode(m) {
      if (m === mode) return;
      const was = current(); // keep the page you were reading in view
      mode = m;
      painted = '';
      cur = 0;
      applyMode();
      wrap.scrollTop = 0;
      paginate();
      goTo(was, { caret: false });
    },
    paginate,
    sheetOf,
    goTo,
    reveal,
    current,
    // Page tops on screen (client coordinates), for Contents and tests.
    sheetTops() {
      if (!g) return [];
      const oy = wrap.getBoundingClientRect().top - wrap.scrollTop;
      return Array.from({ length: count }, (_, i) => oy + i * (g.H + g.G));
    },
    firstPos: () => [...firstPos],
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', onFonts);
      document.removeEventListener('keydown', onKey);
      view.dom.removeEventListener('compositionend', onComp);
      wrap.removeEventListener('scroll', onScroll);
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
      layer.remove();
      nav.remove();
      wrap.classList.remove('pg-on', 'pg-next', 'pg-down');
      wrap.style.minHeight = '';
      wrap.style.height = '';
      wrap.scrollTop = 0;
    },
  };
}
