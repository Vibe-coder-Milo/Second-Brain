// Keeping the app up to date. The service worker fetches a new version in the
// background; this checks for one whenever the app comes back to the screen,
// and offers to switch to it straight away (or does, if the app is locked).

import { state } from './vault.js';

let reg = null;
let waitingUpdate = false;

export function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((r) => {
    reg = r;
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      w?.addEventListener('statechange', () => {
        // The new version is in place. (On first install there's nothing to switch.)
        if (w.state === 'activated' && hadController) ready();
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
    setInterval(() => checkForUpdate(), 30 * 60 * 1000);
  }).catch(() => {});
}

function ready() {
  waitingUpdate = true;
  // Locked: nothing to lose, switch now.
  if (state.status === 'locked') { location.reload(); return; }
  showBar();
}

function showBar() {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>A new version of the app is ready.</span><button type="button" class="btn btn-sm btn-primary" data-up="now">Update now</button><button type="button" class="btn btn-sm btn-ghost" data-up="later">Later</button>';
  bar.querySelector('[data-up=now]').onclick = () => location.reload();
  bar.querySelector('[data-up=later]').onclick = () => bar.remove();
  document.body.appendChild(bar);
}

// Ask the server for a newer version. Resolves true if one is on its way.
export async function checkForUpdate() {
  if (!reg) return false;
  try {
    await reg.update();
  } catch { return false; }
  return !!(reg.installing || reg.waiting) || waitingUpdate;
}

// The version this device is running, from the service worker's cache name.
export async function appVersion() {
  try {
    const keys = await caches.keys();
    const v = keys.map((k) => /^sb-v(\d+)$/.exec(k)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => b - a)[0];
    if (v) return `Version ${v}`;
  } catch { /* no caches here */ }
  try {
    const t = await (await fetch('sw.js', { cache: 'no-store' })).text();
    const m = /VERSION = 'sb-v(\d+)'/.exec(t);
    if (m) return `Version ${m[1]}`;
  } catch { /* offline */ }
  return 'Version unknown';
}

export const updatePending = () => waitingUpdate;
