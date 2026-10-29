// The map: notes as nodes around fixed region hubs, drawn like a chart with
// contour "territories". Built on force-graph (canvas, pinch/zoom/pan).

import { state } from './vault.js';
import { computeLinks, suggestedEdges, displayTitle, regionColors, searchNotes } from './model.js';
import { cssVar } from './util.js';

const R = 240; // hub ring radius in graph units

export function createMap(el, handlers = {}) {
  const ForceGraph = window.ForceGraph;
  const nodeCache = new Map();
  let selectedId = handlers.selectedId || null;
  let hoverId = null;
  let filter = { regions: null, query: '' };
  let matches = null; // Set of note ids matching the filter, or null for all
  let neighbours = new Map();
  let firstFit = true;
  let theme = readTheme();

  const g = ForceGraph()(el)
    .backgroundColor('rgba(0,0,0,0)')
    .nodeId('id')
    .nodeRelSize(1)
    .autoPauseRedraw(false)
    .warmupTicks(80)
    .cooldownTicks(150)
    .d3VelocityDecay(0.35)
    .linkColor(linkColor)
    .linkWidth((l) => (l.kind === 'hub' ? 0.8 : isSelectedLink(l) ? 2 : 1))
    .linkLineDash((l) => (l.kind === 'suggest' ? [4, 4] : null))
    .nodeCanvasObjectMode(() => 'replace')
    .nodeCanvasObject(drawNode)
    .nodePointerAreaPaint((node, color, ctx, scale) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius(node) + 8 / scale, 0, 2 * Math.PI);
      ctx.fill();
    })
    .onRenderFramePre(drawBackdrop)
    .onNodeClick((node) => {
      if (node.hub) handlers.onOpenRegion?.(node.unsorted ? null : node.region.id);
      else handlers.onOpenNote?.(node.id);
    })
    .onNodeHover((node) => {
      hoverId = node && !node.hub ? node.id : null;
      el.style.cursor = node ? 'pointer' : '';
    })
    .onNodeDragEnd((node) => {
      if (node.hub) { node.fx = node.homeX; node.fy = node.homeY; }
    })
    .onBackgroundClick(() => handlers.onBackground?.())
    .onEngineStop(() => {
      if (firstFit) { firstFit = false; fitView(400); }
    });

  g.d3Force('center', null);
  g.d3Force('charge').strength((n) => (n.hub ? -80 : -26)).distanceMax(260);
  g.d3Force('link')
    .distance((l) => (l.kind === 'hub' ? 48 : 110))
    .strength((l) => (l.kind === 'hub' ? 0.22 : l.kind === 'link' ? 0.04 : 0));

  function readTheme() {
    return {
      ink: cssVar('--ink') || '#1B2A38',
      muted: cssVar('--muted') || '#51606C',
      paper: cssVar('--map-bg') || '#F1F4F2',
      grid: cssVar('--grid') || '#DCE5E2',
      amber: cssVar('--amber-line') || '#C08A2E',
      serif: cssVar('--serif') || 'Georgia, serif',
      sans: cssVar('--sans') || 'system-ui, sans-serif',
    };
  }

  function nodeRadius(n) {
    if (n.hub) return n.unsorted ? 6 : 9;
    const deg = neighbours.get(n.id)?.size || 0;
    return 3.2 + Math.min(4, Math.sqrt(deg) * 1.3);
  }

  function isDimmed(n) {
    if (!matches) return false;
    if (n.hub) return false;
    return !matches.has(n.id);
  }

  function isSelectedLink(l) {
    if (!selectedId || l.kind === 'hub') return false;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return s === selectedId || t === selectedId;
  }

  function linkColor(l) {
    const s = typeof l.source === 'object' ? l.source : nodeCache.get(l.source);
    const t = typeof l.target === 'object' ? l.target : nodeCache.get(l.target);
    const dim = (s && isDimmed(s)) || (t && isDimmed(t));
    if (l.kind === 'suggest') return withAlpha(theme.amber, dim ? 0.2 : 0.9);
    if (l.kind === 'hub') {
      const c = regionColors(l.region).dot;
      return withAlpha(c, dim ? 0.1 : 0.45);
    }
    if (isSelectedLink(l)) return withAlpha(theme.ink, 0.85);
    return withAlpha(theme.ink, dim ? 0.08 : 0.32);
  }

  function drawNode(node, ctx, scale) {
    const r = nodeRadius(node);
    const dim = isDimmed(node);
    ctx.save();
    ctx.globalAlpha = dim ? 0.18 : 1;
    if (node.hub) {
      const c = node.unsorted ? regionColors(null) : regionColors(node.region);
      if (!node.unsorted) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI);
        ctx.strokeStyle = withAlpha(c.dot, 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = c.dot;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.paper;
      ctx.stroke();
      // Region name in map-label style.
      const ly = node.unsorted ? node.y + r + 18 / scale : node.y - Math.max(r + 12 / scale, (node.labelLift || 0) + 6 / scale);
      label(ctx, node.unsorted ? 'Unsorted' : node.region.name, node.x, ly, {
        font: `italic ${(node.unsorted ? 14 : 17) / scale}px ${theme.serif}`,
        color: c.text,
        scale,
        align: 'center',
      });
    } else {
      const reg = node.note.region ? state.config.regions.find((x) => x.id === node.note.region) : null;
      const c = regionColors(node.note.inbox ? null : reg);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = c.dot;
      ctx.fill();
      ctx.lineWidth = 1.4 / scale;
      ctx.strokeStyle = theme.paper;
      ctx.stroke();
      const selected = node.id === selectedId;
      if (selected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
        ctx.lineWidth = 1.8 / scale;
        ctx.strokeStyle = theme.ink;
        ctx.stroke();
      }
      if (node.note.sealed) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 2.5, 0, 2 * Math.PI);
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = theme.muted;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const deg = neighbours.get(node.id)?.size || 0;
      const showLabel = selected || node.id === hoverId || scale > 1.5 || (deg >= 2 && scale > 0.75) || (deg >= 4 && scale > 0.45) || (matches && matches.has(node.id) && filter.query);
      if (showLabel && !dim) {
        const t = node.title.length > 34 ? `${node.title.slice(0, 33)}…` : node.title;
        label(ctx, t, node.x + r + 4 / scale, node.y + 4 / scale, {
          font: `${selected ? 700 : 400} ${12 / scale}px ${theme.sans}`,
          color: theme.ink,
          scale,
          align: 'left',
        });
      }
    }
    ctx.restore();
  }

  function label(ctx, text, x, y, { font, color, scale, align }) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4 / scale;
    ctx.strokeStyle = theme.paper;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawBackdrop(ctx, scale) {
    // Faint graticule across the visible area.
    const w = el.clientWidth;
    const h = el.clientHeight;
    const a = g.screen2GraphCoords(0, 0);
    const b = g.screen2GraphCoords(w, h);
    const step = 80;
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) { ctx.moveTo(x, a.y); ctx.lineTo(x, b.y); }
    for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) { ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); }
    ctx.stroke();

    // Territories: three contour rings around each region's notes.
    const { nodes } = g.graphData();
    for (const hub of nodes) {
      if (!hub.hub || hub.unsorted) continue;
      const members = nodes.filter((n) => !n.hub && !n.note.inbox && n.note.region === hub.region.id);
      let rx = 46;
      let ry = 46;
      if (members.length) {
        const dx = members.map((n) => Math.abs(n.x - hub.x)).sort((p, q) => p - q);
        const dy = members.map((n) => Math.abs(n.y - hub.y)).sort((p, q) => p - q);
        const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.9))];
        rx = Math.max(46, pick(dx) + 26);
        ry = Math.max(46, pick(dy) + 26);
      }
      hub.labelLift = ry - 4;
      const c = regionColors(hub.region).dot;
      const dim = filter.regions && !filter.regions.has(hub.region.id);
      const rings = [[1, 0.32], [0.72, 0.48], [0.44, 0.7]];
      rings.forEach(([k, alpha], i) => {
        ctx.beginPath();
        ctx.ellipse(hub.x, hub.y, rx * k, ry * k, 0, 0, 2 * Math.PI);
        if (i === 2) { ctx.fillStyle = withAlpha(c, dim ? 0.02 : 0.08); ctx.fill(); }
        ctx.strokeStyle = withAlpha(c, dim ? alpha * 0.25 : alpha);
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  function hubPositions(regions) {
    const slots = regions.length + 1;
    const out = new Map();
    regions.forEach((r, i) => {
      const ang = (Math.PI / 2) + ((i + 1) * 2 * Math.PI) / slots;
      out.set(r.id, { x: Math.cos(ang) * R, y: Math.sin(ang) * R });
    });
    out.set('__inbox', { x: 0, y: R * 0.92 });
    return out;
  }

  function build() {
    const regions = state.config.regions;
    const pos = hubPositions(regions);
    const nodes = [];
    const links = [];
    const keep = new Set();
    const get = (id, make) => {
      keep.add(id);
      let n = nodeCache.get(id);
      if (!n) { n = make(); nodeCache.set(id, n); }
      return n;
    };
    for (const r of regions) {
      const p = pos.get(r.id);
      const hub = get(`hub:${r.id}`, () => ({ id: `hub:${r.id}`, hub: true }));
      Object.assign(hub, { region: r, homeX: p.x, homeY: p.y, fx: p.x, fy: p.y });
      nodes.push(hub);
    }
    const ip = pos.get('__inbox');
    const inboxHub = get('hub:__inbox', () => ({ id: 'hub:__inbox', hub: true, unsorted: true }));
    Object.assign(inboxHub, { homeX: ip.x, homeY: ip.y, fx: ip.x, fy: ip.y });
    nodes.push(inboxHub);

    for (const note of state.notes.values()) {
      const hubId = note.inbox || !note.region || !pos.has(note.region) ? 'hub:__inbox' : `hub:${note.region}`;
      const hp = nodeCache.get(hubId);
      const n = get(note.id, () => ({ id: note.id, x: hp.homeX + (Math.random() - 0.5) * 60, y: hp.homeY + (Math.random() - 0.5) * 60 }));
      n.note = note;
      n.title = displayTitle(note);
      nodes.push(n);
      const reg = regions.find((r) => r.id === note.region);
      links.push({ source: note.id, target: hubId, kind: 'hub', region: note.inbox ? null : reg });
    }
    const L = computeLinks(state.notes);
    neighbours = L.neighbours;
    for (const [a, b] of L.edges) links.push({ source: a, target: b, kind: 'link' });
    for (const [a, b] of suggestedEdges(state.notes)) links.push({ source: a, target: b, kind: 'suggest' });
    for (const id of [...nodeCache.keys()]) if (!keep.has(id)) nodeCache.delete(id);
    return { nodes, links };
  }

  function computeMatches() {
    const { regions, query } = filter;
    if (!regions && !query) { matches = null; return; }
    let pool = [...state.notes.values()];
    if (regions) pool = pool.filter((n) => !n.inbox && regions.has(n.region));
    if (query) pool = searchNotes(pool, query, 10000);
    matches = new Set(pool.map((n) => n.id));
  }

  // Fit the whole map into the area not covered by the search bar and chips.
  function fitView(ms) {
    const bb = g.getGraphBbox();
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!bb || !w || !h) return;
    const top = 124;
    const bottom = 72;
    const side = 24;
    const bw = bb.x[1] - bb.x[0] + 60;
    const bh = bb.y[1] - bb.y[0] + 90; // room for region labels above the rings
    const k = Math.max(0.2, Math.min((w - 2 * side) / bw, (h - top - bottom) / bh, 2.4));
    const cx = (bb.x[0] + bb.x[1]) / 2;
    const cy = (bb.y[0] + bb.y[1]) / 2 - 20;
    const dy = (top + (h - top - bottom) / 2 - h / 2) / k;
    g.zoom(k, ms);
    g.centerAt(cx, cy - dy, ms);
  }

  function sizeToContainer() {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) g.width(r.width).height(r.height);
  }
  const ro = new ResizeObserver(() => sizeToContainer());
  ro.observe(el);
  sizeToContainer();

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { theme = readTheme(); };
  mql.addEventListener?.('change', onScheme);

  g.graphData(build());
  // Frame the map straight away (positions come from the warm-up ticks), then
  // again once the layout settles.
  setTimeout(() => { if (firstFit) fitView(0); }, 60);

  return {
    update() {
      computeMatches();
      g.graphData(build());
    },
    select(id, { center = false } = {}) {
      selectedId = id;
      if (center && id) {
        const n = nodeCache.get(id);
        if (n && Number.isFinite(n.x)) g.centerAt(n.x, n.y, 500);
      }
    },
    setFilter(f) {
      filter = { ...filter, ...f };
      computeMatches();
    },
    matchCount: () => (matches ? matches.size : null),
    fit() { fitView(400); },
    destroy() {
      ro.disconnect();
      mql.removeEventListener?.('change', onScheme);
      try { g.pauseAnimation(); g._destructor?.(); } catch { /* ignore */ }
      el.innerHTML = '';
    },
  };
}

function withAlpha(color, alpha) {
  const c = String(color).trim();
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  return c;
}
