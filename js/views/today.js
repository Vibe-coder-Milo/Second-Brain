// Today: the week at a glance, what's due, today's note, and what you captured.

import { html, raw, $, toast, debounce, fmtTime } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { displayTitle, regionColors } from '../model.js';
import { icons } from '../icons.js';
import { datePicker, labelPicker } from '../ui.js';
import { allTasks, setTask, dailyNote, ensureDaily, addTaskToDaily, isoToday, addDays, isoOf, dueLabel } from '../notework.js';
import { docPlainText, docLabels } from '../doc.js';

const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function taskRowHtml(t, { today = isoToday(), showSource = true } = {}) {
  const n = t.note;
  const nb = n.notebook ? state.notebooks.get(n.notebook) : null;
  const r = state.config.regions.find((x) => x.id === n.region);
  const late = !t.checked && t.due && t.due < today;
  const src = n.daily ? (n.daily === today ? 'Today’s note' : `Daily note, ${longDay(n.daily)}`) : `${nb ? `${nb.title} › ` : ''}${displayTitle(n)}`;
  const href = `#/note/${n.id}${t.page ? `?page=${t.page}` : ''}`;
  const key = `${n.id}|${t.page || ''}|${t.box || ''}|${t.tid}`;
  return html`<li class="task ${t.checked ? 'done' : ''}">
    <button type="button" class="tick" role="checkbox" aria-checked="${t.checked ? 'true' : 'false'}" data-tick="${key}" aria-label="${t.checked ? 'Mark not done' : 'Mark done'}: ${t.text || 'task'}">${t.checked ? raw(icons.check({ size: 16 })) : ''}</button>
    <div class="task-main"><a class="task-text" href="${href}">${t.text || 'Untitled task'}</a>
      ${showSource ? html`<span class="task-src"><span class="dot" style="background:${regionColors(n.inbox ? null : r).dot}"></span><span class="t">${src}</span>${n.kind === 'ink' ? raw(icons.pen({ size: 13 })) : ''}</span>` : ''}</div>
    <button type="button" class="due-pill ${late ? 'late' : t.due === today ? 'today' : t.due ? '' : 'none'}" data-due="${key}">${t.due ? (late ? `Late, ${longDay(t.due)}` : dueLabel(t.due, today)) : 'Set date'}</button>
  </li>`;
}

// Tick boxes and date pills, for any list of tasks rendered with taskRowHtml.
export function bindTaskRows(root, tasks, { onDone } = {}) {
  const find = (key) => tasks.find((t) => `${t.note.id}|${t.page || ''}|${t.box || ''}|${t.tid}` === key);
  root.querySelectorAll('[data-tick]').forEach((b) => {
    b.onclick = async () => {
      const t = find(b.dataset.tick);
      if (!t) return;
      const checked = !t.checked;
      b.setAttribute('aria-checked', checked ? 'true' : 'false');
      b.innerHTML = checked ? String(icons.check({ size: 16 })) : '';
      b.closest('.task')?.classList.toggle('done', checked);
      try { await setTask(t, { checked }); onDone?.(t, checked); } catch (e) { toast(e.message || 'Couldn’t update that task.'); }
    };
  });
  root.querySelectorAll('[data-due]').forEach((b) => {
    b.onclick = async () => {
      const t = find(b.dataset.due);
      if (!t) return;
      const d = await datePicker(b, t.due);
      if (d === undefined) return;
      try { await setTask(t, { due: d }); } catch (e) { toast(e.message || 'Couldn’t change the date.'); }
    };
  });
}

export function mount(el, params, ctx) {
  let day = params.d || isoToday();
  let editor = null;
  let R = null;
  let bar = null;
  let suggest = null;
  let unfloat = null;
  let dirty = false;
  let destroyed = false;

  const weekOf = (iso) => {
    const d = new Date(`${iso}T12:00:00`);
    const mon = addDays(iso, -((d.getDay() + 6) % 7));
    return [...Array(7)].map((_, i) => addDays(mon, i));
  };
  const busy = (iso) => !!dailyNote(iso) || [...state.notes.values()].some((n) => !n.daily && isoOf(n.createdAt) === iso);

  function draw() {
    const today = isoToday();
    const d = new Date(`${day}T12:00:00`);
    const isToday = day === today;
    el.innerHTML = `${html`<div class="page today-page">
      <div class="today-head">
        <div><p class="eyebrow">${isToday ? 'Today' : day < today ? 'Looking back' : 'Looking ahead'}</p>
          <h1 class="page-title">${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</h1></div>
        <div class="head-actions">
          ${isToday ? '' : html`<button type="button" class="btn btn-sm" data-day="${today}">Today</button>`}
          <a class="icon-btn" href="#/notes?focus=1" aria-label="Search your notes">${icons.search()}</a>
          <label class="icon-btn" aria-label="Go to a day">${icons.calendar()}<input type="date" class="sr-only" id="t-jump" value="${day}"></label>
        </div>
      </div>
      <ol class="week" aria-label="Week">${weekOf(day).map((iso) => {
        const x = new Date(`${iso}T12:00:00`);
        return html`<li><button type="button" class="wd ${iso === day ? 'on' : ''} ${iso === today ? 'is-today' : ''}" data-day="${iso}" aria-label="${x.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}" ${iso === day ? raw('aria-current="date"') : ''}>
          <span class="wd-n">${x.toLocaleDateString(undefined, { weekday: 'short' })}</span><span class="wd-d">${x.getDate()}</span><span class="wd-dot ${busy(iso) ? 'on' : ''}"></span></button></li>`;
      })}</ol>
      <div id="t-inbox"></div>
      <section class="today-sec" aria-labelledby="t-due-h">
        <div class="sec-head"><h2 class="section-title" id="t-due-h">${isToday ? 'Due today' : `Due ${longDay(day)}`}</h2><a class="sec-link" href="#/tasks">All tasks</a></div>
        <ul class="task-list" id="t-tasks"></ul>
        <form class="quick-task" id="t-add" novalidate><label class="sr-only" for="t-add-in">New task</label><input id="t-add-in" type="text" placeholder="${isToday ? 'Add a task for today' : `Add a task for ${longDay(day)}`}" autocomplete="off" enterkeyhint="done"><button type="submit" class="btn btn-sm">Add</button></form>
      </section>
      <section class="today-sec" aria-labelledby="t-note-h">
        <div class="sec-head"><h2 class="section-title" id="t-note-h">${isToday ? 'Today’s note' : 'That day’s note'}</h2><span id="t-note-link"></span></div>
        <div class="today-note"><div class="rich-host" id="t-rich"></div></div>
      </section>
      <section class="today-sec" aria-labelledby="t-cap-h" id="t-caps-sec">
        <h2 class="section-title" id="t-cap-h">${isToday ? 'Captured today' : 'Captured that day'}</h2>
        <ul class="cap-list" id="t-caps"></ul>
      </section>
      <nav class="quick-links" aria-label="More places">
        <a href="#/tasks">${icons.tasks({ size: 20 })}Tasks</a><a href="#/labels">${icons.tag({ size: 20 })}Labels</a><a href="#/notes">${icons.notes({ size: 20 })}All notes</a><a href="#/inbox">${icons.inbox({ size: 20 })}Inbox</a><a href="#/settings">${icons.settings({ size: 20 })}Settings</a>
      </nav>
    </div>
    <div class="fmtbar" id="t-bar" role="toolbar" aria-label="Formatting" hidden></div>`}`;
    el.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => go(b.dataset.day); });
    $('#t-jump', el).onchange = (e) => { if (e.target.value) go(e.target.value); };
    $('#t-add', el).onsubmit = async (e) => {
      e.preventDefault();
      const inp = $('#t-add-in', el);
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      await flush();
      await addTaskToDaily(text, day, day === isoToday() ? isoToday() : day);
      toast('Added');
    };
    drawInbox();
    drawTasks();
    drawCaptures();
    mountEditor();
  }

  function go(iso) {
    flush();
    ctx.navigate(iso === isoToday() ? '#/today' : `#/today?d=${iso}`, { replace: true });
  }

  function drawInbox() {
    const box = $('#t-inbox', el);
    if (!box) return;
    const n = [...state.notes.values()].filter((x) => x.inbox).length;
    box.innerHTML = n && day === isoToday() ? `${html`<a class="inbox-card" href="#/inbox">${icons.inbox()}<span class="grow"><strong>${n} capture${n === 1 ? '' : 's'}</strong> to sort</span>${icons.chevron({ size: 18 })}</a>`}` : '';
  }

  function drawTasks() {
    const box = $('#t-tasks', el);
    if (!box) return;
    const today = isoToday();
    const all = allTasks();
    const list = all.filter((t) => (day === today ? (t.due && t.due <= today && (!t.checked || isoOf(t.doneAt || 0) === today)) : t.due === day))
      .sort((a, b) => (a.checked - b.checked) || String(a.due).localeCompare(String(b.due)));
    box.innerHTML = list.length ? list.map((t) => taskRowHtml(t, { today })).join('') : `${html`<li class="hint task-empty">${day === today ? 'Nothing due today.' : 'Nothing due that day.'}</li>`}`;
    bindTaskRows(box, list);
  }

  function drawCaptures() {
    const box = $('#t-caps', el);
    if (!box) return;
    const regions = state.config.regions;
    const list = [...state.notes.values()].filter((n) => !n.daily && isoOf(n.createdAt) === day).sort((a, b) => a.createdAt - b.createdAt);
    $('#t-caps-sec', el).hidden = !list.length;
    box.innerHTML = list.map((n) => html`<li><a href="#/note/${n.id}"><span class="time">${fmtTime(n.createdAt)}</span><span class="dot" style="background:${regionColors(n.inbox ? null : regions.find((r) => r.id === n.region)).dot}"></span><span class="t">${displayTitle(n)}</span>${n.kind === 'ink' ? raw(icons.pen({ size: 14 })) : n.kind === 'board' ? raw(icons.board({ size: 14 })) : ''}</a></li>`).join('');
  }

  function drawNoteLink() {
    const s = $('#t-note-link', el);
    const n = dailyNote(day);
    if (s) s.innerHTML = n ? `${html`<a class="sec-link" href="#/note/${n.id}">Open</a>`}` : '';
  }

  // ---- The day's note, edited right here ----
  async function mountEditor() {
    const host = $('#t-rich', el);
    if (!host) return;
    R = R || await import('../editor/rich.js');
    if (destroyed || !$('#t-rich', el)) return;
    editor?.destroy();
    const n = dailyNote(day);
    editor = R.createRichEditor(host, {
      doc: n ? R.noteDoc(n) : null,
      editable: true,
      placeholder: 'What happened today? Type / for headings, lists and labels',
      onChange: () => { dirty = true; saveSoon(); },
      onOpenLink: (title) => {
        const t = [...state.notes.values()].find((x) => displayTitle(x).toLowerCase() === title.toLowerCase());
        if (t) ctx.navigate(`#/note/${t.id}`); else toast(`No note called “${title}” yet`);
      },
      pickLabel: (cb) => labelPicker(host, { title: 'Callout label' }).then(cb),
      pickDate: (cur, cb) => datePicker(host, cur).then((d) => cb(d)),
    });
    editor.on('focus', showBar);
    // Tapping the empty part of the card starts typing at the end.
    host.closest('.today-note').onclick = (e) => { if (editor && !editor.view.dom.contains(e.target)) editor.commands.focus('end'); };
    editor.on('blur', () => setTimeout(() => { if (!editor?.isFocused && !document.querySelector('.popover') && !document.querySelector('.overlay')) hideBar(); }, 150));
    drawNoteLink();
  }

  async function showBar() {
    const b = $('#t-bar', el);
    if (!b || bar) return;
    const T = await import('../editor/toolbar.js');
    if (!editor || bar) return;
    b.hidden = false;
    document.body.classList.add('editing');
    bar = T.mountFormatBar(b, editor, { compact: false, hideKeyboard: true, onHideKeyboard: hideBar });
    suggest = T.attachSuggest(editor, {});
    unfloat = T.floatBar(b);
  }
  function hideBar() {
    bar?.destroy();
    bar = null;
    suggest?.close();
    suggest = null;
    unfloat?.();
    unfloat = null;
    const b = $('#t-bar', el);
    if (b) { b.hidden = true; b.innerHTML = ''; }
    document.body.classList.remove('editing');
  }

  const saveSoon = debounce(() => persist(), 800);
  async function flush() { saveSoon.cancel(); await persist(); }
  async function persist() {
    if (!dirty || !editor || !R) return;
    dirty = false;
    const doc = editor.getJSON();
    const n = dailyNote(day);
    try {
      if (!n) {
        if (!docPlainText(doc).trim() && !docLabels(doc).length) return;
        await ensureDaily(day, doc);
      } else {
        const body = R.markdownOf(doc);
        if (JSON.stringify(n.doc) === JSON.stringify(doc)) return;
        await V.saveNote({ ...n, doc, body });
      }
      drawNoteLink();
    } catch (e) { toast(e.message || 'Couldn’t save today’s note.'); }
  }

  draw();
  const soon = debounce(() => {
    if (destroyed) return;
    drawInbox();
    drawTasks();
    drawCaptures();
    drawNoteLink();
    const n = dailyNote(day);
    if (editor && n && !editor.isFocused && !dirty && R) {
      const next = R.noteDoc(n);
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, false);
    }
  }, 200);

  return {
    update(p) {
      const next = p.d || isoToday();
      if (next === day) return;
      flush();
      hideBar();
      day = next;
      draw();
    },
    onEvent(evt) {
      if (['note', 'delete', 'remote', 'sealed', 'config', 'ocr'].includes(evt.type)) soon();
    },
    destroy() {
      destroyed = true;
      flush();
      hideBar();
      editor?.destroy();
      editor = null;
    },
  };
}
