// Persistent frame: sidebar (iPad/desktop) and tab bar (phone).

import { html, fmtAgo } from '../util.js';
import { state, sealedState } from '../vault.js';
import { regionColors, noteTasks } from '../model.js';
import { isoToday } from '../doc.js';
import { icons } from '../icons.js';

export function renderShell(root) {
  root.innerHTML = `${html`<div class="shell">
    <aside class="sidebar" id="sidebar" aria-label="Sidebar"></aside>
    <main id="main" class="main" tabindex="-1"></main>
    <aside id="panel" class="panel" aria-label="Selected note"></aside>
    <nav class="tabbar" id="tabbar" aria-label="Main"></nav>
  </div>`}`;
}

export function syncSummary() {
  const s = state.sync;
  switch (s.state) {
    case 'syncing': return { icon: icons.cloudSync({ size: 16, sw: 2 }), text: 'Syncing…' };
    case 'uploading': return { icon: icons.cloudSync({ size: 16, sw: 2 }), text: s.left ? `Uploading, ${s.left} left` : 'Uploading, a moment…', ok: true };
    case 'idle': return { icon: icons.cloud({ size: 16, sw: 2 }), text: `Synced ${fmtAgo(s.lastSyncAt)}, encrypted`, ok: true };
    case 'offline': return { icon: icons.cloudOff({ size: 16, sw: 2 }), text: 'Offline, saved on this device' };
    case 'error': return { icon: icons.cloudErr({ size: 16, sw: 2 }), text: 'Sync needs attention' };
    default: return { icon: icons.cloudOff({ size: 16, sw: 2 }), text: 'Saved on this device only' };
  }
}

let lateCache = { at: 0, n: 0 };
function lateTasks() {
  // Cheap enough to work out, but don't do it on every keystroke.
  if (Date.now() - lateCache.at < 3000) return lateCache.n;
  const today = isoToday();
  let n = 0;
  for (const note of state.notes.values()) for (const t of noteTasks(note)) if (!t.checked && t.due && t.due < today) n++;
  lateCache = { at: Date.now(), n };
  return n;
}

export function refreshChrome(route) {
  const notes = [...state.notes.values()];
  const inboxCount = notes.filter((n) => n.inbox).length;
  const at = (name) => (route === name ? 'page' : 'false');
  const counts = new Map();
  for (const n of notes) if (!n.inbox && n.region) counts.set(n.region, (counts.get(n.region) || 0) + 1);
  const sealed = sealedState();
  const sync = syncSummary();
  const badge = inboxCount ? html`<span class="badge">${inboxCount}</span>` : '';
  const late = lateTasks();

  const side = document.getElementById('sidebar');
  if (side) {
    side.innerHTML = `${html`
      <p class="brand">Second brain</p>
      <nav class="side-nav" aria-label="Main">
        <a class="side-link" href="#/today" aria-current="${at('today')}">${icons.today()}Today</a>
        <a class="side-link" href="#/map" aria-current="${at('map')}">${icons.map()}Map</a>
        <a class="side-link" href="#/inbox" aria-current="${at('inbox')}">${icons.inbox()}<span class="grow">Inbox</span>${badge}</a>
        <a class="side-link" href="#/notebooks" aria-current="${at('notebooks')}">${icons.notebooks()}Notebooks</a>
        <a class="side-link" href="#/tasks" aria-current="${at('tasks')}">${icons.tasks()}<span class="grow">Tasks</span>${late ? html`<span class="late-count">${late} late</span>` : ''}</a>
        <a class="side-link" href="#/labels" aria-current="${at('labels')}">${icons.tag()}Labels</a>
        <a class="side-link" href="#/notes" aria-current="${at('notes')}">${icons.notes()}All notes</a>
        <a class="side-link" href="#/ask" aria-current="${at('ask')}">${icons.ask()}Ask Claude</a>
        <a class="side-link" href="#/settings" aria-current="${at('settings')}">${icons.settings()}Settings</a>
      </nav>
      <section class="side-section" aria-labelledby="side-regions">
        <h2 id="side-regions">Regions</h2>
        ${state.config.regions.map((r) => html`<a class="side-link side-region" href="#/notes?region=${r.id}"><span class="dot lg" style="background:${regionColors(r).dot}"></span><span class="grow">${r.name}</span><span class="count">${counts.get(r.id) || 0}</span></a>`)}
        ${sealed !== 'none' ? html`<button type="button" class="side-link side-region" data-action="toggle-sealed">${sealed === 'open' ? icons.unlock() : icons.lock()}<span class="grow">Sealed</span><span class="count">${sealed === 'open' ? 'Open' : 'Locked'}</span></button>` : ''}
      </section>
      <div class="side-foot">
        <button type="button" class="btn btn-primary btn-block" data-action="capture" style="min-height:48px;font-size:16px">${icons.plus({ size: 20 })}Capture</button>
        <button type="button" class="sync-line" data-action="open-sync"><span style="color:${sync.ok ? 'var(--good)' : 'var(--muted)'};display:inline-flex">${sync.icon}</span>${sync.text}</button>
      </div>`}`;
  }

  const tab = document.getElementById('tabbar');
  if (tab) {
    tab.innerHTML = `${html`
      <a class="tab" href="#/today" aria-current="${at('today')}">${icons.today({ size: 24 })}Today${inboxCount && route !== 'today' ? html`<span class="badge dot-badge" aria-label="${inboxCount} to sort"></span>` : ''}</a>
      <a class="tab" href="#/map" aria-current="${at('map')}">${icons.map({ size: 24 })}Map</a>
      <button type="button" class="tab tab-capture" data-action="capture" aria-label="Capture"><span class="capture-pill">${icons.plus({ size: 24 })}</span></button>
      <a class="tab" href="#/notebooks" aria-current="${at('notebooks')}">${icons.notebooks({ size: 24 })}Notebooks</a>
      <a class="tab" href="#/ask" aria-current="${at('ask')}">${icons.ask({ size: 24 })}Ask</a>`}`;
  }
}
