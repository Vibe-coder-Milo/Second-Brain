// App entry: routing, lock state, and wiring the pieces together.

import * as V from './vault.js';
import { state } from './vault.js';
import { meta } from './db.js';
import { startAutoSync, scheduleSync } from './sync.js';
import { runOcrQueue } from './ocr.js';
import { isWide, toast } from './util.js';
import { applyTheme, applyTextDefaults } from './theme.js';
import { registerSW } from './appupdate.js';
import { closeAllSheets, passphraseSheet, closePopover } from './ui.js';
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
import * as TodayView from './views/today.js';
import * as DeletedView from './views/deleted.js';
import * as TasksView from './views/tasks.js';
import * as LabelsView from './views/labels.js';
import * as NotebooksView from './views/notebooks.js';

const root = document.getElementById('app');
applyTheme();

// On iPhone and iPad, Safari zooms the whole app in when you tap into small
// text (a text box on a handwritten page, say) and doesn't zoom back out, so
// pages look blurry. maximum-scale stops that; iOS still lets you pinch-zoom.
const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (iOS) document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');

const NotebookView = { mount: NotebooksView.mountNotebook };
const VIEWS = { today: TodayView, map: MapView, inbox: InboxView, notes: NotesView, note: NoteView, notebooks: NotebooksView, notebook: NotebookView, tasks: TasksView, labels: LabelsView, ask: AskView, review: ReviewView, settings: SettingsView, deleted: DeletedView };
// Which tab or sidebar item lights up for each screen.
const CHROME = { note: 'notes', notebook: 'notebooks' };

let current = { name: null, key: null, inst: null };
let panel = { id: null, inst: null };
let silentHash = null;
let navDepth = 0;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  let name = parts[0] || 'today';
  if (name === 'note' || name === 'notebook') params.id = decodeURIComponent(parts[1] || (name === 'note' ? 'new' : ''));
  if (!VIEWS[name]) name = 'today';
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
    if (navDepth > 0) { navDepth--; history.back(); } else ctx.navigate('#/today', { replace: true });
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

let chrome = 'today';
function currentChrome(name, params) {
  if (name === 'note') {
    const n = state.notes.get(params.id);
    if (n?.notebook || params.notebook || params.kind === 'ink' || params.kind === 'board') return 'notebooks';
    if (n?.daily) return 'today';
  }
  return CHROME[name] || name;
}

function route() {
  if (state.status !== 'unlocked') return;
  if (silentHash && location.hash === silentHash) { silentHash = null; return; }
  silentHash = null;
  closePopover();
  const { name, params } = parseHash();
  const main = document.getElementById('main');
  if (!main) return;
  const key = name === 'note' ? `note:${params.id}` : name === 'notebook' ? `notebook:${params.id}` : name;
  if (current.name === name && current.inst?.update && (name !== 'note' || current.key === key || params.id !== 'new')) {
    current.inst.update(params);
    current.key = key;
  } else {
    current.inst?.destroy?.();
    main.innerHTML = '';
    current = { name, key, inst: VIEWS[name].mount(main, params, ctx) || {} };
    if (name !== 'map') window.scrollTo(0, 0);
  }
  chrome = currentChrome(name, params);
  refreshChrome(chrome);
}

function startUnlocked() {
  closeAllSheets();
  renderShell(root);
  route();
  startAutoSync();
  runOcrQueue().catch(() => {});
  startAutoLock();
  // Recently deleted: clear out what has been there 30 days (now, and twice a day).
  setTimeout(() => V.purgeBin().catch(() => {}), 3000);
  setInterval(() => V.purgeBin().catch(() => {}), 12 * 3600 * 1000);
  import('./semantic.js').then((S) => S.buildSoon(5000)).catch(() => {});
  import('./organiser.js').then((O) => O.autoSoon(25000)).catch(() => {});
  setTimeout(() => MapView.preloadMap().catch(() => {}), 4000);
  // When meanings are worked out, the assistant can link very alike notes (if asked to).
  let linkTimer = null;
  import('./semantic.js').then((S) => S.onSemantic((st) => {
    if (st.building || !st.total) return;
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => import('./mapassist.js').then((A) => A.autoLink()).catch(() => {}), 2500);
  })).catch(() => {});
}

async function boot() {
  registerServiceWorker();
  await V.init();
  V.onLocalChange(() => scheduleSync());
  V.subscribe((evt) => {
    if (evt.type === 'unlock') { applyTextDefaults(state.config?.text); startUnlocked(); return; }
    if (state.status !== 'unlocked') return;
    if (evt.type === 'config' || evt.type === 'remote') applyTextDefaults(state.config?.text);
    current.inst?.onEvent?.(evt);
    panel.inst?.onEvent?.(evt);
    if (['note', 'delete', 'remote', 'sealed', 'config', 'sync'].includes(evt.type)) {
      refreshChrome(chrome);
    }
    if (evt.type === 'remote') runOcrQueue().catch(() => {});
    if (['note', 'remote', 'delete', 'sealed', 'ocr'].includes(evt.type)) import('./semantic.js').then((S) => S.buildSoon(8000)).catch(() => {});
    // New captures land in the inbox; the organiser files them once they settle.
    if (['note', 'remote', 'ocr'].includes(evt.type)) import('./organiser.js').then((O) => O.autoSoon()).catch(() => {});
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
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'sb-busy'].forEach((t) => window.addEventListener(t, touch, { passive: true }));
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
  registerSW();
}

window.addEventListener('resize', () => {
  if (state.status === 'unlocked' && current.name === 'map' && !isWide() && panel.id) ctx.hidePanel();
});

boot().catch((e) => {
  console.error(e);
  root.innerHTML = '<div class="gate"><h1>Something went wrong</h1><p class="muted">Reload the page. If this keeps happening, your browser may be blocking storage (private browsing does this).</p></div>';
});

export { ctx, meta };
