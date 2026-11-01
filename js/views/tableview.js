// A notebook section seen as a table (or cards, a timeline, a board): each
// note is a row, and columns are properties you choose, like a date, impact,
// skills or people.

import { html, raw, $, toast, debounce, uid, fmtDate } from '../util.js';
import * as V from '../vault.js';
import { state, notesIn } from '../vault.js';
import { newNote, displayTitle } from '../model.js';
import { icons } from '../icons.js';
import { popover, menuSheet, confirmSheet, openSheet, datePicker } from '../ui.js';
import { isoToday } from '../doc.js';

export const FIELD_TYPES = [
  { id: 'text', name: 'Text' },
  { id: 'date', name: 'Date' },
  { id: 'select', name: 'Choice' },
  { id: 'tags', name: 'Tags' },
  { id: 'person', name: 'People' },
  { id: 'number', name: 'Number' },
  { id: 'check', name: 'Checkbox' },
  { id: 'url', name: 'Link' },
];
const f = (name, type, extra = {}) => ({ id: uid('f'), name, type, ...extra });
export const PRESETS = [
  { id: 'wins', name: 'Wins', note: 'Date, impact, skills, people', fields: () => [f('Date', 'date'), f('Impact', 'text'), f('Skills', 'tags'), f('People', 'person')], view: { group: 'year' } },
  { id: 'projects', name: 'Projects', note: 'Status, due date, owner', fields: () => [f('Status', 'select', { options: ['Idea', 'Doing', 'Waiting', 'Done'] }), f('Due', 'date'), f('Owner', 'person')], view: { mode: 'board' } },
  { id: 'reading', name: 'Reading', note: 'Author, status, rating', fields: () => [f('Author', 'text'), f('Status', 'select', { options: ['To read', 'Reading', 'Finished'] }), f('Rating', 'number'), f('Finished', 'date')] },
  { id: 'people', name: 'People', note: 'Role, met, follow up', fields: () => [f('Role', 'text'), f('Met', 'date'), f('Follow up', 'check')] },
  { id: 'blank', name: 'Just a date', note: 'Add your own columns', fields: () => [f('Date', 'date')] },
];

const MODES = [['table', 'Table', 'table'], ['cards', 'Cards', 'grid'], ['timeline', 'Timeline', 'timeline'], ['board', 'Board', 'kanban']];
const SOFT = ['#E7EEF8', '#E5F3EC', '#FBEFD9', '#F6E3EE', '#EDE7F6', '#E3F2F4', '#F3EBDD', '#EAEFD9'];
const INK = ['#2B5684', '#2F6B5B', '#8A5A12', '#8E3A67', '#5B3E99', '#1C5F6A', '#6B4A2E', '#556019'];
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SOFT.length; };
const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const singular = (name) => (/[^s]s$/i.test(name) && name.length > 3 ? name.slice(0, -1) : name).toLowerCase();

function fmtVal(field, v, { short = false } = {}) {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '';
  switch (field.type) {
    case 'date': {
      const d = new Date(`${v}T12:00:00`);
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() || !short ? { year: 'numeric' } : {}) });
    }
    case 'check': return v ? 'Yes' : 'No';
    case 'url': try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return v; }
    default: return Array.isArray(v) ? v.join(', ') : String(v);
  }
}

function valHtml(field, v) {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return html`<span class="tv-empty">–</span>`;
  switch (field.type) {
    case 'tags':
    case 'select': return html`${(Array.isArray(v) ? v : [v]).map((t) => html`<span class="tv-chip" style="background:${SOFT[hue(t)]};color:${INK[hue(t)]}">${t}</span>`)}`;
    case 'person': return html`${(Array.isArray(v) ? v : [v]).map((p) => html`<span class="tv-avatar" title="${p}" style="background:${SOFT[hue(p)]};color:${INK[hue(p)]}">${initials(p)}<span class="sr-only">${p}</span></span>`)}`;
    case 'check': return v ? raw(`<span class="tv-check on" aria-label="Yes">${icons.check({ size: 13 })}</span>`) : html`<span class="tv-check" aria-label="No"></span>`;
    case 'url': return html`<a href="${v}" target="_blank" rel="noopener noreferrer" class="tv-link">${fmtVal(field, v)}</a>`;
    case 'number': return html`<span class="tv-num">${v}</span>`;
    default: return html`${fmtVal(field, v, { short: true })}`;
  }
}

// Reading and editing one section's properties, shared by the table and the note screen.
export function makeEditors(nbId, secId) {
  const nb = () => state.notebooks.get(nbId);
  const sec = () => nb()?.sections.find((s) => s.id === secId);
  const fields = () => sec()?.fields || [];
  async function saveSection(patch) {
    const b = nb();
    await V.saveNotebook({ ...b, sections: b.sections.map((s) => (s.id === secId ? { ...s, ...patch } : s)) });
  }
  async function setProp(n, fid, value) {
    const cur = state.notes.get(n.id);
    if (!cur) return;
    const props = { ...cur.props };
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) delete props[fid]; else props[fid] = value;
    await V.saveNote({ ...cur, props });
  }

  async function saveField(fid, patch) {
    await saveSection({ fields: fields().map((x) => (x.id === fid ? { ...x, ...patch } : x)) });
  }

  // ---- Editing a cell ----
  function knownValues(field) {
    const out = new Set(field.options || []);
    for (const n of notesIn(nbId)) { const v = n.props[field.id]; (Array.isArray(v) ? v : v ? [v] : []).forEach((x) => out.add(x)); }
    if (field.type === 'person') for (const n of state.notes.values()) if (n.region === 'people' && n.title) out.add(n.title);
    return [...out];
  }

  async function editCell(anchor, n, field) {
    if (!n || !field) return;
    const v = n.props[field.id];
    if (field.type === 'check') { await setProp(n, field.id, !v); return; }
    if (field.type === 'date') { const d = await datePicker(anchor, v || null); if (d !== undefined) await setProp(n, field.id, d); return; }
    if (field.type === 'select' || field.type === 'tags' || field.type === 'person') { multiPick(anchor, n, field); return; }
    const p = popover(anchor, `${html`<form class="tv-edit"><label class="pop-head" for="tv-ed">${field.name}</label>
      ${field.type === 'text' ? html`<textarea id="tv-ed" rows="3">${v || ''}</textarea>` : html`<input id="tv-ed" type="${field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}" value="${v ?? ''}" ${field.type === 'number' ? raw('step="any" inputmode="decimal"') : ''}>`}
      <div class="pop-row"><button type="submit" class="btn btn-primary btn-sm">Save</button>${v !== undefined && v !== '' ? html`<button type="button" class="btn btn-ghost btn-sm" data-clear>Clear</button>` : ''}</div></form>`}`, { label: `Edit ${field.name}`, width: 320, keepFocus: false });
    const inp = $('#tv-ed', p.el);
    setTimeout(() => inp.focus(), 20);
    p.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      let val = inp.value.trim();
      if (field.type === 'number') val = val === '' ? null : Number(val);
      if (field.type === 'url' && val && !/^https?:\/\//i.test(val)) val = `https://${val}`;
      p.close();
      await setProp(n, field.id, val);
    };
    if (field.type === 'text') inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.el.querySelector('form').requestSubmit(); } };
    const c = p.el.querySelector('[data-clear]');
    if (c) c.onclick = async () => { p.close(); await setProp(n, field.id, null); };
  }

  function multiPick(anchor, n, field) {
    const multi = field.type !== 'select';
    let cur = n.props[field.id];
    cur = Array.isArray(cur) ? [...cur] : cur ? [cur] : [];
    const p = popover(anchor, '<div class="tv-pick"></div>', { label: `Choose ${field.name}`, width: 300, keepFocus: false, onClose: async () => { await setProp(state.notes.get(n.id), field.id, multi ? cur : cur[0] || null); } });
    const box = p.el.querySelector('.tv-pick');
    const drawPick = (q = '') => {
      const all = knownValues(field);
      const shown = all.filter((x) => x.toLowerCase().includes(q.toLowerCase()));
      box.innerHTML = `${html`<div class="pop-head">${field.name}</div>
        <input type="text" id="tv-q" placeholder="${field.type === 'person' ? 'Find or add a person' : 'Find or add'}" value="${q}" autocomplete="off">
        <ul class="tv-opts">${shown.map((x) => html`<li><button type="button" data-v="${x}" aria-pressed="${cur.includes(x) ? 'true' : 'false'}">${field.type === 'person' ? html`<span class="tv-avatar" style="background:${SOFT[hue(x)]};color:${INK[hue(x)]}">${initials(x)}</span>` : html`<span class="tv-chip" style="background:${SOFT[hue(x)]};color:${INK[hue(x)]}">${x}</span>`}<span class="grow">${field.type === 'person' ? x : ''}</span>${cur.includes(x) ? raw(icons.check({ size: 14 })) : ''}</button></li>`)}
          ${q.trim() && !all.some((x) => x.toLowerCase() === q.trim().toLowerCase()) ? html`<li><button type="button" data-add="${q.trim()}">${icons.plus({ size: 14 })}Add “${q.trim()}”</button></li>` : ''}</ul>
        ${cur.length ? html`<button type="button" class="pop-item danger" data-none>Clear</button>` : ''}`}`;
      const qi = $('#tv-q', box);
      qi.oninput = () => { const pos = qi.selectionStart; drawPick(qi.value); const x = $('#tv-q', box); x.focus(); x.setSelectionRange(pos, pos); };
      qi.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const add = box.querySelector('[data-add]') || box.querySelector('[data-v]'); add?.click(); } };
      box.querySelectorAll('[data-v]').forEach((b) => {
        b.onclick = () => {
          const x = b.dataset.v;
          if (multi) cur = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x];
          else { cur = [x]; p.close(); return; }
          drawPick(qi.value);
        };
      });
      const ad = box.querySelector('[data-add]');
      if (ad) {
        ad.onclick = async () => {
          const x = ad.dataset.add;
          if (field.type === 'select') await saveField(field.id, { options: [...(field.options || []), x] });
          if (multi) { cur = [...cur, x]; drawPick(''); } else { cur = [x]; p.close(); }
        };
      }
      const none = box.querySelector('[data-none]');
      if (none) none.onclick = () => { cur = []; p.close(); };
    };
    drawPick();
    setTimeout(() => $('#tv-q', box)?.focus(), 20);
  }

  return { nb, sec, fields, saveSection, setProp, saveField, knownValues, editCell };
}

export function mountSectionView(host, nbId, secId, ctx, { onOpenNote, back = null } = {}) {
  const { nb, sec, fields, saveSection, setProp, saveField, knownValues, editCell } = makeEditors(nbId, secId);
  let adding = false;
  let find = '';
  const collapsed = new Set();
  let gone = false;

  const view = () => ({ mode: 'table', sort: null, group: null, filters: {}, board: null, ...(sec()?.view || {}) });
  const firstSec = () => nb()?.sections[0]?.id;
  const rows = () => notesIn(nbId).filter((n) => (n.section || firstSec()) === secId || (!nb().sections.some((s) => s.id === n.section) && secId === firstSec()));

  const setView = (patch) => saveSection({ view: { ...view(), ...patch } });
  // ---- Shaping the rows ----
  function shaped() {
    const v = view();
    const fl = fields();
    let list = rows();
    const q = find.trim().toLowerCase();
    if (q) list = list.filter((n) => [displayTitle(n), n.body, ...fl.map((x) => fmtVal(x, n.props[x.id]))].join(' ').toLowerCase().includes(q));
    for (const [fid, want] of Object.entries(v.filters || {})) {
      const fd = fl.find((x) => x.id === fid);
      if (!fd || want === undefined || want === null) continue;
      list = list.filter((n) => {
        const val = n.props[fid];
        if (want === '__empty') return val === undefined || val === '' || (Array.isArray(val) && !val.length);
        if (fd.type === 'check') return !!val === (want === 'yes');
        return Array.isArray(val) ? val.includes(want) : val === want;
      });
    }
    const sort = v.sort || { by: fl.find((x) => x.type === 'date')?.id || 'updated', dir: 'desc' };
    const key = (n) => {
      if (sort.by === 'title') return displayTitle(n).toLowerCase();
      if (sort.by === 'updated') return n.updatedAt;
      if (sort.by === 'created') return n.createdAt;
      const val = n.props[sort.by];
      return Array.isArray(val) ? val.join(',').toLowerCase() : typeof val === 'string' ? val.toLowerCase() : val ?? '';
    };
    list.sort((a, b) => {
      const x = key(a); const y = key(b);
      const empty = (z) => z === '' || z === undefined;
      if (empty(x) !== empty(y)) return empty(x) ? 1 : -1;
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? r : -r;
    });
    return { list, sort };
  }

  function groupsOf(list) {
    const g = view().group;
    if (!g) return [{ key: '', name: '', items: list }];
    const fl = fields();
    const map = new Map();
    const push = (k, name, n) => { if (!map.has(k)) map.set(k, { key: k, name, items: [] }); map.get(k).items.push(n); };
    const dateField = fl.find((x) => x.type === 'date');
    for (const n of list) {
      if (g === 'year' || g === 'month') {
        const v = dateField ? n.props[dateField.id] : null;
        if (!v) { push('~', 'No date', n); continue; }
        const d = new Date(`${v}T12:00:00`);
        if (g === 'year') push(String(d.getFullYear()), String(d.getFullYear()), n);
        else push(v.slice(0, 7), d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), n);
      } else {
        const fd = fl.find((x) => x.id === g);
        const v = n.props[g];
        const first = Array.isArray(v) ? v[0] : fd?.type === 'check' ? (v ? 'Yes' : 'No') : v;
        if (first === undefined || first === '' || first === null) push('~', `No ${fd?.name.toLowerCase() || 'value'}`, n);
        else push(String(first), String(first), n);
      }
    }
    const out = [...map.values()];
    const fd = fl.find((x) => x.id === g);
    if (fd?.type === 'select') out.sort((a, b) => ((fd.options || []).indexOf(a.key) + 1 || 999) - ((fd.options || []).indexOf(b.key) + 1 || 999));
    else out.sort((a, b) => (a.key === '~') - (b.key === '~') || (g === 'year' || g === 'month' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
    return out;
  }

  // ---- Drawing ----
  function draw() {
    if (gone) return;
    const b = nb();
    const s = sec();
    if (!b || !s) { host.innerHTML = `${html`<div class="page"><p class="muted">This section isn’t here any more.</p></div>`}`; return; }
    const v = view();
    if (!fields().length) { drawSetup(b, s); return; }
    const { list } = shaped();
    const total = rows().length;
    const activeFilters = Object.values(v.filters || {}).filter((x) => x !== undefined && x !== null).length;
    host.innerHTML = `${html`<div class="tv">
      <div class="tv-head">
        <div class="tv-title">
          ${back ? html`<button type="button" class="back" data-tv="back">${icons.back()}${b.title}</button>` : html`<p class="crumb-line">${b.title} › ${s.name}</p>`}
          <h1 class="page-title">${s.name}</h1>
          <p class="page-sub">${plural(total, 'note')}${list.length !== total ? `, ${list.length} shown` : ''}</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-tv="new">${icons.plus({ size: 18 })}New ${singular(s.name)}</button>
      </div>
      <div class="tv-bar">
        <div class="tv-modes" role="tablist" aria-label="View">${MODES.map(([id, name, ic]) => html`<button type="button" role="tab" aria-selected="${v.mode === id ? 'true' : 'false'}" data-mode="${id}">${raw(icons[ic]({ size: 18 }))}<span>${name}</span></button>`)}</div>
        <div class="tv-tools">
          <label class="tv-find">${icons.search({ size: 16 })}<span class="sr-only">Find</span><input type="search" id="tv-find" placeholder="Find" value="${find}" autocomplete="off"></label>
          <button type="button" class="btn btn-sm ${activeFilters ? 'on' : ''}" data-tv="filter">Filter${activeFilters ? ` (${activeFilters})` : ''}</button>
          <button type="button" class="btn btn-sm" data-tv="sort">Sort</button>
          ${v.mode !== 'board' ? html`<button type="button" class="btn btn-sm ${v.group ? 'on' : ''}" data-tv="group">Group${v.group ? `: ${groupName(v.group)}` : ''}</button>` : ''}
        </div>
      </div>
      <div class="tv-body" id="tv-body"></div>
    </div>`}`;
    const body = $('#tv-body', host);
    if (v.mode === 'cards') drawCards(body, list);
    else if (v.mode === 'timeline') drawTimeline(body, list);
    else if (v.mode === 'board') drawBoard(body, list);
    else drawTable(body, list);
    bind();
  }

  const groupName = (g) => (g === 'year' ? 'Year' : g === 'month' ? 'Month' : fields().find((x) => x.id === g)?.name || 'None');

  function drawSetup(b, s) {
    host.innerHTML = `${html`<div class="tv">
      <div class="tv-head"><div class="tv-title">${back ? html`<button type="button" class="back" data-tv="back">${icons.back()}${b.title}</button>` : html`<p class="crumb-line">${b.title} › ${s.name}</p>`}
        <h1 class="page-title">${s.name} as a table</h1><p class="page-sub">Each note becomes a row. Pick the columns to start with; you can change them any time.</p></div></div>
      <ul class="tv-presets">${PRESETS.map((p) => html`<li><button type="button" data-preset="${p.id}"><strong>${p.name}</strong><span class="muted">${p.note}</span></button></li>`)}</ul>
    </div>`}`;
    host.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.onclick = async () => {
        const p = PRESETS.find((x) => x.id === btn.dataset.preset);
        await saveSection({ fields: p.fields(), view: { mode: 'table', ...(p.view || {}) } });
      };
    });
    const bk = host.querySelector('[data-tv=back]');
    if (bk) bk.onclick = () => back();
  }

  function drawTable(body, list) {
    const fl = fields();
    const gs = groupsOf(list);
    const grouped = !!view().group;
    body.innerHTML = `${html`<div class="tv-scroll"><table class="tv-table">
      <thead><tr><th scope="col" class="tv-tcol"><button type="button" data-col="title">Title</button></th>${fl.map((x) => html`<th scope="col" class="tv-${x.type}"><button type="button" data-col="${x.id}">${x.name}</button></th>`)}<th class="tv-addcol"><button type="button" data-tv="addcol" aria-label="Add a column">${icons.plus({ size: 16 })}</button></th></tr></thead>
      ${gs.map((g) => html`<tbody>
        ${grouped ? html`<tr class="tv-group"><th colspan="${fl.length + 2}" scope="rowgroup"><button type="button" data-collapse="${g.key}" aria-expanded="${collapsed.has(g.key) ? 'false' : 'true'}">${icons.chevron({ size: 15 })}${g.name} <span class="count">${g.items.length}</span></button></th></tr>` : ''}
        ${collapsed.has(g.key) ? '' : g.items.map((n) => html`<tr data-row="${n.id}"><th scope="row" class="tv-tcol"><button type="button" class="tv-open" data-open="${n.id}">${n.kind === 'ink' ? raw(icons.pen({ size: 14 })) : n.kind === 'board' ? raw(icons.board({ size: 14 })) : ''}${displayTitle(n)}</button></th>
          ${fl.map((x) => html`<td class="tv-${x.type}"><button type="button" class="tv-cell" data-cell="${n.id}|${x.id}" aria-label="${x.name}: ${fmtVal(x, n.props[x.id]) || 'empty'}. Edit">${valHtml(x, n.props[x.id])}</button></td>`)}<td></td></tr>`)}
      </tbody>`)}
      ${adding ? html`<tbody><tr class="tv-newrow"><th class="tv-tcol" colspan="${fl.length + 2}"><form id="tv-newform"><label class="sr-only" for="tv-newtitle">Title</label><input id="tv-newtitle" type="text" placeholder="Title, then Enter" autocomplete="off"></form></th></tr></tbody>` : ''}
    </table></div>
    <button type="button" class="tv-add" data-tv="addcol">${icons.plus({ size: 16 })}Add a column</button>`}`;
    if (adding) setTimeout(() => $('#tv-newtitle', body)?.focus(), 30);
  }

  function cardHtml(n, fl) {
    const txt = n.body.replace(/[#>*_`|[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    return html`<li class="tv-card" data-row="${n.id}"><button type="button" class="tv-open" data-open="${n.id}">${displayTitle(n)}</button>
      <div class="tv-cprops">${fl.filter((x) => n.props[x.id] !== undefined && n.props[x.id] !== '').slice(0, 4).map((x) => html`<span class="tv-cprop"><span class="k">${x.name}</span>${valHtml(x, n.props[x.id])}</span>`)}</div>
      ${txt ? html`<p class="tv-snip">${txt}</p>` : ''}</li>`;
  }

  function drawCards(body, list) {
    const fl = fields();
    body.innerHTML = `${html`${groupsOf(list).map((g) => html`${view().group ? html`<h2 class="tv-gh">${g.name} <span class="count">${g.items.length}</span></h2>` : ''}<ul class="tv-cards">${g.items.map((n) => cardHtml(n, fl))}</ul>`)}`}`;
  }

  function drawTimeline(body, list) {
    const fl = fields();
    const df = fl.find((x) => x.type === 'date');
    if (!df) { body.innerHTML = `${html`<p class="hint">Add a date column to see a timeline.</p>`}`; return; }
    const dated = list.filter((n) => n.props[df.id]).sort((a, b) => b.props[df.id].localeCompare(a.props[df.id]));
    const by = new Map();
    for (const n of dated) { const k = n.props[df.id].slice(0, 7); if (!by.has(k)) by.set(k, []); by.get(k).push(n); }
    const other = fl.find((x) => x.type === 'text');
    body.innerHTML = `${html`<ol class="tv-timeline">${[...by].map(([k, items]) => html`<li class="tl-month"><h2>${new Date(`${k}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <ol>${items.map((n) => html`<li class="tl-item"><span class="tl-dot" aria-hidden="true"></span><span class="tl-date">${new Date(`${n.props[df.id]}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        <span class="tl-main"><button type="button" class="tv-open" data-open="${n.id}">${displayTitle(n)}</button>${other && n.props[other.id] ? html`<span class="muted">${n.props[other.id]}</span>` : ''}</span></li>`)}</ol></li>`)}</ol>
      ${list.length > dated.length ? html`<p class="hint">${plural(list.length - dated.length, 'note')} without a ${df.name.toLowerCase()} aren’t shown.</p>` : ''}`}`;
  }

  function drawBoard(body, list) {
    const fl = fields();
    const v = view();
    const bf = fl.find((x) => x.id === v.board) || fl.find((x) => x.type === 'select');
    if (!bf) {
      body.innerHTML = `${html`<div class="empty"><p class="serif">A board needs a choice column</p><p style="margin:0">Columns on the board come from a choice like Status: Idea, Doing, Done.</p><button type="button" class="btn" data-tv="addstatus">Add a Status column</button></div>`}`;
      body.querySelector('[data-tv=addstatus]').onclick = async () => { const nf = f('Status', 'select', { options: ['Idea', 'Doing', 'Done'] }); await saveSection({ fields: [...fields(), nf], view: { ...v, mode: 'board', board: nf.id } }); };
      return;
    }
    const cols = ['~', ...(bf.options || [])];
    body.innerHTML = `${html`<div class="tv-board" data-field="${bf.id}">${cols.map((c) => {
      const items = list.filter((n) => (c === '~' ? !n.props[bf.id] : n.props[bf.id] === c));
      if (c === '~' && !items.length) return '';
      return html`<section class="tv-col" data-col-val="${c}" aria-label="${c === '~' ? `No ${bf.name}` : c}"><h2>${c === '~' ? `No ${bf.name.toLowerCase()}` : c} <span class="count">${items.length}</span></h2>
        <ul>${items.map((n) => html`<li class="tv-card draggable" data-row="${n.id}"><button type="button" class="tv-open" data-open="${n.id}">${displayTitle(n)}</button>
          <div class="tv-cprops">${fl.filter((x) => x.id !== bf.id && n.props[x.id] !== undefined && n.props[x.id] !== '').slice(0, 3).map((x) => html`<span class="tv-cprop">${valHtml(x, n.props[x.id])}</span>`)}</div>
          <button type="button" class="tv-move" data-move="${n.id}" aria-label="Move ${displayTitle(n)}">${icons.move({ size: 16 })}</button></li>`)}</ul></section>`;
    })}</div>`}`;
    bindBoardDrag(body, bf);
  }

  // Drag cards between board columns (pen, finger or mouse). With a finger,
  // press and hold a moment first, so an ordinary swipe still scrolls the board.
  // Near the board's edges it scrolls by itself to reach the other columns.
  function bindBoardDrag(body, bf) {
    const board = body.querySelector('.tv-board');
    body.querySelectorAll('.tv-card.draggable').forEach((card) => {
      card.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.tv-move') || e.button > 0) return;
        const id = card.dataset.row;
        const touch = e.pointerType === 'touch';
        let ghost = null;
        let armed = !touch;
        let sx = e.clientX; let sy = e.clientY;
        let px = sx; let py = sy;
        let over = null;
        let raf = 0;
        let hold = 0;
        const findCol = () => {
          const col = document.elementsFromPoint(px, py).find((x) => x.classList?.contains('tv-col'));
          body.querySelectorAll('.tv-col').forEach((c) => c.classList.toggle('over', c === col));
          over = col || null;
        };
        const begin = () => {
          const r = card.getBoundingClientRect();
          // A drag, not a tap: don't open the note when the pointer lifts.
          card.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { capture: true, once: true });
          ghost = card.cloneNode(true);
          ghost.classList.add('tv-ghost');
          Object.assign(ghost.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
          sx = px; sy = py;
          ghost.style.transform = 'rotate(1.5deg)';
          document.body.appendChild(ghost);
          card.classList.add('dragging');
          navigator.vibrate?.(8);
          const edge = () => {
            raf = requestAnimationFrame(edge);
            if (Math.hypot(px - sx, py - sy) < 24) return; // not until it has really moved
            const b = board.getBoundingClientRect();
            const zone = Math.min(56, b.width / 6);
            let dx = 0;
            if (px > b.right - zone) dx = Math.ceil(((px - (b.right - zone)) / zone) * 14);
            else if (px < b.left + zone) dx = -Math.ceil((((b.left + zone) - px) / zone) * 14);
            if (dx) { const before = board.scrollLeft; board.scrollLeft += dx; if (board.scrollLeft !== before) findCol(); }
          };
          raf = requestAnimationFrame(edge);
        };
        if (touch) hold = setTimeout(() => { armed = true; begin(); findCol(); }, 320);
        const move = (ev) => {
          px = ev.clientX; py = ev.clientY;
          if (!armed) {
            // The finger moved before the hold finished: this is a scroll.
            if (Math.hypot(px - sx, py - sy) > 8) finish();
            return;
          }
          if (!ghost) { if (Math.hypot(px - sx, py - sy) < 6) return; begin(); }
          ghost.style.transform = `translate(${px - sx}px, ${py - sy}px) rotate(1.5deg)`;
          findCol();
        };
        // Once a held card is picked up, the finger moves it instead of scrolling.
        const stopScroll = (te) => { if (ghost) te.preventDefault(); };
        const finish = async (commit = false) => {
          clearTimeout(hold);
          cancelAnimationFrame(raf);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', cancel);
          window.removeEventListener('touchmove', stopScroll);
          const had = ghost;
          ghost?.remove();
          ghost = null;
          card.classList.remove('dragging');
          body.querySelectorAll('.tv-col').forEach((c) => c.classList.remove('over'));
          if (commit && had && over) {
            const val = over.dataset.colVal;
            const n = state.notes.get(id);
            const now = n?.props?.[bf.id] || '~';
            if (n && now !== val) await setProp(n, bf.id, val === '~' ? null : val);
          }
        };
        const up = () => finish(true);
        const cancel = () => finish(false);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('touchmove', stopScroll, { passive: false });
      });
      // Holding a card shouldn't bring up the phone's copy/select menu.
      card.addEventListener('contextmenu', (e) => { if (card.classList.contains('dragging')) e.preventDefault(); });
    });
    body.querySelectorAll('[data-move]').forEach((b) => {
      b.onclick = async () => {
        const n = state.notes.get(b.dataset.move);
        const v = await menuSheet(`Move ${displayTitle(n)}`, [...(bf.options || []).map((o) => ({ value: o, label: o })), { value: '~', label: `No ${bf.name.toLowerCase()}` }]);
        if (v !== null) await setProp(n, bf.id, v === '~' ? null : v);
      };
    });
  }

  function bind() {
    const on = (k, fn) => host.querySelectorAll(`[data-tv=${k}]`).forEach((b) => { b.onclick = (e) => fn(b, e); });
    on('back', () => back?.());
    on('new', () => { if (view().mode !== 'table') setView({ mode: 'table' }).then(() => { adding = true; draw(); }); else { adding = true; draw(); } });
    on('addcol', (b) => addColumn(b));
    on('filter', (b) => filterMenu(b));
    on('sort', (b) => sortMenu(b));
    on('group', (b) => groupMenu(b));
    host.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => setView({ mode: b.dataset.mode }); });
    host.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => onOpenNote?.(b.dataset.open); });
    host.querySelectorAll('[data-cell]').forEach((b) => { b.onclick = () => { const [nid, fid] = b.dataset.cell.split('|'); editCell(b, state.notes.get(nid), fields().find((x) => x.id === fid)); }; });
    host.querySelectorAll('[data-col]').forEach((b) => { b.onclick = () => columnMenu(b, b.dataset.col); });
    host.querySelectorAll('[data-collapse]').forEach((b) => { b.onclick = () => { const k = b.dataset.collapse; if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k); draw(); }; });
    const fi = $('#tv-find', host);
    if (fi) fi.oninput = debounce(() => { find = fi.value; const pos = fi.selectionStart; draw(); const n = $('#tv-find', host); n?.focus(); n?.setSelectionRange(pos, pos); }, 250);
    const form = $('#tv-newform', host);
    if (form) {
      const inp = $('#tv-newtitle', host);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const title = inp.value.trim();
        if (!title) { adding = false; draw(); return; }
        const b = nb();
        const props = {};
        const df = fields().find((x) => x.type === 'date');
        if (df) props[df.id] = isoToday();
        await V.saveNote(newNote({ title, titleAuto: false, notebook: nbId, section: secId, region: b.region, inbox: !b.region, sealed: b.sealed, props, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }));
        adding = true;
        draw();
      };
      inp.onkeydown = (e) => { if (e.key === 'Escape') { adding = false; draw(); } };
      inp.onblur = () => setTimeout(() => { if (adding && !inp.value.trim() && document.activeElement !== inp) { adding = false; draw(); } }, 200);
    }
  }

  // ---- Columns ----
  function addColumn() {
    const s = openSheet(`${html`<form class="stack" style="display:flex;flex-direction:column;gap:16px" novalidate>
      <h2 class="page-title" style="font-size:26px">Add a column</h2>
      <div class="field"><label for="ac-name">Name</label><input id="ac-name" type="text" maxlength="30" placeholder="For example Skills"></div>
      <div class="field"><span class="label">Kind</span><div class="chips" role="radiogroup" aria-label="Kind of column">${FIELD_TYPES.map((t, i) => html`<button type="button" class="chip" role="radio" aria-pressed="${i === 0 ? 'true' : 'false'}" aria-checked="${i === 0 ? 'true' : 'false'}" data-type="${t.id}">${t.name}</button>`)}</div></div>
      <div class="field" id="ac-opts" hidden><label for="ac-o">Choices, separated by commas</label><input id="ac-o" type="text" placeholder="Idea, Doing, Done"></div>
      <button class="btn btn-primary btn-block" type="submit">Add column</button>
      <button class="btn btn-ghost btn-block" type="button" data-cancel>Cancel</button></form>`}`, { label: 'Add a column' });
    let type = 'text';
    s.el.querySelectorAll('[data-type]').forEach((b) => {
      b.onclick = () => {
        type = b.dataset.type;
        s.el.querySelectorAll('[data-type]').forEach((x) => { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
        $('#ac-opts', s.el).hidden = type !== 'select';
      };
    });
    s.el.querySelector('[data-cancel]').onclick = () => s.close();
    s.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#ac-name', s.el).value.trim() || FIELD_TYPES.find((t) => t.id === type).name;
      const options = type === 'select' ? $('#ac-o', s.el).value.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
      await saveSection({ fields: [...fields(), f(name, type, options ? { options } : {})] });
      s.close();
    };
    setTimeout(() => $('#ac-name', s.el)?.focus(), 60);
  }

  async function columnMenu(anchor, fid) {
    if (fid === 'title') { sortMenu(anchor); return; }
    const fd = fields().find((x) => x.id === fid);
    if (!fd) return;
    const i = fields().indexOf(fd);
    const items = [
      { value: 'asc', label: 'Sort, first to last' }, { value: 'desc', label: 'Sort, last to first' },
      ...(fd.type === 'date' ? [{ value: 'g-year', label: 'Group by year' }, { value: 'g-month', label: 'Group by month' }] : ['select', 'tags', 'person', 'check'].includes(fd.type) ? [{ value: 'g', label: `Group by ${fd.name.toLowerCase()}` }] : []),
      { value: 'rename', label: 'Rename' },
      ...(fd.type === 'select' ? [{ value: 'options', label: 'Edit choices' }] : []),
      ...(i > 0 ? [{ value: 'left', label: 'Move left' }] : []), ...(i < fields().length - 1 ? [{ value: 'right', label: 'Move right' }] : []),
      { value: 'delete', label: 'Delete column', danger: true },
    ];
    const act = await menuSheet(fd.name, items);
    if (act === 'asc' || act === 'desc') await setView({ sort: { by: fid, dir: act } });
    if (act === 'g-year') await setView({ group: 'year' });
    if (act === 'g-month') await setView({ group: 'month' });
    if (act === 'g') await setView({ group: fid });
    if (act === 'rename' || act === 'options') {
      const { textSheet } = await import('./notebooks.js');
      const val = await textSheet(act === 'rename' ? { title: 'Rename column', value: fd.name } : { title: 'Choices', label: 'Separated by commas', value: (fd.options || []).join(', '), confirm: 'Save' });
      if (val) await saveField(fid, act === 'rename' ? { name: val } : { options: val.split(',').map((x) => x.trim()).filter(Boolean) });
    }
    if (act === 'left' || act === 'right') {
      const fl = [...fields()];
      const j = act === 'left' ? i - 1 : i + 1;
      [fl[i], fl[j]] = [fl[j], fl[i]];
      await saveSection({ fields: fl });
    }
    if (act === 'delete') {
      const ok = await confirmSheet({ title: `Delete ${fd.name}?`, body: 'The column goes from this view. The values stay on each note, out of sight, so adding it back brings them back.', confirm: 'Delete column', danger: true });
      if (ok) {
        const v = view();
        await saveSection({ fields: fields().filter((x) => x.id !== fid), view: { ...v, group: v.group === fid ? null : v.group, sort: v.sort?.by === fid ? null : v.sort, board: v.board === fid ? null : v.board } });
      }
    }
  }

  function sortMenu(anchor) {
    const fl = fields();
    const cur = shaped().sort;
    const opts = [['title', 'Title'], ...fl.filter((x) => x.type !== 'check').map((x) => [x.id, x.name]), ['updated', 'Last edited'], ['created', 'Created']];
    const p = popover(anchor, `${html`<div class="pop-head">Sort by</div>${opts.map(([id, name]) => html`<button type="button" class="pop-item" data-by="${id}" aria-pressed="${cur.by === id ? 'true' : 'false'}">${name}${cur.by === id ? html`<span class="muted" style="margin-left:auto">${cur.dir === 'asc' ? 'First to last' : 'Last to first'}</span>` : ''}</button>`)}`}`, { label: 'Sort', width: 280 });
    p.el.querySelectorAll('[data-by]').forEach((b) => { b.onclick = () => { const by = b.dataset.by; p.close(); setView({ sort: { by, dir: cur.by === by && cur.dir === 'desc' ? 'asc' : 'desc' } }); }; });
  }

  function groupMenu(anchor) {
    const fl = fields();
    const v = view();
    const opts = [['', 'No groups'], ...(fl.some((x) => x.type === 'date') ? [['year', 'Year'], ['month', 'Month']] : []), ...fl.filter((x) => ['select', 'tags', 'person', 'check'].includes(x.type)).map((x) => [x.id, x.name])];
    const p = popover(anchor, `${html`<div class="pop-head">Group by</div>${opts.map(([id, name]) => html`<button type="button" class="pop-item" data-g="${id}" aria-pressed="${(v.group || '') === id ? 'true' : 'false'}">${name}</button>`)}`}`, { label: 'Group', width: 240 });
    p.el.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { p.close(); setView({ group: b.dataset.g || null }); }; });
  }

  function filterMenu(anchor) {
    const fl = fields().filter((x) => ['select', 'tags', 'person', 'check'].includes(x.type));
    const v = view();
    if (!fl.length) { toast('Filters work on choice, tag, people and checkbox columns. Use Find for text.'); return; }
    const p = popover(anchor, `${html`<div class="pop-head">Show only</div>${fl.map((x) => html`<label class="tv-filter"><span>${x.name}</span><select data-ff="${x.id}"><option value="">Any</option>
      ${x.type === 'check' ? html`<option value="yes" ${v.filters?.[x.id] === 'yes' ? raw('selected') : ''}>Yes</option><option value="no" ${v.filters?.[x.id] === 'no' ? raw('selected') : ''}>No</option>` : knownValues(x).map((o) => html`<option value="${o}" ${v.filters?.[x.id] === o ? raw('selected') : ''}>${o}</option>`)}
      <option value="__empty" ${v.filters?.[x.id] === '__empty' ? raw('selected') : ''}>Empty</option></select></label>`)}
      <button type="button" class="pop-item" data-clearf>Show everything</button>`}`, { label: 'Filter', width: 300, keepFocus: false });
    p.el.querySelectorAll('[data-ff]').forEach((s) => { s.onchange = () => setView({ filters: { ...view().filters, [s.dataset.ff]: s.value || null } }); });
    p.el.querySelector('[data-clearf]').onclick = () => { p.close(); setView({ filters: {} }); };
  }

  draw();
  const soon = debounce(() => { if (!gone && !host.contains(document.activeElement)) draw(); else if (!gone && document.activeElement?.id !== 'tv-newtitle' && document.activeElement?.id !== 'tv-find') draw(); }, 120);
  return {
    onEvent(evt) { if (['note', 'notebook', 'delete', 'remote', 'sealed'].includes(evt.type)) soon(); },
    destroy() { gone = true; host.innerHTML = ''; },
  };
}

export { fmtVal, valHtml };
void fmtDate;
