// Typed notes: a rich text editor (Tiptap) with headings, bullets, checklists,
// tables, callouts with labels, post-its, stickers, due dates and [[links]].

import {
  Editor, Node, Extension, mergeAttributes, wrappingInputRule, nodeInputRule, generateJSON,
  StarterKit, TaskList, TaskItem, Table, TableRow, TableCell, TableHeader,
  TextStyle, Color, FontFamily, FontSize, Highlight, TextAlign, Placeholder,
  Plugin, PluginKey, Decoration, DecorationSet,
} from '../../vendor/editor.bundle.js';
import { mdToHtml } from '../markdown.js';
import { state } from '../vault.js';
import * as V from '../vault.js';
import { labelMap, titleIndex } from '../model.js';
import { docToMarkdown } from '../doc.js';
import { stickerDef, stickerSVG, labelDef, postitColor } from '../stickers.js';
import { esc } from '../util.js';
import { darkInk, darkHighlight } from '../theme.js';

export const FONTS = [
  { id: 'Spectral', name: 'Spectral', note: 'Book serif', css: "'Spectral', Georgia, serif" },
  { id: 'Overpass', name: 'Overpass', note: 'Clean sans', css: "'Overpass', system-ui, sans-serif" },
  { id: 'Fraunces', name: 'Fraunces', note: 'Display serif', css: "'Fraunces', Georgia, serif" },
  { id: 'Nunito', name: 'Nunito', note: 'Rounded', css: "'Nunito', system-ui, sans-serif" },
  { id: 'Atkinson Hyperlegible', name: 'Atkinson Hyperlegible', note: 'Easy to read', css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { id: 'JetBrains Mono', name: 'JetBrains Mono', note: 'Monospace', css: "'JetBrains Mono', ui-monospace, monospace" },
  { id: 'Caveat', name: 'Caveat', note: 'Handwritten', css: "'Caveat', cursive" },
];
export const fontCss = (id) => FONTS.find((f) => f.id === id)?.css || FONTS[0].css;

// Text colours: ten hues, each in three strengths, like the named colours in
// Notion and the shade grid in Google Docs. Tuned to read well on white; in
// dark mode each is shown brightened (see darkInk).
export const HUES = ['Grey', 'Brown', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink'];
export const TEXT_PALETTE = [
  { name: 'Bright', colors: ['#8A8F98', '#B5835A', '#E03E3E', '#F2711C', '#D9A20B', '#2DA44E', '#0FA3A3', '#2F80ED', '#9B51E0', '#E0559C'] },
  { name: 'Classic', colors: ['#6B7280', '#976D57', '#C4554D', '#CC782F', '#B8862B', '#548164', '#2E8A86', '#487CA5', '#8A67AB', '#B35488'] },
  { name: 'Deep', colors: ['#3F4650', '#6B4A3A', '#9B2C2C', '#A0521C', '#8C6A1E', '#2F6B4F', '#1F6467', '#2B5684', '#5E3F8A', '#8A2F64'] },
];
// Highlights: soft pastels (like a light wash) and brighter marker colours.
export const HL_PALETTE = [
  { name: 'Soft', colors: ['#E9E9E7', '#EEE0DA', '#FFD6D6', '#FFE0C2', '#FFF1B8', '#D7F2E1', '#CFF0EE', '#CFE0F5', '#E6DDF7', '#F5D6EC'] },
  { name: 'Marker', colors: ['#D5D8DC', '#E3C9B4', '#FFADAD', '#FFC98B', '#FFF475', '#B9F6A9', '#A6F0E8', '#A8D8FF', '#D9C2FF', '#FFB3DE'] },
];
export const TEXT_COLORS = TEXT_PALETTE.flatMap((r) => r.colors);
export const HIGHLIGHTS = HL_PALETTE.flatMap((r) => r.colors);
export const colourName = (c) => {
  const C = String(c || '').toUpperCase();
  for (const [rows, kind] of [[TEXT_PALETTE, ''], [HL_PALETTE, ' highlight']]) {
    for (const r of rows) { const i = r.colors.indexOf(C); if (i >= 0) return `${HUES[i]}, ${r.name.toLowerCase()}${kind}`; }
  }
  return C;
};

// Text colour and highlight carry their dark-mode versions with them, so the
// app can show them readable on a dark background (CSS picks them up).
const ToneColor = Color.extend({
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        color: {
          default: null,
          parseHTML: (el) => el.style.color?.replace(/['"]+/g, '') || null,
          renderHTML: (a) => (a.color ? { style: `color: ${a.color}; --tcd: ${darkInk(a.color)}` } : {}),
        },
      },
    }];
  },
});
const ToneHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-color') || el.style.backgroundColor,
        renderHTML: (a) => (a.color ? { 'data-color': a.color, style: `background-color: ${a.color}; color: inherit; --hld: ${darkHighlight(a.color)}` } : {}),
      },
    };
  },
});

const newTid = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const fmtDue = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

// ---- Custom nodes --------------------------------------------------------------

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { label: { default: 'important', parseHTML: (el) => el.getAttribute('data-callout') || 'important', renderHTML: (a) => ({ 'data-callout': a.label }) } };
  },
  parseHTML() { return [{ tag: 'div[data-callout]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0]; },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'callout';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'callout-label';
      head.contentEditable = 'false';
      const content = document.createElement('div');
      content.className = 'callout-body';
      dom.append(head, content);
      const paint = (n) => {
        const l = labelMap(state.config).get(n.attrs.label) || { name: n.attrs.label, color: '#6B7A85' };
        head.innerHTML = `<span class="tagdot" style="background:${esc(l.color)}"></span>${esc(l.name)}`;
        dom.style.setProperty('--callout', l.color);
        head.setAttribute('aria-label', `Callout label: ${l.name}. Change label`);
      };
      paint(node);
      head.addEventListener('click', (e) => {
        e.preventDefault();
        if (!editor.isEditable) return;
        editor.storage.callout.pick?.((label) => {
          if (!label) return;
          const pos = getPos();
          editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { ...node.attrs, label }); return true; }).run();
        });
      });
      return {
        dom,
        contentDOM: content,
        update(n) { if (n.type.name !== 'callout') return false; node = n; paint(n); return true; },
        ignoreMutation: (m) => !content.contains(m.target),
      };
    };
  },
  addStorage() { return { pick: null }; },
  addInputRules() {
    return [wrappingInputRule({ find: /^!\s$/, type: this.type, getAttributes: { label: 'important' } })];
  },
  addCommands() {
    return {
      setCallout: (attrs) => ({ commands }) => commands.wrapIn(this.name, attrs),
      toggleCallout: (attrs) => ({ commands, editor }) => (editor.isActive('callout') ? commands.lift(this.name) : commands.wrapIn(this.name, attrs)),
    };
  },
});

const PostIt = Node.create({
  name: 'postit',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { color: { default: 'yellow', parseHTML: (el) => el.getAttribute('data-postit') || 'yellow', renderHTML: (a) => ({ 'data-postit': a.color }) } };
  },
  parseHTML() { return [{ tag: 'div[data-postit]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'postit-block' }), 0]; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'postit-block';
      const paint = (n) => { const c = postitColor(n.attrs.color); dom.style.setProperty('--pi', c.bg); dom.style.setProperty('--pf', c.fold); };
      paint(node);
      return { dom, contentDOM: dom, update(n) { if (n.type.name !== 'postit') return false; paint(n); return true; } };
    };
  },
  addCommands() {
    return { togglePostIt: (attrs) => ({ commands, editor }) => (editor.isActive('postit') ? commands.lift(this.name) : commands.wrapIn(this.name, attrs)) };
  },
});

const LabelChip = Node.create({
  name: 'labelChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { label: { default: 'important', parseHTML: (el) => el.getAttribute('data-label'), renderHTML: (a) => ({ 'data-label': a.label }) } };
  },
  parseHTML() { return [{ tag: 'span[data-label]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'label-chip' })]; },
  renderText({ node }) { return labelMap(state.config).get(node.attrs.label)?.name || node.attrs.label; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'label-chip';
      dom.contentEditable = 'false';
      const paint = (n) => {
        const l = labelMap(state.config).get(n.attrs.label) || { name: n.attrs.label, color: '#6B7A85' };
        const d = labelDef(l);
        dom.innerHTML = stickerSVG(d, { w: Math.round(d.w * 0.56), h: Math.round(d.h * 0.56) });
        dom.setAttribute('role', 'img');
        dom.setAttribute('aria-label', `Label: ${l.name}`);
        dom.dataset.label = n.attrs.label;
      };
      paint(node);
      return { dom, update(n) { if (n.type.name !== 'labelChip') return false; paint(n); return true; } };
    };
  },
});

const Sticker = Node.create({
  name: 'sticker',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      pack: { default: 'marks', parseHTML: (el) => el.getAttribute('data-pack'), renderHTML: (a) => ({ 'data-pack': a.pack }) },
      key: { default: 'star', parseHTML: (el) => el.getAttribute('data-key'), renderHTML: (a) => ({ 'data-key': a.key }) },
    };
  },
  parseHTML() { return [{ tag: 'span[data-pack]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'sticker-inline' })]; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'sticker-inline';
      dom.contentEditable = 'false';
      const def = stickerDef(node.attrs.pack, node.attrs.key);
      if (def) {
        const s = 30 / Math.max(def.w, def.h);
        dom.innerHTML = stickerSVG(def, { w: Math.round(def.w * s * 1.2), h: Math.round(def.h * s * 1.2) });
        dom.setAttribute('role', 'img');
        dom.setAttribute('aria-label', def.name || 'Sticker');
      }
      return { dom };
    };
  },
});

const DueDate = Node.create({
  name: 'dueDate',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { date: { default: null, parseHTML: (el) => el.getAttribute('data-due'), renderHTML: (a) => ({ 'data-due': a.date }) } };
  },
  parseHTML() { return [{ tag: 'span[data-due]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'due-chip' })]; },
  renderText({ node }) { return node.attrs.date ? ` 📅 ${node.attrs.date}` : ''; },
  addStorage() { return { pick: null }; },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('button');
      dom.type = 'button';
      dom.className = 'due-chip';
      dom.contentEditable = 'false';
      const paint = (n) => {
        const late = n.attrs.date && n.attrs.date < new Date().toISOString().slice(0, 10);
        dom.classList.toggle('late', !!late);
        dom.textContent = `📅 ${fmtDue(n.attrs.date)}`;
        dom.setAttribute('aria-label', `Due ${fmtDue(n.attrs.date)}. Change date`);
      };
      paint(node);
      dom.addEventListener('click', (e) => {
        e.preventDefault();
        editor.storage.dueDate.pick?.(node.attrs.date, (date) => {
          const pos = getPos();
          if (date === null) editor.chain().command(({ tr }) => { tr.delete(pos, pos + 1); return true; }).run();
          else if (date) editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { date }); return true; }).run();
        });
      });
      return { dom, update(n) { if (n.type.name !== 'dueDate') return false; node = n; paint(n); return true; } };
    };
  },
});

const ImageFile = Node.create({
  name: 'imageFile',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      fileId: { default: null, parseHTML: (el) => el.getAttribute('data-file'), renderHTML: (a) => ({ 'data-file': a.fileId }) },
      w: { default: null }, h: { default: null },
    };
  },
  parseHTML() { return [{ tag: 'figure[data-file]' }]; },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes(HTMLAttributes, { class: 'rich-image' })]; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.className = 'rich-image';
      const img = document.createElement('img');
      img.alt = '';
      if (node.attrs.w && node.attrs.h) img.style.aspectRatio = `${node.attrs.w} / ${node.attrs.h}`;
      dom.appendChild(img);
      V.fileURL(node.attrs.fileId).then((u) => { if (u) img.src = u; });
      return { dom };
    };
  },
});

// Task items carry a stable id (so the Tasks screen can tick them) and the
// time they were ticked.
const TaskItemX = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tid: { default: null, parseHTML: (el) => el.getAttribute('data-tid'), renderHTML: (a) => (a.tid ? { 'data-tid': a.tid } : {}) },
      doneAt: { default: null, rendered: false },
    };
  },
}).configure({ nested: true, onReadOnlyChecked: () => true });

const TaskIds = Extension.create({
  name: 'taskIds',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('taskIds'),
      appendTransaction(trs, oldState, newState) {
        if (!trs.some((t) => t.docChanged)) return null;
        let tr = null;
        const seen = new Set();
        newState.doc.descendants((node, pos) => {
          if (node.type.name !== 'taskItem') return true;
          let { tid, checked, doneAt } = node.attrs;
          let change = false;
          if (!tid || seen.has(tid)) { tid = newTid(); change = true; }
          seen.add(tid);
          if (checked && !doneAt) { doneAt = Date.now(); change = true; }
          if (!checked && doneAt) { doneAt = null; change = true; }
          if (change) { tr = tr || newState.tr; tr.setNodeMarkup(pos, undefined, { ...node.attrs, tid, doneAt }); }
          return true;
        });
        return tr;
      },
    })];
  },
});

const ShadedCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      background: { default: null, parseHTML: (el) => el.getAttribute('data-bg'), renderHTML: (a) => (a.background ? { 'data-bg': a.background, style: `background-color:${a.background}` } : {}) },
    };
  },
});
const ShadedHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      background: { default: null, parseHTML: (el) => el.getAttribute('data-bg'), renderHTML: (a) => (a.background ? { 'data-bg': a.background, style: `background-color:${a.background}` } : {}) },
    };
  },
});

// [[Note title]] links: styled in place, and followed when tapped while reading.
const WIKI = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
const WikiLinks = Extension.create({
  name: 'wikiLinks',
  addStorage() { return { open: null }; },
  addProseMirrorPlugins() {
    const ext = this;
    return [new Plugin({
      key: new PluginKey('wikiLinks'),
      state: {
        init: (_, { doc }) => wikiDecos(doc),
        apply: (tr, old) => (tr.docChanged ? wikiDecos(tr.doc) : old),
      },
      props: {
        decorations(st) { return this.getState(st); },
        handleClick(view, pos, event) {
          const el = event.target.closest?.('[data-wl]');
          if (!el) return false;
          if (view.editable && !(event.metaKey || event.ctrlKey)) return false;
          ext.storage.open?.(el.dataset.wl);
          return true;
        },
      },
    })];
  },
});
function wikiDecos(doc) {
  const idx = titleIndex([...state.notes.values()]);
  const decos = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    WIKI.lastIndex = 0;
    let m;
    while ((m = WIKI.exec(node.text))) {
      const title = m[1].trim();
      const hit = idx.get(title.toLowerCase());
      const start = pos + m.index;
      const end = start + m[0].length;
      decos.push(Decoration.inline(start, end, { class: hit ? 'wikilink' : 'wikilink missing', 'data-wl': title }));
      // The brackets (and "Title|" before a label) hide while reading.
      decos.push(Decoration.inline(start, start + 2 + (m[2] ? m[1].length + 1 : 0), { class: 'wl-br' }));
      decos.push(Decoration.inline(end - 2, end, { class: 'wl-br' }));
    }
    return true;
  });
  return DecorationSet.create(doc, decos);
}

// "/" menu and "[[" autocomplete. The host renders the list; this plugin tracks
// what's been typed and hands over keys while the list is open.
export const suggestKey = new PluginKey('suggest');
const Suggest = Extension.create({
  name: 'suggest',
  addStorage() { return { onChange: null, onKey: null }; },
  addProseMirrorPlugins() {
    const ext = this;
    return [new Plugin({
      key: suggestKey,
      view: () => ({
        update(view) {
          const { selection } = view.state;
          let found = null;
          if (selection.empty && view.editable) {
            const $f = selection.$from;
            const before = $f.parent.textBetween(0, $f.parentOffset, null, '￼');
            let m = before.match(/(?:^|\s)\/([\w ]{0,24})$/);
            if (m && !/\s{2}/.test(m[1])) found = { kind: 'slash', query: m[1], from: selection.from - m[1].length - 1, to: selection.from };
            m = before.match(/\[\[([^\]\n]{0,40})$/);
            if (m) found = { kind: 'wiki', query: m[1], from: selection.from - m[1].length - 2, to: selection.from };
          }
          ext.storage.onChange?.(found, view);
        },
        destroy() { ext.storage.onChange?.(null); },
      }),
      props: {
        handleKeyDown(view, event) {
          return ext.storage.onKey?.(event) || false;
        },
      },
    })];
  },
});

export function extensions({ placeholder = 'Write, or type / for styles' } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'], isAllowedUri: (url) => /^(https?:|mailto:)/i.test(url), HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
    }),
    TaskList,
    TaskItemX,
    TaskIds,
    Table.configure({ resizable: false }),
    TableRow,
    ShadedHeader,
    ShadedCell,
    TextStyle,
    ToneColor,
    FontFamily,
    FontSize,
    ToneHighlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
    Callout,
    PostIt,
    LabelChip,
    Sticker,
    DueDate,
    ImageFile,
    WikiLinks,
    Suggest,
  ];
}

// ---- Markdown in, document out ---------------------------------------------------

// Turn a Markdown body (old notes, captures, Claude replies) into a document.
export function mdToDoc(md) {
  const html = mdToHtml(md || '');
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const root = tpl.content;
  // Checkbox lists become checklists.
  root.querySelectorAll('li').forEach((li) => {
    const box = li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]');
    if (!box) return;
    li.setAttribute('data-type', 'taskItem');
    li.setAttribute('data-checked', box.checked ? 'true' : 'false');
    box.remove();
    li.parentElement?.setAttribute('data-type', 'taskList');
  });
  // "> [!label]" blocks become callouts or post-its.
  const labels = state.config?.labels || [];
  root.querySelectorAll('blockquote').forEach((bq) => {
    const first = bq.firstElementChild;
    const m = first?.innerHTML.match(/^\s*\[!([\w -]+)\]\s*(<br>)?/i);
    if (!m) return;
    first.innerHTML = first.innerHTML.slice(m[0].length);
    if (!first.textContent.trim() && !first.querySelector('*')) first.remove();
    const name = m[1].trim().toLowerCase();
    const div = document.createElement('div');
    if (name === 'post-it') div.setAttribute('data-postit', 'yellow');
    else div.setAttribute('data-callout', labels.find((l) => l.name.toLowerCase() === name || l.id === name)?.id || 'important');
    while (bq.firstChild) div.appendChild(bq.firstChild);
    if (!div.children.length) div.appendChild(document.createElement('p'));
    bq.replaceWith(div);
  });
  // "📅 2026-11-08" becomes a due-date chip.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  while (walker.nextNode()) if (/📅\s?\d{4}-\d{2}-\d{2}/.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode);
  for (const t of hits) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const re = /📅\s?(\d{4}-\d{2}-\d{2})/g;
    let m;
    while ((m = re.exec(t.nodeValue))) {
      frag.append(t.nodeValue.slice(last, m.index));
      const span = document.createElement('span');
      span.setAttribute('data-due', m[1]);
      frag.append(span);
      last = m.index + m[0].length;
    }
    frag.append(t.nodeValue.slice(last));
    t.replaceWith(frag);
  }
  const div = document.createElement('div');
  div.appendChild(root.cloneNode(true));
  return generateJSON(div.innerHTML, extensions());
}

export const noteDoc = (n) => n.doc || mdToDoc(n.body || '');

// Add Markdown (from a Claude reply) to the end of a note, keeping its formatting.
export function appendMarkdown(n, md) {
  const doc = structuredClone(noteDoc(n));
  doc.content = [...(doc.content || []), ...(mdToDoc(md).content || [])];
  return { doc, body: docToMarkdown(doc, labelMap(state.config)) };
}

// ---- The editor -----------------------------------------------------------------

export function createRichEditor(el, { doc, editable = false, placeholder, onChange, onOpenLink, pickLabel, pickDate, font } = {}) {
  const editor = new Editor({
    element: el,
    extensions: extensions({ placeholder }),
    content: doc || { type: 'doc', content: [{ type: 'paragraph' }] },
    editable,
    editorProps: {
      attributes: { class: 'rich', spellcheck: 'true', autocapitalize: 'sentences' },
    },
    onUpdate: ({ editor: ed }) => onChange?.(ed.getJSON()),
  });
  editor.storage.wikiLinks.open = onOpenLink || null;
  editor.storage.callout.pick = pickLabel || null;
  editor.storage.dueDate.pick = pickDate || null;
  if (font) el.style.setProperty('--note-font', fontCss(font));
  return editor;
}

export const markdownOf = (doc) => docToMarkdown(doc, labelMap(state.config));
