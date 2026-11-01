// Formatting bar, "/" style menu and [[ autocomplete for typed notes and text
// boxes. Buttons keep the editor focused so the keyboard stays up.

import { html, raw, esc, toast, isWide } from '../util.js';
import { state } from '../vault.js';
import * as V from '../vault.js';
import { icons } from '../icons.js';
import { popover, closePopover, labelPicker, datePicker, stickerDrawer, tooltips } from '../ui.js';
import { searchNotes, displayTitle } from '../model.js';
import { compressImage } from '../images.js';
import { FONTS, TEXT_COLORS, HIGHLIGHTS, suggestKey } from './rich.js';
import { POSTIT_COLORS } from '../stickers.js';

export const STYLES = [
  { id: 'title', name: 'Title', hint: '#', keys: 'title h1', run: (c) => c.toggleHeading({ level: 1 }), active: (e) => e.isActive('heading', { level: 1 }) },
  { id: 'heading', name: 'Heading', hint: '##', keys: 'heading h2', run: (c) => c.toggleHeading({ level: 2 }), active: (e) => e.isActive('heading', { level: 2 }) },
  { id: 'sub', name: 'Subheading', hint: '###', keys: 'subheading h3', run: (c) => c.toggleHeading({ level: 3 }), active: (e) => e.isActive('heading', { level: 3 }) },
  { id: 'body', name: 'Body text', hint: '', keys: 'body text paragraph normal', run: (c) => c.setParagraph(), active: (e) => e.isActive('paragraph') && !e.isActive('bulletList') && !e.isActive('orderedList') && !e.isActive('taskList') },
  { id: 'bullets', name: 'Bulleted list', hint: '-', icon: 'bullets', keys: 'bullet list', run: (c) => c.toggleBulletList(), active: (e) => e.isActive('bulletList') },
  { id: 'numbers', name: 'Numbered list', hint: '1.', icon: 'numbers', keys: 'numbered list ordered', run: (c) => c.toggleOrderedList(), active: (e) => e.isActive('orderedList') },
  { id: 'checklist', name: 'Checklist', hint: '[ ]', icon: 'checklist', keys: 'checklist todo task', run: (c) => c.toggleTaskList(), active: (e) => e.isActive('taskList') },
  { id: 'quote', name: 'Quote', hint: '>', icon: 'quote', keys: 'quote', run: (c) => c.toggleBlockquote(), active: (e) => e.isActive('blockquote') },
  { id: 'callout', name: 'Callout box', hint: '!', icon: 'callout', keys: 'callout important box highlight', run: (c) => c.toggleCallout({ label: 'important' }), active: (e) => e.isActive('callout') },
  { id: 'postit', name: 'Post-it', hint: '', icon: 'postit', keys: 'post-it postit sticky note', run: (c) => c.togglePostIt({ color: 'yellow' }), active: (e) => e.isActive('postit') },
  { id: 'divider', name: 'Divider', hint: '---', icon: 'divider', keys: 'divider line rule', run: (c) => c.setHorizontalRule() },
];

const EXTRA = [
  { id: 'table', name: 'Table', icon: 'table', keys: 'table grid rows columns' },
  { id: 'label', name: 'Label', icon: 'tag', keys: 'label tag important follow' },
  { id: 'sticker', name: 'Sticker or post-it', icon: 'sticker', keys: 'sticker star emoji post-it postit' },
  { id: 'due', name: 'Due date', icon: 'calendar', keys: 'due date deadline' },
  { id: 'image', name: 'Image', icon: 'image', keys: 'image photo picture' },
  { id: 'link', name: 'Link to a note', icon: 'link', keys: 'link note wiki [[' },
];

function styleMenuHtml(editor, items, activeIdx = -1) {
  return html`<ul class="style-menu" role="listbox">${items.map((s, i) => html`<li role="option" aria-selected="${i === activeIdx ? 'true' : 'false'}"><button type="button" data-style="${s.id}" class="${s.active?.(editor) ? 'on' : ''}">
    <span class="sm-name sm-${s.id}">${s.icon ? raw(icons[s.icon]({ size: 18 })) : ''}${s.name}</span>${s.hint ? html`<kbd>${s.hint}</kbd>` : ''}</button></li>`)}</ul>`;
}

// Actions that need a picker or a file. `opts` comes from the host screen.
export async function runAction(editor, id, anchor, opts = {}) {
  const st = STYLES.find((s) => s.id === id);
  if (st) { st.run(editor.chain().focus()).run(); return; }
  if (id === 'table') {
    if (editor.isActive('table')) return tableMenu(editor, anchor);
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    return;
  }
  if (id === 'label') {
    const label = await labelPicker(anchor, { title: 'Add a label' });
    if (label) editor.chain().focus().insertContent([{ type: 'labelChip', attrs: { label } }, { type: 'text', text: ' ' }]).run();
    return;
  }
  if (id === 'sticker') {
    const v = await stickerDrawer({ allowTape: false, allowPostits: true });
    if (!v) return;
    if (v.type === 'postit') editor.chain().focus().togglePostIt({ color: v.color }).run();
    else if (v.type === 'label') editor.chain().focus().insertContent([{ type: 'labelChip', attrs: { label: v.label } }, { type: 'text', text: ' ' }]).run();
    else if (v.type === 'sticker') editor.chain().focus().insertContent({ type: 'sticker', attrs: { pack: v.pack, key: v.key } }).run();
    else if (v.type === 'mine') editor.chain().focus().insertContent({ type: 'sticker', attrs: { pack: 'mine', key: v.id } }).run();
    return;
  }
  if (id === 'due') {
    const date = await datePicker(anchor);
    if (date) {
      if (!editor.isActive('taskList')) editor.chain().focus().toggleTaskList().run();
      editor.chain().focus().insertContent([{ type: 'text', text: ' ' }, { type: 'dueDate', attrs: { date } }]).run();
    }
    return;
  }
  if (id === 'image') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      for (const f of input.files) {
        try {
          const img = await compressImage(f);
          const fileId = await V.addFile(img.bytes, { sealed: !!opts.sealed?.() });
          opts.onFile?.(fileId, img);
          editor.chain().focus().insertContent({ type: 'imageFile', attrs: { fileId, w: img.w, h: img.h } }).run();
        } catch { toast(`Couldn’t add ${f.name || 'that image'}.`); }
      }
    };
    input.click();
    return;
  }
  if (id === 'link') editor.chain().focus().insertContent('[[').run();
}

function tableMenu(editor, anchor) {
  const items = [
    ['Row above', (c) => c.addRowBefore()], ['Row below', (c) => c.addRowAfter()],
    ['Column left', (c) => c.addColumnBefore()], ['Column right', (c) => c.addColumnAfter()],
    ['Merge cells', (c) => c.mergeCells()], ['Split cell', (c) => c.splitCell()],
    ['Header row on or off', (c) => c.toggleHeaderRow()],
    ['Delete row', (c) => c.deleteRow()], ['Delete column', (c) => c.deleteColumn()],
  ];
  const shades = ['#FFF1B8', '#D7F2E1', '#CFE0F5', '#FFD6D6', '#EEF2F1'];
  const p = popover(anchor, `${html`<div class="pop-head">Table</div>
    <div class="pop-grid2">${items.map(([n], i) => html`<button type="button" class="pop-item" data-i="${i}">${n}</button>`)}</div>
    <div class="pop-row"><span class="muted" style="font-size:13px">Shading</span>${shades.map((c) => html`<button type="button" class="swatch sm" data-shade="${c}" style="background:${c}" aria-label="Shade cells"></button>`)}<button type="button" class="swatch sm none" data-shade="" aria-label="No shading"></button></div>
    <button type="button" class="pop-item danger" data-del>Delete table</button>`}`, { label: 'Table', width: 320 });
  p.el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { items[Number(b.dataset.i)][1](editor.chain().focus()).run(); p.close(); }; });
  p.el.querySelectorAll('[data-shade]').forEach((b) => { b.onclick = () => { editor.chain().focus().setCellAttribute('background', b.dataset.shade || null).run(); p.close(); }; });
  p.el.querySelector('[data-del]').onclick = () => { editor.chain().focus().deleteTable().run(); p.close(); };
}

function colourMenu(editor, anchor) {
  const p = popover(anchor, `${html`<div class="pop-head">Text colour</div>
    <div class="pop-row wrap">${TEXT_COLORS.map((c) => html`<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="Text colour ${c}"></button>`)}</div>
    <div class="pop-head">Highlight</div>
    <div class="pop-row wrap">${HIGHLIGHTS.map((c) => html`<button type="button" class="swatch" data-hl="${c}" style="background:${c}" aria-label="Highlight ${c}"></button>`)}<button type="button" class="swatch none" data-hl="" aria-label="No highlight"></button></div>
    <button type="button" class="pop-item" data-reset>Reset colour</button>`}`, { label: 'Colour', width: 300 });
  p.el.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => { editor.chain().focus().setColor(b.dataset.color).run(); p.close(); }; });
  p.el.querySelectorAll('[data-hl]').forEach((b) => { b.onclick = () => { const c = b.dataset.hl; (c ? editor.chain().focus().setHighlight({ color: c }) : editor.chain().focus().unsetHighlight()).run(); p.close(); }; });
  p.el.querySelector('[data-reset]').onclick = () => { editor.chain().focus().unsetColor().unsetHighlight().run(); p.close(); };
}

function fontMenu(editor, anchor, opts) {
  const cur = editor.getAttributes('textStyle').fontFamily || opts.noteFont?.() || 'Spectral';
  const p = popover(anchor, `${html`<div class="pop-head">Font</div>
    <ul class="font-menu">${FONTS.map((f) => html`<li><button type="button" data-font="${f.id}" class="${cur === f.id ? 'on' : ''}"><span style="font-family:${f.css};font-size:19px">${f.name}</span><span class="muted">${f.note}</span></button></li>`)}</ul>
    ${opts.setNoteFont ? html`<p class="hint" style="padding:0 6px 6px">With nothing selected, this sets the font for the whole note.</p>` : ''}`}`, { label: 'Font', width: 300 });
  p.el.querySelectorAll('[data-font]').forEach((b) => {
    b.onclick = () => {
      const f = b.dataset.font;
      if (editor.state.selection.empty && opts.setNoteFont) opts.setNoteFont(f);
      else editor.chain().focus().setFontFamily(f).run();
      p.close();
    };
  });
}

const sizeOf = (editor) => parseInt(editor.getAttributes('textStyle').fontSize || '', 10) || 18;

export function mountFormatBar(bar, editor, opts = {}) {
  const compact = !!opts.compact;
  const B = (act, icon, label, extra = '') => html`<button type="button" class="fb" data-act="${act}" aria-label="${label}" ${raw(extra)}>${raw(icons[icon]({ size: 20 }))}</button>`;
  bar.innerHTML = `${html`
    <button type="button" class="fb fb-text" data-act="style" aria-label="Text styles"><span id="fb-style">Body</span>${raw(icons.up({ size: 14 }))}</button>
    <button type="button" class="fb fb-text fb-insert" data-act="insert" aria-label="Insert a table, image, sticker, due date or link">${raw(icons.plus({ size: 16 }))}<span>Insert</span></button>
    ${compact ? '' : html`<button type="button" class="fb fb-text" data-act="font" aria-label="Font">Aa</button>
    <span class="fb-size" role="group" aria-label="Text size"><button type="button" class="fb sm" data-act="smaller" aria-label="Smaller">−</button><span id="fb-size">18</span><button type="button" class="fb sm" data-act="larger" aria-label="Larger">+</button></span>`}
    <span class="fb-sep"></span>
    ${B('bold', 'bold', 'Bold', 'aria-pressed="false"')}${B('italic', 'italic', 'Italic', 'aria-pressed="false"')}${B('underline', 'underline', 'Underline', 'aria-pressed="false"')}
    ${compact ? '' : B('strike', 'strike', 'Strikethrough', 'aria-pressed="false"')}
    <button type="button" class="fb" data-act="colour" aria-label="Text colour and highlight"><span class="fb-a">A<span id="fb-col"></span></span></button>
    <span class="fb-sep"></span>
    ${B('bullets', 'bullets', 'Bulleted list', 'aria-pressed="false"')}${B('numbers', 'numbers', 'Numbered list', 'aria-pressed="false"')}${B('checklist', 'checklist', 'Checklist', 'aria-pressed="false"')}
    ${B('outdent', 'outdent', 'Indent less')}${B('indent', 'indent', 'Indent more')}
    ${compact ? '' : B('align', 'align', 'Alignment')}
    <span class="fb-sep"></span>
    ${B('label', 'tag', 'Add a label')}${B('due', 'calendar', 'Due date')}
    <span class="fb-sep"></span>
    ${B('undo', 'undo', 'Undo')}${B('redo', 'redo', 'Redo')}
    ${opts.hideKeyboard ? B('hidekb', 'keyboardDown', 'Hide keyboard') : ''}`}`;

  bar.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  tooltips(bar);
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const ch = () => editor.chain().focus();
    switch (act) {
      case 'style': {
        const items = [...STYLES, ...(compact ? [] : [EXTRA[0]])];
        const p = popover(b, `${styleMenuHtml(editor, items)}<p class="hint" style="padding:6px 10px 8px">Type / anywhere to open this menu</p>`, { label: 'Text styles', width: 290 });
        p.el.querySelectorAll('[data-style]').forEach((x) => { x.onclick = () => { p.close(); runAction(editor, x.dataset.style, b, opts); }; });
        break;
      }
      case 'insert': {
        const items = EXTRA.map((x) => (x.id === 'table' && editor.isActive('table') ? { ...x, name: 'Table options' } : x));
        const p = popover(b, `${html`<div class="pop-head">Insert</div>${items.map((x) => html`<button type="button" class="pop-item" data-ins="${x.id}">${raw(icons[x.icon]({ size: 20 }))}${x.name}</button>`)}`}`, { label: 'Insert', width: 260 });
        p.el.querySelectorAll('[data-ins]').forEach((x) => { x.onclick = () => { p.close(); runAction(editor, x.dataset.ins, b, opts); }; });
        break;
      }
      case 'font': fontMenu(editor, b, opts); break;
      case 'smaller': ch().setFontSize(`${Math.max(12, sizeOf(editor) - 2)}px`).run(); break;
      case 'larger': ch().setFontSize(`${Math.min(48, sizeOf(editor) + 2)}px`).run(); break;
      case 'bold': ch().toggleBold().run(); break;
      case 'italic': ch().toggleItalic().run(); break;
      case 'underline': ch().toggleUnderline().run(); break;
      case 'strike': ch().toggleStrike().run(); break;
      case 'colour': colourMenu(editor, b); break;
      case 'bullets': ch().toggleBulletList().run(); break;
      case 'numbers': ch().toggleOrderedList().run(); break;
      case 'checklist': ch().toggleTaskList().run(); break;
      case 'indent': if (!ch().sinkListItem('listItem').run()) ch().sinkListItem('taskItem').run(); break;
      case 'outdent': if (!ch().liftListItem('listItem').run()) ch().liftListItem('taskItem').run(); break;
      case 'align': {
        const order = ['left', 'center', 'right'];
        const cur = order.find((a) => editor.isActive({ textAlign: a })) || 'left';
        ch().setTextAlign(order[(order.indexOf(cur) + 1) % 3]).run();
        break;
      }
      case 'undo': ch().undo().run(); break;
      case 'redo': ch().redo().run(); break;
      case 'hidekb': editor.commands.blur(); opts.onHideKeyboard?.(); break;
      default: await runAction(editor, act, b, opts);
    }
    refresh();
  });

  const refresh = () => {
    const name = STYLES.slice(0, 3).find((s) => s.active(editor))?.name
      || (editor.isActive('bulletList') ? 'Bulleted list' : editor.isActive('orderedList') ? 'Numbered list' : editor.isActive('taskList') ? 'Checklist' : editor.isActive('callout') ? 'Callout' : editor.isActive('blockquote') ? 'Quote' : 'Body');
    const st = bar.querySelector('#fb-style');
    if (st) st.textContent = name;
    const sz = bar.querySelector('#fb-size');
    if (sz) sz.textContent = String(sizeOf(editor));
    const col = bar.querySelector('#fb-col');
    if (col) col.style.background = editor.getAttributes('textStyle').color || 'currentColor';
    const press = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike', bullets: 'bulletList', numbers: 'orderedList', checklist: 'taskList' };
    for (const [act, mark] of Object.entries(press)) bar.querySelector(`[data-act=${act}]`)?.setAttribute('aria-pressed', editor.isActive(mark) ? 'true' : 'false');
    const tb = bar.querySelector('[data-act=table]');
    if (tb) tb.setAttribute('aria-label', editor.isActive('table') ? 'Table options' : 'Insert table');
    const ins = bar.querySelector('[data-act=insert] span');
    if (ins) ins.textContent = editor.isActive('table') ? 'Table' : 'Insert';
  };
  editor.on('selectionUpdate', refresh);
  editor.on('transaction', refresh);
  refresh();
  return { refresh, destroy() { editor.off('selectionUpdate', refresh); editor.off('transaction', refresh); } };
}

// ---- "/" menu and [[ autocomplete -------------------------------------------------

export function attachSuggest(editor, opts = {}) {
  let pop = null;
  let items = [];
  let idx = 0;
  let cur = null;

  const close = () => { pop?.close(); pop = null; cur = null; };

  const choose = (i) => {
    const it = items[i];
    if (!it || !cur) return;
    const { from, to, kind } = cur;
    close();
    if (kind === 'slash') {
      editor.chain().focus().deleteRange({ from, to }).run();
      const anchor = caretBox(editor);
      runAction(editor, it.id, anchor, opts);
    } else {
      editor.chain().focus().deleteRange({ from, to }).insertContent(`[[${it.title}]] `).run();
    }
  };

  const render = () => {
    if (!cur) return;
    if (cur.kind === 'slash') {
      const q = cur.query.trim().toLowerCase();
      // Names that start with what you typed come first, then other name
      // matches, then matches on other words.
      const rank = (s) => (s.name.toLowerCase().startsWith(q) ? 0 : s.name.toLowerCase().includes(q) ? 1 : 2);
      items = [...STYLES, ...EXTRA].filter((s) => !q || s.name.toLowerCase().includes(q) || s.keys.includes(q)).map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
    } else {
      const q = cur.query.trim();
      const pool = [...state.notes.values()].filter((n) => n.id !== opts.noteId?.());
      const found = q ? searchNotes(pool, q, 6) : pool.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
      items = found.map((n) => ({ id: n.id, title: displayTitle(n) }));
      if (q && !items.some((x) => x.title.toLowerCase() === q.toLowerCase())) items.push({ id: null, title: q, missing: true });
    }
    if (!items.length) { pop?.close(); pop = null; return; }
    idx = Math.min(idx, items.length - 1);
    const body = cur.kind === 'slash'
      ? styleMenuHtml(editor, items, idx)
      : html`<ul class="style-menu" role="listbox">${items.map((it, i) => html`<li role="option" aria-selected="${i === idx ? 'true' : 'false'}"><button type="button" data-i="${i}"><span class="sm-name serif">${it.missing ? html`Link to “${it.title}”` : it.title}</span></button></li>`)}</ul>`;
    const box = caretBox(editor, cur.from);
    if (!pop) pop = popover(box, body, { label: cur.kind === 'slash' ? 'Styles' : 'Link to a note', width: 290, onClose: () => { pop = null; } });
    else pop.el.innerHTML = String(body);
    pop.el.querySelectorAll('[data-style]').forEach((b, i) => { b.onclick = () => choose(i); });
    pop.el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => choose(Number(b.dataset.i)); });
  };

  editor.storage.suggest.onChange = (found) => {
    if (!found) { if (cur) close(); return; }
    if (!cur || cur.kind !== found.kind || cur.from !== found.from) idx = 0;
    cur = found;
    render();
  };
  editor.storage.suggest.onKey = (e) => {
    if (!cur || !pop) return false;
    if (e.key === 'ArrowDown') { idx = (idx + 1) % items.length; render(); return true; }
    if (e.key === 'ArrowUp') { idx = (idx - 1 + items.length) % items.length; render(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { choose(idx); return true; }
    if (e.key === 'Escape') { close(); return true; }
    return false;
  };
  return { close };
}

function caretBox(editor, pos) {
  try {
    const c = editor.view.coordsAtPos(pos ?? editor.state.selection.from);
    return { x: c.left, y: c.top, h: c.bottom - c.top };
  } catch {
    const r = editor.view.dom.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + 20, h: 20 };
  }
}

// Keep a formatting bar just above the iPhone keyboard. Returns a cleanup.
export function floatBar(bar) {
  const phone = !isWide();
  bar.classList.toggle('phone', phone);
  if (!phone || !window.visualViewport) return () => {};
  const vv = window.visualViewport;
  const place = () => {
    bar.style.bottom = 'auto';
    bar.style.top = `${Math.round(vv.offsetTop + vv.height - bar.offsetHeight)}px`;
  };
  const ro = new ResizeObserver(place);
  ro.observe(bar);
  vv.addEventListener('resize', place);
  vv.addEventListener('scroll', place);
  place();
  return () => { ro.disconnect(); vv.removeEventListener('resize', place); vv.removeEventListener('scroll', place); bar.style.top = ''; bar.style.bottom = ''; };
}

export { closePopover, POSTIT_COLORS, esc };
