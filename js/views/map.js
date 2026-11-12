// Map screen: your notes, their regions and every connection between them.
// The map assistant keeps it up to date by itself: related lines appear as
// notes are written, new notes are filed, and it points out a few patterns.

import { html, raw, $, isWide, toast, fmtDate } from '../util.js';
import { state } from '../vault.js';
import { regionColors, displayTitle, kindName } from '../model.js';
import { createMap } from '../graph.js';
import { KINDS, DEFAULT_SHOWN, labelsInUse } from '../mapdata.js';
import { icons } from '../icons.js';
import { popover, closePopover } from '../ui.js';
import { syncSummary } from './shell.js';

const SHOWN_KEY = 'sb-map-shown';
const loadShown = () => { try { const v = JSON.parse(localStorage.getItem(SHOWN_KEY)); return Array.isArray(v) ? v : DEFAULT_SHOWN; } catch { return DEFAULT_SHOWN; } };
const saveShown = (v) => { try { localStorage.setItem(SHOWN_KEY, JSON.stringify(v)); } catch { /* private mode */ } };

// The map library (force-graph) is only fetched when you open the map, so it
// doesn't slow the app's start. It's fetched in the background soon after
// unlocking too, so the map is usually ready by the time you tap it.
let graphLib = null;
export function preloadMap() {
  if (window.ForceGraph) return Promise.resolve();
  if (!graphLib) {
    graphLib = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'vendor/force-graph.min.js';
      s.onload = () => ok();
      s.onerror = () => { graphLib = null; s.remove(); fail(new Error('The map could not load.')); };
      document.head.appendChild(s);
    });
  }
  return graphLib;
}

export function mount(main, params, ctx) {
  if (window.ForceGraph) return mountMap(main, params, ctx);
  main.innerHTML = `${html`<div class="mapview"><p class="status-line map-loading">${icons.spinner({ size: 18 })}Opening your map…</p></div>`}`;
  let inst = null;
  let gone = false;
  let last = params;
  const start = () => preloadMap().then(() => { if (!gone) inst = mountMap(main, last, ctx); }).catch((e) => {
    if (gone) return;
    main.innerHTML = `${html`<div class="mapview"><div class="map-loading"><p class="error">${e.message} Check your connection and try again.</p><button type="button" class="btn" data-retry>Try again</button></div></div>`}`;
    main.querySelector('[data-retry]').onclick = start;
  });
  start();
  return {
    update(p) { last = p; inst?.update(p); },
    onEvent(evt) { inst?.onEvent(evt); },
    destroy() { gone = true; inst?.destroy(); },
  };
}

function mountMap(main, params, ctx) {
  let regionFilter = null;
  let since = 0; // only notes worked on since then (0: any time)
  const TIMES = [[0, 'Any time'], [7, 'Past week'], [30, 'Past month'], [90, 'Past 3 months'], [365, 'Past year']];
  let sinceDays = 0;
  let showing = null; // { text, ids } from "Show" on something noticed
  let pickedId = null; // a note picked on the map (card at the bottom)
  main.innerHTML = `${html`<div class="mapview" id="mapview">
    <div class="map-canvas" id="map-canvas" aria-label="Map of your notes. Tap a dot to see what it connects to."></div>
    <div class="map-top">
      <div class="search">${icons.search({ size: 18 })}<label class="sr-only" for="map-q">Search notes</label><input id="map-q" type="search" placeholder="Search notes and screenshots" autocomplete="off" enterkeyhint="search"></div>
      <button type="button" class="icon-btn" id="map-sync" data-action="open-sync"></button>
    </div>
    <div class="map-chips"><div class="chips scroll" id="map-chips" role="group" aria-label="Filter by region"></div><div class="map-state" id="map-state" hidden></div></div>
    <aside class="map-legend" id="map-legend" aria-label="Connections"></aside>
    <aside class="map-notice" id="map-notice" aria-label="Noticed by the map assistant" hidden></aside>
    <div class="map-card" id="map-card" hidden></div>
    <div class="map-empty card" id="map-empty" hidden>
      <p class="serif" style="font-size:22px;margin:0">Your map starts here</p>
      <p class="muted" style="margin:0">Capture a thought or a few screenshots. The map assistant files them into regions and connects related notes by itself.</p>
      <button type="button" class="btn btn-primary" data-action="capture">${icons.plus({ size: 20 })}Capture something</button>
    </div>
    <div class="map-bottom">
      <p class="map-stats" id="map-stats"></p>
      <p class="drop-hint">${icons.image({ size: 16 })}Drag screenshots onto the map to capture</p>
      <div class="map-actions">
        <button type="button" class="btn btn-sm map-btn show-narrow" id="map-legend-btn" aria-expanded="false">${icons.link({ size: 17 })}<span>Connections</span></button>
        <button type="button" class="btn btn-sm map-btn" id="map-notice-btn" aria-expanded="false" aria-label="What the map assistant noticed" hidden>${icons.sparkle({ size: 17 })}<span id="map-notice-n">Noticed</span></button>
        <button type="button" class="btn btn-sm map-btn map-org" id="map-org" aria-label="Organise: file notes into regions, and add regions they need">${icons.folder({ size: 17 })}<span class="hide-narrow">Organise</span></button>
        <button type="button" class="icon-btn round" id="map-fit" aria-label="Fit map to screen">${icons.target()}</button>
      </div>
    </div>
  </div>`}`;

  const view = $('#mapview', main);
  let currentNote = null;
  const map = createMap($('#map-canvas', main), {
    selectedId: params.note || null,
    shown: loadShown(),
    onOpenNote: (id) => {
      // Wide screens open the note beside the map; phones show a card first.
      if (isWide()) ctx.navigate(`#/map?note=${encodeURIComponent(id)}`, { replace: !!currentNote });
      else pick(id);
    },
    onOpenRegion: (rid) => ctx.navigate(rid ? `#/notes?region=${encodeURIComponent(rid)}` : '#/inbox'),
    onOpenLabel: (lid) => ctx.navigate(`#/labels?l=${encodeURIComponent(lid)}`),
    onLinkClick: (l) => linkPopover(l),
    onBackground: () => {
      if (pickedId) { pick(null); return; }
      if (currentNote) ctx.navigate('#/map', { replace: true });
    },
  });

  const q = $('#map-q', main);
  q.addEventListener('input', () => { map.setFilter({ query: q.value.trim() }); drawStats(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && q.value.trim()) ctx.navigate(`#/notes?q=${encodeURIComponent(q.value.trim())}`);
  });
  $('#map-fit', main).onclick = () => map.fit();
  $('#map-org', main).onclick = () => import('./organise.js').then((M) => M.organiseSheet());
  const toggleCard = (btn, card) => {
    const open = !card.classList.contains('open');
    for (const [b, c] of [[$('#map-legend-btn', main), $('#map-legend', main)], [$('#map-notice-btn', main), $('#map-notice', main)]]) {
      c.classList.toggle('open', c === card && open);
      b.setAttribute('aria-expanded', c === card && open ? 'true' : 'false');
    }
  };
  $('#map-legend-btn', main).onclick = (e) => toggleCard(e.currentTarget, $('#map-legend', main));
  $('#map-notice-btn', main).onclick = (e) => toggleCard(e.currentTarget, $('#map-notice', main));

  // ---- Region chips -------------------------------------------------------------
  function drawChips() {
    const chips = $('#map-chips', main);
    chips.innerHTML = `${html`<button type="button" class="chip time-chip" data-time aria-haspopup="true" aria-pressed="${sinceDays ? 'true' : 'false'}">${icons.history({ size: 15 })}${TIMES.find((t) => t[0] === sinceDays)[1]}</button>
      <button type="button" class="chip" aria-pressed="${regionFilter ? 'false' : 'true'}" data-r="">All</button>
      ${state.config.regions.map((r) => html`<button type="button" class="chip" aria-pressed="${regionFilter === r.id ? 'true' : 'false'}" data-r="${r.id}"><span class="dot" style="background:${regionColors(r).dot}"></span>${r.name}</button>`)}`}`;
    chips.querySelector('[data-time]').onclick = (e) => {
      const p = popover(e.currentTarget, `${html`<div class="pop-head">Notes worked on</div>${TIMES.map(([d, name]) => html`<button type="button" class="pop-item" data-days="${d}" aria-pressed="${d === sinceDays ? 'true' : 'false'}">${name}</button>`)}`}`, { label: 'When', width: 220 });
      p.el.querySelectorAll('[data-days]').forEach((b) => {
        b.onclick = () => {
          sinceDays = Number(b.dataset.days);
          since = sinceDays ? Date.now() - sinceDays * 86400000 : 0;
          map.setFilter({ since: since || null });
          p.close();
          drawChips();
          drawStats();
        };
      });
    };
    chips.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = () => {
        regionFilter = b.dataset.r || null;
        map.setFilter({ regions: regionFilter ? new Set([regionFilter]) : null });
        drawChips();
        drawStats();
      };
    });
  }

  // ---- Legend: every kind of connection, tap to show or hide ----------------------
  // Work that finishes after leaving the map does nothing.
  let gone = false;
  function drawLegend() {
    if (gone) return;
    const box = $('#map-legend', main);
    const counts = map.counts();
    const shown = new Set(map.shown());
    const labels = labelsInUse().size;
    box.innerHTML = `${html`<div class="ml-head"><span>Connections</span></div>
      <ul class="ml-list">${KINDS.map((k) => {
        const n = k.id === 'label' ? labels : counts[k.id] || 0;
        return html`<li><button type="button" class="ml-kind" data-kind="${k.id}" aria-pressed="${shown.has(k.id) ? 'true' : 'false'}">
          <span class="kind-line ${k.dash ? 'dash' : ''}" style="--k:var(${k.css})"></span><span class="ml-name">${k.name}</span><span class="ml-n">${n}</span></button></li>`;
      })}</ul>
      <button type="button" class="ml-play" data-play>${icons.play({ size: 16 })}<span>Replay how your map grew</span></button>`}`;
    box.querySelectorAll('[data-kind]').forEach((b) => {
      b.onclick = () => {
        const s = new Set(map.shown());
        if (s.has(b.dataset.kind)) s.delete(b.dataset.kind); else s.add(b.dataset.kind);
        map.setShown([...s]);
        saveShown([...s]);
        drawLegend();
      };
    });
    box.querySelector('[data-play]').onclick = () => replay();
  }

  function replay() {
    const st = $('#map-state', main);
    pick(null);
    st.hidden = false;
    st.innerHTML = `${html`<span class="ms-text" id="ms-date"></span><button type="button" class="icon-btn bare sm" data-stop aria-label="Stop the replay">${icons.close({ size: 16 })}</button>`}`;
    const stop = () => { map.stopPlay(); st.hidden = true; drawState(); };
    st.querySelector('[data-stop]').onclick = stop;
    map.play({ ms: 7000, onTick: (t) => { const d = $('#ms-date', main); if (d) d.textContent = fmtDate(t, { year: 'always' }); }, onDone: () => setTimeout(stop, 900) });
  }

  // ---- Noticed by the assistant -------------------------------------------------------
  let notes = [];
  async function drawNotice() {
    const { noticed } = await import('../mapassist.js');
    if (gone) return;
    notes = state.notes.size >= 3 ? noticed() : [];
    const box = $('#map-notice', main);
    const btn = $('#map-notice-btn', main);
    box.hidden = !notes.length;
    btn.hidden = !notes.length;
    $('#map-notice-n', main).textContent = notes.length ? `${notes.length} noticed` : 'Noticed';
    btn.classList.toggle('fresh', notes.length > 0 && !box.classList.contains('open'));
    if (!notes.length) return;
    box.innerHTML = `${html`<div class="ml-head">${icons.sparkle({ size: 15 })}<span>Noticed</span></div>
      <button type="button" class="icon-btn bare sm mn-close" data-close aria-label="Close">${icons.close({ size: 16 })}</button>
      <ul class="mn-list">${notes.map((x, i) => html`<li><p>${x.text}</p><div class="mn-act"><button type="button" class="btn btn-sm" data-show="${i}">Show</button>${x.action ? html`<button type="button" class="btn btn-sm btn-ghost" data-act="${i}">${x.action.name}</button>` : ''}</div></li>`)}</ul>
      <p class="hint">Found on this device by the map assistant.</p>`}`;
    box.querySelectorAll('[data-show]').forEach((b) => { b.onclick = () => show(notes[Number(b.dataset.show)]); });
    box.querySelector('[data-close]').onclick = () => toggleCard(btn, box);
    box.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        await notes[Number(b.dataset.act)].action.run();
        toast('Linked');
      };
    });
  }

  function show(x) {
    pick(null);
    showing = x ? { text: x.text, ids: new Set(x.ids) } : null;
    map.setFilter({ ids: showing ? showing.ids : null });
    if (showing) map.fitTo(showing.ids); else map.fit();
    drawState();
    drawStats();
    // Out of the way, so what's shown is in view.
    const nb = $('#map-notice-btn', main);
    $('#map-notice', main).classList.remove('open');
    nb.setAttribute('aria-expanded', 'false');
    if (!isWide()) { $('#map-legend', main).classList.remove('open'); $('#map-legend-btn', main).setAttribute('aria-expanded', 'false'); }
  }

  // A strip under the chips saying what the map is showing, with a way back.
  function drawState() {
    const st = $('#map-state', main);
    const f = map.focused();
    if (!showing && !f) { st.hidden = true; st.innerHTML = ''; return; }
    st.hidden = false;
    if (f) {
      st.innerHTML = `${html`<span class="ms-text">Connections of <strong>${displayTitle(state.notes.get(f.id) || { title: '' })}</strong></span>
        <div class="seg" role="radiogroup" aria-label="How far"><button type="button" role="radio" data-depth="1" aria-checked="${f.depth === 1 ? 'true' : 'false'}">Direct</button><button type="button" role="radio" data-depth="2" aria-checked="${f.depth === 2 ? 'true' : 'false'}">2 steps</button></div>
        <button type="button" class="icon-btn bare sm" data-clear aria-label="Show the whole map">${icons.close({ size: 16 })}</button>`}`;
      st.querySelectorAll('[data-depth]').forEach((b) => { b.onclick = () => { map.focusOn(f.id, Number(b.dataset.depth)); drawState(); }; });
      st.querySelector('[data-clear]').onclick = () => { map.focusOn(null); drawState(); map.fit(); };
    } else {
      st.innerHTML = `${html`<span class="ms-text">${showing.text}</span><button type="button" class="icon-btn bare sm" data-clear aria-label="Show everything">${icons.close({ size: 16 })}</button>`}`;
      st.querySelector('[data-clear]').onclick = () => show(null);
    }
  }

  // ---- A note picked on the map -----------------------------------------------------
  function pick(id) {
    pickedId = id && state.notes.has(id) ? id : null;
    if (!currentNote) map.select(pickedId);
    const card = $('#map-card', main);
    if (!pickedId) { card.hidden = true; card.innerHTML = ''; return; }
    const n = state.notes.get(pickedId);
    const reg = state.config.regions.find((r) => r.id === n.region);
    const near = map.neighboursOf(pickedId).length;
    card.hidden = false;
    card.innerHTML = `${html`<div class="mc-main"><span class="dot" style="background:${regionColors(n.inbox ? null : reg).dot}"></span>
        <div class="mc-t"><strong>${displayTitle(n)}</strong><span class="muted">${n.inbox ? 'Inbox' : reg?.name || 'Unsorted'} · ${kindName(n)} · ${near} connection${near === 1 ? '' : 's'}</span></div>
        <button type="button" class="icon-btn bare sm" data-close aria-label="Close">${icons.close({ size: 16 })}</button></div>
      <div class="btn-row"><a class="btn btn-sm btn-primary" href="#/note/${n.id}" style="flex:1">Open</a>${near ? html`<button type="button" class="btn btn-sm" data-focus style="flex:1">${icons.target({ size: 16 })}Only its connections</button>` : ''}</div>`}`;
    card.querySelector('[data-close]').onclick = () => pick(null);
    const fb = card.querySelector('[data-focus]');
    if (fb) fb.onclick = () => { map.focusOn(pickedId, 1); drawState(); };
  }

  // ---- A line tapped -------------------------------------------------------------------
  function linkPopover(l) {
    const a = state.notes.get(l.a);
    const b = state.notes.get(l.b) || null;
    if (!a || !b) return;
    const k = KINDS.find((x) => x.id === l.kind);
    const p = popover({ x: l.x, y: l.y, h: 4 }, `${html`<div class="lp">
      <p class="lp-kind"><span class="kind-line ${k?.dash ? 'dash' : ''}" style="--k:var(${k?.css || '--c-link'})"></span>${k?.name || 'Connection'}</p>
      <p class="lp-notes"><a href="#/note/${a.id}">${displayTitle(a)}</a> <span class="muted">and</span> <a href="#/note/${b.id}">${displayTitle(b)}</a></p>
      ${l.why ? html`<p class="hint">${l.why}</p>` : ''}
      ${l.kind === 'related' ? html`<div class="btn-row"><button type="button" class="btn btn-sm btn-primary" data-keep>Link them</button><button type="button" class="btn btn-sm btn-ghost" data-no>Not related</button></div>` : ''}
    </div>`}`, { label: 'Connection', width: 300 });
    const A = () => import('../mapassist.js');
    p.el.querySelector('[data-keep]')?.addEventListener('click', async () => { closePopover(); await (await A()).keepRelated(a.id, b.id); toast('Linked'); });
    p.el.querySelector('[data-no]')?.addEventListener('click', async () => { closePopover(); await (await A()).notRelated(a.id, b.id); toast('The assistant won’t connect these again'); });
  }

  function drawStats() {
    if (gone) return;
    const notesN = state.notes.size;
    const c = map.counts();
    const links = (c.link || 0) + (c.sub || 0) + (c.board || 0);
    const m = map.matchCount();
    $('#map-stats', main).textContent = m != null ? `${m} of ${notesN} notes` : `${notesN} note${notesN === 1 ? '' : 's'}, ${links} link${links === 1 ? '' : 's'}${c.related ? `, ${c.related} related` : ''}`;
    $('#map-empty', main).hidden = notesN > 0;
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
    map.select(currentNote || pickedId, { center: false });
    view.classList.toggle('with-panel', !!currentNote);
    if (currentNote) { ctx.showPanel(currentNote); pick(null); map.select(currentNote); }
    else ctx.hidePanel();
  }

  // Drag and drop screenshots onto the map (iPad / desktop).
  const onDragOver = (e) => {
    if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); view.classList.add('dropping'); }
  };
  const onDragLeave = (e) => { if (e.target === view || !view.contains(e.relatedTarget)) view.classList.remove('dropping'); };
  const onDrop = (e) => {
    if (e.defaultPrevented) return; // another copy of this screen already took the drop
    e.preventDefault();
    view.classList.remove('dropping');
    const all = [...(e.dataTransfer?.files || [])];
    // Documents (PDF, Word, PowerPoint) open as pages to mark up, and pictures dropped with them
    // come along (one note, a page each); pictures alone go to Capture.
    const files = all.filter((f) => f.type.startsWith('image/'));
    const docs = all.filter((f) => !f.type.startsWith('image/'));
    if (docs.length || (all.length && !files.length)) {
      import('../docintake.js').then((D) => D.routeFiles(all, {
        single: (f) => import('../handoff.js').then((H) => { H.handOff(f); ctx.navigate('#/note/new?kind=ink'); }),
        many: (list) => import('./importsheet.js').then((M) => M.importSheet({ files: list, ctx })),
      }));
      return;
    }
    if (files.length) ctx.openCapture({ files });
  };
  view.addEventListener('dragover', onDragOver);
  view.addEventListener('dragleave', onDragLeave);
  view.addEventListener('drop', onDrop);

  // When meanings are worked out, related lines appear by themselves.
  let offSem = null;
  let semTimer = null;
  import('../semantic.js').then((S) => {
    if (gone) return;
    offSem = S.onSemantic((st) => {
      if (st.building) return;
      clearTimeout(semTimer);
      semTimer = setTimeout(() => { if (gone) return; map.update(); drawLegend(); drawStats(); drawNotice(); }, 300);
    });
    S.buildSoon(1500);
  });

  drawChips();
  drawLegend();
  drawStats();
  drawSync();
  drawNotice();
  setNote(params.note);
  // Opened from a note's own map: just that note's neighbourhood.
  if (params.focus && state.notes.has(params.focus)) setTimeout(() => { if (!gone) { map.focusOn(params.focus, 1); map.select(params.focus); drawState(); } }, 300);

  let redraw = null;
  return {
    update(p) { setNote(p.note); },
    onEvent(evt) {
      if (['note', 'delete', 'remote', 'sealed', 'config', 'unlock', 'ocr'].includes(evt.type)) {
        if (evt.type === 'ocr' && !evt.id) return;
        map.update();
        if (evt.type === 'config') drawChips();
        drawStats();
        clearTimeout(redraw);
        redraw = setTimeout(() => { if (!gone) { drawLegend(); drawNotice(); } }, 400);
        if (currentNote && !state.notes.has(currentNote)) ctx.navigate('#/map', { replace: true });
        if (pickedId && !state.notes.has(pickedId)) pick(null);
      }
      if (evt.type === 'sync') drawSync();
    },
    destroy() {
      gone = true;
      clearTimeout(redraw);
      offSem?.();
      clearTimeout(semTimer);
      map.destroy();
      ctx.hidePanel();
    },
  };
}
