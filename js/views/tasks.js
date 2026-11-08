// Tasks from every note, typed or handwritten, by date, by note or by region
// (the menu's region lines open this screen showing just one region).

import { html, raw, $, toast, debounce } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { displayTitle, regionColors } from '../model.js';
import { icons } from '../icons.js';
import { datePicker } from '../ui.js';
import { allTasks, addTaskToDaily, isoToday, addDays, isoOf } from '../notework.js';
import { taskRowHtml, bindTaskRows } from './today.js';

export function mount(el, params, ctx) {
  const MODES = ['date', 'note', 'region'];
  let mode = MODES.includes(params.by) ? params.by : (MODES.includes(state.device?.tasksBy) ? state.device.tasksBy : 'date');
  let only = params.region || null; // one region from the menu ('none' = no region)
  let due = null;
  let showDone = false;

  function groups(list, today) {
    const week = addDays(today, 6);
    const open = list.filter((t) => !t.checked);
    const g = [
      { id: 'late', name: 'Late', items: open.filter((t) => t.due && t.due < today) },
      { id: 'today', name: `Today, ${new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`, items: open.filter((t) => t.due === today) },
      { id: 'week', name: 'This week', items: open.filter((t) => t.due && t.due > today && t.due <= week) },
      { id: 'later', name: 'Later', items: open.filter((t) => t.due && t.due > week) },
      { id: 'none', name: 'No date', items: open.filter((t) => !t.due) },
    ];
    for (const x of g) x.items.sort((a, b) => String(a.due).localeCompare(String(b.due)) || b.note.updatedAt - a.note.updatedAt);
    return g.filter((x) => x.items.length);
  }

  function draw() {
    const today = isoToday();
    const all = allTasks();
    const open = all.filter((t) => !t.checked);
    const dueN = open.filter((t) => t.due && t.due <= today).length;
    const weekAgo = Date.now() - 7 * 86400000;
    const done = all.filter((t) => t.checked && (t.doneAt || 0) >= weekAgo).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    let body;
    if (mode === 'region') {
      // Regions in their usual order, then tasks in notes with no region (inbox, daily notes).
      const regionKey = (n) => (n.inbox || !n.region ? 'none' : n.region);
      const rows = [...state.config.regions.map((r) => ({ id: r.id, name: r.name, dot: regionColors(r).dot })), { id: 'none', name: 'No region', dot: regionColors(null).dot }]
        .filter((r) => !only || r.id === only);
      const byDue = (a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due).localeCompare(String(b.due)) || b.note.updatedAt - a.note.updatedAt;
      body = rows.map((r) => ({ ...r, items: open.filter((t) => regionKey(t.note) === r.id).sort(byDue) })).filter((r) => r.items.length).map((r) => {
        const d = r.items.filter((t) => t.due && t.due <= today).length;
        return html`<section class="task-group" aria-labelledby="tg-r-${r.id}">
        <h2 class="tg-h region" id="tg-r-${r.id}"><span class="dot lg" style="background:${r.dot}"></span>${r.name}<span class="tg-n">${r.items.length} to do</span>${d ? html`<span class="due-count">${d} due</span>` : ''}</h2>
        <ul class="task-list">${r.items.map((t) => raw(String(taskRowHtml(t, { today }))))}</ul></section>`;
      });
      if (only) {
        const name = only === 'none' ? 'No region' : state.config.regions.find((r) => r.id === only)?.name || 'This region';
        body = [html`<p class="tasks-only">Showing ${name} only. <button type="button" class="link-btn" data-all-regions>Show all regions</button></p>`, ...body];
      }
    } else if (mode === 'date') {
      body = groups(all, today).map((g) => html`<section class="task-group" aria-labelledby="tg-${g.id}">
        <h2 class="tg-h ${g.id === 'late' ? 'late' : ''}" id="tg-${g.id}">${g.name}</h2>
        <ul class="task-list">${g.items.map((t) => raw(String(taskRowHtml(t, { today }))))}</ul></section>`);
    } else {
      const by = new Map();
      for (const t of open) { if (!by.has(t.note.id)) by.set(t.note.id, []); by.get(t.note.id).push(t); }
      body = [...by.values()].sort((a, b) => b[0].note.updatedAt - a[0].note.updatedAt).map((items) => {
        const n = items[0].note;
        const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
        const r = state.config.regions.find((x) => x.id === n.region);
        return html`<section class="task-group"><h2 class="tg-h note"><a href="#/note/${n.id}"><span class="dot" style="background:${regionColors(n.inbox ? null : r).dot}"></span>${nb ? `${nb.title} › ` : ''}${displayTitle(n)}</a></h2>
          <ul class="task-list">${items.map((t) => raw(String(taskRowHtml(t, { today, showSource: false }))))}</ul></section>`;
      });
    }
    el.innerHTML = `${html`<div class="page tasks-page">
      <div class="page-head">
        <div><h1 class="page-title">Tasks</h1><p class="page-sub">From every note, typed or handwritten${dueN ? html`, <span class="late-text">${dueN} due</span>` : ''}</p></div>
        <div class="seg" role="radiogroup" aria-label="Group tasks">
          <button type="button" role="radio" aria-checked="${mode === 'date' ? 'true' : 'false'}" data-mode="date">By date</button>
          <button type="button" role="radio" aria-checked="${mode === 'note' ? 'true' : 'false'}" data-mode="note">By note</button>
          <button type="button" role="radio" aria-checked="${mode === 'region' ? 'true' : 'false'}" data-mode="region">By region</button>
        </div>
      </div>
      <form class="quick-task big" id="tk-add" novalidate>
        <label class="sr-only" for="tk-in">New task</label><input id="tk-in" type="text" placeholder="Add a task. It goes into today’s note." autocomplete="off" enterkeyhint="done">
        <button type="button" class="btn" id="tk-due">${icons.calendar({ size: 18 })}<span>${due ? new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Due date'}</span></button>
        <button type="submit" class="btn btn-primary btn-sm">Add</button>
      </form>
      ${open.length ? body : html`<div class="empty"><p class="serif">No open tasks</p><p style="margin:0">Checklists in any note show up here: type [ ] or use the checklist button, in typed notes or text boxes on handwritten pages.</p></div>`}
      ${done.length ? html`<details class="done-group" ${showDone ? raw('open') : ''}><summary>${icons.chevron({ size: 16 })}${done.length} done this week</summary>
        <ul class="task-list">${done.map((t) => raw(String(taskRowHtml(t, { today }))))}</ul></details>` : ''}
    </div>`}`;
    el.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => { mode = b.dataset.mode; only = null; V.updateDevice({ tasksBy: mode }).catch(() => {}); draw(); };
    });
    const allR = el.querySelector('[data-all-regions]');
    if (allR) allR.onclick = () => { only = null; ctx.navigate('#/tasks?by=region', { replace: true, silent: true }); draw(); };
    $('#tk-due', el).onclick = async (e) => { const d = await datePicker(e.currentTarget, due); if (d !== undefined) { due = d; draw(); $('#tk-in', el)?.focus(); } };
    $('#tk-add', el).onsubmit = async (e) => {
      e.preventDefault();
      const text = $('#tk-in', el).value.trim();
      if (!text) return;
      await addTaskToDaily(text, due);
      due = null;
      toast('Added to today’s note');
    };
    const dg = el.querySelector('.done-group');
    if (dg) dg.addEventListener('toggle', () => { showDone = dg.open; });
    bindTaskRows(el, [...open, ...done]);
  }

  draw();
  let gone = false;
  const soon = debounce(() => {
    if (gone) return;
    const typing = document.activeElement?.id === 'tk-in' ? $('#tk-in', el).value : null;
    draw();
    if (typing !== null) { const i = $('#tk-in', el); i.value = typing; i.focus(); }
  }, 250);
  return {
    update(p) { if (MODES.includes(p.by)) mode = p.by; only = p.region || null; draw(); },
    onEvent(evt) { if (['note', 'delete', 'remote', 'sealed', 'page'].includes(evt.type)) soon(); },
    destroy() { gone = true; },
  };
}

export const lateCount = () => {
  const today = isoToday();
  return allTasks().filter((t) => !t.checked && t.due && t.due < today).length;
};
export { isoOf };
