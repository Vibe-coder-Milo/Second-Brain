// A single note. Typed notes and captures open here with the rich editor;
// handwritten notes hand over to the handwriting screen.

import { html, raw, $, fmtDate, fmtTime, toast, debounce, isWide, downloadText } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { newNote, displayTitle, regionColors, typeName, NOTE_TYPES, TEMPLATES, guessRegions, SOURCE_LABEL, labelMap } from '../model.js';
import { docOutline, docLabels, docPlainText } from '../doc.js';
import { compressImage } from '../images.js';
import { rerunOcr } from '../ocr.js';
import { confirmSheet, menuSheet, notePicker, regionPicker, passphraseSheet, datePicker, labelPicker, labelChipHtml } from '../ui.js';
import { icons } from '../icons.js';
import { linkedWith, mentions, related, subNotes } from '../connections.js';
import { notebookPicker } from './notebooks.js';

let InkView = null;

// Typed and handwritten notes share the route; pick the right screen.
export function mount(el, params, ctx) {
  let inst = null;
  let kind = null;
  const pick = (p) => {
    const n = state.notes.get(p.id);
    const k = (n?.kind === 'ink' || (p.id === 'new' && p.kind === 'ink')) ? 'ink' : 'typed';
    if (k === kind && inst) { inst.update?.(p); return; }
    inst?.destroy?.();
    el.innerHTML = '';
    kind = k;
    if (k === 'ink') {
      inst = { destroy() {} };
      const go = (mod) => { if (kind === 'ink') inst = mod.mount(el, p, ctx); };
      if (InkView) go(InkView);
      else import('./inknote.js').then((m) => { InkView = m; go(m); });
    } else inst = mountTyped(el, p, ctx);
  };
  pick(params);
  return {
    update: (p) => pick(p),
    onEvent: (evt) => inst?.onEvent?.(evt),
    destroy: () => inst?.destroy?.(),
  };
}

function mountTyped(el, params, ctx) {
  const compact = !!params.compact;
  let id = params.id;
  let editing = false;
  let draft = null; // a new note that hasn't been saved yet
  let editor = null;
  let bar = null;
  let suggest = null;
  let rich = null;
  let dirty = false;
  let saveState = '';
  let vvHandler = null;
  let focusWhenReady = false;

  const note = () => (id === 'new' ? draft : state.notes.get(id));

  async function loadRich() {
    if (!rich) rich = await import('../editor/rich.js');
    return rich;
  }

  function start() {
    if (id === 'new') {
      draft = newNote({
        region: params.region || null,
        inbox: !(params.region || params.notebook),
        notebook: params.notebook || null,
        section: params.section || null,
        parent: params.parent || null,
        type: params.type || 'note',
      });
      if (params.notebook) {
        const nb = state.notebooks.get(params.notebook);
        if (nb) { draft.region = nb.region; draft.inbox = false; draft.sealed = nb.sealed; }
      }
      if (params.parent) {
        const par = state.notes.get(params.parent);
        if (par) { draft.notebook = par.notebook; draft.section = par.section; draft.region = par.region; draft.inbox = par.inbox; draft.sealed = par.sealed; }
      }
      editing = true;
    }
    drawShell();
  }

  // ---------- Layout ----------
  function drawShell() {
    destroyEditor();
    const n = note();
    if (!n) {
      el.innerHTML = `${html`<div class="${compact ? '' : 'page'}" style="${compact ? 'padding:24px' : ''}"><div class="empty"><p class="serif">This note isn’t here</p><p style="margin:0">It may have been deleted, or it’s sealed and locked.</p><a class="btn" href="#/today">Back to Today</a></div></div>`}`;
      return;
    }
    el.innerHTML = `${html`<div class="${compact ? 'note-panel' : 'page note-page'}" id="np">
      <div class="topbar note-top">
        ${compact
          ? html`<button type="button" class="icon-btn bare" data-act="close" aria-label="Close note">${icons.close()}</button>`
          : html`<button type="button" class="back" data-act="back">${icons.back()}Back</button>`}
        <span class="save-state" id="n-save" aria-live="polite"></span>
        <div class="top-actions">
          <button type="button" class="icon-btn bare" data-act="link" aria-label="Link to another note">${icons.link()}</button>
          ${compact ? html`<a class="icon-btn bare" href="#/note/${n.id}" aria-label="Open full note">${icons.external()}</a>` : ''}
          <button type="button" class="icon-btn bare" data-act="more" aria-label="More actions">${icons.more()}</button>
          <button type="button" class="btn btn-sm ${editing ? 'btn-primary' : ''}" id="n-edit" data-act="toggle-edit">${editing ? 'Done' : 'Edit'}</button>
        </div>
      </div>
      <article class="note">
        <div id="n-head"></div>
        <div id="n-figs" class="note-figs"></div>
        <div class="rich-host" id="n-rich"></div>
        <div id="n-extra"></div>
        <div id="n-details"></div>
        <div id="n-conn"></div>
      </article>
    </div>
    <div class="fmtbar" id="n-bar" role="toolbar" aria-label="Formatting" hidden></div>
    <aside class="outline-panel" id="n-outline" aria-label="Outline" hidden></aside>`}`;
    bindTop();
    drawHead();
    drawFigures();
    drawExtra();
    drawDetails();
    drawConnections();
    mountEditor();
  }

  function bindTop() {
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => { b.onclick = (e) => fn(b, e); });
    on('[data-act=back]', async () => { await flush(); ctx.back(); });
    on('[data-act=close]', async () => { await flush(); ctx.navigate('#/map', { replace: true }); });
    on('[data-act=toggle-edit]', () => (editing ? stopEditing() : startEditing()));
    on('[data-act=link]', () => linkTo());
    on('[data-act=more]', () => more());
  }

  function drawHead() {
    const n = note();
    const box = $('#n-head', el);
    if (!box || !n) return;
    const regions = state.config.regions;
    const r = regions.find((x) => x.id === n.region);
    const c = regionColors(n.inbox ? null : r);
    const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
    const sec = nb?.sections.find((s) => s.id === n.section);
    const parent = n.parent ? state.notes.get(n.parent) : null;
    const sugg = n.inbox ? [...(n.suggestedRegion ? [regions.find((x) => x.id === n.suggestedRegion)].filter(Boolean) : []), ...guessRegions(n, regions)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 2) : [];
    box.innerHTML = `${html`<div style="display:flex;flex-direction:column;gap:8px">
      <div class="note-meta">
        <span class="dot" style="background:${c.dot}"></span>
        <span class="region" style="color:${c.text}">${n.inbox ? 'Inbox' : r?.name || 'Unsorted'}</span>
        ${nb ? html`<a class="crumb" href="#/notebook/${nb.id}">${nb.title}${sec && nb.sections.length > 1 ? ` › ${sec.name}` : ''}</a>` : ''}
        ${parent ? html`<a class="crumb" href="#/note/${parent.id}">${icons.sub({ size: 14 })}${displayTitle(parent)}</a>` : ''}
        <span class="muted">${n.daily ? 'Daily note' : typeName(n.type)}, ${fmtDate(n.createdAt, { year: 'always' })}</span>
        ${n.sealed ? html`<span class="muted" style="display:inline-flex;align-items:center;gap:4px">${icons.lock()}Sealed</span>` : ''}
      </div>
      ${editing
        ? html`<label class="sr-only" for="n-title">Title</label><textarea id="n-title" class="title-input note-title" rows="1" placeholder="Title" enterkeyhint="next">${n.title}</textarea>`
        : html`<h1 class="note-title">${displayTitle(n)}</h1>`}
    </div>
    ${n.inbox && !editing ? html`<div class="file-in"><span>File in</span>
      ${sugg.map((x) => html`<button type="button" class="chip sm" data-file-in="${x.id}"><span class="dot" style="background:${regionColors(x).dot}"></span>${x.name}</button>`)}
      <button type="button" class="chip sm" data-act="file-other">${sugg.length ? 'Other…' : 'Choose a region…'}</button>
      <button type="button" class="chip sm" data-act="to-notebook">${icons.notebooks({ size: 14 })}Notebook…</button></div>` : ''}
    ${n.sealSuggested && !n.sealed && !editing ? html`<div class="seal-box"><span class="flag">This looks personal. Consider sealing it.</span><button type="button" class="btn btn-sm" data-act="seal">Seal</button></div>` : ''}`}`;
    const t = $('#n-title', box);
    if (t) {
      const fit = () => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; };
      requestAnimationFrame(fit);
      t.addEventListener('input', () => { fit(); markDirty(); });
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (editor) { editor.view.focus(); editor.commands.focus('start'); } else { focusWhenReady = true; t.blur(); }
      });
    }
    box.querySelectorAll('[data-file-in]').forEach((b) => { b.onclick = async () => { await V.fileNote(n.id, b.dataset.fileIn); toast('Filed'); }; });
    const fo = box.querySelector('[data-act=file-other]');
    if (fo) fo.onclick = async () => { const rid = await regionPicker({ allowInbox: false }); if (rid) { await V.fileNote(n.id, rid); toast('Filed'); } };
    const tn = box.querySelector('[data-act=to-notebook]');
    if (tn) tn.onclick = () => moveToNotebook();
    const sb = box.querySelector('[data-act=seal]');
    if (sb) sb.onclick = () => seal(true);
  }

  function drawFigures() {
    const n = note();
    const box = $('#n-figs', el);
    if (!box || !n) return;
    box.innerHTML = `${html`${n.files.map((f, i) => html`<figure class="note-figure">
      <img data-file="${f.id}" alt="${f.ocr ? `Image ${i + 1}: ${f.ocr.slice(0, 120)}` : `Image ${i + 1}`}">
      ${editing ? html`<button type="button" class="btn btn-sm btn-ghost" data-rm="${f.id}" style="align-self:flex-start">${icons.trash({ size: 16 })}Remove image</button>`
        : f.ocrStatus === 'pending' ? html`<span class="ocr-status">${icons.spinner()}Reading text…</span>`
        : f.ocr ? html`<details class="ocr"><summary><span class="ocr-status ok">${icons.check()}Text found</span><span>Show text</span></summary><pre>${f.ocr}</pre></details>`
        : html`<span class="ocr-status">${f.ocrStatus === 'error' ? 'Couldn’t read text.' : 'No text found.'} <button type="button" class="link-btn" data-ocr="${f.id}">Try again</button></span>`}
    </figure>`)}`}`;
    box.querySelectorAll('img[data-file]').forEach(async (img) => {
      const url = await V.fileURL(img.dataset.file);
      if (url) img.src = url;
      else img.replaceWith(Object.assign(document.createElement('div'), { className: 'ph', textContent: 'Image still downloading' }));
    });
    box.querySelectorAll('[data-ocr]').forEach((b) => { b.onclick = () => rerunOcr(n.id, b.dataset.ocr); });
    box.querySelectorAll('[data-rm]').forEach((b) => {
      b.onclick = async () => {
        const ok = await confirmSheet({ title: 'Remove this image?', confirm: 'Remove', danger: true });
        if (!ok) return;
        const cur = note();
        const next = { ...cur, files: cur.files.filter((f) => f.id !== b.dataset.rm) };
        if (id === 'new') draft = next; else await V.saveNote(next);
        await V.deleteFile(b.dataset.rm);
        drawFigures();
      };
    });
  }

  function drawExtra() {
    const n = note();
    const box = $('#n-extra', el);
    if (!box || !n) return;
    box.innerHTML = editing ? '' : `${html`
      ${n.tags.length ? html`<div class="chips">${n.tags.map((t) => html`<span class="chip static">${t}</span>`)}</div>` : ''}
      ${n.url ? html`<p class="note-link">${icons.link({ size: 18 })}<a href="${n.url}" target="_blank" rel="noopener noreferrer">${n.url}</a></p>` : ''}
      ${n.chat ? html`<p class="note-link muted">${icons.chats({ size: 18 })}${SOURCE_LABEL.chat}: ${n.chat.url ? html`<a href="${n.chat.url}" target="_blank" rel="noopener noreferrer">${n.chat.title || 'open chat'}</a>` : n.chat.title}</p>` : ''}`}`;
  }

  function drawDetails() {
    const n = note();
    const box = $('#n-details', el);
    if (!box || !n) return;
    if (!editing) { box.innerHTML = ''; return; }
    const regions = state.config.regions;
    const sealedMode = V.sealedState();
    box.innerHTML = `${html`<details class="note-details" ${id === 'new' && !n.notebook ? raw('open') : ''}>
      <summary>Details: region, type, tags, link, images</summary>
      <div class="details-body">
        ${n.notebook ? html`<p class="hint">In the notebook ${state.notebooks.get(n.notebook)?.title || ''}. Its region comes from the notebook.</p>` : html`<div class="row2">
          <div class="field"><label for="e-region">Region</label><select id="e-region">
            <option value="" ${n.inbox ? raw('selected') : ''}>Inbox (sort later)</option>
            ${regions.map((r) => html`<option value="${r.id}" ${!n.inbox && n.region === r.id ? raw('selected') : ''}>${r.name}</option>`)}
          </select></div>
          <div class="field"><label for="e-type">Type</label><select id="e-type">
            ${NOTE_TYPES.map((t) => html`<option value="${t.id}" ${n.type === t.id ? raw('selected') : ''}>${t.name}</option>`)}
          </select></div>
        </div>`}
        <div class="field"><label for="e-tags">Tags</label><input id="e-tags" type="text" placeholder="Separate with commas" value="${n.tags.join(', ')}" autocapitalize="off"></div>
        <div class="field"><label for="e-url">Link</label><input id="e-url" type="url" placeholder="https://" value="${n.url || ''}" autocapitalize="off" autocorrect="off"></div>
        <label class="btn btn-sm" style="align-self:flex-start">${icons.image({ size: 18 })}Add images above the text<input type="file" accept="image/*" multiple class="sr-only" id="e-add"></label>
        ${sealedMode === 'none'
          ? html`<p class="hint">To keep a note out of anything shared with Claude, set up sealed notes in Settings.</p>`
          : html`<label class="check"><input type="checkbox" id="e-sealed" ${n.sealed ? raw('checked') : ''}> Seal this note (never shared, needs your second passphrase)</label>`}
      </div>
    </details>`}`;
    const reg = $('#e-region', box);
    if (reg) reg.onchange = () => { patch({ region: reg.value || null, inbox: !reg.value, suggestedRegion: reg.value ? null : note().suggestedRegion }); };
    const typ = $('#e-type', box);
    if (typ) {
      typ.onchange = () => {
        patch({ type: typ.value });
        const t = TEMPLATES[typ.value];
        if (t && editor && !docPlainText(editor.getJSON()).trim()) editor.commands.setContent(rich.mdToDoc(t), true);
      };
    }
    $('#e-tags', box).onchange = (e) => patch({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) });
    $('#e-url', box).onchange = (e) => patch({ url: e.target.value.trim() || null });
    $('#e-add', box).onchange = async (e) => {
      const list = [...e.target.files];
      e.target.value = '';
      const cur = note();
      const files = [...cur.files];
      for (const f of list) {
        try {
          const img = await compressImage(f);
          const fid = await V.addFile(img.bytes, { sealed: cur.sealed });
          files.push({ id: fid, w: img.w, h: img.h, type: img.type, ocr: '', ocrStatus: 'pending', ocrBy: V.state.deviceId });
        } catch { toast(`Couldn’t add ${f.name || 'that image'}.`); }
      }
      await patch({ files }, { force: true });
      ctx.runOcr();
      drawFigures();
    };
    const sealBox = $('#e-sealed', box);
    if (sealBox) sealBox.onchange = async () => { await flush(true); const ok = await seal(sealBox.checked); if (!ok) sealBox.checked = !sealBox.checked; };
  }

  async function patch(fields, { force = false } = {}) {
    if (id === 'new') {
      draft = { ...draft, ...fields };
      if (force) await persist(true);
      return;
    }
    const cur = state.notes.get(id);
    if (!cur) return;
    await V.saveNote({ ...cur, ...fields });
    setSave('Saved on this device');
  }

  // ---------- Connections ----------
  function drawConnections() {
    const n = note();
    const box = $('#n-conn', el);
    if (!box || !n) return;
    if (editing || id === 'new') { box.innerHTML = ''; return; }
    const regions = state.config.regions;
    const dot = (o) => regionColors(o.inbox ? null : regions.find((x) => x.id === o.region)).dot;
    const href = (o) => (compact ? `#/map?note=${o.id}` : `#/note/${o.id}`);
    const linked = linkedWith(n);
    const ment = mentions(n);
    const rel = related(n);
    const kids = subNotes(n);
    const suggestions = n.suggested.filter((s) => state.notes.has(s.id) && !n.links.includes(s.id));
    const incoming = [...state.notes.values()].filter((o) => o.id !== n.id && o.suggested.some((s) => s.id === n.id) && !o.links.includes(n.id) && !suggestions.some((s) => s.id === o.id));
    const sugg = [...suggestions.map((s) => ({ other: state.notes.get(s.id), reason: s.reason })), ...incoming.map((o) => ({ other: o, reason: o.suggested.find((s) => s.id === n.id)?.reason }))];
    box.innerHTML = `${html`<section class="connections" aria-labelledby="conn-h">
      <h2 id="conn-h" class="conn-title">Connections</h2>
      ${kids.length || n.notebook ? html`<div class="conn-group"><h3>Sub-notes${kids.length ? html` <span class="count">${kids.length}</span>` : ''}</h3>
        <ul class="links-list">${kids.map((k) => html`<li><a href="${href(k)}">${icons.sub({ size: 16 })}<span style="flex:1;min-width:0">${displayTitle(k)}</span><span class="rn">${k.kind === 'ink' ? 'Handwritten' : 'Typed'}</span></a></li>`)}</ul>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-sub="note">${icons.plus({ size: 16 })}Typed sub-note</button><button type="button" class="btn btn-sm" data-sub="ink">${icons.pen({ size: 16 })}Handwritten sub-note</button></div></div>` : ''}
      ${linked.length ? html`<div class="conn-group"><h3>Linked <span class="count">${linked.length}</span></h3>
        <ul class="links-list">${linked.map(({ note: o, explicit, context }) => html`<li><a href="${href(o)}"><span class="dot" style="background:${dot(o)}"></span><span style="flex:1;min-width:0"><span class="lt">${displayTitle(o)}</span>${context ? html`<span class="ctx">…${context.slice(0, 110)}</span>` : ''}</span></a>
          ${explicit ? html`<button type="button" class="icon-btn bare" data-unlink="${o.id}" aria-label="Unlink ${displayTitle(o)}">${icons.close({ size: 16 })}</button>` : ''}</li>`)}</ul></div>` : ''}
      ${ment.length ? html`<div class="conn-group"><h3>Mentioned, not linked</h3>
        <ul class="links-list">${ment.map((m) => html`<li><a href="${href(m.note)}"><span class="dot" style="background:${dot(m.note)}"></span><span style="flex:1;min-width:0"><span class="lt">${displayTitle(m.note)}</span><span class="ctx">…${m.before}<mark>${m.match}</mark>${m.after}…</span></span></a>
          <button type="button" class="btn btn-sm" data-accept="${m.note.id}">Link</button></li>`)}</ul></div>` : ''}
      ${rel.length ? html`<div class="conn-group"><h3>Related, found on this device</h3>
        <ul class="links-list">${rel.map((x) => html`<li><a href="${href(x.note)}"><span class="dot" style="background:${dot(x.note)}"></span><span style="flex:1;min-width:0"><span class="lt">${displayTitle(x.note)}</span><span class="ctx">Shares: ${x.shared.join(', ')}</span></span></a>
          <button type="button" class="btn btn-sm" data-accept="${x.note.id}">Link</button></li>`)}</ul>
        <p class="hint">Worked out on this device from your words. Nothing is sent anywhere.</p></div>` : ''}
      ${sugg.map(({ other, reason }) => html`<div class="suggest" aria-label="Suggested link">
        <span class="flag">Suggested link</span>
        <p class="title">${displayTitle(other)}</p>
        ${reason ? html`<p class="hint">${reason}</p>` : ''}
        <div class="actions"><button type="button" class="btn btn-sm btn-primary" style="min-height:40px;font-size:15px" data-accept="${other.id}">Link</button><button type="button" class="btn btn-sm btn-ghost" data-dismiss="${other.id}">Dismiss</button></div>
      </div>`)}
      ${!linked.length && !ment.length && !rel.length && !sugg.length && !kids.length && !n.notebook ? html`<p class="hint">No connections yet. Link a note with [[ while editing, or with the link button.</p>` : ''}
      <button type="button" class="conn-history" data-act="history">${icons.history({ size: 18 })}<span>Version history</span><span class="muted">${n.editedOn ? `Edited on ${n.editedOn}, ` : ''}${fmtDate(n.updatedAt)} ${fmtTime(n.updatedAt)}</span></button>
    </section>`}`;
    const on = (sel, fn) => box.querySelectorAll(sel).forEach((b) => { b.onclick = () => fn(b); });
    on('[data-unlink]', async (b) => { await V.unlinkNotes(n.id, b.dataset.unlink); });
    on('[data-accept]', async (b) => { await V.linkNotes(n.id, b.dataset.accept); toast('Linked'); });
    on('[data-dismiss]', async (b) => { await V.dismissSuggestion(n.id, b.dataset.dismiss); });
    on('[data-sub]', (b) => ctx.navigate(`#/note/new?parent=${n.id}${b.dataset.sub === 'ink' ? '&kind=ink' : ''}`));
    on('[data-act=history]', async () => { const { openHistory } = await import('./history.js'); openHistory(n, ctx); });
  }

  // ---------- Editor ----------
  async function mountEditor() {
    const n = note();
    const host = $('#n-rich', el);
    if (!host || !n) return;
    const R = await loadRich();
    if (note() !== n && id !== 'new') return; // moved on while loading
    if (!$('#n-rich', el)) return;
    editor = R.createRichEditor(host, {
      doc: R.noteDoc(n),
      editable: editing,
      font: n.font,
      placeholder: n.files.length ? 'Add your own words' : 'Write, or type / for headings, lists, labels and more',
      onChange: () => markDirty(),
      onOpenLink: (title) => {
        const target = [...state.notes.values()].find((x) => displayTitle(x).toLowerCase() === title.toLowerCase());
        if (target) ctx.navigate(`#/note/${target.id}`);
        else toast(`No note called “${title}” yet`);
      },
      pickLabel: (cb) => labelPicker(host, { title: 'Callout label' }).then(cb),
      pickDate: (cur, cb) => datePicker(host, cur).then((d) => cb(d === undefined ? undefined : d)),
    });
    host.style.setProperty('--note-font', R.fontCss(n.font));
    // Tap the text while reading to start editing there.
    editor.view.dom.addEventListener('click', (e) => {
      if (editing || compact) return;
      if (e.target.closest('a, button, input, label, .wikilink, .due-chip, .callout-label')) return;
      const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      startEditing(pos?.pos);
    });
    if (editing) {
      setupBar();
      if (focusWhenReady) { focusWhenReady = false; editor.commands.focus('start'); } else if (id === 'new' && !n.title) setTimeout(() => $('#n-title', el)?.focus(), 50);
    }
    drawOutline();
  }

  function setupBar() {
    const b = $('#n-bar', el);
    if (!b || !editor) return;
    b.hidden = false;
    const phone = !isWide();
    b.classList.toggle('phone', phone);
    document.body.classList.add('editing');
    import('../editor/toolbar.js').then((T) => {
      if (!editor) return;
      bar = T.mountFormatBar(b, editor, {
        compact: false,
        hideKeyboard: phone,
        sealed: () => !!note()?.sealed,
        noteFont: () => note()?.font,
        setNoteFont: (f) => { patch({ font: f }); $('#n-rich', el)?.style.setProperty('--note-font', rich.fontCss(f)); },
      });
      suggest = T.attachSuggest(editor, { noteId: () => id, sealed: () => !!note()?.sealed });
      vvHandler = T.floatBar(b);
    });
  }

  function teardownBar() {
    bar?.destroy();
    bar = null;
    suggest?.close();
    suggest = null;
    const b = $('#n-bar', el);
    if (b) { b.hidden = true; b.innerHTML = ''; }
    document.body.classList.remove('editing');
    vvHandler?.();
    vvHandler = null;
  }

  function destroyEditor() {
    teardownBar();
    editor?.destroy();
    editor = null;
  }

  function drawOutline() {
    const box = $('#n-outline', el);
    if (!box || !editor || compact) return;
    const doc = editor.getJSON();
    const heads = docOutline(doc);
    const labs = docLabels(doc);
    const wide = window.matchMedia('(min-width: 1180px)').matches;
    if (!wide || (heads.length < 2 && !labs.length)) { box.hidden = true; el.querySelector('#np')?.classList.remove('with-outline'); return; }
    box.hidden = false;
    el.querySelector('#np')?.classList.add('with-outline');
    const lm = labelMap(state.config);
    const counts = new Map();
    for (const l of labs) counts.set(l.l, (counts.get(l.l) || 0) + 1);
    box.innerHTML = `${html`${heads.length >= 2 ? html`<h2>Outline</h2><ul class="outline-list">${heads.map((h) => html`<li class="lv${h.level}"><button type="button" data-h="${h.index}">${h.text || 'Untitled'}</button></li>`)}</ul>` : ''}
      ${counts.size ? html`<h2>Labels in this note</h2><ul class="outline-labels">${[...counts].map(([l, c]) => html`<li><a href="#/labels?l=${encodeURIComponent(l)}">${raw(labelChipHtml(lm.get(l) || { name: l }, 0.55))}<span class="count">${c}</span></a></li>`)}</ul>` : ''}`}`;
    box.querySelectorAll('[data-h]').forEach((b) => {
      b.onclick = () => {
        const hs = editor.view.dom.querySelectorAll('h1, h2, h3');
        hs[Number(b.dataset.h)]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  }
  const outlineSoon = debounce(drawOutline, 600);

  // ---------- Editing and saving ----------
  function startEditing(pos) {
    if (editing) return;
    editing = true;
    editor?.setEditable(true);
    $('#n-edit', el).textContent = 'Done';
    $('#n-edit', el).classList.add('btn-primary');
    drawHead();
    drawFigures();
    drawExtra();
    drawDetails();
    drawConnections();
    setupBar();
    if (editor) {
      if (typeof pos === 'number') editor.chain().focus().setTextSelection(pos).run();
      else editor.commands.focus('end');
    }
  }

  async function stopEditing() {
    await flush(true);
    if (id === 'new') { ctx.back(); return; }
    editing = false;
    teardownBar();
    editor?.setEditable(false);
    $('#n-edit', el).textContent = 'Edit';
    $('#n-edit', el).classList.remove('btn-primary');
    drawHead();
    drawFigures();
    drawExtra();
    drawDetails();
    drawConnections();
    drawOutline();
    ctx.runOcr();
  }

  function markDirty() {
    dirty = true;
    setSave('Saving…');
    saveSoon();
    outlineSoon();
  }
  const saveSoon = debounce(() => persist(), 700);

  async function flush(force = false) {
    saveSoon.cancel();
    if (dirty || force) await persist(force);
  }

  async function persist() {
    const n = note();
    if (!n || !editor || !rich) return;
    dirty = false;
    const doc = editor.getJSON();
    const body = rich.markdownOf(doc);
    const titleEl = $('#n-title', el);
    const title = titleEl ? titleEl.value.replace(/\s+/g, ' ').trim() : n.title;
    const next = { ...n, doc, body, title, titleAuto: !title };
    if (id === 'new') {
      draft = next;
      if (!title && !docPlainText(doc).trim() && !next.files.length) { setSave(''); return; }
      try {
        const saved = await V.saveNote(next);
        id = saved.id;
        draft = null;
        ctx.navigate(`#/note/${saved.id}`, { replace: true, silent: true });
        setSave('Saved on this device');
      } catch (e) { setSave(e.message); }
      return;
    }
    const cur = state.notes.get(id);
    if (!cur) return;
    if (cur.body === body && cur.title === title && JSON.stringify(cur.doc) === JSON.stringify(doc)) { setSave('Saved on this device'); return; }
    try {
      await V.saveNote({ ...cur, doc, body, title, titleAuto: !title });
      setSave('Saved on this device');
    } catch (e) { setSave(e.message); }
  }

  function setSave(t) {
    saveState = t;
    const s = $('#n-save', el);
    if (s) s.textContent = t;
  }

  // ---------- Actions ----------
  async function linkTo() {
    const n = note();
    if (id === 'new') { await persist(true); if (id === 'new') { toast('Write something first'); return; } }
    const other = await notePicker({ exclude: [n.id, ...n.links] });
    if (other) { await V.linkNotes(id, other); toast('Linked'); }
  }

  async function seal(sealed) {
    const s = V.sealedState();
    if (s === 'none') {
      const go = await confirmSheet({ title: 'Set up sealed notes first', body: 'Sealed notes use a second passphrase and are never shared with Claude. You can set this up in Settings.', confirm: 'Open Settings' });
      if (go) ctx.navigate('#/settings');
      return false;
    }
    if (s === 'locked') {
      const ok = await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) });
      if (!ok) return false;
    }
    if (id === 'new') { draft = { ...draft, sealed }; return true; }
    try {
      await V.setSealed(id, sealed);
      toast(sealed ? 'Sealed' : 'Unsealed');
      return true;
    } catch (e) { toast(e.message); return false; }
  }

  async function moveToNotebook() {
    const n = note();
    const dest = await notebookPicker({ title: 'Move to a notebook' });
    if (!dest) return;
    const nb = state.notebooks.get(dest.notebook);
    if (nb?.sealed && !n.sealed) { toast('Seal the note first to move it into a sealed notebook.'); return; }
    await patch({ notebook: dest.notebook, section: dest.section, region: nb?.region || null, inbox: false, suggestedRegion: null, parent: null }, { force: true });
    toast(`Moved to ${nb?.title}`);
    drawHead();
  }

  async function more() {
    const n = note();
    if (!n) return;
    await flush();
    const items = [
      { value: 'edit', label: editing ? 'Done editing' : 'Edit' },
      { value: 'link', label: 'Link to another note' },
      { value: 'sub', label: 'Add a sub-note' },
      { value: 'notebook', label: n.notebook ? 'Move to another notebook' : 'Move into a notebook' },
      { value: 'history', label: 'Version history' },
      { value: 'md', label: 'Export as Markdown' },
      { value: 'print', label: 'Print or save as PDF' },
      { value: n.sealed ? 'unseal' : 'seal', label: n.sealed ? 'Unseal' : 'Seal this note' },
    ];
    if (!n.inbox && !n.notebook) items.push({ value: 'inbox', label: 'Move back to inbox' });
    if (n.notebook) items.push({ value: 'out', label: 'Take out of the notebook' });
    if (id !== 'new') items.push({ value: 'delete', label: 'Delete note', danger: true });
    const act = await menuSheet(displayTitle(n), items);
    if (act === 'edit') (editing ? stopEditing() : startEditing());
    if (act === 'link') linkTo();
    if (act === 'sub') { await persist(true); if (id !== 'new') ctx.navigate(`#/note/new?parent=${id}`); }
    if (act === 'notebook') moveToNotebook();
    if (act === 'history') { const { openHistory } = await import('./history.js'); openHistory(state.notes.get(id) || n, ctx); }
    if (act === 'md') {
      const { noteToMarkdown, safeName } = await import('../export.js');
      downloadText(`${safeName(displayTitle(n))}.md`, noteToMarkdown(state.notes.get(id) || n));
    }
    if (act === 'print') { if (editing) await stopEditing(); setTimeout(() => window.print(), 100); }
    if (act === 'seal') seal(true);
    if (act === 'unseal') seal(false);
    if (act === 'inbox') await V.saveNote({ ...n, inbox: true, region: null, suggestedRegion: n.region });
    if (act === 'out') await V.saveNote({ ...n, notebook: null, section: null, parent: null, inbox: !n.region });
    if (act === 'delete') {
      const kids = subNotes(n).length;
      const ok = await confirmSheet({ title: 'Delete this note?', body: `Its images go too.${kids ? ` Its ${kids} sub-note${kids === 1 ? '' : 's'} will move up a level.` : ''} This syncs to your other devices.`, confirm: 'Delete', danger: true });
      if (ok) {
        destroyEditor();
        await V.deleteNote(n.id);
        toast('Deleted');
        ctx.navigate(compact ? '#/map' : n.notebook ? `#/notebook/${n.notebook}` : '#/notes', { replace: true });
      }
    }
  }

  start();

  return {
    update(p) {
      if (p.id === id) return;
      flush();
      id = p.id;
      params = p;
      editing = false;
      draft = null;
      start();
    },
    onEvent(evt) {
      if (id === 'new') return;
      if (evt.type === 'delete' && evt.id === id) { drawShell(); return; }
      if (['note', 'delete', 'remote', 'sealed', 'config', 'ocr', 'notebook'].includes(evt.type)) {
        if (evt.type === 'ocr' && evt.id && evt.id !== id) return;
        const n = state.notes.get(id);
        if (!n) { drawShell(); return; }
        // Someone else changed this note (another device): show it, unless we're typing.
        if (!editing && editor && rich && (evt.type === 'remote' || evt.type === 'sealed')) {
          const cur = editor.getJSON();
          const next = rich.noteDoc(n);
          if (JSON.stringify(cur) !== JSON.stringify(next)) editor.commands.setContent(next, false);
        }
        if (!editing) { drawHead(); drawFigures(); drawExtra(); }
        else if (evt.type === 'ocr') drawFigures();
        drawConnections();
      }
    },
    destroy() {
      flush();
      destroyEditor();
    },
  };
}
