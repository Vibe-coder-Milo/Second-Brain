// Persistent frame: sidebar (iPad/desktop) and tab bar (phone).

import { html, fmtAgo } from '../util.js';
import { state, sealedState, binItems } from '../vault.js';
import { regionColors } from '../model.js';
import { icons } from '../icons.js';
import { menuCounts } from '../counts.js';

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

// "3 due": tasks due today or earlier and not ticked. Today and Tasks show the same.
const duePill = (n) => (n ? html`<span class="due-count">${n} due</span>` : '');
const countOf = (n) => (n ? html`<span class="count">${n}</span>` : '');

// What Recently deleted lists (notes deleted with a notebook count with it).
const binCount = () => binItems().length;

export function refreshChrome(route) {
  const notes = [...state.notes.values()];
  const inboxCount = notes.filter((n) => n.inbox).length;
  const at = (name) => (route === name ? 'page' : 'false');
  const counts = new Map();
  for (const n of notes) if (!n.inbox && n.region) counts.set(n.region, (counts.get(n.region) || 0) + 1);
  const sealed = sealedState();
  const sync = syncSummary();
  const badge = inboxCount ? html`<span class="badge">${inboxCount}</span>` : '';
  const mc = menuCounts();
  // Tasks to do in each region, in the order of the regions (then the rest).
  const taskRegions = [...state.config.regions.map((r) => ({ id: r.id, name: r.name, dot: regionColors(r).dot })), { id: '', name: 'No region', dot: regionColors(null).dot }]
    .map((r) => ({ ...r, ...(mc.byRegion.get(r.id) || { open: 0, due: 0 }) }))
    .filter((r) => r.open);

  const side = document.getElementById('sidebar');
  if (side) {
    side.innerHTML = `${html`
      <p class="brand">Second brain</p>
      <nav class="side-nav" aria-label="Main">
        <a class="side-link" href="#/today" aria-current="${at('today')}">${icons.today()}<span class="grow">Today</span>${duePill(mc.due)}</a>
        <a class="side-link" href="#/map" aria-current="${at('map')}">${icons.map()}Map</a>
        <a class="side-link" href="#/inbox" aria-current="${at('inbox')}">${icons.inbox()}<span class="grow">Inbox</span>${badge}</a>
        <a class="side-link" href="#/notebooks" aria-current="${at('notebooks')}">${icons.notebooks()}Notebooks</a>
        <a class="side-link" href="#/tasks" aria-current="${at('tasks')}">${icons.tasks()}<span class="grow">Tasks</span>${duePill(mc.due)}${countOf(mc.open)}</a>
        ${taskRegions.length ? html`<div class="side-sub" role="group" aria-label="Tasks by region">${taskRegions.map((r) => html`<a class="side-link side-subl" href="#/tasks?by=region&amp;region=${r.id || 'none'}" aria-label="${r.name}: ${r.open} to do${r.due ? `, ${r.due} due` : ''}"><span class="dot" style="background:${r.dot}"></span><span class="grow">${r.name}</span><span class="count">${r.open}</span></a>`)}</div>` : ''}
        <a class="side-link" href="#/labels" aria-current="${at('labels')}">${icons.tag()}<span class="grow">Labels</span>${countOf(mc.labels)}</a>
        <a class="side-link" href="#/highlights" aria-current="${at('highlights')}">${icons.highlighter()}<span class="grow">Highlights</span>${countOf(mc.highlights)}</a>
        <a class="side-link" href="#/notes" aria-current="${at('notes')}">${icons.notes()}All notes</a>
        <a class="side-link" href="#/ask" aria-current="${at('ask')}">${icons.ask()}Ask Claude</a>
        <a class="side-link" href="#/settings" aria-current="${at('settings')}">${icons.settings()}Settings</a>
        <a class="side-link" href="#/deleted" aria-current="${at('deleted')}">${icons.trash()}<span class="grow">Recently deleted</span>${state.bin.size ? html`<span class="count">${binCount()}</span>` : ''}</a>
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
