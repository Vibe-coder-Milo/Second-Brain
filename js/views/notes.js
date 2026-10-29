// All notes, a single region, or search results.

import { html, $, fmtDate, snippet, debounce } from '../util.js';
import { state, sealedState } from '../vault.js';
import { displayTitle, regionColors, searchNotes, typeName } from '../model.js';
import { icons } from '../icons.js';

export function mount(main, params, ctx) {
  let p = { ...params };

  const draw = (keepFocus = false) => {
    const regions = state.config.regions;
    const region = p.region ? regions.find((r) => r.id === p.region) : null;
    let list = [...state.notes.values()];
    if (region) list = list.filter((n) => !n.inbox && n.region === region.id);
    if (p.sealed) list = list.filter((n) => n.sealed);
    const q = (p.q || '').trim();
    list = q ? searchNotes(list, q) : list.sort((a, b) => b.updatedAt - a.updatedAt);
    const title = region ? region.name : p.sealed ? 'Sealed notes' : q ? 'Search' : 'All notes';
    const hidden = state.hiddenSealed && sealedState() === 'locked' && !region;

    main.innerHTML = `${html`<div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title" style="display:flex;align-items:center;gap:12px">${region ? html`<span class="dot" style="width:14px;height:14px;background:${regionColors(region).dot}"></span>` : ''}${title}</h1>
          <p class="page-sub">${list.length} note${list.length === 1 ? '' : 's'}${hidden ? `, plus ${state.hiddenSealed} sealed` : ''}</p>
        </div>
        <a class="btn btn-sm" href="#/note/new${region ? `?region=${region.id}` : ''}">${icons.plus({ size: 16 })}New note</a>
      </div>
      <div class="search">${icons.search({ size: 18 })}<label class="sr-only" for="nq">Search notes</label><input id="nq" type="search" placeholder="Search notes, screenshots and tags" value="${q}" autocomplete="off" enterkeyhint="search"></div>
      <div class="chips scroll" role="group" aria-label="Region">
        <a class="chip" href="#/notes${q ? `?q=${encodeURIComponent(q)}` : ''}" aria-pressed="${!region ? 'true' : 'false'}">All</a>
        ${regions.map((r) => html`<a class="chip" href="#/notes?region=${r.id}${q ? `&q=${encodeURIComponent(q)}` : ''}" aria-pressed="${region?.id === r.id ? 'true' : 'false'}"><span class="dot" style="background:${regionColors(r).dot}"></span>${r.name}</a>`)}
      </div>
      ${list.length ? html`<ul class="rows">${list.map(row)}</ul>` : html`<div class="empty"><p class="serif">${q ? 'No matches' : 'Nothing here yet'}</p><p style="margin:0">${q ? 'Try fewer words, or search for text inside a screenshot.' : region ? `File notes from your inbox into ${region.name}, or start a new one.` : 'Capture something to get started.'}</p></div>`}
    </div>`}`;

    const input = $('#nq', main);
    input.addEventListener('input', debounce(() => {
      const v = input.value.trim();
      const qs = new URLSearchParams();
      if (region) qs.set('region', region.id);
      if (v) qs.set('q', v);
      ctx.navigate(`#/notes${qs.toString() ? `?${qs}` : ''}`, { replace: true, silent: true });
      p = { ...p, q: v };
      draw(true);
    }, 250));
    if (keepFocus) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  };

  function row(n) {
    const r = state.config.regions.find((x) => x.id === n.region);
    const text = n.body.trim() || n.files.map((f) => f.ocr || '').join(' ');
    return html`<li><a class="row note-row" href="#/note/${n.id}">
      <span class="dot" style="margin-top:8px;background:${regionColors(n.inbox ? null : r).dot}"></span>
      <span class="row-main">
        <span class="row-title serif">${displayTitle(n)}${n.sealed ? html` <span class="muted" style="display:inline-flex;vertical-align:-1px">${icons.lock()}</span>` : ''}</span>
        ${text ? html`<span class="row-snippet">${snippet(text, 150)}</span>` : ''}
        <span class="row-meta"><span>${n.inbox ? 'Inbox' : r?.name || 'Unsorted'}, ${typeName(n.type).toLowerCase()}, ${fmtDate(n.updatedAt)}</span>${n.files.length ? html`<span>${n.files.length} image${n.files.length === 1 ? '' : 's'}</span>` : ''}</span>
      </span>
    </a></li>`;
  }

  draw();
  return {
    update(np) { p = { ...np }; draw(); },
    onEvent(evt) { if (['note', 'delete', 'remote', 'sealed', 'config'].includes(evt.type)) { const f = document.activeElement?.id === 'nq'; draw(f); } },
  };
}
