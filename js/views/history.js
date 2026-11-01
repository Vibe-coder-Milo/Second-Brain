// Version history. Every sync is a commit in your private repo, so each note
// (and each handwritten page) has a list of versions, decrypted here.

import { html, raw, $, toast, fmtDate, fmtTime, copyText } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { displayTitle, labelMap } from '../model.js';
import { icons } from '../icons.js';
import { openSheet, confirmSheet } from '../ui.js';
import { records, files } from '../db.js';

const BATCH = 12;

export function lineDiff(a, b) {
  const A = String(a || '').split('\n');
  const B = String(b || '').split('\n');
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let q = 0;
  while (q < A.length - p && q < B.length - p && A[A.length - 1 - q] === B[B.length - 1 - q]) q++;
  const a2 = A.slice(p, A.length - q);
  const b2 = B.slice(p, B.length - q);
  const out = A.slice(0, p).map((s) => ({ t: '=', s }));
  if (a2.length * b2.length > 250000) {
    out.push(...a2.map((s) => ({ t: '-', s })), ...b2.map((s) => ({ t: '+', s })));
  } else {
    const m = a2.length;
    const n = b2.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (a2[i] === b2[j]) { out.push({ t: '=', s: a2[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', s: a2[i++] }); else out.push({ t: '+', s: b2[j++] });
    }
    while (i < m) out.push({ t: '-', s: a2[i++] });
    while (j < n) out.push({ t: '+', s: b2[j++] });
  }
  out.push(...A.slice(A.length - q).map((s) => ({ t: '=', s })));
  return out;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summary(diff) {
  const add = diff.filter((d) => d.t === '+' && d.s.trim()).length;
  const rem = diff.filter((d) => d.t === '-' && d.s.trim()).length;
  if (!add && !rem) return 'Details changed';
  if (add && rem && add === rem && add <= 2) return `${plural(add, 'line')} changed`;
  return [add ? `${plural(add, 'line')} added` : '', rem ? `${rem} removed` : ''].filter(Boolean).join(', ');
}

// Changed lines with one line of context either side.
function diffHtml(diff) {
  const keep = new Set();
  diff.forEach((d, i) => { if (d.t !== '=') { keep.add(i - 1); keep.add(i); keep.add(i + 1); } });
  const out = [];
  let gap = false;
  diff.forEach((d, i) => {
    if (!keep.has(i)) { gap = true; return; }
    if (gap && out.length) out.push(html`<li class="df gap" aria-hidden="true">…</li>`);
    gap = false;
    if (!d.s.trim()) return;
    out.push(html`<li class="df ${d.t === '+' ? 'add' : d.t === '-' ? 'rem' : 'ctx'}"><span class="sr-only">${d.t === '+' ? 'Added: ' : d.t === '-' ? 'Removed: ' : ''}</span><span aria-hidden="true">${d.t === '=' ? ' ' : d.t === '+' ? '+' : '−'}</span>${d.s || ' '}</li>`);
  });
  return out;
}

const deviceIcon = (name) => (/iPhone|Android/.test(name || '')
  ? raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><line x1="11" y1="18.5" x2="13" y2="18.5"/></svg>')
  : /iPad/.test(name || '')
    ? raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4.5" y="2.5" width="15" height="19" rx="2.2"/><line x1="11" y1="18.5" x2="13" y2="18.5"/></svg>')
    : raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.8"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>'));

export async function openHistory(n, ctx, { page = null } = {}) {
  const S = await import('../sync.js');
  const board = n.kind === 'board' && page;
  const ink = (n.kind === 'ink' || n.kind === 'board') && page;
  const title = ink && !board ? `${displayTitle(n)}, page ${n.pages.findIndex((p) => p.id === page.id) + 1}` : displayTitle(n);
  const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>Version history</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Done</button></span></div>
    <p class="hint" style="margin-top:-10px">${title}. Every sync keeps a copy in your private GitHub repo, encrypted.</p>
    <div id="vh-body" class="vh"><p class="muted">Loading versions…</p></div>`}`, { label: 'Version history' });
  s.el.classList.add('wide-sheet');
  s.el.querySelector('[data-close]').onclick = () => s.close();
  const body = $('#vh-body', s.el);

  if (!S.isConfigured()) {
    body.innerHTML = `${html`<p class="muted">Versions come from sync. Turn on sync in Settings and every change is kept in your private repo.</p><a class="btn" href="#/settings">Open Settings</a>`}`;
    body.querySelector('a').addEventListener('click', () => s.close());
    return;
  }

  const path = ink ? `files/${page.id}.bin` : `notes/${n.id}.json`;
  let commits;
  try {
    commits = await S.fileVersions(path, { limit: 60 });
  } catch (e) {
    body.innerHTML = `${html`<p class="error">${S.explainError(e)}</p>`}`;
    return;
  }
  const local = ink ? await files.get(page.id) : await records.get(n.id);
  const unsynced = !!local?.dirty;
  if (!commits?.length) {
    body.innerHTML = `${html`<p class="muted">${unsynced ? 'This hasn’t synced yet. Versions appear here after each sync.' : 'No versions yet.'}</p>`}`;
    return;
  }

  const versions = []; // { sha, date, v, text?, data?, device }
  let loaded = 0;
  let open = 0;

  async function loadMore() {
    const next = commits.slice(loaded, loaded + BATCH + 1);
    for (const c of next) {
      if (versions.some((x) => x.sha === c.sha)) continue;
      try {
        if (ink) {
          const data = await S.pageAt(page.id, c.sha);
          versions.push({ sha: c.sha, date: data.at || c.date, data });
        } else {
          const v = await S.noteAt(n.id, c.sha);
          if (!v) continue;
          versions.push({ sha: c.sha, date: v.updatedAt || c.date, v, device: v.editedOn, text: `${v.title ? `${v.title}\n\n` : ''}${v.body}` });
        }
      } catch (e) { console.warn('version', c.sha, e); }
    }
    loaded = Math.min(commits.length, loaded + BATCH);
    draw();
  }

  function boardSummary(cur, prev) {
    const count = (d) => (d.objects || []).filter((o) => !o.del).length;
    const oc = count(cur.data);
    const sc = cur.data.strokes?.length || 0;
    if (!prev) return [plural(oc, 'thing'), sc ? plural(sc, 'pen stroke') : ''].filter(Boolean).join(', ');
    const od = oc - count(prev.data);
    const sd = sc - (prev.data.strokes?.length || 0);
    return [od > 0 ? `${plural(od, 'thing')} added` : od < 0 ? `${plural(-od, 'thing')} removed` : '', sd > 0 ? `${plural(sd, 'pen stroke')} added` : sd < 0 ? `${plural(-sd, 'pen stroke')} removed` : ''].filter(Boolean).join(', ') || 'Moved or edited';
  }

  function inkSummary(cur, prev) {
    if (board) return boardSummary(cur, prev);
    const sc = cur.data.strokes?.length || 0;
    const oc = cur.data.objects?.length || 0;
    if (!prev) return `${plural(sc, 'stroke')}${oc ? `, ${plural(oc, 'sticker or box', 'stickers and boxes')}` : ''}`;
    const ps = new Set((prev.data.strokes || []).map((x) => x.id));
    const cs = new Set((cur.data.strokes || []).map((x) => x.id));
    const added = [...cs].filter((x) => !ps.has(x)).length;
    const removed = [...ps].filter((x) => !cs.has(x)).length;
    const od = oc - (prev.data.objects?.length || 0);
    return [added ? `${plural(added, 'stroke')} added` : '', removed ? `${removed} removed` : '', od > 0 ? `${plural(od, 'sticker or box', 'stickers or boxes')} added` : od < 0 ? `${plural(-od, 'sticker or box', 'stickers or boxes')} removed` : ''].filter(Boolean).join(', ') || 'Moved or restyled';
  }

  function draw() {
    const shown = versions.slice(0, loaded);
    let lastDay = '';
    const items = shown.map((x, i) => {
      const prev = versions[i + 1];
      const day = fmtDate(x.date, { year: 'auto' });
      const head = day !== lastDay ? html`<li class="vh-day">${day === fmtDate(Date.now()) ? 'Today' : day}</li>` : '';
      lastDay = day;
      const diff = ink ? null : lineDiff(prev?.text || '', x.text);
      const sum = ink ? inkSummary(x, prev) : summary(diff);
      const isOpen = i === open;
      return html`${head}<li class="vh-item ${isOpen ? 'open' : ''}">
        <button type="button" class="vh-head" aria-expanded="${isOpen ? 'true' : 'false'}" data-i="${i}">
          <span class="vh-dev">${deviceIcon(x.device)}</span>
          <span class="vh-t"><strong>${fmtTime(x.date)}${x.device ? `, ${x.device}` : ''}${i === 0 ? ' (latest synced)' : ''}</strong><span>${sum}</span></span>
          ${icons.chevron({ size: 16 })}</button>
        ${isOpen ? html`<div class="vh-detail">
          ${ink ? html`<div class="vh-prev" data-prev="${i}"><span class="muted">Drawing…</span></div>` : html`<ul class="diff">${diffHtml(diff)}</ul>`}
          <div class="btn-row">${i > 0 || unsynced ? html`<button type="button" class="btn btn-primary" data-restore="${i}" style="flex:1">Restore this version</button>` : html`<span class="hint" style="flex:1;align-self:center">This is what you have now.</span>`}
            ${ink ? '' : html`<button type="button" class="btn" data-copy="${i}">Copy text</button>`}</div>
        </div>` : ''}</li>`;
    });
    body.innerHTML = `${html`${unsynced ? html`<p class="hint">Your latest changes on this device haven’t synced yet, so they aren’t listed.</p>` : ''}
      <ul class="vh-list">${items}</ul>
      ${commits.length > loaded ? html`<button type="button" class="link-btn" data-more>Show ${commits.length - loaded} earlier version${commits.length - loaded === 1 ? '' : 's'}</button>` : ''}`}`;
    body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.i); open = open === i ? -1 : i; draw(); }; });
    const more = body.querySelector('[data-more]');
    if (more) more.onclick = () => { more.disabled = true; more.textContent = 'Loading…'; loadMore(); };
    body.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = async () => { await copyText(versions[Number(b.dataset.copy)].text); toast('Copied'); }; });
    body.querySelectorAll('[data-restore]').forEach((b) => { b.onclick = () => restore(versions[Number(b.dataset.restore)]); });
    const pv = body.querySelector('[data-prev]');
    if (pv) {
      const x = versions[Number(pv.dataset.prev)];
      (board ? import('../boarddraw.js') : import('../editor/inkdraw.js')).then(async (m) => {
        const c = board ? await m.renderBoardCanvas(x.data, { widthPx: 1040 }) : await m.renderPageCanvas(page, x.data, 520);
        c.className = 'vh-canvas';
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', board ? 'This version of the board' : 'This version of the page');
        pv.replaceChildren(c);
      }).catch(() => { pv.textContent = 'Couldn’t draw this version.'; });
    }
  }

  async function restore(x) {
    const ok = await confirmSheet({ title: 'Restore this version?', body: 'What you have now stays in history, so you can come back to it.', confirm: 'Restore' });
    if (!ok) return;
    try {
      if (ink) {
        const cur = await V.loadPage(page.id);
        const { uid } = await import('../util.js');
        const now = Date.now();
        // Fresh ids, so other devices don't treat the restored ink as erased.
        const strokes = (x.data.strokes || []).map((st) => ({ ...st, id: uid('k') }));
        const live = state.notes.get(n.id);
        if (board) {
          // Board objects keep their ids (arrows point at them): everything
          // in that version comes back, everything since is marked deleted.
          const keep = new Map((x.data.objects || []).map((o) => [o.id, { ...o, t: now }]));
          const objects = [...keep.values()];
          for (const o of cur.objects || []) if (!keep.has(o.id)) objects.push(o.del ? o : { ...o, del: true, t: now });
          const tomb = [...new Set([...(cur.tomb || []), ...(cur.strokes || []).map((st) => st.id)])];
          const saved = await V.savePage(page.id, { ...cur, strokes, objects, tomb }, { sealed: !!live?.sealed });
          const { boardSummary } = await import('../boarddraw.js');
          if (live) await V.saveNote({ ...live, body: boardSummary(saved) });
        } else {
          const objects = (x.data.objects || []).map((o) => ({ ...o, id: uid('o'), t: now }));
          const tomb = [...new Set([...(cur.tomb || []), ...(cur.strokes || []).map((st) => st.id), ...(cur.objects || []).map((o) => o.id)])];
          await V.savePage(page.id, { ...cur, strokes, objects, tomb }, { sealed: !!live?.sealed });
          const { refreshInkSummary } = await import('../notework.js');
          await refreshInkSummary(n.id);
        }
        V.emit({ type: 'page', id: page.id });
      } else {
        const cur = state.notes.get(n.id);
        if (!cur) return;
        await V.saveNote({ ...cur, title: x.v.title, titleAuto: x.v.titleAuto, body: x.v.body, doc: x.v.doc, tags: x.v.tags, url: x.v.url, font: x.v.font });
        V.emit({ type: 'remote', id: n.id });
      }
      toast('Restored');
      s.close();
    } catch (e) { toast(e.message || 'Couldn’t restore.'); }
  }

  await loadMore();
  void labelMap;
}
