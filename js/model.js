// Note shape, regions, templates, links and search.

import { uid, firstLine } from './util.js';

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
};
export const UNSORTED = { light: ['#8A96A1', '#51606C'], dark: ['#7D8C99', '#A7B4B0'] };

export const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
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

export const SOURCE_LABEL = {
  thought: 'Thought',
  screenshot: 'Screenshot',
  photo: 'Photo',
  link: 'Link',
  chat: 'From a Claude chat',
  claude: 'From Claude',
  conflict: 'Sync conflict copy',
};

export function newNote(fields = {}) {
  const now = Date.now();
  return normNote({ id: uid('n'), createdAt: now, updatedAt: now, ...fields });
}

export function normNote(n) {
  return {
    id: n.id,
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
    createdAt: n.createdAt || Date.now(),
    updatedAt: n.updatedAt || Date.now(),
  };
}

export function displayTitle(n) {
  if (n.title) return n.title;
  const fromBody = firstLine(n.body);
  if (fromBody) return fromBody;
  const ocr = n.files?.find((f) => f.ocr)?.ocr;
  if (ocr) return firstLine(ocr);
  return `${SOURCE_LABEL[n.source] || 'Note'}`;
}

export function noteText(n) {
  return [n.title, n.body, ...(n.files || []).map((f) => f.ocr || ''), (n.tags || []).join(' '), n.url || '', n.chat?.title || ''].join('\n');
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

export function defaultConfig() {
  return { regions: DEFAULT_REGIONS.map((r) => ({ ...r })), lastSweepAt: null, createdAt: Date.now() };
}
export function normConfig(c) {
  const d = defaultConfig();
  return {
    ...d,
    ...c,
    regions: Array.isArray(c?.regions) && c.regions.length ? c.regions : d.regions,
  };
}
