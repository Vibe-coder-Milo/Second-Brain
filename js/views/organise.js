// The organiser's review: where it would put each note, new regions it would
// add, tick or untick, then file. Opened from the map and the inbox.

import { html, raw, toast, fmtAgo } from '../util.js';
import { state } from '../vault.js';
import { openSheet } from '../ui.js';
import { regionColors, displayTitle, PALETTE } from '../model.js';
import { icons } from '../icons.js';

export async function organiseSheet({ everything = false } = {}) {
  const O = await import('../organiser.js');
  const s = openSheet(`${html`<div class="sheet-head"><span class="side"></span><h2>Organise your map</h2><span class="side"><button type="button" class="btn btn-ghost btn-sm" data-close>Close</button></span></div>
    <div id="org-body"><p class="status-line">${icons.spinner({ size: 18 })}Reading your notes on this device…</p></div>`}`, { label: 'Organise your map' });
  s.el.classList.add('wide-sheet');
  s.el.querySelector('[data-close]').onclick = () => s.close();
  const body = s.el.querySelector('#org-body');
  let all = everything;

  const draw = async () => {
    body.innerHTML = `${html`<p class="status-line">${icons.spinner({ size: 18 })}Reading your notes on this device…</p>`}`;
    const pool = [...state.notes.values()].filter((n) => !n.notebook && (n.inbox || all));
    let plans;
    try { plans = await O.plan(pool); } catch (e) { body.innerHTML = `${html`<p class="error">${e.message || 'The organiser stopped.'}</p>`}`; return; }
    const inboxLeft = pool.filter((n) => n.inbox && !plans.some((p) => p.note.id === n.id)).length;
    // Group by where the notes go; new regions first.
    const groups = new Map();
    for (const p of plans) {
      const key = p.to ? p.to.id : `new:${p.area.id}`;
      if (!groups.has(key)) groups.set(key, { key, region: p.to, area: p.area, items: [] });
      groups.get(key).items.push(p);
    }
    const list = [...groups.values()].sort((a, b) => (a.area ? 0 : 1) - (b.area ? 0 : 1) || b.items.length - a.items.length);
    // New regions get the next free colours, in the order they'll be added.
    const usedColours = new Set(state.config.regions.map((r) => r.color));
    const free = Object.keys(PALETTE).filter((k) => !usedColours.has(k));
    const newColour = new Map(list.filter((g) => g.area).map((g, i) => [g.key, free[i] || 'slate']));
    const chip = (g) => {
      const c = g.region ? regionColors(g.region) : regionColors({ color: newColour.get(g.key) });
      return html`<span class="org-dest"><span class="dot" style="background:${c.dot}"></span>${g.region ? g.region.name : g.area.name}${g.area ? html`<span class="org-new">New region</span>` : ''}</span>`;
    };
    body.innerHTML = `${html`
      <p class="hint">The organiser reads your notes on this device (nothing is sent anywhere), files each where it fits, and adds a region when notes need a new home. Untick anything you'd rather leave.</p>
      <label class="check"><input type="checkbox" id="org-all" ${all ? raw('checked') : ''}> Also re-check notes already filed</label>
      ${list.length ? html`<div class="org-groups">${list.map((g) => html`<section class="org-group">
        <h3>${chip(g)}<span class="count">${g.items.length}</span></h3>
        <ul>${g.items.map((p) => html`<li><label class="check"><input type="checkbox" data-pid="${p.note.id}" ${p.sure || p.note.inbox ? raw('checked') : ''}><span class="org-t">${displayTitle(p.note)}</span><span class="org-from">${p.note.inbox ? 'Inbox' : (state.config.regions.find((r) => r.id === p.note.region)?.name || '')}</span></label></li>`)}</ul>
      </section>`)}</div>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-apply style="flex:1">File ticked notes</button></div>`
      : html`<div class="empty" style="padding:18px 0"><p class="serif">Everything is in its place</p><p style="margin:0">${inboxLeft ? `${inboxLeft} note${inboxLeft === 1 ? '' : 's'} in your inbox ${inboxLeft === 1 ? "doesn't" : "don't"} clearly belong anywhere yet. File ${inboxLeft === 1 ? 'it' : 'them'} yourself, or add more to ${inboxLeft === 1 ? 'it' : 'them'}.` : 'Nothing waiting to be filed.'}</p></div>`}
      ${list.length && inboxLeft ? html`<p class="hint">${inboxLeft} inbox note${inboxLeft === 1 ? '' : 's'} didn't clearly belong anywhere, so ${inboxLeft === 1 ? 'it stays' : 'they stay'} in the inbox.</p>` : ''}`}`;
    body.querySelector('#org-all').onchange = (e) => { all = e.target.checked; draw(); };
    const go = body.querySelector('[data-apply]');
    if (go) {
      go.onclick = async () => {
        const ticked = new Set([...body.querySelectorAll('[data-pid]:checked')].map((x) => x.dataset.pid));
        const chosen = plans.filter((p) => ticked.has(p.note.id));
        if (!chosen.length) { s.close(); return; }
        go.disabled = true;
        const res = await O.apply(chosen, { by: 'you' });
        s.close();
        toast(res.created.length ? `Added ${res.created.map((r) => r.name).join(', ')} and filed ${res.filed} note${res.filed === 1 ? '' : 's'}` : `Filed ${res.filed} note${res.filed === 1 ? '' : 's'}`);
      };
    }
  };
  draw();
  return s;
}

// Recent moves, with Undo (shown in the inbox).
export function recentMovesHtml() {
  const log = (state.device?.organiserLog || []).filter((e) => Date.now() - e.at < 7 * 86400000).slice(0, 8);
  if (!log.length) return '';
  const name = (rid) => state.config.regions.find((r) => r.id === rid)?.name || 'a region';
  return String(html`<section class="org-recent" aria-labelledby="org-r-h"><h2 id="org-r-h" class="section-title">${icons.history({ size: 16 })}Recently organised</h2>
    <ul class="rows">${log.map((e) => html`<li class="row org-move"><div class="row-main"><a class="row-title" href="#/note/${e.note}">${e.title}</a>
      <p class="row-snippet">${e.link ? `The assistant linked them, ${fmtAgo(e.at)}` : html`${e.by === 'organiser' ? 'Organiser' : 'You'} filed it in ${name(e.to)}${e.created ? ' (new region)' : ''}, ${fmtAgo(e.at)}`}</p></div>
      <button type="button" class="btn btn-sm btn-ghost" data-undo="${e.id}">Undo</button></li>`)}</ul></section>`);
}

export function bindRecentMoves(root) {
  root.querySelectorAll('[data-undo]').forEach((b) => {
    b.onclick = async () => {
      const O = await import('../organiser.js');
      b.disabled = true;
      if (await O.undo(b.dataset.undo)) toast('Put back');
    };
  });
}
