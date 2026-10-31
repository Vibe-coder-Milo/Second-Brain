// Helpers for typed-note documents (the editor's JSON), usable without loading
// the editor itself: Markdown mirror, plain text, tasks, labels and outline.
//
// A typed note keeps its rich document in `doc`. `body` always holds a Markdown
// copy, which is what search, links, Claude requests and exports read.

const DUE_RE = /📅\s?(\d{4}-\d{2}-\d{2})/;

export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function walk(node, fn, parents = []) {
  if (!node) return;
  if (fn(node, parents) === false) return;
  for (const c of node.content || []) walk(c, fn, [...parents, node]);
}

// ---- Inline -----------------------------------------------------------------

function inlineText(node, { md = false, labels = null } = {}) {
  let out = '';
  for (const c of node.content || []) {
    if (c.type === 'text') out += md ? markText(c) : c.text;
    else if (c.type === 'hardBreak') out += md ? '  \n' : '\n';
    else if (c.type === 'labelChip') {
      const name = labels?.get(c.attrs?.label)?.name || c.attrs?.name || c.attrs?.label || 'label';
      out += md ? `#${name.replace(/\s+/g, '-')}` : name;
    } else if (c.type === 'dueDate') { if (c.attrs?.date) out = `${out.replace(/\s*$/, out ? ' ' : '')}📅 ${c.attrs.date}`; }
    else if (c.type === 'sticker') out += '';
    else if (c.content) out += inlineText(c, { md, labels });
  }
  return out;
}

function markText(t) {
  let s = t.text;
  const marks = (t.marks || []).map((m) => m.type);
  if (!s.trim()) return s;
  if (marks.includes('code')) s = `\`${s}\``;
  if (marks.includes('bold')) s = `**${s}**`;
  if (marks.includes('italic')) s = `*${s}*`;
  if (marks.includes('strike')) s = `~~${s}~~`;
  if (marks.includes('highlight')) s = `==${s}==`;
  const link = (t.marks || []).find((m) => m.type === 'link');
  if (link?.attrs?.href) s = `[${s}](${link.attrs.href})`;
  return s;
}

// ---- Markdown mirror --------------------------------------------------------

export function docToMarkdown(doc, labels = null) {
  if (!doc) return '';
  const blocks = (doc.content || []).map((b) => blockMd(b, '', labels)).filter((x) => x !== null);
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function blockMd(b, indent, labels) {
  const o = { md: true, labels };
  switch (b.type) {
    case 'paragraph': return indent + inlineText(b, o);
    case 'heading': return `${'#'.repeat(b.attrs?.level || 1)} ${inlineText(b, o)}`;
    case 'horizontalRule': return '---';
    case 'codeBlock': return `\`\`\`\n${inlineText(b)}\n\`\`\``;
    case 'blockquote': return (b.content || []).map((c) => blockMd(c, '', labels)).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n');
    case 'callout': {
      const name = labels?.get(b.attrs?.label)?.name || b.attrs?.label || 'note';
      const inner = (b.content || []).map((c) => blockMd(c, '', labels)).join('\n\n');
      return [`> [!${name.toLowerCase()}]`, ...inner.split('\n').map((l) => `> ${l}`)].join('\n');
    }
    case 'postit': {
      const inner = (b.content || []).map((c) => blockMd(c, '', labels)).join('\n\n');
      return ['> [!post-it]', ...inner.split('\n').map((l) => `> ${l}`)].join('\n');
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': return listMd(b, indent, labels);
    case 'table': return tableMd(b, labels);
    case 'imageFile': return '![image]()';
    default: return b.content ? (b.content || []).map((c) => blockMd(c, indent, labels)).join('\n\n') : null;
  }
}

function listMd(list, indent, labels) {
  const lines = [];
  let n = list.attrs?.start || 1;
  for (const item of list.content || []) {
    const bullet = list.type === 'orderedList' ? `${n++}. ` : list.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : '- ';
    const [first, ...rest] = item.content || [];
    lines.push(`${indent}${bullet}${first ? inlineText(first, { md: true, labels }) : ''}`);
    const sub = indent + ' '.repeat(list.type === 'orderedList' ? bullet.length : 2);
    for (const r of rest) {
      if (['bulletList', 'orderedList', 'taskList'].includes(r.type)) lines.push(listMd(r, sub, labels));
      else lines.push(`${sub}${blockMd(r, '', labels)}`);
    }
  }
  return lines.join('\n');
}

function tableMd(t, labels) {
  const rows = (t.content || []).map((row) => (row.content || []).map((cell) => (cell.content || []).map((p) => inlineText(p, { md: true, labels })).join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ')));
  if (!rows.length) return '';
  const w = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(w - r.length).fill('')];
  const out = [`| ${pad(rows[0]).join(' | ')} |`, `| ${Array(w).fill('---').join(' | ')} |`];
  for (const r of rows.slice(1)) out.push(`| ${pad(r).join(' | ')} |`);
  return out.join('\n');
}

// ---- Plain text, outline, labels -------------------------------------------

export function docPlainText(doc, labels = null) {
  if (!doc) return '';
  const out = [];
  walk(doc, (n) => {
    if (['paragraph', 'heading', 'codeBlock'].includes(n.type)) { out.push(inlineText(n, { labels })); return false; }
    return true;
  });
  return out.filter(Boolean).join('\n');
}

export function docOutline(doc) {
  const out = [];
  let i = 0;
  for (const b of doc?.content || []) {
    if (b.type === 'heading') out.push({ level: b.attrs?.level || 1, text: inlineText(b), index: i++ });
  }
  return out;
}

// Label chips, with the text of the block each one sits in.
export function docLabels(doc) {
  const out = [];
  walk(doc, (n, parents) => {
    if (n.type === 'labelChip' && n.attrs?.label) {
      const block = [...parents].reverse().find((p) => ['paragraph', 'heading'].includes(p.type));
      out.push({ l: n.attrs.label, ctx: block ? inlineText(block).trim() : '' });
    }
    if (n.type === 'callout' && n.attrs?.label) {
      out.push({ l: n.attrs.label, ctx: docPlainText({ content: n.content || [] }).split('\n')[0] || '' });
    }
    return true;
  });
  return out;
}

// ---- Tasks ------------------------------------------------------------------

export function docTasks(doc) {
  const out = [];
  let idx = 0;
  walk(doc, (n) => {
    if (n.type === 'taskItem') {
      const first = (n.content || [])[0];
      let due = null;
      walk(first, (c) => { if (c.type === 'dueDate' && c.attrs?.date) due = c.attrs.date; return true; });
      const text = first ? inlineText(first).replace(DUE_RE, '').trim() : '';
      out.push({ tid: n.attrs?.tid || `i${idx}`, text, checked: !!n.attrs?.checked, due, doneAt: n.attrs?.doneAt || null });
      idx++;
    }
    return true;
  });
  return out;
}

function findTask(doc, tid) {
  let found = null;
  let idx = 0;
  walk(doc, (n) => {
    if (found) return false;
    if (n.type === 'taskItem') {
      if ((n.attrs?.tid || `i${idx}`) === tid) found = n;
      idx++;
    }
    return true;
  });
  return found;
}

export function setTaskChecked(doc, tid, checked) {
  const d = structuredClone(doc);
  const t = findTask(d, tid);
  if (t) t.attrs = { ...t.attrs, checked, doneAt: checked ? Date.now() : null };
  return d;
}

export function setTaskDue(doc, tid, date) {
  const d = structuredClone(doc);
  const t = findTask(d, tid);
  if (!t) return d;
  const first = t.content?.[0];
  if (!first) return d;
  first.content = (first.content || []).filter((c) => c.type !== 'dueDate');
  // drop trailing spaces left behind
  const last = first.content[first.content.length - 1];
  if (last?.type === 'text') last.text = last.text.replace(/\s+$/, '');
  if (!last || last.type !== 'text' || last.text === '') first.content = first.content.filter((c) => !(c.type === 'text' && c.text === ''));
  if (date) first.content.push({ type: 'text', text: ' ' }, { type: 'dueDate', attrs: { date } });
  return d;
}

export function taskNode(text, due = null, tid = null) {
  const inline = [];
  if (text) inline.push({ type: 'text', text });
  if (due) inline.push({ type: 'text', text: ' ' }, { type: 'dueDate', attrs: { date: due } });
  return { type: 'taskItem', attrs: { checked: false, tid: tid || `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, doneAt: null }, content: [{ type: 'paragraph', content: inline }] };
}

export function appendTask(doc, text, due = null) {
  const d = structuredClone(doc || { type: 'doc', content: [] });
  d.content = d.content || [];
  const last = d.content[d.content.length - 1];
  if (last?.type === 'taskList') last.content.push(taskNode(text, due));
  else {
    if (last?.type === 'paragraph' && !(last.content || []).length) d.content.pop();
    d.content.push({ type: 'taskList', content: [taskNode(text, due)] });
  }
  return d;
}

// Tasks written as Markdown checkboxes in notes that have no rich document.
const MD_TASK = /^(\s*[-*] \[)( |x|X)(\] )(.*)$/;
export function mdTasks(body) {
  const out = [];
  String(body || '').split('\n').forEach((line, i) => {
    const m = line.match(MD_TASK);
    if (!m) return;
    const due = (m[4].match(DUE_RE) || [])[1] || null;
    out.push({ tid: `L${i}`, text: m[4].replace(DUE_RE, '').trim(), checked: m[2] !== ' ', due, doneAt: null });
  });
  return out;
}
export function mdSetTask(body, tid, { checked, due } = {}) {
  const lines = String(body || '').split('\n');
  const i = Number(tid.slice(1));
  const m = lines[i]?.match(MD_TASK);
  if (!m) return body;
  let text = m[4];
  if (due !== undefined) text = `${text.replace(DUE_RE, '').trimEnd()}${due ? ` 📅 ${due}` : ''}`;
  lines[i] = `${m[1]}${checked === undefined ? m[2] : checked ? 'x' : ' '}${m[3]}${text}`;
  return lines.join('\n');
}

export const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });
