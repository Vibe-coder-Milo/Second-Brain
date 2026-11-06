// Two notes side by side (iPad and wider screens): #/note/A?beside=B.
// Each side is a whole note screen of its own (typed, handwritten, PDF or
// whiteboard): it scrolls, zooms and turns pages by itself, and the Pencil
// writes on whichever side it touches. Pens and colours are shared, so they
// stay the same on both sides. Drag the bar in the middle to resize; swap the
// sides or close one. The pair is remembered: opening A again brings B back
// beside it, until you close the right side.

import { html, $, isWide } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { icons } from '../icons.js';

export const besideHash = (a, b) => `#/note/${encodeURIComponent(a)}?beside=${encodeURIComponent(b)}`;
const MIN = 0.28;

// The note last opened beside this one (kept on this device).
export function pairOf(id) {
  const b = state.device?.besides?.[id];
  return b && state.notes.has(b) && b !== id ? b : null;
}
async function rememberPair(a, b) {
  const besides = { ...(state.device?.besides || {}) };
  if (b) besides[a] = b; else delete besides[a];
  const keys = Object.keys(besides);
  if (keys.length > 200) delete besides[keys[0]];
  await V.updateDevice({ besides }).catch(() => {});
}

export function mount(el, params, ctx) {
  let a = params.id;
  let b = params.beside;
  let share = Number(state.device?.splitShare) || 0.5;
  const panes = { a: null, b: null };
  let destroyed = false;

  document.body.classList.add('split-on');
  el.innerHTML = `${html`<div class="split" id="split">
    <div class="split-pane nb-pane" data-side="a"></div>
    <div class="split-bar" role="separator" aria-orientation="vertical" aria-label="Drag to give one side more room" tabindex="0"><span></span></div>
    <div class="split-pane nb-pane" data-side="b"></div>
    <div class="split-ctl" role="group" aria-label="Side by side">
      <button type="button" class="btn btn-sm" data-split="swap">${icons.swap({ size: 16 })}Swap sides</button>
      <button type="button" class="btn btn-sm" data-split="close">${icons.close({ size: 16 })}Close right</button>
    </div>
  </div>`}`;
  const root = $('#split', el);
  const paneEl = (side) => root.querySelector(`[data-side="${side}"]`);
  const setShare = (k) => { share = Math.max(MIN, Math.min(1 - MIN, k)); root.style.setProperty('--split', `${(share * 100).toFixed(1)}%`); };
  setShare(share);

  // Each side's navigation: a note opened from a side opens on that side;
  // anything else leaves side by side.
  const ctxFor = (side) => ({
    ...ctx,
    navigate(hash, opts = {}) {
      const m = hash.match(/^#\/note\/([^?]+)(?:\?(.*))?$/);
      if (m && m[1] !== 'new' && !(m[2] || '').includes('beside=')) {
        const id = decodeURIComponent(m[1]);
        if (side === 'a' && id !== b) return ctx.navigate(besideHash(id, b), opts);
        if (side === 'b' && id !== a) return ctx.navigate(besideHash(a, id), opts);
      }
      return ctx.navigate(hash, opts);
    },
    back() { if (side === 'b') close(); else ctx.back(); },
  });

  async function mountSide(side, id) {
    const host = paneEl(side);
    panes[side]?.destroy?.();
    host.innerHTML = '';
    const { mount: mountNote } = await import('./note.js');
    if (destroyed) return;
    panes[side] = mountNote(host, { id }, ctxFor(side)) || {};
    // The note that left may have cleared page-wide classes the other side still needs.
    if (root.querySelector('.inkview, .bd')) document.body.classList.add('inking');
    if (root.querySelector('.bd')) document.body.classList.add('boarding');
  }
  // The side you last touched is the active one (its toolbar shows fully).
  const activate = (side) => {
    for (const s of ['a', 'b']) paneEl(s).classList.toggle('active', s === side);
    root.dataset.active = side;
  };
  for (const s of ['a', 'b']) paneEl(s).addEventListener('pointerdown', () => activate(s), true);
  activate('b');

  // Dragging the bar.
  const bar = root.querySelector('.split-bar');
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    const r = root.getBoundingClientRect();
    const mv = (ev) => setShare((ev.clientX - r.left) / r.width);
    const up = () => {
      bar.removeEventListener('pointermove', mv);
      bar.removeEventListener('pointerup', up);
      V.updateDevice({ splitShare: Math.round(share * 100) / 100 }).catch(() => {});
      window.dispatchEvent(new Event('resize'));
    };
    bar.addEventListener('pointermove', mv);
    bar.addEventListener('pointerup', up);
  });
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setShare(share + (e.key === 'ArrowLeft' ? -0.05 : 0.05)); window.dispatchEvent(new Event('resize')); }
  });

  function close() {
    rememberPair(a, null);
    ctx.navigate(`#/note/${encodeURIComponent(a)}`, { replace: true });
  }
  root.querySelector('[data-split=swap]').onclick = () => { rememberPair(b, a); rememberPair(a, null); ctx.navigate(besideHash(b, a), { replace: true }); };
  root.querySelector('[data-split=close]').onclick = () => close();

  async function show() {
    if (!state.notes.has(a) || !state.notes.has(b) || a === b || !isWide()) {
      ctx.navigate(`#/note/${encodeURIComponent(state.notes.has(a) ? a : b)}`, { replace: true });
      return;
    }
    rememberPair(a, b);
    await mountSide('a', a);
    await mountSide('b', b);
  }
  show();

  return {
    update(p) {
      const na = p.id;
      const nb = p.beside;
      if (na === a && nb === b) return;
      const keepA = na === a;
      const keepB = nb === b;
      a = na; b = nb;
      if (!state.notes.has(a) || !state.notes.has(b) || a === b) { show(); return; }
      rememberPair(a, b);
      if (!keepA) mountSide('a', a);
      if (!keepB) mountSide('b', b);
    },
    onEvent(evt) {
      panes.a?.onEvent?.(evt);
      panes.b?.onEvent?.(evt);
      if (evt.type === 'delete' && (evt.id === a || evt.id === b)) show();
    },
    destroy() {
      destroyed = true;
      panes.a?.destroy?.();
      panes.b?.destroy?.();
      document.body.classList.remove('split-on');
    },
  };
}
