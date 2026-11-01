// Inbox: new captures waiting to be filed.

import { html, raw, fmtDate, snippet, toast } from '../util.js';
import { state, fileNote, fileURL, saveNotes } from '../vault.js';
import { displayTitle, guessRegions, regionColors, SOURCE_LABEL } from '../model.js';
import { regionPicker } from '../ui.js';
import { icons } from '../icons.js';

export function mount(main, params, ctx) {
  let moves = null;
  import('./organise.js').then((M) => { moves = M; draw(); });
  const draw = () => {
    const items = [...state.notes.values()].filter((n) => n.inbox).sort((a, b) => b.createdAt - a.createdAt);
    const regions = state.config.regions;
    const suggestionFor = (n) => {
      const out = [];
      if (n.suggestedRegion) { const r = regions.find((x) => x.id === n.suggestedRegion); if (r) out.push(r); }
      for (const r of guessRegions(n, regions, 2)) if (!out.includes(r)) out.push(r);
      return out.slice(0, 2);
    };
    const withSuggestion = items.filter((n) => n.suggestedRegion && regions.some((r) => r.id === n.suggestedRegion));
    const recent = moves ? moves.recentMovesHtml() : '';
    const bindRecent = moves?.bindRecentMoves;

    main.innerHTML = `${html`<div class="page">
      <div class="page-head">
        <div><h1 class="page-title">Inbox</h1><p class="page-sub">${items.length ? `${items.length} capture${items.length === 1 ? '' : 's'} to sort` : 'All sorted'}</p></div>
      </div>
      ${items.length ? html`<div class="btn-row">
        <button type="button" class="btn btn-primary" data-action="organise" style="flex:1">${icons.sparkle({ size: 18 })}Organise on this device</button>
        <a class="btn" href="#/ask?preset=sort" style="flex:1">${icons.ask({ size: 18 })}Sort all with Claude</a>
        ${withSuggestion.length > 1 ? html`<button type="button" class="btn" data-action="file-suggested" style="flex:1">File ${withSuggestion.length} as suggested</button>` : ''}
      </div>` : ''}
      ${items.length ? html`<ul class="rows">${items.map((n) => row(n, suggestionFor(n)))}</ul>` : html`<div class="empty">
        <p class="serif">Nothing waiting</p>
        <p style="margin:0">New captures land here until you file them into a region.</p>
        <button type="button" class="btn btn-primary" data-action="capture">${icons.plus({ size: 20 })}Capture something</button>
      </div>`}
      ${raw(recent)}
    </div>`}`;
    bindRecent?.(main);
    const org = main.querySelector('[data-action=organise]');
    if (org) org.onclick = () => import('./organise.js').then((M) => M.organiseSheet());

    main.querySelectorAll('[data-file-in]').forEach((b) => {
      b.onclick = async () => {
        const [id, rid] = b.dataset.fileIn.split('|');
        await fileNote(id, rid);
        toast(`Filed in ${regions.find((r) => r.id === rid)?.name}`);
      };
    });
    main.querySelectorAll('[data-other]').forEach((b) => {
      b.onclick = async () => {
        const rid = await regionPicker({ allowInbox: false });
        if (rid) { await fileNote(b.dataset.other, rid); toast(`Filed in ${regions.find((r) => r.id === rid)?.name}`); }
      };
    });
    const fs = main.querySelector('[data-action=file-suggested]');
    if (fs) {
      fs.onclick = async () => {
        await saveNotes(withSuggestion.map((n) => ({ ...n, region: n.suggestedRegion, inbox: false, suggestedRegion: null })));
        toast(`Filed ${withSuggestion.length} notes`);
      };
    }
    main.querySelectorAll('img[data-file]').forEach(async (img) => {
      const url = await fileURL(img.dataset.file);
      if (url) img.src = url;
    });
  };

  function row(n, sugg) {
    const firstImg = n.files[0];
    const pending = n.files.some((f) => f.ocrStatus === 'pending');
    const text = n.body.trim() || n.files.map((f) => f.ocr || '').join(' ').trim();
    const title = displayTitle(n);
    const thumb = firstImg
      ? html`<a class="thumb" href="#/note/${n.id}" aria-hidden="true" tabindex="-1"><img data-file="${firstImg.id}" alt=""></a>`
      : html`<a class="thumb icon ${n.source === 'chat' ? 'chat' : ''}" href="#/note/${n.id}" aria-hidden="true" tabindex="-1">${n.source === 'chat' ? icons.chats({ size: 20 }) : n.source === 'link' ? icons.link({ size: 20 }) : icons.lines()}</a>`;
    const serif = !firstImg && !n.url;
    return html`<li class="row">
      ${thumb}
      <div class="row-main">
        <div class="row-meta"><span>${SOURCE_LABEL[n.source] || 'Note'}, ${fmtDate(n.createdAt)}</span>${n.chat?.url ? html`<a href="${n.chat.url}" target="_blank" rel="noopener noreferrer">Open chat</a>` : ''}</div>
        <a class="row-title ${serif ? 'serif' : ''}" href="#/note/${n.id}">${title}${n.sealed ? html` <span class="muted" style="display:inline-flex;vertical-align:-1px" aria-label="Sealed">${icons.lock()}</span>` : ''}</a>
        ${text && snippet(text, 120) !== title ? html`<p class="row-snippet">${snippet(text, 140)}</p>` : ''}
        ${pending ? html`<span class="ocr-status">${icons.spinner()}Reading text…</span>` : ''}
        ${n.sealSuggested ? html`<span class="flag">Personal. Consider sealing.</span>` : ''}
        <div class="file-in"><span>File in</span>
          ${sugg.map((r) => html`<button type="button" class="chip sm" data-file-in="${n.id}|${r.id}"><span class="dot" style="background:${regionColors(r).dot}"></span>${r.name}</button>`)}
          <button type="button" class="chip sm" data-other="${n.id}">${sugg.length ? 'Other…' : 'Choose…'}</button>
        </div>
      </div>
    </li>`;
  }

  draw();
  return {
    onEvent(evt) { if (['note', 'delete', 'remote', 'sealed', 'config', 'ocr', 'device'].includes(evt.type)) draw(); },
  };
}
