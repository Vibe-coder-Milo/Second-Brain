// The map assistant. On this device, without being asked, it:
//  - draws "related" lines between notes that mean similar things
//    (mapdata.js), which you can keep as links or dismiss with a tap;
//  - files new notes and adds regions (organiser.js);
//  - notices a few patterns worth a look (below).

import { state } from './vault.js';
import * as V from './vault.js';
import { connections, titleOf } from './mapdata.js';

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
