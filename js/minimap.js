// A small map of one note's connections, shown inside the note: the note in
// the middle, what it connects to around it (in the same colours as the big
// map), and one step further out. Tap a dot to open that note.

import { html, raw } from './util.js';
import { state } from './vault.js';
import { displayTitle, regionColors } from './model.js';
import { connections, KINDS } from './mapdata.js';
import { icons } from './icons.js';

const MAX_FIRST = 10;
const MAX_SECOND = 8;

// Nodes and lines for a note's neighbourhood, or null if it has none.
export function neighbourhood(id) {
  const { edges } = connections();
  const adj = new Map();
  for (const e of edges) {
    if (e.kind === 'label') continue;
    for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push({ id: b, kind: e.kind, why: e.why });
    }
  }
  const rank = { link: 0, sub: 1, board: 2, related: 3 };
  const first = (adj.get(id) || []).filter((x) => state.notes.has(x.id)).sort((p, q) => rank[p.kind] - rank[q.kind]).slice(0, MAX_FIRST);
  if (!first.length) return null;
  const inFirst = new Set([id, ...first.map((x) => x.id)]);
  const second = [];
  for (const f of first) {
    for (const x of adj.get(f.id) || []) {
      if (second.length >= MAX_SECOND) break;
      if (inFirst.has(x.id) || second.some((s) => s.id === x.id) || !state.notes.has(x.id)) continue;
      second.push({ ...x, via: f.id });
    }
  }
  return { first, second };
}

const short = (t, n = 22) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const colourOf = (n) => regionColors(n.inbox ? null : state.config.regions.find((r) => r.id === n.region)).dot;

export function miniMapHtml(id, { href = (x) => `#/note/${x}`, wide = true } = {}) {
  const nb = neighbourhood(id);
  const me = state.notes.get(id);
  if (!nb || !me) return '';
  const W = wide ? 640 : 340;
  const H = wide ? 300 : 280;
  const cx = W / 2;
  const cy = H / 2;
  const r1 = Math.min(W * 0.3, H * 0.33);
  const pos = new Map([[id, [cx, cy]]]);
  const M = wide ? 90 : 56; // room either side for a label
  const clampX = (x) => Math.max(M, Math.min(W - M, x));
  nb.first.forEach((f, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / nb.first.length;
    pos.set(f.id, [clampX(cx + Math.cos(a) * r1 * (wide ? 1.35 : 1.15)), cy + Math.sin(a) * r1]);
  });
  // One step further: just outside the note they hang off, fanned out.
  const perParent = new Map();
  for (const s of nb.second) perParent.set(s.via, (perParent.get(s.via) || 0) + 1);
  const seen = new Map();
  for (const s of nb.second) {
    const [px, py] = pos.get(s.via);
    const base = Math.atan2(py - cy, px - cx);
    const k = seen.get(s.via) || 0;
    seen.set(s.via, k + 1);
    const spread = (k - ((perParent.get(s.via) || 1) - 1) / 2) * 0.5;
    const d = r1 * 0.55;
    const x = clampX(px + Math.cos(base + spread) * d);
    const y = Math.max(14, Math.min(H - 20, py + Math.sin(base + spread) * d));
    pos.set(s.id, [x, y]);
  }
  const kindCss = (k) => KINDS.find((x) => x.id === k)?.css || '--c-link';
  const line = (a, b, kind, faint) => {
    const [x1, y1] = pos.get(a);
    const [x2, y2] = pos.get(b);
    return html`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" style="stroke:var(${kindCss(kind)})" class="mm-l ${kind === 'related' ? 'dash' : ''} ${faint ? 'faint' : ''}"/>`;
  };
  const node = (nid, ring) => {
    const n = state.notes.get(nid);
    const [x, y] = pos.get(nid);
    const centre = nid === id;
    const r = centre ? 9 : ring === 1 ? 6.5 : 4.5;
    // Labels sit under their dot, short enough to stay inside the map.
    const label = short(displayTitle(n), centre ? 30 : ring === 1 ? (wide ? 24 : 16) : (wide ? 18 : 13));
    const ty = y + r + (centre ? 15 : 13);
    const tx = x;
    const anchor = 'middle';
    const inner = html`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" style="fill:${colourOf(n)}" class="${centre ? 'mm-me' : ''}"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" class="mm-t ${centre ? 'me' : ring === 2 ? 'far' : ''}">${label}</text>`;
    return centre ? html`<g>${inner}</g>` : html`<a href="${href(nid)}" aria-label="${displayTitle(n)}">${inner}</a>`;
  };
  const kinds = [...new Set(nb.first.map((f) => f.kind))];
  return String(html`<div class="minimap">
    <div class="mm-head"><h3>Map of this note</h3><a class="btn btn-sm" href="#/map?focus=${encodeURIComponent(id)}">${icons.map({ size: 16 })}Open on the map</a></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${displayTitle(me)} and the ${nb.first.length} notes it connects to">
      ${nb.second.map((s) => raw(String(line(s.via, s.id, s.kind, true))))}
      ${nb.first.map((f) => raw(String(line(id, f.id, f.kind, false))))}
      ${nb.second.map((s) => raw(String(node(s.id, 2))))}
      ${nb.first.map((f) => raw(String(node(f.id, 1))))}
      ${raw(String(node(id, 0)))}
    </svg>
    <p class="mm-key">${kinds.map((k) => { const d = KINDS.find((x) => x.id === k); return html`<span><span class="kind-line ${d?.dash ? 'dash' : ''}" style="--k:var(${d?.css})"></span>${d?.name}</span>`; })}</p>
  </div>`);
}
