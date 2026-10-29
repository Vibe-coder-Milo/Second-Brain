// Map screen.

import { html, $, isWide } from '../util.js';
import { state } from '../vault.js';
import { regionColors } from '../model.js';
import { createMap } from '../graph.js';
import { icons } from '../icons.js';
import { syncSummary } from './shell.js';

export function mount(main, params, ctx) {
  let regionFilter = null;
  main.innerHTML = `${html`<div class="mapview" id="mapview">
    <div class="map-canvas" id="map-canvas" aria-label="Map of your notes. Tap a dot to open a note."></div>
    <div class="map-top">
      <div class="search">${icons.search({ size: 18 })}<label class="sr-only" for="map-q">Search notes</label><input id="map-q" type="search" placeholder="Search notes and screenshots" autocomplete="off" enterkeyhint="search"></div>
      <button type="button" class="icon-btn" id="map-sync" data-action="open-sync"></button>
    </div>
    <div class="map-chips"><div class="chips scroll" id="map-chips" role="group" aria-label="Filter by region"></div></div>
    <div class="map-empty card" id="map-empty" hidden>
      <p class="serif" style="font-size:22px;margin:0">Your map starts here</p>
      <p class="muted" style="margin:0">Capture a thought or a few screenshots. They land in your inbox, and each region grows its own territory as you file them.</p>
      <button type="button" class="btn btn-primary" data-action="capture">${icons.plus({ size: 20 })}Capture something</button>
    </div>
    <div class="map-bottom">
      <p class="map-stats" id="map-stats"></p>
      <p class="drop-hint">${icons.image({ size: 16 })}Drag screenshots onto the map to capture</p>
      <button type="button" class="icon-btn round" id="map-fit" aria-label="Fit map to screen">${icons.target()}</button>
    </div>
  </div>`}`;

  const view = $('#mapview', main);
  let currentNote = null;
  const map = createMap($('#map-canvas', main), {
    selectedId: params.note || null,
    onOpenNote: (id) => {
      if (isWide()) ctx.navigate(`#/map?note=${encodeURIComponent(id)}`, { replace: !!currentNote });
      else ctx.navigate(`#/note/${encodeURIComponent(id)}`);
    },
    onOpenRegion: (rid) => ctx.navigate(rid ? `#/notes?region=${encodeURIComponent(rid)}` : '#/inbox'),
    onBackground: () => { if (currentNote) ctx.navigate('#/map', { replace: true }); },
  });

  const q = $('#map-q', main);
  q.addEventListener('input', () => { map.setFilter({ query: q.value.trim() }); drawStats(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && q.value.trim()) ctx.navigate(`#/notes?q=${encodeURIComponent(q.value.trim())}`);
  });
  $('#map-fit', main).onclick = () => map.fit();

  function drawChips() {
    const chips = $('#map-chips', main);
    chips.innerHTML = `${html`<button type="button" class="chip" aria-pressed="${regionFilter ? 'false' : 'true'}" data-r="">All</button>
      ${state.config.regions.map((r) => html`<button type="button" class="chip" aria-pressed="${regionFilter === r.id ? 'true' : 'false'}" data-r="${r.id}"><span class="dot" style="background:${regionColors(r).dot}"></span>${r.name}</button>`)}`}`;
    chips.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = () => {
        regionFilter = b.dataset.r || null;
        map.setFilter({ regions: regionFilter ? new Set([regionFilter]) : null });
        drawChips();
        drawStats();
      };
    });
  }

  function drawStats() {
    const notes = state.notes.size;
    let links = 0;
    for (const n of state.notes.values()) links += n.links.length;
    const m = map.matchCount();
    $('#map-stats', main).textContent = m != null ? `${m} of ${notes} notes match` : `${notes} note${notes === 1 ? '' : 's'}, ${links} link${links === 1 ? '' : 's'}`;
    $('#map-empty', main).hidden = notes > 0;
  }

  function drawSync() {
    const s = syncSummary();
    const b = $('#map-sync', main);
    b.innerHTML = `${s.icon}`;
    b.style.color = s.ok ? 'var(--good)' : 'var(--muted)';
    b.setAttribute('aria-label', `${s.text}. Open sync settings`);
  }

  function setNote(id) {
    currentNote = id && state.notes.has(id) && isWide() ? id : null;
    map.select(currentNote, { center: false });
    view.classList.toggle('with-panel', !!currentNote);
    if (currentNote) ctx.showPanel(currentNote);
    else ctx.hidePanel();
  }

  // Drag and drop screenshots onto the map (iPad / desktop).
  const onDragOver = (e) => {
    if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); view.classList.add('dropping'); }
  };
  const onDragLeave = (e) => { if (e.target === view || !view.contains(e.relatedTarget)) view.classList.remove('dropping'); };
  const onDrop = (e) => {
    e.preventDefault();
    view.classList.remove('dropping');
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) ctx.openCapture({ files });
  };
  view.addEventListener('dragover', onDragOver);
  view.addEventListener('dragleave', onDragLeave);
  view.addEventListener('drop', onDrop);

  drawChips();
  drawStats();
  drawSync();
  setNote(params.note);

  return {
    update(p) { setNote(p.note); },
    onEvent(evt) {
      if (['note', 'delete', 'remote', 'sealed', 'config', 'unlock', 'ocr'].includes(evt.type)) {
        if (evt.type === 'ocr' && !evt.id) return;
        map.update();
        if (evt.type === 'config') drawChips();
        drawStats();
        if (currentNote && !state.notes.has(currentNote)) ctx.navigate('#/map', { replace: true });
      }
      if (evt.type === 'sync') drawSync();
    },
    destroy() {
      map.destroy();
      ctx.hidePanel();
    },
  };
}
