// A single note: read view and edit form. Also used in the iPad side panel.

import { html, raw, $, fmtDate, toast } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { newNote, displayTitle, regionColors, typeName, NOTE_TYPES, TEMPLATES, computeLinks, titleIndex, guessRegions, SOURCE_LABEL } from '../model.js';
import { renderMarkdown } from '../markdown.js';
import { compressImage } from '../images.js';
import { rerunOcr } from '../ocr.js';
import { confirmSheet, menuSheet, notePicker, regionPicker, passphraseSheet } from '../ui.js';
import { icons } from '../icons.js';

export function mount(el, params, ctx) {
  const compact = !!params.compact;
  let id = params.id;
  let editing = id === 'new';
  let draft = null;

  const draw = () => {
    if (editing) return drawEdit();
    const n = state.notes.get(id);
    if (!n) {
      el.innerHTML = `${html`<div class="${compact ? '' : 'page'}" style="${compact ? 'padding:24px' : ''}"><div class="empty"><p class="serif">This note isn’t here</p><p style="margin:0">It may have been deleted, or it’s sealed and locked.</p><a class="btn" href="#/map">Back to the map</a></div></div>`}`;
      return;
    }
    drawView(n);
  };

  // ---------- Read view ----------
  function drawView(n) {
    const regions = state.config.regions;
    const r = regions.find((x) => x.id === n.region);
    const c = regionColors(n.inbox ? null : r);
    const { neighbours } = computeLinks(state.notes);
    const linked = [...(neighbours.get(n.id) || [])].map((x) => state.notes.get(x)).filter(Boolean);
    const explicit = (other) => n.links.includes(other.id) || other.links.includes(n.id);
    const suggestions = n.suggested.filter((s) => state.notes.has(s.id) && !n.links.includes(s.id));
    const incoming = [...state.notes.values()].filter((o) => o.id !== n.id && o.suggested.some((s) => s.id === n.id) && !o.links.includes(n.id) && !suggestions.some((s) => s.id === o.id));
    const idx = titleIndex([...state.notes.values()]);
    const bodyHtml = n.body.trim() ? renderMarkdown(n.body, (t) => idx.get(t.toLowerCase())) : '';
    const sugg = n.inbox ? [...(n.suggestedRegion ? [regions.find((x) => x.id === n.suggestedRegion)].filter(Boolean) : []), ...guessRegions(n, regions)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 2) : [];

    el.innerHTML = `${html`<div class="${compact ? 'note-panel' : 'page'}" style="${compact ? 'padding:12px 24px 32px;display:flex;flex-direction:column;gap:18px' : ''}">
      <div class="topbar">
        ${compact
          ? html`<button type="button" class="icon-btn bare" data-act="close" aria-label="Close note">${icons.close()}</button>`
          : html`<button type="button" class="back" data-act="back">${icons.back()}Back</button>`}
        <div style="display:flex">
          <button type="button" class="icon-btn bare" data-act="link" aria-label="Link to another note">${icons.link()}</button>
          ${compact ? html`<a class="icon-btn bare" href="#/note/${n.id}" aria-label="Open full note">${icons.external()}</a>` : ''}
          <button type="button" class="icon-btn bare" data-act="more" aria-label="More actions">${icons.more()}</button>
        </div>
      </div>
      <article class="note">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div class="note-meta">
            <span class="dot" style="background:${c.dot}"></span>
            <span class="region" style="color:${c.text}">${n.inbox ? 'Inbox' : r?.name || 'Unsorted'}</span>
            <span class="muted">${typeName(n.type)}, ${fmtDate(n.createdAt, { year: 'always' })}</span>
            ${n.sealed ? html`<span class="muted" style="display:inline-flex;align-items:center;gap:4px">${icons.lock()}Sealed</span>` : ''}
          </div>
          <h1 class="note-title">${displayTitle(n)}</h1>
        </div>
        ${n.inbox ? html`<div class="file-in"><span>File in</span>
          ${sugg.map((x) => html`<button type="button" class="chip sm" data-file-in="${x.id}"><span class="dot" style="background:${regionColors(x).dot}"></span>${x.name}</button>`)}
          <button type="button" class="chip sm" data-act="file-other">${sugg.length ? 'Other…' : 'Choose a region…'}</button></div>` : ''}
        ${n.sealSuggested && !n.sealed ? html`<div class="seal-box"><span class="flag">This looks personal. Consider sealing it.</span><button type="button" class="btn btn-sm" data-act="seal">Seal</button></div>` : ''}
        ${n.files.map((f, i) => html`<figure class="note-figure">
          <img data-file="${f.id}" alt="${f.ocr ? `Image ${i + 1}: ${f.ocr.slice(0, 120)}` : `Image ${i + 1}`}">
          ${f.ocrStatus === 'pending' ? html`<span class="ocr-status">${icons.spinner()}Reading text…</span>`
            : f.ocr ? html`<details class="ocr"><summary><span class="ocr-status ok">${icons.check()}Text found</span><span>Show text</span></summary><pre>${f.ocr}</pre></details>`
            : html`<span class="ocr-status">${f.ocrStatus === 'error' ? 'Couldn’t read text.' : 'No text found.'} <button type="button" class="link-btn" data-ocr="${f.id}">Try again</button></span>`}
        </figure>`)}
        ${bodyHtml ? html`<div class="md">${raw(bodyHtml)}</div>` : !n.files.length ? html`<p class="muted" style="margin:0">Nothing written yet.</p>` : ''}
        ${n.tags.length ? html`<div class="chips">${n.tags.map((t) => html`<span class="chip static">${t}</span>`)}</div>` : ''}
        ${n.url ? html`<p style="margin:0;display:flex;gap:8px;align-items:center;overflow-wrap:anywhere">${icons.link({ size: 18 })}<a href="${n.url}" target="_blank" rel="noopener noreferrer">${n.url}</a></p>` : ''}
        ${n.chat ? html`<p style="margin:0;display:flex;gap:8px;align-items:center" class="muted">${icons.chats({ size: 18 })}${SOURCE_LABEL.chat}: ${n.chat.url ? html`<a href="${n.chat.url}" target="_blank" rel="noopener noreferrer">${n.chat.title || 'open chat'}</a>` : n.chat.title}</p>` : ''}
        ${linked.length ? html`<section style="display:flex;flex-direction:column;gap:4px">
          <h2 class="section-title" style="margin-bottom:4px">Linked notes</h2>
          <ul class="links-list">${linked.map((o) => {
            const or = regions.find((x) => x.id === o.region);
            return html`<li><a href="${compact ? `#/map?note=${o.id}` : `#/note/${o.id}`}"><span class="dot" style="background:${regionColors(o.inbox ? null : or).dot}"></span><span style="flex:1;min-width:0">${displayTitle(o)}</span><span class="rn">${o.inbox ? 'Inbox' : or?.name || ''}</span></a>
              ${explicit(o) ? html`<button type="button" class="icon-btn bare" data-unlink="${o.id}" aria-label="Unlink ${displayTitle(o)}">${icons.close({ size: 16 })}</button>` : ''}</li>`;
          })}</ul>
        </section>` : ''}
        ${[...suggestions.map((s) => ({ other: state.notes.get(s.id), reason: s.reason })), ...incoming.map((o) => ({ other: o, reason: o.suggested.find((s) => s.id === n.id)?.reason }))].map(({ other, reason }) => html`
          <section class="suggest" aria-label="Suggested link">
            <span class="flag">Suggested link</span>
            <p class="title">${displayTitle(other)}</p>
            ${reason ? html`<p class="hint">${reason}</p>` : ''}
            <div class="actions"><button type="button" class="btn btn-sm btn-primary" style="min-height:40px;font-size:15px" data-accept="${other.id}">Link</button><button type="button" class="btn btn-sm btn-ghost" data-dismiss="${other.id}">Dismiss</button></div>
          </section>`)}
        <div class="btn-row"><button type="button" class="btn" data-act="edit">Edit note</button></div>
      </article>
    </div>`}`;

    el.querySelectorAll('img[data-file]').forEach(async (img) => {
      const url = await V.fileURL(img.dataset.file);
      if (url) img.src = url;
      else img.replaceWith(Object.assign(document.createElement('div'), { className: 'ph', textContent: 'Image still downloading' }));
    });
    bind(n);
  }

  function bind(n) {
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => { b.onclick = (e) => fn(b, e); });
    on('[data-act=back]', () => ctx.back());
    on('[data-act=close]', () => ctx.navigate('#/map', { replace: true }));
    on('[data-act=edit]', () => { editing = true; draw(); });
    on('[data-act=link]', () => linkTo(n));
    on('[data-act=more]', () => more(n));
    on('[data-act=seal]', () => seal(n, true));
    on('[data-act=file-other]', async () => {
      const rid = await regionPicker({ allowInbox: false });
      if (rid) { await V.fileNote(n.id, rid); toast('Filed'); }
    });
    on('[data-file-in]', async (b) => { await V.fileNote(n.id, b.dataset.fileIn); toast('Filed'); });
    on('[data-unlink]', async (b) => { await V.unlinkNotes(n.id, b.dataset.unlink); });
    on('[data-accept]', async (b) => { await V.linkNotes(n.id, b.dataset.accept); toast('Linked'); });
    on('[data-dismiss]', async (b) => { await V.dismissSuggestion(n.id, b.dataset.dismiss); });
    on('[data-ocr]', (b) => rerunOcr(n.id, b.dataset.ocr));
  }

  async function linkTo(n) {
    const other = await notePicker({ exclude: [n.id, ...n.links] });
    if (other) { await V.linkNotes(n.id, other); toast('Linked'); }
  }

  async function seal(n, sealed) {
    const s = V.sealedState();
    if (s === 'none') {
      const go = await confirmSheet({ title: 'Set up sealed notes first', body: 'Sealed notes use a second passphrase and are never shared with Claude. You can set this up in Settings.', confirm: 'Open Settings' });
      if (go) ctx.navigate('#/settings');
      return;
    }
    if (s === 'locked') {
      const ok = await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) });
      if (!ok) return;
    }
    try {
      await V.setSealed(n.id, sealed);
      toast(sealed ? 'Sealed' : 'Unsealed');
    } catch (e) { toast(e.message); }
  }

  async function more(n) {
    const items = [
      { value: 'edit', label: 'Edit' },
      { value: 'link', label: 'Link to another note' },
      { value: n.sealed ? 'unseal' : 'seal', label: n.sealed ? 'Unseal' : 'Seal this note' },
    ];
    if (!n.inbox) items.push({ value: 'inbox', label: 'Move back to inbox' });
    items.push({ value: 'delete', label: 'Delete note', danger: true });
    const act = await menuSheet(displayTitle(n), items);
    if (act === 'edit') { editing = true; draw(); }
    if (act === 'link') linkTo(n);
    if (act === 'seal') seal(n, true);
    if (act === 'unseal') seal(n, false);
    if (act === 'inbox') await V.saveNote({ ...n, inbox: true, region: null, suggestedRegion: n.region });
    if (act === 'delete') {
      const ok = await confirmSheet({ title: 'Delete this note?', body: 'Its images go too. This syncs to your other devices.', confirm: 'Delete', danger: true });
      if (ok) { await V.deleteNote(n.id); toast('Deleted'); ctx.navigate(compact ? '#/map' : '#/notes', { replace: true }); }
    }
  }

  // ---------- Edit form ----------
  const added = [];
  const removed = [];

  function drawEdit() {
    if (!draft) {
      const base = id === 'new' ? newNote({ region: params.region || null, inbox: !params.region }) : state.notes.get(id);
      if (!base) { editing = false; return draw(); }
      draft = JSON.parse(JSON.stringify(base));
      draft.wasSealed = base.sealed;
    }
    const regions = state.config.regions;
    const sealedMode = V.sealedState();
    el.innerHTML = `${html`<form class="${compact ? '' : 'page'} note-edit" style="${compact ? 'padding:12px 24px 32px' : ''}" novalidate>
      <div class="topbar">
        <button type="button" class="back" data-act="cancel">Cancel</button>
        <button type="submit" class="btn btn-sm btn-primary" style="min-height:40px;font-size:15px">Save</button>
      </div>
      <div class="field"><label class="sr-only" for="e-title">Title</label><input id="e-title" class="title-input" type="text" placeholder="Title" value="${draft.title}"></div>
      <div class="row2">
        <div class="field"><label for="e-region">Region</label><select id="e-region">
          <option value="" ${draft.inbox ? 'selected' : ''}>Inbox (sort later)</option>
          ${regions.map((r) => html`<option value="${r.id}" ${!draft.inbox && draft.region === r.id ? raw('selected') : ''}>${r.name}</option>`)}
        </select></div>
        <div class="field"><label for="e-type">Type</label><select id="e-type">
          ${NOTE_TYPES.map((t) => html`<option value="${t.id}" ${draft.type === t.id ? raw('selected') : ''}>${t.name}</option>`)}
        </select></div>
      </div>
      <div class="field"><label for="e-body">Note</label><textarea id="e-body" class="serif body" placeholder="Write in your own words. Link other notes with [[Note title]].">${draft.body}</textarea></div>
      <div class="field"><span class="label">Images</span>
        <div class="edit-images" id="e-images"></div>
        <label class="btn btn-sm" style="align-self:flex-start">${icons.image({ size: 18 })}Add images<input type="file" accept="image/*" multiple class="sr-only" id="e-add"></label>
      </div>
      <div class="field"><label for="e-tags">Tags</label><input id="e-tags" type="text" placeholder="Separate with commas" value="${draft.tags.join(', ')}" autocapitalize="off"></div>
      <div class="field"><label for="e-url">Link</label><input id="e-url" type="url" placeholder="https://" value="${draft.url || ''}" autocapitalize="off" autocorrect="off"></div>
      ${sealedMode === 'none'
        ? html`<p class="hint">To keep a note out of anything shared with Claude, set up sealed notes in Settings.</p>`
        : html`<label class="check"><input type="checkbox" id="e-sealed" ${draft.sealed ? raw('checked') : ''}> Seal this note (never shared, needs your second passphrase)</label>`}
      <p class="error" id="e-err" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Save note</button>
      ${id !== 'new' ? html`<button type="button" class="btn btn-danger btn-block" data-act="delete">Delete note</button>` : ''}
    </form>`}`;
    drawImages();
    const form = el.querySelector('form');
    const body = $('#e-body', el);
    const autosize = () => { body.style.height = 'auto'; body.style.height = `${Math.max(220, body.scrollHeight + 4)}px`; };
    body.addEventListener('input', autosize);
    requestAnimationFrame(autosize);
    $('#e-type', el).onchange = (e) => {
      const t = TEMPLATES[e.target.value];
      if (t && !body.value.trim()) { body.value = t; autosize(); }
    };
    $('#e-add', el).onchange = async (e) => {
      const list = [...e.target.files];
      e.target.value = '';
      for (const f of list) {
        try {
          const img = await compressImage(f);
          const fid = await V.addFile(img.bytes, { sealed: draft.wasSealed });
          added.push(fid);
          draft.files.push({ id: fid, w: img.w, h: img.h, type: img.type, ocr: '', ocrStatus: 'pending', ocrBy: V.state.deviceId });
        } catch (ex) { toast(`Couldn’t add ${f.name || 'that image'}.`); }
      }
      drawImages();
    };
    el.querySelector('[data-act=cancel]').onclick = async () => {
      for (const fid of added) await V.deleteFile(fid);
      added.length = 0;
      removed.length = 0;
      draft = null;
      if (id === 'new') { ctx.back(); return; }
      editing = false;
      draw();
    };
    const del = el.querySelector('[data-act=delete]');
    if (del) del.onclick = () => more(state.notes.get(id));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#e-err', el);
      const regionVal = $('#e-region', el).value;
      const wantSealed = !!$('#e-sealed', el)?.checked;
      const next = {
        ...draft,
        title: $('#e-title', el).value.trim(),
        body: body.value,
        type: $('#e-type', el).value,
        region: regionVal || null,
        inbox: !regionVal,
        tags: $('#e-tags', el).value.split(',').map((t) => t.trim()).filter(Boolean),
        url: $('#e-url', el).value.trim() || null,
        sealed: draft.wasSealed,
      };
      next.titleAuto = !next.title;
      if (!next.inbox) next.suggestedRegion = null;
      delete next.wasSealed;
      if (!next.title && !next.body.trim() && !next.files.length) { err.textContent = 'Add a title, some text or an image.'; err.hidden = false; return; }
      try {
        if (wantSealed && !state.keys.s) {
          const ok = await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) });
          if (!ok) return;
        }
        const saved = await V.saveNote(next);
        for (const fid of removed) await V.deleteFile(fid);
        if (wantSealed !== saved.sealed) await V.setSealed(saved.id, wantSealed);
        added.length = 0;
        removed.length = 0;
        draft = null;
        editing = false;
        ctx.runOcr();
        toast('Saved');
        if (id === 'new') { id = saved.id; ctx.navigate(`#/note/${saved.id}`, { replace: true }); return; }
        draw();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    };
  }

  function drawImages() {
    const box = $('#e-images', el);
    if (!box) return;
    box.innerHTML = draft.files.map((f) => html`<div class="im"><img data-file="${f.id}" alt=""><button type="button" data-rm="${f.id}" aria-label="Remove image">${icons.close({ size: 16 })}</button></div>`).join('');
    box.querySelectorAll('img[data-file]').forEach(async (img) => { const u = await V.fileURL(img.dataset.file); if (u) img.src = u; });
    box.querySelectorAll('[data-rm]').forEach((b) => {
      b.onclick = () => {
        const fid = b.dataset.rm;
        draft.files = draft.files.filter((f) => f.id !== fid);
        if (added.includes(fid)) { added.splice(added.indexOf(fid), 1); V.deleteFile(fid); } else removed.push(fid);
        drawImages();
      };
    });
  }

  draw();

  return {
    update(p) {
      if (p.id !== id) { id = p.id; editing = p.id === 'new'; draft = null; draw(); }
    },
    onEvent(evt) {
      if (editing) return;
      if (['note', 'delete', 'remote', 'sealed', 'config', 'ocr'].includes(evt.type)) {
        if (evt.type === 'ocr' && evt.id && evt.id !== id) return;
        draw();
      }
    },
  };
}
