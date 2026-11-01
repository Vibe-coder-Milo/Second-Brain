// The organiser: puts notes on the map. It runs on this device only. It
// reads what each note means (the same small model as search by meaning),
// compares that with every region (what the region is about, and the notes
// already in it) and with common areas of life that aren't regions yet. Then
// it files the note where it fits, and adds a region when notes need a new
// home (notes about your flat → a new "Property & home" region).
// Nothing leaves the device. Every move can be undone.

import { state } from './vault.js';
import * as V from './vault.js';
import { noteText, displayTitle, PALETTE } from './model.js';

// Areas of life the organiser can add as regions. Each has a description
// (what the model compares notes with) and a few telling words.
export const AREAS = [
  { id: 'property', name: 'Property & home', examples: ['buying a condo or HDB flat', 'home loan and mortgage interest rate', 'renovating my home and contractor quotes', 'renting out my apartment to a tenant', 'property prices, stamp duty and valuation'], keywords: ['home', 'house', 'condo', 'hdb', 'bto', 'flat', 'apartment', 'mortgage', 'home loan', 'renovation', 'reno', 'landlord', 'tenant', 'tenants', 'rent', 'rental', 'property', 'interior', 'furniture', 'contractor', 'valuation', 'stamp duty', 'absd', 'resale', 'sofa', 'kitchen', 'bedroom'] },
  { id: 'money', name: 'Money & admin', examples: ['monthly budget and expenses', 'filing income tax and tax reliefs', 'bank account and credit card bills', 'insurance policy and premiums', 'savings goals and CPF contributions'], keywords: ['budget', 'expenses', 'spending', 'savings', 'bank', 'credit card', 'bill', 'bills', 'tax', 'iras', 'cpf', 'insurance', 'policy', 'premium', 'renewal', 'passport', 'documents', 'payslip', 'salary'] },
  { id: 'health', name: 'Health & fitness', examples: ['gym workout and exercise routine', 'running and marathon training', 'doctor visit and health check-up', 'sleep, diet and nutrition'], keywords: ['gym', 'run', 'running', 'workout', 'exercise', 'fitness', 'marathon', 'yoga', 'swim', 'swimming', 'sleep', 'diet', 'doctor', 'clinic', 'dentist', 'health', 'check-up', 'checkup', 'steps', 'weight', 'protein', 'training'] },
  { id: 'food', name: 'Food & cooking', examples: ['a recipe and how to cook it', 'restaurants and cafes to try', 'baking and ingredients', 'meal plan and groceries'], keywords: ['recipe', 'recipes', 'cook', 'cooking', 'bake', 'baking', 'restaurant', 'cafe', 'hawker', 'meal', 'groceries', 'grocery', 'wine', 'brunch', 'ingredients'] },
  { id: 'projects', name: 'Side projects', examples: ['coding my side project app', 'fixing a bug in my app and pushing to GitHub', 'building a website or tool', 'startup idea and prototype', 'a feature for the app I am building'], keywords: ['app', 'github', 'code', 'coding', 'repo', 'website', 'startup', 'side project', 'prototype', 'api', 'deploy', 'bug', 'feature'] },
  { id: 'hobbies', name: 'Hobbies', examples: ['photography and cameras', 'learning guitar or piano', 'video games and board games', 'gardening, drawing and crafts'], keywords: ['photography', 'camera', 'music', 'guitar', 'piano', 'game', 'games', 'gaming', 'drawing', 'painting', 'craft', 'gardening', 'plants', 'lego', 'hobby'] },
  { id: 'car', name: 'Car & transport', examples: ['buying a car and COE prices', 'car servicing and repairs', 'road tax, parking and petrol'], keywords: ['car', 'coe', 'servicing', 'road tax', 'motor', 'parking', 'erp', 'petrol', 'ev', 'charging', 'driving', 'mileage', 'workshop'] },
  { id: 'family', name: 'Family & kids', examples: ['my kids school and homework', 'tuition and enrichment classes for children', 'parenting and childcare', 'family outing with my parents'], keywords: ['kids', 'kid', 'son', 'daughter', 'school', 'tuition', 'psle', 'homework', 'childcare', 'parenting', 'baby', 'enrichment', 'preschool'] },
  { id: 'shopping', name: 'Shopping & wishlist', examples: ['things to buy and my wishlist', 'comparing gadgets before buying', 'online orders, deliveries and returns'], keywords: ['buy', 'wishlist', 'gadget', 'shopping', 'deal', 'sale', 'order', 'delivery', 'return', 'shopee', 'lazada', 'amazon'] },
  { id: 'pets', name: 'Pets', examples: ['my dog or cat', 'vet visit and pet vaccinations', 'pet food and grooming'], keywords: ['dog', 'cat', 'puppy', 'kitten', 'vet', 'grooming', 'pet', 'pets'] },
  { id: 'community', name: 'Community & giving', examples: ['volunteering and charity work', 'church or temple activities', 'donations and community events'], keywords: ['volunteer', 'volunteering', 'charity', 'donate', 'donation', 'church', 'mosque', 'community', 'cell group', 'ngo'] },
];

// What the starting regions are about, as short examples the model compares with.
const EXAMPLES = {
  career: ['my job and manager', 'performance review and promotion', 'work project and stakeholders', 'meeting and presentation at work'],
  investing: ['stocks and dividends', 'ETF and portfolio', 'REITs and valuation', 'market research and trading idea'],
  travel: ['trip itinerary and places to visit', 'flights and hotel booking', 'holiday abroad'],
  ideas: ['book notes and lessons', 'article or podcast takeaways', 'a concept or framework to learn'],
  people: ['catching up with a friend', 'birthday and relationships', 'mentor and family members'],
};
const examplesFor = (r) => EXAMPLES[r.id] || AREAS.find((a) => a.id === r.id)?.examples || [`notes about ${r.name}`, ...(r.keywords || []).slice(0, 4)];

// How sure it must be (similarity, 0 to 1). Filing into a region needs a fair
// match; adding a region needs a clear one and a lead over every region.
const FILE_AT = 0.3;
const NEW_AT = 0.32;
const LEAD = 0.04;
const SURE = 0.36; // filing without asking, when it runs by itself
const SURE_NEW = 0.38; // adding a region by itself (lower when two notes agree)

export const organiseOn = () => state.device?.organise !== false;

// ---- Vectors ------------------------------------------------------------------------

const textVec = new Map();
async function vecFor(texts) {
  const need = texts.filter((t) => !textVec.has(t));
  if (need.length) {
    const { embed } = await import('./ai.js');
    const vs = await embed(need);
    need.forEach((t, i) => textVec.set(t, Float32Array.from(vs[i])));
  }
  return texts.map((t) => textVec.get(t));
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
function unit(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map((x) => x / n); }

const words = (n) => ` ${`${displayTitle(n)} ${noteText(n)}`.toLowerCase().replace(/[^a-z0-9&/\- ]+/g, ' ')} `;
const hits = (text, keys = []) => keys.reduce((s, k) => s + (text.includes(` ${k} `) || text.includes(` ${k}s `) ? 1 : 0), 0);
const sameName = (a, b) => a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '');

// Areas that are already regions (same id or name) aren't offered again.
const freeAreas = () => AREAS.filter((a) => !state.config.regions.some((r) => r.id === a.id || sameName(r.name, a.name) || sameName(r.name.split('&')[0], a.name.split('&')[0])));

// ---- Planning ----------------------------------------------------------------------

// For each note: where it should go. [{ note, to: region | null, area: AREA | null, score, sure }]
export async function plan(notes, { allowNew = true } = {}) {
  const S = await import('./semantic.js');
  const useMeaning = S.semanticOn();
  if (useMeaning) { try { await S.buildIndex(); } catch { /* fall back to words */ } }
  const regions = state.config.regions;
  const areas = allowNew ? freeAreas() : [];
  const haveVec = useMeaning && notes.some((n) => S.noteVector(n.id));
  const exR = new Map();
  const exA = new Map();
  const centroid = new Map();
  if (haveVec) {
    const all = [...regions.map(examplesFor), ...areas.map((a) => a.examples)].flat();
    const vs = await vecFor(all);
    let i = 0;
    for (const r of regions) { const n = examplesFor(r).length; exR.set(r.id, vs.slice(i, i + n)); i += n; }
    for (const a of areas) { const n = a.examples.length; exA.set(a.id, vs.slice(i, i + n)); i += n; }
    // What's already in each region counts too.
    for (const r of regions) {
      const inIt = [...state.notes.values()].filter((n) => !n.inbox && n.region === r.id).map((n) => S.noteVector(n.id)).filter(Boolean).slice(0, 80);
      if (inIt.length >= 2) {
        const c = new Float32Array(inIt[0].length);
        for (const v of inIt) for (let k = 0; k < c.length; k++) c[k] += v[k];
        centroid.set(r.id, unit(c));
      }
    }
  }
  // Best example, helped a little by the second best.
  const closeness = (v, vs) => {
    if (!v || !vs?.length) return 0.1;
    const s = vs.map((e) => dot(v, e)).sort((a, b) => b - a);
    return 0.6 * s[0] + 0.4 * (s[1] ?? s[0]);
  };
  const out = [];
  for (const n of notes) {
    const w = words(n);
    const v = haveVec ? S.noteVector(n.id) : null;
    const kw = (keys) => Math.min(0.12, hits(w, keys) * 0.04);
    let best = null;
    for (const r of regions) {
      const c = centroid.get(r.id);
      const s = Math.max(closeness(v, exR.get(r.id)), c && v ? dot(v, c) - 0.02 : 0) + kw(r.keywords) + (w.includes(` ${r.name.toLowerCase()} `) ? 0.05 : 0);
      if (!best || s > best.s) best = { r, s };
    }
    let bestA = null;
    for (const a of areas) {
      const s = closeness(v, exA.get(a.id)) + kw(a.keywords);
      if (!bestA || s > bestA.s) bestA = { a, s };
    }
    const fileAt = v ? FILE_AT : 0.18;
    const newAt = v ? NEW_AT : 0.22;
    if (bestA && bestA.s >= newAt && bestA.s > (best?.s || 0) + LEAD) {
      out.push({ note: n, to: null, area: bestA.a, score: bestA.s, sure: bestA.s >= SURE_NEW });
    } else if (best && best.s >= fileAt) {
      if (best.r.id === n.region && !n.inbox) continue; // already there
      out.push({ note: n, to: best.r, area: null, score: best.s, sure: best.s >= SURE });
    }
  }
  // Two or more notes pointing at the same new area make it surer.
  const perArea = new Map();
  for (const p of out) if (p.area) perArea.set(p.area.id, (perArea.get(p.area.id) || 0) + 1);
  for (const p of out) if (p.area && perArea.get(p.area.id) >= 2) p.sure = p.sure || p.score >= NEW_AT;
  return out;
}

// ---- Doing it ----------------------------------------------------------------------

const LOG_MAX = 40;
export const organiserLog = () => state.device?.organiserLog || [];

function nextColour() {
  const used = new Set(state.config.regions.map((r) => r.color));
  return Object.keys(PALETTE).find((k) => !used.has(k)) || Object.keys(PALETTE)[state.config.regions.length % Object.keys(PALETTE).length];
}

// File notes as planned, adding any new regions first. Returns what happened.
export async function apply(plans, { by = 'you' } = {}) {
  const created = [];
  let regions = [...state.config.regions];
  const regionFor = (p) => {
    if (p.to) return p.to.id;
    let r = regions.find((x) => x.id === p.area.id || sameName(x.name, p.area.name));
    if (!r) {
      const used = new Set(regions.map((x) => x.color));
      const color = Object.keys(PALETTE).find((k) => !used.has(k)) || nextColour();
      r = { id: regions.some((x) => x.id === p.area.id) ? `${p.area.id}_${Date.now().toString(36)}` : p.area.id, name: p.area.name, color, keywords: p.area.keywords.slice(0, 20), madeBy: 'organiser' };
      regions.push(r);
      created.push(r);
    }
    return r.id;
  };
  const moves = plans.map((p) => ({ p, rid: regionFor(p) }));
  if (created.length) await V.saveConfig({ regions });
  const at = Date.now();
  const log = [];
  const changed = [];
  for (const { p, rid } of moves) {
    const n = state.notes.get(p.note.id);
    if (!n) continue;
    log.push({ id: `${at}-${n.id}`, at, note: n.id, title: displayTitle(n), from: { region: n.region || null, inbox: !!n.inbox }, to: rid, created: created.some((r) => r.id === rid) ? rid : null, by });
    changed.push({ ...n, region: rid, inbox: false, suggestedRegion: null });
  }
  if (changed.length) await V.saveNotes(changed);
  if (log.length) await V.updateDevice({ organiserLog: [...log, ...organiserLog()].slice(0, LOG_MAX) });
  return { filed: changed.length, created };
}

// Put a note back where it was. Removes a region the organiser added if it's
// now empty.
export async function undo(entryId) {
  const log = organiserLog();
  const e = log.find((x) => x.id === entryId);
  if (!e) return false;
  const n = state.notes.get(e.note);
  if (n && n.region === e.to) await V.saveNote({ ...n, region: e.from.region, inbox: e.from.inbox }, { touch: false });
  const rest = log.filter((x) => x.id !== entryId);
  await V.updateDevice({ organiserLog: rest });
  const made = e.created || (state.config.regions.find((r) => r.id === e.to)?.madeBy === 'organiser' ? e.to : null);
  if (made && ![...state.notes.values()].some((x) => x.region === made && !x.inbox) && ![...state.notebooks.values()].some((b) => b.region === made)) {
    await V.saveConfig({ regions: state.config.regions.filter((r) => r.id !== made) });
  }
  return true;
}

// ---- Running by itself -------------------------------------------------------------

// Inbox notes that have settled (not just captured, not open) are filed when
// the organiser is sure. It never moves notes you've already filed.
let timer = null;
let running = false;
// The note on screen now (being written, or open beside the map).
function openNoteId() {
  const h = location.hash;
  const m = /#\/note\/([^?&/]+)/.exec(h) || /[?&]note=([^&]+)/.exec(h);
  return m ? decodeURIComponent(m[1]) : null;
}
export function autoSoon(delay = 15000) {
  clearTimeout(timer);
  if (!organiseOn()) return;
  timer = setTimeout(() => { autoRun().catch((e) => console.warn('organiser', e)); }, delay);
}
export async function autoRun() {
  if (running || !organiseOn() || state.status !== 'unlocked') return null;
  const now = Date.now();
  const open = openNoteId();
  const todo = [...state.notes.values()].filter((n) => n.inbox && !n.notebook && n.id !== open && now - (n.updatedAt || 0) > 12000 && !n.files.some((f) => f.ocrStatus === 'pending'));
  if (!todo.length) return null;
  running = true;
  try {
    const plans = (await plan(todo)).filter((p) => p.sure);
    if (!plans.length) return null;
    const res = await apply(plans, { by: 'organiser' });
    const { toast } = await import('./util.js');
    const where = [...new Set(plans.map((p) => p.to?.name || p.area.name))];
    toast(res.created.length
      ? `Organiser added ${res.created.map((r) => r.name).join(', ')} to your map and filed ${res.filed} note${res.filed === 1 ? '' : 's'}`
      : `Organiser filed ${res.filed} note${res.filed === 1 ? '' : 's'} in ${where.join(', ')}`, { ms: 4500 });
    return res;
  } finally { running = false; }
}
