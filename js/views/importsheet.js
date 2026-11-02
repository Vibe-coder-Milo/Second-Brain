// "Bring in notes from Notability": pick many PDFs (or a zip of them), pick a
// notebook, and each PDF becomes a handwritten note there.

import { html, raw, toast } from '../util.js';
import { state } from '../vault.js';
import { openSheet } from '../ui.js';
import { icons } from '../icons.js';
import { coverSVG } from '../covers.js';

const mb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function importSheet({ files = null, notebook = null, section = null, ctx = null } = {}) {
  return new Promise((resolve) => {
    let items = null;
    let dest = notebook ? { notebook, section } : null;
    let running = false;
    let stopped = false;
    let lock = null;
    const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>Bring in notes</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Close</button></span></div><div id="imp-body" class="imp-body"></div>`}`, {
      label: 'Bring in notes',
      onClose: () => { stopped = true; lock?.release?.().catch(() => {}); resolve(null); },
    });
    s.el.classList.add('wide-sheet');
    const body = s.el.querySelector('#imp-body');
    // Closing while it runs stops after the note being brought in; the ones done stay.
    s.el.querySelector('[data-close]').onclick = () => { if (running) toast('Stopped. The notes already brought in stay.'); s.close(); };

    const pick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = 'application/pdf,.pdf,application/zip,.zip';
      inp.onchange = () => { if (inp.files?.length) read([...inp.files]); };
      inp.click();
    };

    const read = async (list) => {
      body.innerHTML = `${html`<p class="status-line">${icons.spinner({ size: 18 })}Looking at the files…</p>`}`;
      try {
        const B = await import('../bulkimport.js');
        items = await B.collect(list);
      } catch (e) { items = []; toast(e.message || 'Couldn’t read those files.'); }
      draw();
    };

    const destHtml = () => {
      const nb = dest && state.notebooks.get(dest.notebook);
      if (!nb) return html`<button type="button" class="btn btn-primary btn-block" data-dest>${icons.notebooks({ size: 18 })}Choose a notebook</button>`;
      const sec = nb.sections.find((x) => x.id === dest.section) || nb.sections[0];
      return html`<div class="imp-dest">${raw(coverSVG(nb, { width: 44, label: false }))}<div><p class="imp-dest-t">${nb.title}</p><p class="muted" style="margin:0">${nb.sections.length > 1 ? `Into ${sec.name}` : 'A notebook'}${nb.region ? `, ${state.config.regions.find((r) => r.id === nb.region)?.name || ''}` : ''}</p></div><button type="button" class="btn btn-sm" data-dest>Change</button></div>`;
    };

    const draw = () => {
      if (!items) {
        body.innerHTML = `${html`
          <p class="muted" style="margin:0">Each PDF becomes a handwritten note in a notebook, looking just as it did, with room to keep writing on it.</p>
          <ol class="imp-steps">
            <li><b>In Notability:</b> in your library tap ${raw('<span class="kbd">⋯</span>')} then <b>Select Notes</b>, pick the notes (a whole subject at once is fine), then <b>Export</b>, choose <b>PDF</b>, and <b>Save to Files</b>.</li>
            <li><b>Here:</b> tap <b>Choose PDFs</b> and select them all in Files. A .zip of PDFs works too: its folders become sections.</li>
          </ol>
          <button type="button" class="btn btn-primary btn-block" data-pick>${icons.pdf({ size: 18 })}Choose PDFs</button>
          <p class="hint">Typed text in the PDFs is searchable. Handwriting comes over as a picture of the page: it shows exactly as it was, but isn't turned into ink you can edit. Notability’s own .note files can’t be read, so export as PDF.</p>`}`;
        body.querySelector('[data-pick]').onclick = pick;
        return;
      }
      if (!items.length) {
        body.innerHTML = `${html`<p class="error" style="margin:0">No PDFs in those files.</p><button type="button" class="btn btn-primary btn-block" data-pick>${icons.pdf({ size: 18 })}Choose PDFs</button>`}`;
        body.querySelector('[data-pick]').onclick = pick;
        return;
      }
      const size = items.reduce((t, x) => t + x.size, 0);
      const folders = [...new Set(items.map((x) => x.folder).filter(Boolean))];
      body.innerHTML = `${html`
        <p class="imp-count"><b>${plural(items.length, 'note')}</b> ready to bring in <span class="muted">(${mb(size)})</span></p>
        <ul class="imp-list">${items.slice(0, 8).map((x) => html`<li>${icons.pdf({ size: 16 })}<span>${x.name.replace(/\.pdf$/i, '').replace(/_+/g, ' ')}</span>${x.folder ? html`<span class="muted">${x.folder}</span>` : ''}</li>`)}${items.length > 8 ? html`<li class="muted">and ${items.length - 8} more</li>` : ''}</ul>
        ${folders.length ? html`<p class="hint">${plural(folders.length, 'folder')} in the zip (${folders.slice(0, 4).join(', ')}${folders.length > 4 ? '…' : ''}) will become sections.</p>` : ''}
        <span class="label">Where they go</span>
        ${destHtml()}
        ${dest ? html`<button type="button" class="btn btn-primary btn-block" data-go>Bring in ${plural(items.length, 'note')}</button>` : ''}
        <button type="button" class="btn btn-ghost btn-block" data-pick>Choose different files</button>
        <p class="hint">Keep the app open until it’s done. Large PDFs take a few seconds each.</p>`}`;
      body.querySelector('[data-pick]').onclick = pick;
      body.querySelectorAll('[data-dest]').forEach((b) => {
        b.onclick = async () => {
          const { notebookPicker } = await import('./notebooks.js');
          const d = await notebookPicker({ title: 'Bring them into' });
          if (d) dest = d;
          draw();
        };
      });
      const go = body.querySelector('[data-go]');
      if (go) go.onclick = run;
    };

    const run = async () => {
      running = true;
      try { lock = await navigator.wakeLock?.request?.('screen'); } catch { /* not allowed */ }
      body.innerHTML = `${html`<p class="imp-now" id="imp-now" aria-live="polite">Starting…</p>
        <div class="imp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="0"><span id="imp-fill"></span></div>
        <p class="hint" id="imp-sub"></p>
        <button type="button" class="btn btn-block" data-stop>Stop</button>`}`;
      body.querySelector('[data-stop]').onclick = () => { stopped = true; body.querySelector('[data-stop]').disabled = true; body.querySelector('#imp-sub').textContent = 'Stopping after this one…'; };
      const B = await import('../bulkimport.js');
      let res;
      try {
        res = await B.importAll(items, {
          notebookId: dest.notebook,
          sectionId: dest.section,
          stop: () => stopped,
          onProgress: ({ i, total, name, page, pages }) => {
            const now = body.querySelector('#imp-now');
            if (!now) return;
            now.textContent = `Bringing in ${i + 1} of ${total}: ${name.replace(/\.pdf$/i, '')}`;
            body.querySelector('#imp-sub').textContent = `Page ${page} of ${pages}`;
            const bar = body.querySelector('.imp-bar');
            bar.setAttribute('aria-valuenow', String(i));
            body.querySelector('#imp-fill').style.width = `${Math.round(((i + page / Math.max(1, pages)) / total) * 100)}%`;
          },
        });
      } catch (e) {
        res = { notes: 0, pages: 0, failed: [{ name: '', why: e.message || 'Something went wrong.' }] };
      }
      running = false;
      lock?.release?.().catch(() => {});
      const nb = state.notebooks.get(dest.notebook);
      body.innerHTML = `${html`<div class="imp-done">${icons.check({ size: 22 })}<p class="serif" style="font-size:22px;margin:0">Brought in ${plural(res.notes, 'note')}</p></div>
        <p class="muted" style="margin:0">${res.pages} page${res.pages === 1 ? '' : 's'}, in ${nb?.title || 'your notebook'}.${stopped && res.notes < items.length ? ' Stopped early: the rest weren’t brought in.' : ''}</p>
        ${res.failed.length ? html`<p class="error" style="margin:0">${plural(res.failed.length, 'file')} couldn’t be read:</p><ul class="imp-list">${res.failed.slice(0, 8).map((f) => html`<li><span>${f.name}</span><span class="muted">${f.why}</span></li>`)}</ul>` : ''}
        ${nb ? html`<a class="btn btn-primary btn-block" href="#/notebook/${nb.id}" data-open>Open ${nb.title}</a>` : ''}`}`;
      body.querySelector('[data-open]')?.addEventListener('click', () => s.close());
      if (res.notes) toast(`Brought in ${plural(res.notes, 'note')}`);
    };

    if (files?.length) read(files); else draw();
  });
}
