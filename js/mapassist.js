// The map assistant. On this device, without being asked, it:
//  - draws "related" lines between notes that mean similar things
//    (mapdata.js), which you can keep as links or dismiss with a tap;
//  - files new notes and adds regions (organiser.js);
//  - notices a few patterns worth a look (below).

import { state } from './vault.js';
import * as V from './vault.js';
import { connections, titleOf, themes } from './mapdata.js';

const STRONG = new Set(['link', 'sub', 'board']);
const listOf = (ids) => {
  const t = ids.map(titleOf).filter(Boolean);
  if (t.length <= 2) return t.join(' and ');
  return `${t[0]}, ${t[1]} and ${t.length - 2} more`;
};
const regionName = (id) => state.config.regions.find((r) => r.id === id)?.name || null;

// A few things worth a look: [{ id, text, ids, action? }]
export function noticed(max = 4) {
  const { edges } = connections();
  const strongN = new Map();
  const allN = new Map();
  const relN = new Map();
  const put = (m, a, b) => { if (!m.has(a)) m.set(a, new Set()); if (!m.has(b)) m.set(b, new Set()); m.get(a).add(b); m.get(b).add(a); };
  for (const e of edges) {
    if (e.kind === 'label') continue;
    put(allN, e.a, e.b);
    if (STRONG.has(e.kind)) put(strongN, e.a, e.b);
    if (e.kind === 'related') put(relN, e.a, e.b);
  }
  const out = [];

  // 1. Notes that mean similar things but aren't linked: groups of 3 or more.
  const seen = new Set();
  const groups = [];
  for (const id of relN.keys()) {
    if (seen.has(id)) continue;
    const comp = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const x = stack.pop();
      comp.push(x);
      for (const y of relN.get(x) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
    }
    if (comp.length >= 3) groups.push(comp);
  }
  groups.sort((a, b) => b.length - a.length);
  for (const gIds of groups.slice(0, 2)) {
    out.push({ id: `group:${gIds.slice().sort()[0]}`, kind: 'group', text: `${gIds.length} notes seem to belong together: ${listOf(gIds)}.`, ids: gIds, action: { name: 'Link them', run: () => linkGroup(gIds) } });
  }

  // 1b. A theme inside a region, named for you.
  const th = themes(edges).sort((a, b) => b.ids.length - a.ids.length)[0];
  if (th) out.push({ id: `theme:${th.region}:${th.name}`, kind: 'theme', text: `A theme in ${regionName(th.region)}: ${th.name} (${th.ids.length} notes).`, ids: th.ids });

  // 2. Bridges: a note that ties regions together (through links you made).
  const bridges = [];
  for (const [id, ns] of strongN) {
    const n = state.notes.get(id);
    if (!n || n.inbox) continue;
    const other = new Set([...ns].map((x) => state.notes.get(x)).filter((o) => o && !o.inbox && o.region && o.region !== n.region).map((o) => o.region));
    if (other.size >= 1 && ns.size >= 2) bridges.push({ id, regions: [n.region, ...other].map(regionName).filter(Boolean), score: other.size * 10 + ns.size });
  }
  bridges.sort((a, b) => b.score - a.score);
  if (bridges[0] && bridges[0].regions.length >= 2) {
    const b = bridges[0];
    const r = b.regions;
    out.push({ id: `bridge:${b.id}`, kind: 'bridge', text: `${titleOf(b.id)} ties ${r.length > 2 ? `${r.slice(0, -1).join(', ')} and ${r[r.length - 1]}` : `${r[0]} and ${r[1]}`} together.`, ids: [b.id, ...strongN.get(b.id)] });
  }

  // 3. Your most connected note.
  let hub = null;
  for (const [id, ns] of strongN) if (!hub || ns.size > hub.n) hub = { id, n: ns.size };
  if (hub && hub.n >= 3) out.push({ id: `hub:${hub.id}`, kind: 'hub', text: `${titleOf(hub.id)} is your most connected note (${hub.n} links).`, ids: [hub.id, ...strongN.get(hub.id)] });

  // 4. Notes connected to nothing yet.
  const loners = [...state.notes.values()].filter((n) => !allN.has(n.id) && !n.sealed).map((n) => n.id);
  if (loners.length >= 2) out.push({ id: 'loners', kind: 'loners', text: `${loners.length} notes aren't connected to anything yet.`, ids: loners });

  return out.slice(0, max);
}

// Link a group of related notes to the one at its centre.
export async function linkGroup(ids) {
  const { edges } = connections();
  const deg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) if (e.kind === 'related' && deg.has(e.a) && deg.has(e.b)) { deg.set(e.a, deg.get(e.a) + 1); deg.set(e.b, deg.get(e.b) + 1); }
  const centre = [...deg].sort((a, b) => b[1] - a[1])[0][0];
  for (const id of ids) if (id !== centre) await V.linkNotes(centre, id);
  return centre;
}

export const keepRelated = (a, b) => V.linkNotes(a, b);

// "Not related": the assistant stops drawing that line.
export async function notRelated(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const n = state.notes.get(x);
    if (n && !n.dismissed.includes(y)) await V.saveNote({ ...n, dismissed: [...n.dismissed, y], suggested: n.suggested.filter((s) => s.id !== y) }, { touch: false });
  }
}

// ---- The week on your map ----------------------------------------------------------

const DAY = 86400000;
// What changed on the map in the last 7 days, in a few short lines (for Today).
export function weekDigest(now = Date.now()) {
  const since = now - 7 * DAY;
  const notes = [...state.notes.values()];
  const fresh = notes.filter((n) => (n.createdAt || 0) >= since);
  const touched = notes.filter((n) => (n.updatedAt || 0) >= since);
  if (!fresh.length && !touched.length) return null;
  const byRegion = new Map();
  for (const n of fresh) { const k = n.inbox ? null : n.region; byRegion.set(k, (byRegion.get(k) || 0) + 1); }
  const top = [...byRegion].filter(([k]) => k).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, c]) => `${c} in ${regionName(k)}`);
  const inbox = byRegion.get(null) || 0;
  const log = (state.device?.organiserLog || []).filter((e) => e.at >= since);
  const madeRegions = [...new Set(log.filter((e) => e.created).map((e) => regionName(e.created)).filter(Boolean))];
  const filedByAssistant = log.filter((e) => e.by === 'organiser' && !e.link).length;
  const linkedByAssistant = log.filter((e) => e.link).length;
  const { edges } = connections();
  const freshIds = new Set(fresh.map((n) => n.id));
  const newLinks = edges.filter((e) => (e.kind === 'link' || e.kind === 'sub' || e.kind === 'board') && (freshIds.has(e.a) || freshIds.has(e.b))).length;
  const newRelated = edges.filter((e) => e.kind === 'related' && (freshIds.has(e.a) || freshIds.has(e.b))).length;
  const lines = [];
  if (fresh.length) lines.push(`${fresh.length} new note${fresh.length === 1 ? '' : 's'}${top.length ? `: ${top.join(', ')}` : ''}${inbox ? `${top.length ? ', ' : ': '}${inbox} still in the inbox` : ''}.`);
  else lines.push(`${touched.length} note${touched.length === 1 ? '' : 's'} worked on, nothing new.`);
  if (madeRegions.length) lines.push(`New region${madeRegions.length === 1 ? '' : 's'} on your map: ${madeRegions.join(', ')}.`);
  if (newLinks || newRelated) lines.push(`${newLinks ? `${newLinks} new link${newLinks === 1 ? '' : 's'}` : ''}${newLinks && newRelated ? ' and ' : ''}${newRelated ? `${newRelated} related note${newRelated === 1 ? '' : 's'} found for you` : ''}.`.replace(/^./, (c) => c.toUpperCase()));
  if (filedByAssistant || linkedByAssistant) lines.push(`The assistant ${filedByAssistant ? `filed ${filedByAssistant} note${filedByAssistant === 1 ? '' : 's'}` : ''}${filedByAssistant && linkedByAssistant ? ' and ' : ''}${linkedByAssistant ? `linked ${linkedByAssistant} pair${linkedByAssistant === 1 ? '' : 's'}` : ''} for you.`);
  const tip = noticed(4).find((x) => x.kind === 'group' || x.kind === 'theme' || x.kind === 'bridge');
  return { lines, tip, fresh: fresh.length };
}

// ---- Linking by itself (an option) -----------------------------------------------------

// Pairs of notes so alike they're almost certainly about the same thing.
export const AUTO_LINK_MIN = 0.5;
export const autoLinkOn = () => state.device?.autoLink === true;
export async function autoLink() {
  if (!autoLinkOn() || state.status !== 'unlocked') return 0;
  const { similarNotes } = await import('./semantic.js');
  const done = new Set();
  const made = [];
  for (const n of state.notes.values()) {
    if (n.sealed) continue;
    for (const { note: o, score } of similarNotes(n, { limit: 2, min: AUTO_LINK_MIN }) || []) {
      const k = [n.id, o.id].sort().join('|');
      if (done.has(k) || o.sealed || n.links.includes(o.id) || o.links.includes(n.id) || n.dismissed?.includes(o.id) || o.dismissed?.includes(n.id)) continue;
      done.add(k);
      made.push({ a: n.id, b: o.id, score });
    }
  }
  if (!made.length) return 0;
  for (const m of made) await V.linkNotes(m.a, m.b);
  const at = Date.now();
  const entries = made.map((m) => ({ id: `${at}-${m.a}-${m.b}`, at, link: true, note: m.a, other: m.b, title: `${titleOf(m.a)} and ${titleOf(m.b)}`, by: 'organiser' }));
  await V.updateDevice({ organiserLog: [...entries, ...(state.device?.organiserLog || [])].slice(0, 40) });
  return made.length;
}
