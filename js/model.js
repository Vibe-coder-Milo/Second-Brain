// Note shape, regions, templates, links and search.

import { uid, firstLine } from './util.js';
import { docTasks, mdTasks } from './doc.js';
import { isDarkUI } from './theme.js';
import { FONT_IDS, TEXT_SIZES, TEXT_SIZE } from './fonts.js';

// Region colours: a dot/line colour and a darker (or lighter, at night) text colour
// that passes contrast on the map background.
export const PALETTE = {
  ochre: { light: ['#C0802F', '#8A5216'], dark: ['#D99A4A', '#E8B97E'] },
  sea: { light: ['#2F8A72', '#1F5E4F'], dark: ['#4FB396', '#8FD3BE'] },
  chart: { light: ['#4277B5', '#2B5684'], dark: ['#6B9BD6', '#A9C6EA'] },
  plum: { light: ['#8C67B0', '#63438A'], dark: ['#A889C8', '#CDB6E2'] },
  brick: { light: ['#B85558', '#8A3537'], dark: ['#D4787B', '#EBAAAC'] },
  olive: { light: ['#7C8A2F', '#556019'], dark: ['#A5B44F', '#CBD68C'] },
  teal: { light: ['#2A8C9C', '#1C5F6A'], dark: ['#4FB2C2', '#93D3DD'] },
  rose: { light: ['#B8578E', '#8A3466'], dark: ['#D27BAD', '#E9AFD0'] },
  indigo: { light: ['#5C6BC0', '#3B478F'], dark: ['#8592DA', '#B9C1EC'] },
  amber: { light: ['#B8860B', '#7D5A05'], dark: ['#D9A92E', '#ECCB7A'] },
  moss: { light: ['#4F7F3A', '#355A26'], dark: ['#78A862', '#AFCF9F'] },
  slate: { light: ['#5F7486', '#3E4F5E'], dark: ['#8EA2B3', '#BFCCD7'] },
  // Added 8 Nov 2026. Text colours pass 4.5:1 on the page in both themes (5.9 or more).
  coral: { light: ['#D0664A', '#9A4027'], dark: ['#E88B70', '#F3B9A8'] },
  tangerine: { light: ['#D77A1F', '#8F4C0B'], dark: ['#EE9B48', '#F6C48F'] },
  gold: { light: ['#A8901A', '#685807'], dark: ['#CDB33E', '#E5D485'] },
  lime: { light: ['#6E9A23', '#466510'], dark: ['#97C44A', '#C4E08F'] },
  emerald: { light: ['#2E9358', '#1B643B'], dark: ['#4FBF7E', '#94DDB2'] },
  mint: { light: ['#3A9E8A', '#22685A'], dark: ['#62C6B1', '#A5E2D5'] },
  sky: { light: ['#3C93C9', '#20628A'], dark: ['#66B4E3', '#A7D5F0'] },
  navy: { light: ['#34508F', '#223766'], dark: ['#6F8CCB', '#ADC0E6'] },
  lavender: { light: ['#8C7FC9', '#574B94'], dark: ['#ABA1E0', '#D1CBF0'] },
  magenta: { light: ['#B0469E', '#7F2C72'], dark: ['#D271C2', '#EAAFE1'] },
  cherry: { light: ['#C0394B', '#8E2333'], dark: ['#E2687A', '#F2A9B4'] },
  cocoa: { light: ['#8B5E3C', '#5F3E25'], dark: ['#B98A66', '#DCC0AA'] },
  graphite: { light: ['#5A6069', '#33383F'], dark: ['#9AA0A8', '#C9CDD2'] },
};
// Names for the colour picker, in the order it shows them (warm to cool, then greys).
export const REGION_COLOUR_NAMES = {
  cherry: 'Cherry', brick: 'Brick', coral: 'Coral', tangerine: 'Tangerine', ochre: 'Ochre', amber: 'Amber', gold: 'Gold',
  olive: 'Olive', lime: 'Lime', moss: 'Moss', emerald: 'Emerald', sea: 'Sea green', mint: 'Mint', teal: 'Teal',
  sky: 'Sky', chart: 'Chart blue', navy: 'Navy', indigo: 'Indigo', lavender: 'Lavender', plum: 'Plum', magenta: 'Magenta', rose: 'Rose',
  cocoa: 'Cocoa', slate: 'Slate', graphite: 'Graphite',
};
export const UNSORTED = { light: ['#8A96A1', '#51606C'], dark: ['#7D8C99', '#A7B4B0'] };

export const isDark = () => isDarkUI();
export function regionColors(region) {
  const p = (region && PALETTE[region.color]) || UNSORTED;
  const [dot, text] = isDark() ? p.dark : p.light;
  return { dot, text };
}

export const DEFAULT_REGIONS = [
  { id: 'career', name: 'Career', color: 'ochre', keywords: ['promotion', 'manager', 'md', 'boss', 'project', 'launch', 'rollout', 'feedback', 'review', 'appraisal', 'kpi', 'stakeholder', 'presentation', 'deck', 'team', 'meeting', 'win', 'career', 'role', 'interview', 'performance'] },
  { id: 'investing', name: 'Investing', color: 'sea', keywords: ['stock', 'stocks', 'dividend', 'reit', 'reits', 'yield', 'etf', 'sgx', 'nasdaq', 's&p', 'portfolio', 'backtest', 'valuation', 'earnings', 'eps', 'p/e', 'bond', 'bonds', 'market', 'shares', 'invest', 'ticker', 'buy', 'sell', 'momentum'] },
  { id: 'travel', name: 'Travel', color: 'chart', keywords: ['flight', 'hotel', 'ryokan', 'trip', 'itinerary', 'booking', 'check-in', 'airport', 'visa', 'travel', 'tour', 'museum', 'temple', 'beach', 'airbnb', 'train', 'jr pass', 'onsen'] },
  { id: 'ideas', name: 'Ideas & learning', color: 'plum', keywords: ['book', 'article', 'idea', 'learn', 'learning', 'course', 'podcast', 'quote', 'concept', 'framework', 'thinking', 'lesson', 'read', 'reading', 'notes'] },
  { id: 'people', name: 'People', color: 'brick', keywords: ['mentor', 'coffee', 'friend', 'birthday', 'catch up', 'catch-up', 'dinner', 'family', 'mum', 'dad', 'wife', 'husband', 'partner', 'colleague'] },
];

export const NOTE_TYPES = [
  { id: 'note', name: 'Note' },
  { id: 'highlight', name: 'Highlight' },
  { id: 'decision', name: 'Decision' },
  { id: 'idea', name: 'Idea' },
  { id: 'lesson', name: 'Lesson' },
  { id: 'question', name: 'Open question' },
  { id: 'plan', name: 'Plan' },
  { id: 'person', name: 'Person' },
  { id: 'reference', name: 'Reference' },
];
export const typeName = (id) => NOTE_TYPES.find((t) => t.id === id)?.name || 'Note';

export const TEMPLATES = {
  highlight: '## What happened\n\n\n## Impact\n\n\n## Skills it shows\n\n',
  decision: '## Decision\n\n\n## Why\n\n\n## What I knew at the time\n\n\n## Revisit when\n\n',
  person: '## Who they are\n\n\n## What they care about\n\n\n## Last time we spoke\n\n',
  question: '## The question\n\n\n## What I know so far\n\n',
};

// Labels are stickers you can search by. Colours match the sticker library.
export const DEFAULT_LABELS = [
  { id: 'important', name: 'Important', color: '#B0413E' },
  { id: 'follow-up', name: 'Follow up', color: '#C0802F' },
  { id: 'idea', name: 'Idea', color: '#8C67B0' },
  { id: 'decision', name: 'Decision', color: '#1B2A38' },
  { id: 'question', name: 'Question', color: '#2B5684' },
  { id: 'deadline', name: 'Deadline', color: '#D0452F' },
  { id: 'done', name: 'Done', color: '#2F8A72' },
  { id: 'waiting', name: 'Waiting', color: '#6B7A85' },
];
export const LABEL_COLORS = ['#B0413E', '#D0452F', '#C0802F', '#E0A526', '#7C8A2F', '#2F8A72', '#2A8C9C', '#4277B5', '#2B5684', '#8C67B0', '#B8578E', '#6B7A85', '#1B2A38'];
export const labelMap = (config) => new Map((config?.labels || []).map((l) => [l.id, l]));

export const SOURCE_LABEL = {
  thought: 'Thought',
  screenshot: 'Screenshot',
  photo: 'Photo',
  link: 'Link',
  chat: 'From a Claude chat',
  pdf: 'Imported PDF',
  scan: 'Scan',
  daily: 'Daily note',
  claude: 'From Claude',
  conflict: 'Sync conflict copy',
};

export function newNote(fields = {}) {
  const now = Date.now();
  return normNote({ id: uid('n'), createdAt: now, updatedAt: now, ...fields });
}

export function normNote(n) {
  const kind = n.kind === 'ink' || n.kind === 'board' ? n.kind : 'note';
  const paged = kind === 'ink' || kind === 'board';
  return {
    id: n.id,
    kind,
    title: n.title || '',
    titleAuto: n.titleAuto ?? !n.title,
    body: n.body || '',
    type: n.type || 'note',
    source: n.source || null,
    region: n.region || null,
    suggestedRegion: n.suggestedRegion || null,
    inbox: n.inbox ?? !n.region,
    sealed: !!n.sealed,
    tags: Array.isArray(n.tags) ? n.tags : [],
    links: Array.isArray(n.links) ? [...new Set(n.links)] : [],
    suggested: Array.isArray(n.suggested) ? n.suggested : [],
    dismissed: Array.isArray(n.dismissed) ? n.dismissed : [],
    files: Array.isArray(n.files) ? n.files : [],
    url: n.url || null,
    chat: n.chat || null,
    sealSuggested: !!n.sealSuggested,
    doc: n.doc && typeof n.doc === 'object' ? n.doc : null,
    font: n.font || null,
    notebook: n.notebook || null,
    section: n.section || null,
    parent: n.parent || null,
    order: Number.isFinite(n.order) ? n.order : (n.createdAt || 0),
    pages: paged && Array.isArray(n.pages) ? n.pages.map(normPage) : [],
    pageTomb: paged && Array.isArray(n.pageTomb) ? n.pageTomb : [],
    labels: Array.isArray(n.labels) ? n.labels : [],
    tasks: kind === 'ink' && Array.isArray(n.tasks) ? n.tasks : [],
    daily: n.daily || null,
    recordings: Array.isArray(n.recordings) ? n.recordings : [],
    props: n.props && typeof n.props === 'object' ? n.props : {},
    pdfText: kind === 'ink' && n.pdfText ? String(n.pdfText) : '',
    layers: kind === 'ink' && Array.isArray(n.layers) ? n.layers : null,
    exportAllLayers: kind === 'ink' && !!n.exportAllLayers,
    hw: kind === 'ink' && n.hw && typeof n.hw === 'object' ? n.hw : {},
    layout: kind === 'ink' && n.layout === 'scroll' ? 'scroll' : 'pages',
    // Pages with highlighter marks (null: not worked out yet; see highlights.js).
    hlPages: kind === 'ink' && Array.isArray(n.hlPages) ? n.hlPages : null,
    hlCount: kind === 'ink' && Number.isFinite(n.hlCount) ? n.hlCount : null, // highlights (grouped as on the Highlights screen)
    editedOn: n.editedOn || null,
    // In Recently deleted since this time (and deleted with these others).
    binnedAt: Number(n.binnedAt) > 0 ? Number(n.binnedAt) : null,
    binBatch: n.binBatch || null,
    createdAt: n.createdAt || Date.now(),
    updatedAt: n.updatedAt || Date.now(),
  };
}

export const PAPERS = [
  { id: 'dotted', name: 'Dot grid' },
  { id: 'ruled', name: 'Lined' },
  { id: 'narrow', name: 'Narrow lined' },
  { id: 'grid', name: 'Squared' },
  { id: 'cornell', name: 'Cornell' },
  { id: 'blank', name: 'Blank' },
];
export const PAPER_COLORS = [
  { id: 'white', name: 'White', bg: '#FFFFFF', line: '#DCE3E9', dot: '#B9C4CE', strong: '#C3CDD6' },
  { id: 'ivory', name: 'Ivory', bg: '#FBF7EF', line: '#E7DECD', dot: '#CDBFA7', strong: '#D6C8AF' },
  { id: 'night', name: 'Dark', bg: '#1E2B38', line: '#2D3D4C', dot: '#3F5163', strong: '#3B4D5E' },
];
export const PAGE_W = 1000;
export const A4_H = 1414;

export function normPage(p) {
  return {
    id: p.id,
    paper: PAPERS.some((x) => x.id === p.paper) ? p.paper : 'dotted',
    color: PAPER_COLORS.some((x) => x.id === p.color) ? p.color : 'white',
    h: Number(p.h) > 100 ? Number(p.h) : A4_H,
    bg: p.bg || null,
    // The original PDF this page came from, and its page number there.
    pdf: p.pdf?.file && Number(p.pdf.n) >= 1 ? { file: String(p.pdf.file), n: Math.floor(Number(p.pdf.n)) } : null,
    bookmark: !!p.bookmark,
  };
}
export const newPage = (fields = {}) => normPage({ id: uid('p'), ...fields });

export function normNotebook(b) {
  return {
    id: b.id,
    kind: 'notebook',
    title: b.title || 'Untitled notebook',
    region: b.region || null,
    cover: { style: 'contour', color: '#2B5684', photo: null, titleStyle: 'printed', ...(b.cover || {}) },
    paper: b.paper || 'dotted',
    paperColor: b.paperColor || 'white',
    sealed: !!b.sealed,
    sections: Array.isArray(b.sections) && b.sections.length ? b.sections : [{ id: 's_notes', name: 'Notes' }],
    order: Number.isFinite(b.order) ? b.order : (b.createdAt || 0),
    binnedAt: Number(b.binnedAt) > 0 ? Number(b.binnedAt) : null,
    binBatch: b.binBatch || null,
    createdAt: b.createdAt || Date.now(),
    updatedAt: b.updatedAt || Date.now(),
  };
}
export const newNotebook = (fields = {}) => {
  const now = Date.now();
  return normNotebook({ id: uid('b'), createdAt: now, updatedAt: now, sections: [{ id: uid('s'), name: 'Notes' }], ...fields });
};

// Every task in a note: typed checklists, Markdown checkboxes, and checklists in
// text boxes on handwritten pages (summarised on the note when the page saves).
export function noteTasks(n) {
  if (n.kind === 'ink') return n.tasks || [];
  if (n.doc) return docTasks(n.doc);
  return mdTasks(n.body);
}

export function deviceLabel() {
  const ua = navigator.userAgent || '';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Computer';
}

// Notes whose content lives in page files (handwriting and whiteboards).
export const hasPages = (n) => n?.kind === 'ink' || n?.kind === 'board';
export const kindName = (n) => (n?.kind === 'ink' ? 'Handwritten' : n?.kind === 'board' ? 'Whiteboard' : 'Typed');

export function displayTitle(n) {
  if (n.title) return n.title;
  const fromBody = firstLine(n.body);
  if (fromBody) return fromBody;
  const ocr = n.files?.find((f) => f.ocr)?.ocr;
  if (ocr) return firstLine(ocr);
  if (n.kind === 'ink') return 'Handwritten note';
  if (n.kind === 'board') return 'Whiteboard';
  return `${SOURCE_LABEL[n.source] || 'Note'}`;
}

export function noteText(n) {
  return [n.title, n.body, ...(n.files || []).map((f) => f.ocr || ''), ...(n.recordings || []).map((r) => r.transcript?.text || ''), ...Object.values(n.props || {}).flat().map((v) => (typeof v === 'string' ? v : '')), (n.tags || []).join(' '), n.url || '', n.chat?.title || ''].join('\n');
}

// [[Title]] or [[Title|label]] links inside a note body.
export function wikiTitles(body) {
  const out = [];
  const re = /\[\[([^\]|\n]+)(?:\|[^\]\n]+)?\]\]/g;
  let m;
  while ((m = re.exec(body || ''))) out.push(m[1].trim());
  return out;
}

export function titleIndex(notes) {
  const idx = new Map();
  for (const n of notes) {
    const t = displayTitle(n).toLowerCase();
    if (!idx.has(t)) idx.set(t, n);
  }
  return idx;
}

// All undirected links: explicit links + resolved wikilinks.
export function computeLinks(notesMap) {
  const notes = [...notesMap.values()];
  const idx = titleIndex(notes);
  const edges = new Map(); // key "a|b" sorted
  const add = (a, b) => {
    if (!a || !b || a === b || !notesMap.has(a) || !notesMap.has(b)) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    edges.set(key, [a, b]);
  };
  for (const n of notes) {
    for (const l of n.links) add(n.id, l);
    for (const t of wikiTitles(n.body)) {
      const target = idx.get(t.toLowerCase());
      if (target) add(n.id, target.id);
    }
  }
  const neighbours = new Map();
  for (const [a, b] of edges.values()) {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a).add(b);
    neighbours.get(b).add(a);
  }
  return { edges: [...edges.values()], neighbours };
}

export function suggestedEdges(notesMap) {
  const out = [];
  const seen = new Set();
  for (const n of notesMap.values()) {
    for (const s of n.suggested) {
      if (!notesMap.has(s.id) || n.links.includes(s.id) || n.dismissed.includes(s.id)) continue;
      const key = n.id < s.id ? `${n.id}|${s.id}` : `${s.id}|${n.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([n.id, s.id]);
    }
  }
  return out;
}

// Cheap local guess at a region, used for "File in" chips in the inbox.
export function guessRegions(note, regions, max = 2) {
  const text = ' ' + noteText(note).toLowerCase().replace(/[^a-z0-9&/\- ]+/g, ' ') + ' ';
  const scores = regions.map((r) => {
    let s = 0;
    for (const k of r.keywords || []) if (text.includes(` ${k} `) || text.includes(` ${k}s `)) s += 1;
    if (text.includes(` ${r.name.toLowerCase()} `)) s += 2;
    return { r, s };
  });
  return scores.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.r);
}

export function searchNotes(notes, q, limit = 200) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const res = [];
  for (const n of notes) {
    const title = displayTitle(n).toLowerCase();
    const text = noteText(n).toLowerCase();
    let score = 0;
    let all = true;
    for (const t of terms) {
      if (title.includes(t)) score += 5;
      else if (text.includes(t)) score += 1;
      else { all = false; break; }
    }
    if (all) res.push({ n, score: score + (n.updatedAt / 1e13) });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.n);
}

// Default text: the font, size and colour new typed text starts with (in
// typed notes and in text boxes on handwritten pages). Chosen in Settings and
// synced, so every device writes the same way. Font null = the usual one
// (Spectral in typed notes, Overpass in text boxes); colour null = the app's ink.
// Colours offered for default text: dark enough to read on white paper (and
// shown brightened in dark mode).
export const TEXT_DEFAULT_COLORS = [
  ['Ink black', '#16191D'], ['Chart blue', '#2B5684'], ['Royal blue', '#2E5BD8'], ['Deep teal', '#1F6467'], ['Forest green', '#2F6B4F'],
  ['Brown', '#6B4A3A'], ['Deep red', '#9B2C2C'], ['Plum', '#5E3F8A'], ['Berry', '#8A2F64'], ['Slate grey', '#3F4650'],
];
export const DEFAULT_TEXT = { font: null, size: TEXT_SIZE, color: null };
export function normText(t) {
  const size = Number(t?.size);
  const color = typeof t?.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color.toUpperCase() : null;
  return {
    font: FONT_IDS.includes(t?.font) ? t.font : null,
    size: TEXT_SIZES.includes(size) ? size : DEFAULT_TEXT.size,
    color,
  };
}

export function defaultConfig() {
  return { regions: DEFAULT_REGIONS.map((r) => ({ ...r })), labels: DEFAULT_LABELS.map((l) => ({ ...l })), myStickers: [], favColors: null, text: { ...DEFAULT_TEXT }, lastSweepAt: null, createdAt: Date.now() };
}
export function normConfig(c) {
  const d = defaultConfig();
  return {
    ...d,
    ...c,
    regions: Array.isArray(c?.regions) && c.regions.length ? c.regions : d.regions,
    labels: Array.isArray(c?.labels) ? c.labels : d.labels,
    myStickers: Array.isArray(c?.myStickers) ? c.myStickers : [],
    text: normText(c?.text),
  };
}
