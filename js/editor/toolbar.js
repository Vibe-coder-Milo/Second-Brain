// Formatting bar, "/" style menu and [[ autocomplete for typed notes and text
// boxes. Buttons keep the editor focused so the keyboard stays up.

import { html, raw, esc, toast, isWide } from '../util.js';
import { state } from '../vault.js';
import * as V from '../vault.js';
import { icons } from '../icons.js';
import { popover, closePopover, labelPicker, datePicker, stickerDrawer, tooltips } from '../ui.js';
import { searchNotes, displayTitle } from '../model.js';
import { compressImage } from '../images.js';
import { TEXT_PALETTE, HL_PALETTE, colourName, suggestKey } from './rich.js';
import { FONTS, NOTE_FONT, TEXT_SIZE } from '../fonts.js';
import { POSTIT_COLORS } from '../stickers.js';
import { isDarkUI, darkInk, darkHighlight } from '../theme.js';

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

// The colour picker: text colours by hue and strength, highlights (soft or
// marker), the colours you used last, and any colour of your own.
const RECENT_MAX = 8;
export const recentColours = (kind = 'text') => (state.device?.[kind === 'hl' ? 'recentHl' : 'recentText'] || []).slice(0, RECENT_MAX);
export async function rememberColour(c, kind = 'text') {
  if (!c) return;
  const key = kind === 'hl' ? 'recentHl' : 'recentText';
  const list = [c.toUpperCase(), ...(state.device?.[key] || []).filter((x) => x.toUpperCase() !== c.toUpperCase())].slice(0, RECENT_MAX);
  try { await V.updateDevice({ [key]: list }); } catch { /* locked */ }
}

function colourMenu(editor, anchor, opts = {}) {
  // Show colours as they'll look: brightened in dark mode.
  const dark = opts.dark ? opts.dark() : isDarkUI();
  const show = (c) => (dark ? (opts.tone || darkInk)(c) : c);
  const showHl = (c) => (dark ? darkHighlight(c) : c);
  const cur = (editor.getAttributes('textStyle').color || '').toUpperCase();
  const curHl = (editor.getAttributes('highlight').color || '').toUpperCase();
  const sw = (c, kind) => html`<button type="button" class="cswatch" data-${kind === 'hl' ? 'hl' : 'color'}="${c}" style="--c:${kind === 'hl' ? showHl(c) : show(c)}" aria-label="${colourName(c)}" aria-pressed="${(kind === 'hl' ? curHl : cur) === c.toUpperCase() ? 'true' : 'false'}"></button>`;
  const recT = recentColours('text');
  const recH = recentColours('hl');
  const p = popover(anchor, `${html`<div class="cpick">
    <div class="pop-head">Text colour</div>
    <div class="cgrid">${TEXT_PALETTE.map((r) => html`${r.colors.map((c) => sw(c, 'text'))}`)}</div>
    <div class="crow"><button type="button" class="chip sm" data-color="" aria-pressed="${cur ? 'false' : 'true'}"><span class="cdot" style="background:var(--ink)"></span>Default</button>
      ${recT.length ? html`<span class="clabel">Recent</span>${recT.map((c) => sw(c, 'text'))}` : ''}
      <label class="chip sm cmine"><span class="cdot rainbow"></span>Your own<input type="color" data-custom="text" value="${cur && cur.startsWith('#') ? cur.slice(0, 7).toLowerCase() : '#2b5684'}"></label></div>
    <div class="pop-head">Highlight</div>
    ${HL_PALETTE.map((r) => html`<div class="cgrid one" aria-label="${r.name} highlights">${r.colors.map((c) => sw(c, 'hl'))}</div>`)}
    <div class="crow"><button type="button" class="chip sm" data-hl="" aria-pressed="${curHl ? 'false' : 'true'}"><span class="cdot none"></span>None</button>
      ${recH.length ? html`<span class="clabel">Recent</span>${recH.map((c) => sw(c, 'hl'))}` : ''}
      <label class="chip sm cmine"><span class="cdot rainbow"></span>Your own<input type="color" data-custom="hl" value="#fff475"></label></div>
    <button type="button" class="pop-item" data-reset>Clear colour and highlight</button>
  </div>`}`, { label: 'Colour', width: 330, cls: 'tall' });
  const setText = (c) => { (c ? editor.chain().focus().setColor(c) : editor.chain().focus().unsetColor()).run(); if (c) rememberColour(c, 'text').then(() => opts.onPicked?.()); };
  const setHl = (c) => { (c ? editor.chain().focus().setHighlight({ color: c }) : editor.chain().focus().unsetHighlight()).run(); if (c) rememberColour(c, 'hl'); };
  p.el.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => { setText(b.dataset.color); p.close(); }; });
  p.el.querySelectorAll('[data-hl]').forEach((b) => { b.onclick = () => { setHl(b.dataset.hl); p.close(); }; });
  p.el.querySelectorAll('[data-custom]').forEach((inp) => {
    inp.onchange = () => { const c = inp.value.toUpperCase(); if (inp.dataset.custom === 'hl') setHl(c); else setText(c); p.close(); };
  });
  p.el.querySelector('[data-reset]').onclick = () => { editor.chain().focus().unsetColor().unsetHighlight().run(); p.close(); };
}

function fontMenu(editor, anchor, opts) {
  const cur = editor.getAttributes('textStyle').fontFamily || opts.noteFont?.() || NOTE_FONT;
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

// Text without its own size shows at the default size from Settings.
const sizeOf = (editor, base) => parseInt(editor.getAttributes('textStyle').fontSize || '', 10) || base || state.config?.text?.size || TEXT_SIZE;

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

// ---- The typed-note toolbar ---------------------------------------------------------
// Two rows, shaped and placed like the handwritten-note toolbar: the top row
// holds the tools and never changes (undo, style, bold, lists, label, insert,
// record), the row below holds the text settings (font, size, colour, more).
// It's always there, so the text never jumps when you start typing.

const QUICK_COLOURS = ['#2B5684', '#C4554D', '#548164', '#CC782F', '#8A67AB'];
// The quick colours: the ones you used last, topped up with a few classics.
const quickColours = (n) => [...new Set([...recentColours('text'), ...QUICK_COLOURS].map((c) => c.toUpperCase()))].slice(0, n);

export function mountNoteBars(tools, props, editor, opts = {}) {
  const wide = !!opts.wide;
  const T = (act, ic, label, toggle = false) => html`<button type="button" class="tool" data-act="${act}" aria-label="${label}" ${toggle ? raw('aria-pressed="false"') : ''}>${raw(icons[ic]({ size: 22 }))}</button>`;
  tools.innerHTML = `${html`
    ${wide ? html`<div class="tg">${T('undo', 'undo', 'Undo')}${T('redo', 'redo', 'Redo')}</div>` : ''}
    <div class="tg"><button type="button" class="tool style-chip" data-act="style" aria-label="Text style: headings, lists, quote, callout"><span id="fb-style">Body</span>${raw(icons.chevron({ size: 14 }))}</button>${T('bold', 'bold', 'Bold', true)}${wide ? html`${T('italic', 'italic', 'Italic', true)}${T('underline', 'underline', 'Underline', true)}` : ''}</div>
    <div class="tg">${T('bullets', 'bullets', 'Bulleted list', true)}${wide ? T('numbers', 'numbers', 'Numbered list', true) : ''}${T('checklist', 'checklist', 'Checklist', true)}</div>
    <div class="tg">${T('label', 'tag', 'Add a label you can search for')}${T('insert', 'plus', 'Insert: table, image, sticker, post-it, due date, link')}</div>
    ${wide && opts.onRecord ? html`<div class="tg">${T('record', 'mic', 'Record audio', true)}</div>` : ''}`}`;
  const dark = opts.dark?.() || false;
  props.innerHTML = `${html`
    <button type="button" class="pen-chip" data-act="font" aria-label="Font"><span class="fc-aa">Aa</span><span id="fb-font">Spectral</span>${raw(icons.chevron({ size: 14 }))}</button>
    <div class="tg fb-size" role="group" aria-label="Text size"><button type="button" class="tool sm" data-act="smaller" aria-label="Smaller text">−</button><span id="fb-size">18</span><button type="button" class="tool sm" data-act="larger" aria-label="Larger text">+</button></div>
    <div class="tg colours" role="group" aria-label="Text colour"></div>
    <div class="tg">${wide ? '' : html`${T('italic', 'italic', 'Italic', true)}${T('underline', 'underline', 'Underline', true)}`}${T('strike', 'strike', 'Strikethrough', true)}${wide ? '' : T('numbers', 'numbers', 'Numbered list', true)}${T('outdent', 'outdent', 'Indent less')}${T('indent', 'indent', 'Indent more')}${T('align', 'align', 'Alignment')}</div>
    ${opts.hideKeyboard ? html`<div class="tg">${T('hidekb', 'keyboardDown', 'Hide keyboard')}</div>` : ''}`}`;
  props.hidden = false;
  // Default, then the colours you used last, then the full picker.
  const drawQuick = () => {
    const box = props.querySelector('.colours');
    if (!box) return;
    // Only when a new colour joins, so swatches don't shuffle as you tap them.
    const want = quickColours(wide ? 5 : 3);
    const shown = [...box.querySelectorAll('[data-tcol]')].map((x) => x.dataset.tcol).filter(Boolean);
    if (shown.length && want.every((c) => shown.includes(c))) return;
    box.innerHTML = `${html`<button type="button" class="ink-swatch" data-tcol="" style="--c:var(--ink)" aria-label="Default colour"></button>${want.map((c) => html`<button type="button" class="ink-swatch" data-tcol="${c}" style="--c:${dark ? opts.tone(c) : c}" aria-label="${colourName(c)}"></button>`)}<button type="button" class="ink-swatch more" data-act="colour" aria-label="More colours and highlight"></button>`}`;
    refresh?.();
  };
  let refresh = null;
  drawQuick();

  const onDown = (e) => { if (e.target.closest('button')) e.preventDefault(); };
  const onClick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'record') { opts.onRecord?.(); return; }
    if (act === 'undo' || act === 'redo') { opts.ensureEditing?.(); editor.chain().focus()[act]().run(); refresh(); return; }
    opts.ensureEditing?.();
    const ch = () => editor.chain().focus();
    if (b.dataset.tcol !== undefined) {
      const c = b.dataset.tcol;
      (c ? ch().setColor(c) : ch().unsetColor()).run();
      if (c) rememberColour(c, 'text').then(drawQuick);
      refresh();
      return;
    }
    switch (act) {
      case 'style': {
        const p = popover(b, `${styleMenuHtml(editor, STYLES)}<p class="hint" style="padding:6px 10px 8px">Type / anywhere to open this menu</p>`, { label: 'Text styles', width: 290 });
        p.el.querySelectorAll('[data-style]').forEach((x) => { x.onclick = () => { p.close(); runAction(editor, x.dataset.style, b, opts); }; });
        break;
      }
      case 'insert': {
        const items = EXTRA.filter((x) => x.id !== 'label').map((x) => (x.id === 'table' && editor.isActive('table') ? { ...x, name: 'Table options' } : x));
        const rec = !wide && opts.onRecord;
        const p = popover(b, `${html`<div class="pop-head">Insert</div>${items.map((x) => html`<button type="button" class="pop-item" data-ins="${x.id}">${raw(icons[x.icon]({ size: 20 }))}${x.name}</button>`)}${rec ? html`<div class="pop-head">More</div><button type="button" class="pop-item" data-ins="record">${raw(icons.mic({ size: 20 }))}Record audio</button>` : ''}`}`, { label: 'Insert', width: 260 });
        p.el.querySelectorAll('[data-ins]').forEach((x) => { x.onclick = () => { p.close(); if (x.dataset.ins === 'record') opts.onRecord?.(); else runAction(editor, x.dataset.ins, b, opts); }; });
        break;
      }
      case 'font': fontMenu(editor, b, opts); break;
      case 'smaller': ch().setFontSize(`${Math.max(12, sizeOf(editor, opts.baseSize) - 2)}px`).run(); break;
      case 'larger': ch().setFontSize(`${Math.min(48, sizeOf(editor, opts.baseSize) + 2)}px`).run(); break;
      case 'bold': ch().toggleBold().run(); break;
      case 'italic': ch().toggleItalic().run(); break;
      case 'underline': ch().toggleUnderline().run(); break;
      case 'strike': ch().toggleStrike().run(); break;
      case 'colour': colourMenu(editor, b, { ...opts, onPicked: drawQuick }); break;
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
      case 'hidekb': editor.commands.blur(); opts.onHideKeyboard?.(); break;
      default: if (act) await runAction(editor, act, b, opts);
    }
    refresh();
  };
  for (const bar of [tools, props]) {
    bar.addEventListener('pointerdown', onDown);
    bar.addEventListener('click', onClick);
    tooltips(bar);
  }

  refresh = () => {
    const name = STYLES.slice(0, 3).find((s) => s.active(editor))?.name
      || (editor.isActive('bulletList') ? 'Bullets' : editor.isActive('orderedList') ? 'Numbers' : editor.isActive('taskList') ? 'Checklist' : editor.isActive('callout') ? 'Callout' : editor.isActive('blockquote') ? 'Quote' : 'Body');
    const st = tools.querySelector('#fb-style');
    if (st) st.textContent = name;
    const sz = props.querySelector('#fb-size');
    if (sz) sz.textContent = String(sizeOf(editor, opts.baseSize));
    const fn = props.querySelector('#fb-font');
    if (fn) fn.textContent = FONTS.find((f) => f.id === (editor.getAttributes('textStyle').fontFamily || opts.noteFont?.() || NOTE_FONT))?.name || NOTE_FONT;
    const press = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike', bullets: 'bulletList', numbers: 'orderedList', checklist: 'taskList' };
    for (const [act, mark] of Object.entries(press)) for (const bar of [tools, props]) bar.querySelector(`[data-act=${act}]`)?.setAttribute('aria-pressed', editor.isActive(mark) ? 'true' : 'false');
    const col = editor.getAttributes('textStyle').color || '';
    props.querySelectorAll('[data-tcol]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.tcol.toLowerCase() === col.toLowerCase() ? 'true' : 'false'));
    const ins = tools.querySelector('[data-act=insert]');
    if (ins) ins.setAttribute('aria-label', editor.isActive('table') ? 'Insert, or change this table' : 'Insert: table, image, sticker, post-it, due date, link');
  };
  editor.on('selectionUpdate', refresh);
  editor.on('transaction', refresh);
  refresh();
  return {
    refresh,
    setRecording(on) { tools.querySelector('[data-act=record]')?.setAttribute('aria-pressed', on ? 'true' : 'false'); },
    destroy() {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
      for (const bar of [tools, props]) { bar.removeEventListener('pointerdown', onDown); bar.removeEventListener('click', onClick); bar.innerHTML = ''; }
    },
  };
}

// On iPhone, keep the toolbar in view at the top while the keyboard is up
// (Safari otherwise slides the page up under it). Returns a cleanup.
export function pinTop(elm) {
  if (isWide() || !window.visualViewport) return () => {};
  const vv = window.visualViewport;
  const place = () => {
    const off = Math.max(0, Math.round(vv.offsetTop));
    elm.style.transform = off > 1 ? `translateY(${off}px)` : '';
  };
  vv.addEventListener('resize', place);
  vv.addEventListener('scroll', place);
  place();
  return () => { vv.removeEventListener('resize', place); vv.removeEventListener('scroll', place); elm.style.transform = ''; };
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
