// Notebooks: the shelf, a notebook's sections and sub-notes, the cover library
// and the new-notebook screen. On iPad the open note sits beside the notebook.

import { html, raw, $, toast, isWide, debounce, uid } from '../util.js';
import * as V from '../vault.js';
import { state, notesIn } from '../vault.js';
import { newNotebook, regionColors, displayTitle, PAPERS, PAPER_COLORS } from '../model.js';
import { icons } from '../icons.js';
import { openSheet, menuSheet, confirmSheet, passphraseSheet } from '../ui.js';
import { COVERS, COVER_GROUPS, PLAIN_COLORS, coverSVG, coverName } from '../covers.js';
import { compressImage } from '../images.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Fill in photo covers once their (encrypted) image is ready.
async function paintPhotoCovers(root) {
  for (const slot of root.querySelectorAll('[data-cover-photo]')) {
    const nb = state.notebooks.get(slot.dataset.coverPhoto);
    if (!nb?.cover?.photo) continue;
    const url = await V.fileURL(nb.cover.photo);
    if (url) slot.innerHTML = coverSVG(nb, { photoUrl: url, width: Number(slot.dataset.w) || 140 });
  }
}

function coverHtml(nb, width) {
  return html`<span class="cover-slot" ${nb.cover?.style === 'photo' ? raw(`data-cover-photo="${nb.id}" data-w="${width}"`) : ''}>${raw(coverSVG(nb, { width }))}</span>`;
}

const sortNotebooks = (list, sort) => {
  const regions = state.config.regions.map((r) => r.id);
  if (sort === 'name') return list.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'region') return list.sort((a, b) => (regions.indexOf(a.region) - regions.indexOf(b.region)) || a.title.localeCompare(b.title));
  const last = (b) => Math.max(b.updatedAt, ...notesIn(b.id).map((n) => n.updatedAt));
  return list.sort((a, b) => last(b) - last(a));
};

// ---- The shelf ------------------------------------------------------------------

export function mount(el, params, ctx) {
  let region = params.region || '';
  let sort = state.device?.nbSort || 'recent';

  function draw() {
    const all = [...state.notebooks.values()];
    const list = sortNotebooks(all.filter((b) => !region || b.region === region), sort);
    const notes = all.reduce((s, b) => s + notesIn(b.id).length, 0);
    const used = state.config.regions.filter((r) => all.some((b) => b.region === r.id));
    el.innerHTML = `${html`<div class="page shelf-page">
      <div class="page-head">
        <div><h1 class="page-title">Notebooks</h1><p class="page-sub">${all.length ? `${plural(all.length, 'notebook')}, ${plural(notes, 'note')}` : 'Handwritten and typed notes, kept together'}</p></div>
        <div class="head-actions">
          ${all.length > 1 ? html`<label class="sr-only" for="sh-sort">Sort</label><select id="sh-sort" class="region-select">
            ${[['recent', 'Recent'], ['name', 'Name'], ['region', 'Region']].map(([v, n]) => html`<option value="${v}" ${sort === v ? raw('selected') : ''}>${n}</option>`)}</select>` : ''}
          <button type="button" class="btn btn-sm" data-import aria-label="Bring in notes from Notability or PDFs">${icons.download({ size: 18 })}<span class="hide-sm">Bring in notes</span></button>
          <button type="button" class="btn btn-primary btn-sm hide-sm" data-new>${icons.plus({ size: 18 })}New notebook</button>
        </div>
      </div>
      ${used.length > 1 ? html`<div class="chips scroll" role="group" aria-label="Filter by region">
        <button type="button" class="chip" aria-pressed="${!region ? 'true' : 'false'}" data-r="">All</button>
        ${used.map((r) => html`<button type="button" class="chip" aria-pressed="${region === r.id ? 'true' : 'false'}" data-r="${r.id}"><span class="dot" style="background:${regionColors(r).dot}"></span>${r.name}</button>`)}
      </div>` : ''}
      <ul class="shelf" aria-label="Notebooks">
        ${list.map((b) => {
          const n = notesIn(b.id).length;
          return html`<li><a class="nb-card" href="#/notebook/${b.id}">
            <span class="cover-wrap">${coverHtml(b, 160)}${b.sealed ? html`<span class="cover-lock" aria-hidden="true">${icons.lock({ size: 14 })}</span>` : ''}</span>
            <span class="nb-name">${b.title}</span>
            <span class="nb-count">${b.sealed ? 'Sealed, ' : ''}${plural(n, 'note')}</span>
          </a></li>`;
        })}
        <li><button type="button" class="nb-card new" data-new><span class="cover-wrap dashed">${icons.plus({ size: 26 })}<span>New notebook</span></span></button></li>
      </ul>
      ${state.hiddenSealed && V.sealedState() === 'locked' ? html`<p class="hint">Sealed notebooks are hidden. <button type="button" class="link-btn" data-action="toggle-sealed">Open sealed notes</button></p>` : ''}
      ${!all.length ? html`<p class="hint">A notebook holds handwritten pages and typed notes, split into sections, with sub-notes inside notes. Each notebook lives in a region, so its notes join that part of your map.</p>` : ''}
      <p class="hint">Coming from Notability or GoodNotes? <button type="button" class="link-btn" data-import2>Bring in your notes as PDFs</button>, many at once.</p>
    </div>`}`;
    el.querySelectorAll('[data-new]').forEach((b) => { b.onclick = async () => { const nb = await notebookSheet(); if (nb) ctx.navigate(`#/notebook/${nb.id}`); }; });
    el.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { region = b.dataset.r; draw(); }; });
    el.querySelectorAll('[data-import], [data-import2]').forEach((b) => { b.onclick = async () => { const { importSheet } = await import('./importsheet.js'); importSheet({ ctx }); }; });
    const so = $('#sh-sort', el);
    if (so) so.onchange = () => { sort = so.value; V.updateDevice({ nbSort: sort }).catch(() => {}); draw(); };
    paintPhotoCovers(el);
  }

  draw();
  let gone = false;
  const soon = debounce(() => { if (!gone) draw(); }, 250);
  return {
    update(p) { region = p.region || ''; draw(); },
    onEvent(evt) { if (['note', 'notebook', 'delete', 'remote', 'sealed', 'config'].includes(evt.type)) soon(); },
    destroy() { gone = true; soon.cancel?.(); },
  };
}

// ---- Inside a notebook -------------------------------------------------------------

const ROW_ICON = (n) => (n.kind === 'ink' ? icons.pen({ size: 17 }) : n.kind === 'board' ? icons.board({ size: 17 }) : icons.lines({ size: 17 }));

export function mountNotebook(el, params, ctx) {
  let id = params.id;
  let current = params.note || null;
  let tableSec = params.view || null; // a section shown as a table
  let pane = null; // { id, inst }
  let tv = null; // the table view instance
  const collapsed = new Set();
  let wide = isWide();
  document.body.classList.add('nb-open');

  const nb = () => state.notebooks.get(id);
  // Drop a PDF on the notebook to mark it up.
  el.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault(); });
  el.addEventListener('drop', (e) => {
    const fs = [...(e.dataTransfer?.files || [])].filter((x) => x.type === 'application/pdf' || /\.(pdf|zip)$/i.test(x.name));
    if (!fs.length) return;
    e.preventDefault();
    if (fs.length > 1 || /\.zip$/i.test(fs[0].name)) bulk(fs); else openPdf(fs[0]);
  });

  // The note beside the notebook uses its own navigation, so links to notes in
  // this notebook open in the pane instead of taking over the screen.
  const paneCtx = {
    ...ctx,
    navigate(hash, opts = {}) {
      const m = hash.match(/^#\/note\/([^?]+)(?:\?(.*))?$/);
      if (m && isWide()) {
        const nid = decodeURIComponent(m[1]);
        const n = state.notes.get(nid);
        if (nid === 'new' || n?.notebook === id) return ctx.navigate(`#/notebook/${id}?note=${encodeURIComponent(nid)}${m[2] ? `&${m[2]}` : ''}`, opts);
      }
      return ctx.navigate(hash, opts);
    },
    back() { ctx.navigate(`#/notebook/${id}`, { replace: true }); },
  };

  const noteHref = (n) => (wide ? `#/notebook/${id}?note=${n.id}` : `#/note/${n.id}`);

  function treeHtml(b) {
    const all = notesIn(b.id);
    const kids = (pid) => all.filter((n) => (n.parent || null) === pid && (pid || true)).sort((a, x) => a.order - x.order);
    const rows = (list, depth) => html`${list.map((n) => {
      const sub = all.filter((c) => c.parent === n.id).sort((a, x) => a.order - x.order);
      return html`<li><a class="nb-row ${current === n.id ? 'current' : ''}" href="${noteHref(n)}" style="--d:${depth}" ${current === n.id ? raw('aria-current="page"') : ''}>
        <span class="ic">${ROW_ICON(n)}</span><span class="t">${displayTitle(n)}</span>${n.kind === 'ink' && n.pages.length > 1 ? html`<span class="pc">${n.pages.length} pages</span>` : ''}</a>
        ${sub.length ? html`<ul class="nb-tree">${rows(sub, depth + 1)}</ul>` : ''}</li>`;
    })}`;
    const one = b.sections.length === 1;
    return html`${b.sections.map((s, si) => {
      const top = all.filter((n) => !n.parent || !all.some((p) => p.id === n.parent)).filter((n) => (n.section || b.sections[0].id) === s.id || (!b.sections.some((x) => x.id === n.section) && si === 0)).sort((a, x) => a.order - x.order);
      const count = all.filter((n) => (n.section || b.sections[0].id) === s.id).length;
      const open = !collapsed.has(s.id);
      void kids;
      return html`<section class="nb-sec" aria-label="${s.name}">
        ${one ? '' : html`<div class="nb-sec-head">
          <button type="button" class="nb-sec-toggle" aria-expanded="${open ? 'true' : 'false'}" data-toggle="${s.id}">${icons.chevron({ size: 16 })}<span>${s.name}</span></button>
          <span class="count">${count}</span>
          <button type="button" class="icon-btn bare sm ${tableSec === s.id ? 'on' : ''}" data-view="${s.id}" aria-label="See ${s.name} as a table" ${tableSec === s.id ? raw('aria-current="true"') : ''}>${icons.table({ size: 17 })}</button>
          <button type="button" class="icon-btn bare sm" data-secmenu="${s.id}" aria-label="${s.name} options">${icons.more({ size: 18 })}</button>
        </div>`}
        ${open ? html`<ul class="nb-tree">${top.length ? rows(top, 0) : html`<li class="nb-empty">Nothing here yet</li>`}</ul>` : ''}
      </section>`;
    })}`;
  }

  function draw() {
    wide = isWide();
    const b = nb();
    tv?.destroy();
    tv = null;
    if (!b) {
      el.innerHTML = `${html`<div class="page"><div class="empty"><p class="serif">This notebook isn’t here</p><p style="margin:0">It may have been deleted, or it’s sealed and locked.</p><a class="btn" href="#/notebooks">Back to notebooks</a></div></div>`}`;
      return;
    }
    if (tableSec && !b.sections.some((s) => s.id === tableSec)) tableSec = null;
    // On iPhone a table takes the whole screen.
    if (tableSec && !wide) {
      el.innerHTML = '<div class="nbv-tv page" id="nb-tv"></div>';
      mountTable($('#nb-tv', el));
      return;
    }
    const n = notesIn(b.id).length;
    const r = state.config.regions.find((x) => x.id === b.region);
    el.innerHTML = `${html`<div class="nbv ${wide && (current || tableSec) ? 'with-pane' : ''}">
      <div class="nb-side">
        <a class="back" href="#/notebooks">${icons.back()}Notebooks</a>
        <div class="nb-head">
          <button type="button" class="nb-cover-btn" data-act="edit" aria-label="Change cover and details">${coverHtml(b, 54)}</button>
          <div class="nb-head-t">
            <h1 class="nb-title">${b.title}</h1>
            <p class="nb-sub">${r ? html`<span class="dot" style="background:${regionColors(r).dot}"></span>${r.name}, ` : ''}${plural(n, 'note')}${b.sections.length > 1 ? ` in ${plural(b.sections.length, 'section')}` : ''}${b.sealed ? ', sealed' : ''}</p>
          </div>
          <button type="button" class="icon-btn bare" data-act="more" aria-label="Notebook options">${icons.more()}</button>
        </div>
        <div class="nb-new">
          <button type="button" class="btn" data-newnote="ink">${icons.pen({ size: 18 })}Handwritten</button>
          <button type="button" class="btn" data-newnote="note">${icons.lines({ size: 18 })}Typed</button>
          <button type="button" class="btn" data-newnote="board">${icons.board({ size: 18 })}Whiteboard</button>
          <button type="button" class="btn" data-act="table">${icons.table({ size: 18 })}Table view</button>
          <button type="button" class="btn" data-pdf>${icons.pdf({ size: 18 })}Mark up a PDF</button>
        </div>
        <nav class="nb-tree-wrap" aria-label="Notes in ${b.title}">${treeHtml(b)}</nav>
        <button type="button" class="nb-add-sec" data-act="add-section">${icons.plus({ size: 18 })}Add section</button>
      </div>
      ${wide ? html`<div class="nb-pane" id="nb-pane">${current || tableSec ? '' : html`<div class="nb-pane-empty">${raw(coverSVG(b, { width: 150, label: false }))}<p class="serif">${n ? 'Pick a note, or start a new one.' : 'Start your first page.'}</p>
        <div class="btn-row"><button type="button" class="btn" data-newnote="ink">${icons.pen({ size: 18 })}Handwritten</button><button type="button" class="btn" data-newnote="note">${icons.lines({ size: 18 })}Typed</button><button type="button" class="btn" data-newnote="board">${icons.board({ size: 18 })}Whiteboard</button><button type="button" class="btn" data-pdf>${icons.pdf({ size: 18 })}Mark up a PDF</button></div></div>`}</div>` : ''}
    </div>`}`;
    bind();
    paintPhotoCovers(el);
    if (wide && tableSec) { pane = null; mountTable($('#nb-pane', el)); } else if (wide && current) openPane(params);
    else pane = null;
  }

  async function mountTable(host) {
    const { mountSectionView } = await import('./tableview.js');
    if (!host.isConnected) return;
    tv?.destroy();
    tv = mountSectionView(host, id, tableSec, ctx, {
      back: wide ? null : () => ctx.navigate(`#/notebook/${id}`),
      onOpenNote: (nid) => ctx.navigate(isWide() ? `#/notebook/${id}?note=${nid}` : `#/note/${nid}`),
    });
  }

  function showTable(sid) {
    ctx.navigate(`#/notebook/${id}?view=${sid}`);
  }

  function redrawTree() {
    if (tableSec && !wide && nb()) return; // the table keeps itself up to date
    const wrap = el.querySelector('.nb-tree-wrap');
    const b = nb();
    if (!wrap || !b) { draw(); return; }
    wrap.innerHTML = String(treeHtml(b));
    const sub = el.querySelector('.nb-sub');
    const n = notesIn(b.id).length;
    const r = state.config.regions.find((x) => x.id === b.region);
    if (sub) sub.innerHTML = `${html`${r ? html`<span class="dot" style="background:${regionColors(r).dot}"></span>${r.name}, ` : ''}${plural(n, 'note')}${b.sections.length > 1 ? ` in ${plural(b.sections.length, 'section')}` : ''}${b.sealed ? ', sealed' : ''}`}`;
    bindTree();
  }

  function bind() {
    el.querySelectorAll('[data-newnote]').forEach((btn) => { btn.onclick = () => newNoteIn(btn.dataset.newnote); });
    // A PDF opens as a handwritten note with its pages to draw, circle and highlight on.
    el.querySelectorAll('[data-pdf]').forEach((btn) => {
      btn.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/pdf,.pdf';
        inp.multiple = true;
        inp.onchange = () => { const fs = [...(inp.files || [])]; if (fs.length > 1) bulk(fs); else if (fs[0]) openPdf(fs[0]); };
        inp.click();
      };
    });
    el.querySelector('[data-act=more]').onclick = () => more();
    el.querySelector('[data-act=edit]').onclick = async () => { await notebookSheet(nb()); };
    el.querySelector('[data-act=add-section]').onclick = () => addSection();
    el.querySelector('[data-act=table]').onclick = () => showTable(lastSection());
    bindTree();
  }

  function bindTree() {
    el.querySelectorAll('[data-toggle]').forEach((b) => {
      b.onclick = () => { const s = b.dataset.toggle; if (collapsed.has(s)) collapsed.delete(s); else collapsed.add(s); redrawTree(); };
    });
    el.querySelectorAll('[data-secmenu]').forEach((b) => { b.onclick = () => sectionMenu(b.dataset.secmenu); });
    el.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => (tableSec === b.dataset.view ? ctx.navigate(`#/notebook/${id}`) : showTable(b.dataset.view)); });
  }

  function lastSection() {
    const b = nb();
    const cur = current && state.notes.get(current);
    return (cur?.section && b.sections.some((s) => s.id === cur.section) ? cur.section : null) || b.sections.find((s) => !collapsed.has(s.id))?.id || b.sections[0].id;
  }

  // Several PDFs (or a zip): each becomes its own note in this notebook.
  async function bulk(files) {
    const { importSheet } = await import('./importsheet.js');
    importSheet({ files, notebook: id, section: lastSection(), ctx });
  }

  async function openPdf(file) {
    const { handOff } = await import('../handoff.js');
    handOff(file);
    newNoteIn('ink');
  }

  function newNoteIn(kind, section = lastSection()) {
    const q = `notebook=${id}&section=${section}${kind === 'ink' || kind === 'board' ? `&kind=${kind}` : ''}`;
    if (isWide()) ctx.navigate(`#/notebook/${id}?note=new&${q}`);
    else ctx.navigate(`#/note/new?${q}`);
  }

  async function openPane(p) {
    const host = $('#nb-pane', el);
    if (!host) return;
    const key = p.note === 'new' ? `new:${p.kind || 'note'}:${Date.now()}` : p.note;
    if (pane && pane.key === key) return;
    const { mount: mountNote } = await import('./note.js');
    const np = { id: p.note, kind: p.kind, notebook: id, section: p.section, parent: p.parent };
    if (pane?.inst && p.note !== 'new' && pane.key && !pane.key.startsWith('new:')) {
      pane.inst.update?.(np);
      pane.key = key;
      return;
    }
    pane?.inst?.destroy?.();
    host.innerHTML = '';
    pane = { key, inst: mountNote(host, np, paneCtx) };
  }

  function closePane() {
    pane?.inst?.destroy?.();
    pane = null;
  }

  // ---- Sections ----
  async function addSection() {
    const name = await textSheet({ title: 'New section', label: 'Name', placeholder: 'For example 1:1s', confirm: 'Add section' });
    if (!name) return;
    const b = nb();
    await V.saveNotebook({ ...b, sections: [...b.sections, { id: uid('s'), name }] });
    toast(`Added ${name}`);
  }

  async function sectionMenu(sid) {
    const b = nb();
    const i = b.sections.findIndex((s) => s.id === sid);
    const s = b.sections[i];
    if (!s) return;
    const items = [
      { value: 'ink', label: 'New handwritten note here' },
      { value: 'note', label: 'New typed note here' },
      { value: 'board', label: 'New whiteboard here' },
      { value: 'table', label: 'See as a table' },
      { value: 'rename', label: 'Rename section' },
    ];
    if (i > 0) items.push({ value: 'up', label: 'Move up' });
    if (i < b.sections.length - 1) items.push({ value: 'down', label: 'Move down' });
    if (b.sections.length > 1) items.push({ value: 'delete', label: 'Delete section', danger: true });
    const act = await menuSheet(s.name, items);
    if (act === 'ink' || act === 'note' || act === 'board') newNoteIn(act, sid);
    if (act === 'table') showTable(sid);
    if (act === 'rename') {
      const name = await textSheet({ title: 'Rename section', label: 'Name', value: s.name, confirm: 'Save' });
      if (name) await V.saveNotebook({ ...b, sections: b.sections.map((x) => (x.id === sid ? { ...x, name } : x)) });
    }
    if (act === 'up' || act === 'down') {
      const sec = [...b.sections];
      const j = act === 'up' ? i - 1 : i + 1;
      [sec[i], sec[j]] = [sec[j], sec[i]];
      await V.saveNotebook({ ...b, sections: sec });
    }
    if (act === 'delete') {
      const inside = notesIn(id).filter((n) => n.section === sid);
      const to = b.sections.find((x) => x.id !== sid);
      const ok = await confirmSheet({ title: `Delete ${s.name}?`, body: inside.length ? `Its ${plural(inside.length, 'note')} move to ${to.name}. Nothing is deleted.` : 'It’s empty.', confirm: 'Delete section', danger: true });
      if (!ok) return;
      for (const n of inside) await V.saveNote({ ...n, section: to.id }, { touch: false });
      await V.saveNotebook({ ...b, sections: b.sections.filter((x) => x.id !== sid) });
    }
  }

  async function more() {
    const b = nb();
    const items = [
      { value: 'edit', label: 'Cover, name and region' },
      { value: 'section', label: 'Add section' },
      { value: 'pdf', label: 'Export notebook as PDF' },
      { value: 'md', label: 'Export notebook as Markdown' },
      { value: b.sealed ? 'unseal' : 'seal', label: b.sealed ? 'Unseal notebook' : 'Seal notebook' },
      { value: 'delete', label: 'Delete notebook', danger: true },
    ];
    const act = await menuSheet(b.title, items);
    if (act === 'edit') await notebookSheet(b);
    if (act === 'section') addSection();
    if (act === 'pdf' || act === 'md') {
      toast(act === 'pdf' ? 'Making the PDF…' : 'Making the export…');
      try {
        const X = await import('../export.js');
        if (act === 'pdf') await X.exportNotebookPdf(b);
        else await X.exportNotebookMarkdown(b);
      } catch (e) { console.error(e); toast('Couldn’t make the export.'); }
    }
    if (act === 'seal' || act === 'unseal') {
      if (!(await ensureSealedOpen(ctx))) return;
      try { await V.setNotebookSealed(id, act === 'seal'); toast(act === 'seal' ? 'Notebook sealed' : 'Notebook unsealed'); } catch (e) { toast(e.message); }
    }
    if (act === 'delete') {
      const n = notesIn(id).length;
      const how = n ? await menuSheet(`Delete ${b.title}?`, [
        { value: 'keep', label: `Delete the notebook, keep its ${plural(n, 'note')}` },
        { value: 'all', label: `Delete the notebook and its ${plural(n, 'note')}`, danger: true },
      ]) : 'all';
      if (!how) return;
      if (how === 'all') {
        const ok = await confirmSheet({ title: 'Delete everything in it?', body: `${plural(n, 'note')}, with their pages and images. This syncs to your other devices.`, confirm: 'Delete', danger: true });
        if (!ok) return;
      } else {
        for (const x of notesIn(id)) await V.saveNote({ ...x, notebook: null, section: null, inbox: !x.region }, { touch: false });
      }
      closePane();
      await V.deleteNotebook(id);
      toast('Notebook deleted');
      ctx.navigate('#/notebooks', { replace: true });
    }
  }

  draw();
  let gone = false;
  const soon = debounce(() => { if (gone) return; if (nb()) redrawTree(); else draw(); }, 200);
  const onResize = debounce(() => { if (isWide() !== wide) { closePane(); draw(); } }, 200);
  window.addEventListener('resize', onResize);

  return {
    update(p) {
      if (p.id !== id) { closePane(); id = p.id; current = p.note || null; tableSec = p.view || null; params = p; collapsed.clear(); draw(); return; }
      params = p;
      const had = !!current;
      if ((p.view || null) !== tableSec) { tableSec = p.view || null; current = p.note || null; closePane(); draw(); return; }
      current = p.note || null;
      if (!isWide()) { if (current && current !== 'new') ctx.navigate(`#/note/${current}`, { replace: true }); return; }
      if (!current) { closePane(); draw(); return; }
      if (!had) { draw(); return; }
      el.querySelector('.nbv')?.classList.add('with-pane');
      redrawTree();
      openPane(p);
    },
    onEvent(evt) {
      pane?.inst?.onEvent?.(evt);
      tv?.onEvent(evt);
      if (evt.type === 'notebook' && evt.id === id) { if (tv) redrawTree(); else draw(); return; }
      if (['note', 'delete', 'remote', 'sealed', 'config'].includes(evt.type)) {
        if (evt.type === 'delete' && evt.id === id) { draw(); return; }
        soon();
      }
    },
    destroy() {
      gone = true;
      tv?.destroy();
      window.removeEventListener('resize', onResize);
      closePane();
      document.body.classList.remove('nb-open');
    },
  };
}

// ---- Small text prompt -----------------------------------------------------------

export function textSheet({ title, label = 'Name', value = '', placeholder = '', confirm = 'Save' }) {
  return new Promise((resolve) => {
    const s = openSheet(`${html`<form class="stack" style="display:flex;flex-direction:column;gap:16px" novalidate>
      <h2 class="page-title" style="font-size:26px">${title}</h2>
      <div class="field"><label for="ts-v">${label}</label><input id="ts-v" type="text" value="${value}" placeholder="${placeholder}" maxlength="60" autocomplete="off"></div>
      <button class="btn btn-primary btn-block" type="submit">${confirm}</button>
      <button class="btn btn-ghost btn-block" type="button" data-cancel>Cancel</button></form>`}`, { label: title, onClose: (v) => resolve(v || null) });
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
    s.el.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = $('#ts-v', s.el).value.trim(); if (v) s.close(v); };
    setTimeout(() => $('#ts-v', s.el)?.select(), 60);
  });
}

async function ensureSealedOpen(ctx) {
  const s = V.sealedState();
  if (s === 'none') {
    const go = await confirmSheet({ title: 'Set up sealed notes first', body: 'Sealed notebooks use a second passphrase and are never shared with Claude. You can set this up in Settings.', confirm: 'Open Settings' });
    if (go) ctx?.navigate('#/settings');
    return false;
  }
  if (s === 'locked') return !!(await passphraseSheet({ title: 'Unlock sealed notes', confirmLabel: 'Unlock', check: (p) => V.unlockSealed(p) }));
  return true;
}

// ---- New notebook / edit notebook -------------------------------------------------

export function notebookSheet(existing = null) {
  return new Promise((resolve) => {
    const d = existing
      ? structuredClone(existing)
      : newNotebook({ title: '', region: null, cover: { style: COVERS[Math.floor(Math.random() * COVERS.length)].id, color: '#2B5684', photo: null, titleStyle: 'printed' } });
    if (!existing) { d.region = state.config.regions[0]?.id || null; d.title = ''; }
    let photoUrl = null;
    const madePhotos = [];
    const regions = state.config.regions;
    const sealedMode = V.sealedState();
    const s = openSheet(`${html`<form class="nbs" novalidate>
      <div class="sheet-head nbs-head"><button type="button" class="btn btn-ghost side" data-cancel style="justify-content:flex-start;padding:0">Cancel</button><h2>${existing ? 'Notebook' : 'New notebook'}</h2><span class="side"><button type="submit" class="btn btn-ghost" style="font-weight:700;padding:0;justify-content:flex-end">${existing ? 'Save' : 'Create'}</button></span></div>
      <div class="nbs-body">
        <div class="nbs-left">
          <div class="nbs-preview" id="nbs-prev"></div>
          <div class="field"><label for="nbs-name">Name</label><input id="nbs-name" type="text" class="serif-input" value="${d.title}" placeholder="For example Kyoto 2027" maxlength="40" autocomplete="off" required></div>
          <div class="row2">
            <div class="field"><label for="nbs-region">Region</label><select id="nbs-region">
              ${regions.map((r) => html`<option value="${r.id}" ${d.region === r.id ? raw('selected') : ''}>${r.name}</option>`)}
              <option value="" ${!d.region ? raw('selected') : ''}>No region (inbox)</option></select></div>
            <div class="field"><label for="nbs-paper">Paper</label><select id="nbs-paper">
              ${PAPERS.map((p) => html`<option value="${p.id}" ${d.paper === p.id ? raw('selected') : ''}>${p.name}</option>`)}</select></div>
          </div>
          <div class="field"><label for="nbs-pcol">Paper colour</label><select id="nbs-pcol">${PAPER_COLORS.map((p) => html`<option value="${p.id}" ${d.paperColor === p.id ? raw('selected') : ''}>${p.name}</option>`)}</select></div>
          ${existing ? '' : sealedMode === 'none'
            ? html`<p class="hint">To keep a notebook away from Claude completely, set up sealed notes in Settings.</p>`
            : html`<label class="check"><input type="checkbox" id="nbs-seal"> Seal this notebook</label>`}
        </div>
        <div class="nbs-right">
          <span class="label">Cover</span>
          <div class="chips scroll cover-groups" role="group" aria-label="Cover collections" id="nbs-groups"></div>
          <ul class="cover-grid" role="radiogroup" aria-label="Cover" id="nbs-covers"></ul>
          <div class="nbs-plain" id="nbs-plain" hidden><span class="label">Colour</span><div class="swatches">${PLAIN_COLORS.map(([n, c]) => html`<button type="button" class="swatch" data-pc="${c}" style="background:${c}" aria-label="${n}"></button>`)}<label class="swatch any" aria-label="Any colour"><input type="color" id="nbs-any" class="sr-only" value="${d.cover.color || '#2B5684'}"></label></div></div>
          <div class="nbs-ts"><span class="label">Title on cover</span>
            <div class="seg" role="radiogroup" aria-label="Title on cover">
              ${[['printed', 'Cover’s style'], ['hand', 'Handwritten'], ['hidden', 'Hidden']].map(([v, n]) => html`<button type="button" role="radio" data-ts="${v}" aria-checked="${(d.cover.titleStyle || 'printed') === v ? 'true' : 'false'}" class="${v === 'hand' ? 'hand' : ''}">${n}</button>`)}
            </div></div>
        </div>
      </div>
      <p class="error" id="nbs-err" role="alert" hidden></p>
    </form>`}`, { label: existing ? 'Edit notebook' : 'New notebook', onClose: (v) => { if (!v) madePhotos.forEach((f) => V.deleteFile(f).catch(() => {})); resolve(v || null); } });
    s.el.classList.add('wide-sheet', 'nb-sheet');
    const name = $('#nbs-name', s.el);

    const preview = () => { $('#nbs-prev', s.el).innerHTML = coverSVG({ ...d, title: name.value.trim() || 'Notebook' }, { width: 180, photoUrl }); };
    // Collections: all covers, a group of them, or your own (photo, plain colour).
    let group = 'all';
    const drawGroups = () => {
      const opts = [['all', 'All'], ...COVER_GROUPS, ['own', 'Your own']];
      $('#nbs-groups', s.el).innerHTML = `${html`${opts.map(([id, name]) => html`<button type="button" class="chip" data-cg="${id}" aria-pressed="${group === id ? 'true' : 'false'}">${name}</button>`)}`}`;
      s.el.querySelectorAll('[data-cg]').forEach((b) => { b.onclick = () => { group = b.dataset.cg; drawGroups(); drawCovers(); }; });
    };
    const drawCovers = () => {
      const st = d.cover.style;
      const own = [{ id: 'photo' }, { id: 'plain', nb: { ...d, title: '', cover: { ...d.cover, style: 'plain' } } }];
      // In All, covers sit with the rest of their collection.
      const order = COVER_GROUPS.map(([g]) => g);
      const art = COVERS.filter((c) => group === 'all' || c.group === group).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)).map((c) => ({ id: c.id, nb: { ...d, title: '', cover: { ...d.cover, style: c.id } } }));
      const items = group === 'own' ? own : group === 'all' ? [...art, ...own] : art;
      $('#nbs-covers', s.el).innerHTML = `${html`${items.map((it) => html`<li><button type="button" role="radio" aria-checked="${st === it.id ? 'true' : 'false'}" data-cover="${it.id}" class="cover-pick">
        ${it.id === 'photo'
          ? (photoUrl && st === 'photo' ? raw(coverSVG({ ...d, title: '' }, { width: 96, photoUrl, label: false })) : html`<span class="cover-photo-add">${icons.image({ size: 22 })}</span>`)
          : raw(coverSVG(it.nb, { width: 96, label: false }))}
        <span class="cn">${coverName(it.id)}</span>${st === it.id ? html`<span class="tick">${icons.check({ size: 12 })}</span>` : ''}</button></li>`)}`}`;
      s.el.querySelectorAll('[data-cover]').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.cover === 'photo') { pickPhoto(); return; }
          d.cover = { ...d.cover, style: b.dataset.cover };
          $('#nbs-plain', s.el).hidden = d.cover.style !== 'plain';
          drawCovers();
          preview();
        };
      });
      $('#nbs-plain', s.el).hidden = st !== 'plain';
    };
    const pickPhoto = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          const img = await compressImage(f, { max: 900, quality: 0.86 });
          const sealed = !!(existing ? d.sealed : $('#nbs-seal', s.el)?.checked);
          const fid = await V.addFile(img.bytes, { sealed });
          madePhotos.push(fid);
          d.cover = { ...d.cover, style: 'photo', photo: fid };
          photoUrl = await V.fileURL(fid);
          drawCovers();
          preview();
        } catch { toast('Couldn’t use that photo.'); }
      };
      inp.click();
    };
    s.el.querySelectorAll('[data-pc]').forEach((b) => { b.onclick = () => { d.cover = { ...d.cover, style: 'plain', color: b.dataset.pc }; drawCovers(); preview(); }; });
    $('#nbs-any', s.el).oninput = (e) => { d.cover = { ...d.cover, style: 'plain', color: e.target.value.toUpperCase() }; drawCovers(); preview(); };
    s.el.querySelectorAll('[data-ts]').forEach((b) => {
      b.onclick = () => {
        d.cover = { ...d.cover, titleStyle: b.dataset.ts };
        s.el.querySelectorAll('[data-ts]').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
        preview();
      };
    });
    name.addEventListener('input', preview);
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
    s.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const title = name.value.trim();
      const err = $('#nbs-err', s.el);
      if (!title) { err.textContent = 'Give the notebook a name.'; err.hidden = false; name.focus(); return; }
      const region = $('#nbs-region', s.el).value || null;
      const seal = !!$('#nbs-seal', s.el)?.checked;
      if (seal && !(await ensureSealedOpen())) return;
      try {
        if (existing) {
          const cur = state.notebooks.get(existing.id);
          if (cur.cover?.photo && cur.cover.photo !== d.cover.photo) await V.deleteFile(cur.cover.photo).catch(() => {});
          if (d.cover.photo && d.cover.style !== 'photo') { await V.deleteFile(d.cover.photo).catch(() => {}); d.cover.photo = null; }
          const next = { ...cur, title, paper: $('#nbs-paper', s.el).value, paperColor: $('#nbs-pcol', s.el).value, cover: d.cover };
          if (region !== cur.region) { await V.saveNotebook(next); await V.moveNotebook(cur.id, region); } else await V.saveNotebook(next);
          madePhotos.length = 0;
          s.close(state.notebooks.get(cur.id));
        } else {
          if (d.cover.photo && d.cover.style !== 'photo') { await V.deleteFile(d.cover.photo).catch(() => {}); d.cover.photo = null; }
          if (d.cover.photo && seal) await V.reencryptFile(d.cover.photo, 's');
          const saved = await V.saveNotebook({ ...d, title, region, paper: $('#nbs-paper', s.el).value, paperColor: $('#nbs-pcol', s.el).value, sealed: seal, order: Date.now() });
          madePhotos.length = 0;
          toast(`Made ${title}`);
          s.close(saved);
        }
      } catch (ex) { err.textContent = ex.message || 'Couldn’t save.'; err.hidden = false; }
    };
    (async () => {
      if (d.cover.style === 'photo' && d.cover.photo) photoUrl = await V.fileURL(d.cover.photo);
      drawGroups();
      drawCovers();
      preview();
    })();
    if (!existing) setTimeout(() => name.focus(), 80);
  });
}

// ---- Pick a notebook (and section) ---------------------------------------------------

export function notebookPicker({ title = 'Choose a notebook' } = {}) {
  return new Promise((resolve) => {
    const list = sortNotebooks([...state.notebooks.values()], 'recent');
    let handoff = false;
    const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>${title}</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button></span></div>
      <ul class="nb-pick">${list.map((b) => html`<li><button type="button" data-nb="${b.id}">${coverHtml(b, 34)}<span class="t">${b.title}</span><span class="muted">${plural(notesIn(b.id).length, 'note')}</span></button>
        ${b.sections.length > 1 ? html`<ul class="nb-pick-secs" data-secs="${b.id}" hidden>${b.sections.map((x) => html`<li><button type="button" data-sec="${x.id}" data-in="${b.id}">${x.name}</button></li>`)}</ul>` : ''}</li>`)}
        <li><button type="button" data-newnb>${icons.plus({ size: 20 })}<span class="t">New notebook…</span></button></li></ul>`}`, { label: title, onClose: (v) => { if (!handoff) resolve(v || null); } });
    paintPhotoCovers(s.el);
    s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
    s.el.querySelectorAll('[data-nb]').forEach((b) => {
      b.onclick = () => {
        const nb = state.notebooks.get(b.dataset.nb);
        if (nb.sections.length === 1) { s.close({ notebook: nb.id, section: nb.sections[0].id }); return; }
        const secs = s.el.querySelector(`[data-secs="${nb.id}"]`);
        secs.hidden = !secs.hidden;
      };
    });
    s.el.querySelectorAll('[data-sec]').forEach((b) => { b.onclick = () => s.close({ notebook: b.dataset.in, section: b.dataset.sec }); });
    s.el.querySelector('[data-newnb]').onclick = async () => {
      handoff = true;
      s.close(null);
      const nb = await notebookSheet();
      resolve(nb ? { notebook: nb.id, section: nb.sections[0].id } : null);
    };
  });
}
