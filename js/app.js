// App entry: routing, lock state, and wiring the pieces together.

import * as V from './vault.js';
import { state } from './vault.js';
import { meta } from './db.js';
import { startAutoSync, scheduleSync } from './sync.js';
import { runOcrQueue } from './ocr.js';
import { isWide, toast } from './util.js';
import { closeAllSheets, passphraseSheet } from './ui.js';
import { renderShell, refreshChrome } from './views/shell.js';
import { renderUnlock, renderOnboarding } from './views/gate.js';
import { openCapture } from './views/capture.js';
import * as MapView from './views/map.js';
import * as InboxView from './views/inbox.js';
import * as NotesView from './views/notes.js';
import * as NoteView from './views/note.js';
import * as AskView from './views/ask.js';
import * as ReviewView from './views/review.js';
import * as SettingsView from './views/settings.js';

const root = document.getElementById('app');
const VIEWS = { map: MapView, inbox: InboxView, notes: NotesView, note: NoteView, ask: AskView, review: ReviewView, settings: SettingsView };

let current = { name: null, key: null, inst: null };
let panel = { id: null, inst: null };
let silentHash = null;
let navDepth = 0;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  let name = parts[0] || 'map';
  if (name === 'note') params.id = decodeURIComponent(parts[1] || 'new');
  if (!VIEWS[name]) name = 'map';
  return { name, params };
}

const ctx = {
  navigate(hash, { replace = false, silent = false } = {}) {
    if (silent) silentHash = hash;
    if (replace) {
      history.replaceState(null, '', hash);
      if (!silent) route();
    } else {
      navDepth++;
      location.hash = hash;
    }
  },
  back() {
    if (navDepth > 0) { navDepth--; history.back(); } else ctx.navigate('#/map', { replace: true });
  },
  openCapture: (opts = {}) => openCapture(opts, ctx),
  runOcr: () => runOcrQueue().catch(() => {}),
  showPanel(id) {
    const el = document.getElementById('panel');
    if (!el) return;
    el.classList.add('open');
    if (panel.inst && panel.id === id) return;
    panel.inst = NoteView.mount(el, { id, compact: true }, ctx);
    panel.id = id;
    el.scrollTop = 0;
  },
  hidePanel() {
    const el = document.getElementById('panel');
    if (!el) return;
    el.classList.remove('open');
    el.innerHTML = '';
    panel = { id: null, inst: null };
  },
  async unlockSealed() {
    if (state.keys.s) return true;
    if (V.sealedState() === 'none') return false;
    const p = await passphraseSheet({ title: 'Open sealed notes', confirmLabel: 'Open', check: (x) => V.unlockSealed(x) });
    return !!p;
  },
};

function route() {
  if (state.status !== 'unlocked') return;
  if (silentHash && location.hash === silentHash) { silentHash = null; return; }
  silentHash = null;
  const { name, params } = parseHash();
  const main = document.getElementById('main');
  if (!main) return;
  const key = name === 'note' ? `note:${params.id}` : name;
  if (current.name === name && current.inst?.update && (name !== 'note' || current.key === key || params.id !== 'new')) {
    current.inst.update(params);
    current.key = key;
  } else {
    current.inst?.destroy?.();
    main.innerHTML = '';
    current = { name, key, inst: VIEWS[name].mount(main, params, ctx) || {} };
    if (name !== 'map') window.scrollTo(0, 0);
  }
  refreshChrome(name === 'note' ? 'notes' : name);
}

function startUnlocked() {
  closeAllSheets();
  renderShell(root);
  route();
  startAutoSync();
  runOcrQueue().catch(() => {});
  startAutoLock();
}

async function boot() {
  registerServiceWorker();
  await V.init();
  V.onLocalChange(() => scheduleSync());
  V.subscribe((evt) => {
    if (evt.type === 'unlock') { startUnlocked(); return; }
    if (state.status !== 'unlocked') return;
    current.inst?.onEvent?.(evt);
    panel.inst?.onEvent?.(evt);
    if (['note', 'delete', 'remote', 'sealed', 'config', 'sync'].includes(evt.type)) {
      refreshChrome(current.name === 'note' ? 'notes' : current.name);
    }
    if (evt.type === 'remote') runOcrQueue().catch(() => {});
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a || state.status !== 'unlocked') return;
    const act = a.dataset.action;
    if (act === 'capture') { e.preventDefault(); ctx.openCapture(); }
    if (act === 'open-sync') { e.preventDefault(); ctx.navigate('#/settings'); }
    if (act === 'toggle-sealed') {
      e.preventDefault();
      if (state.keys.s) { V.lockSealed(); toast('Sealed notes locked'); } else ctx.unlockSealed();
    }
  });
  // Paste an image anywhere (outside text fields) to capture it.
  document.addEventListener('paste', (e) => {
    if (state.status !== 'unlocked' || document.querySelector('.overlay')) return;
    if (e.target.closest?.('input, textarea')) return;
    const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); ctx.openCapture({ files: imgs }); }
  });

  if (state.status === 'new') renderOnboarding(root);
  else if (state.status === 'locked') await renderUnlock(root);
}

// ---- Auto-lock -------------------------------------------------------------

let lastActive = Date.now();
let hiddenAt = null;
function startAutoLock() {
  const touch = () => { lastActive = Date.now(); };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.addEventListener(t, touch, { passive: true }));
  const limit = () => (state.device?.autoLockMin || 10) * 60000;
  setInterval(() => {
    if (state.status === 'unlocked' && Date.now() - lastActive > limit()) V.lock();
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > limit()) V.lock();
    else touch();
  });
}

// ---- Service worker (offline + home-screen app) ----------------------------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('An update is ready. It applies next time you open the app.', { ms: 5000 });
        }
      });
    });
  }).catch(() => {});
}

window.addEventListener('resize', () => {
  if (state.status === 'unlocked' && current.name === 'map' && !isWide() && panel.id) ctx.hidePanel();
});

boot().catch((e) => {
  console.error(e);
  root.innerHTML = '<div class="gate"><h1>Something went wrong</h1><p class="muted">Reload the page. If this keeps happening, your browser may be blocking storage (private browsing does this).</p></div>';
});

export { ctx, meta };
