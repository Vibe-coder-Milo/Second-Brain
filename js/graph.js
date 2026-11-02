// The map: notes as dots around region hubs, drawn like a chart with contour
// "territories", and every connection between notes as a line in its own
// colour (see mapdata.js). Hover or tap a note to light up what it connects
// to; focus on a note to see only its neighbourhood; replay to watch the map
// grow. Built on force-graph (canvas, pinch/zoom/pan).

import { state } from './vault.js';
import { displayTitle, regionColors, searchNotes, labelMap } from './model.js';
import { cssVar } from './util.js';
import { connections, KINDS, DEFAULT_SHOWN, themes } from './mapdata.js';

// Hubs sit on a ring; with more regions the ring grows so they don't crowd.
const ringRadius = (slots) => Math.max(240, slots * 42);

export function createMap(el, handlers = {}) {
  const ForceGraph = window.ForceGraph;
  const nodeCache = new Map();
  let selectedId = handlers.selectedId || null;
  let hoverId = null;
  let filter = { regions: null, query: '' };
  let matches = null; // Set of note ids matching the filter, or null for all
  let neighbours = new Map(); // id -> Set of ids, over the kinds shown
  let shown = new Set(handlers.shown || DEFAULT_SHOWN);
  let focus = null; // { id, depth, ids: Set }
  let reveal = null; // replay: show notes created up to this time
  let counts = {};
  let themeList = [];
  let firstFit = true;
  let theme = readTheme();

  const kindOf = (id) => KINDS.find((k) => k.id === id);
  const ends = (l) => [typeof l.source === 'object' ? l.source : nodeCache.get(l.source), typeof l.target === 'object' ? l.target : nodeCache.get(l.target)];
  const idOf = (x) => (typeof x === 'object' ? x.id : x);

  const g = ForceGraph()(el)
    .backgroundColor('rgba(0,0,0,0)')
    .nodeId('id')
    .nodeRelSize(1)
    // Only redraw when something changes (moving, zooming, hovering, a new
    // filter), not 60 times a second while the map sits still: saves battery.
    .autoPauseRedraw(true)
    .warmupTicks(80)
    .cooldownTicks(150)
    .d3VelocityDecay(0.35)
    .linkColor(linkColor)
    .linkWidth(linkWidth)
    .linkLineDash((l) => kindOf(l.kind)?.dash || null)
    .linkVisibility(linkVisible)
    .nodeVisibility(nodeVisible)
    .linkHoverPrecision(6)
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
      else if (node.labelNode) handlers.onOpenLabel?.(node.label.id);
      else handlers.onOpenNote?.(node.id);
    })
    .onNodeHover((node) => {
      const was = hoverId;
      hoverId = node && !node.hub ? node.id : null;
      if (was !== hoverId) poke();
      el.style.cursor = node ? 'pointer' : '';
    })
    .onLinkHover((l) => { if (!hoverId) el.style.cursor = l && l.kind !== 'hub' ? 'pointer' : ''; })
    .onLinkClick((l, ev) => { if (l.kind !== 'hub') handlers.onLinkClick?.({ a: idOf(l.source), b: idOf(l.target), kind: l.kind, why: l.why, x: ev?.clientX ?? 0, y: ev?.clientY ?? 0 }); })
    .onNodeDragEnd((node) => {
      if (node.hub) { node.fx = node.homeX; node.fy = node.homeY; }
    })
    .onBackgroundClick(() => handlers.onBackground?.())
    .onEngineStop(() => {
      if (firstFit) { firstFit = false; fitView(400); }
    });

  g.d3Force('center', null);
  g.d3Force('charge').strength((n) => (n.hub ? -80 : n.labelNode ? -40 : -26)).distanceMax(260);
  g.d3Force('link')
    .distance((l) => (l.kind === 'hub' ? 48 : l.kind === 'label' ? 70 : 110))
    .strength((l) => (l.kind === 'hub' ? 0.22 : l.kind === 'link' || l.kind === 'sub' || l.kind === 'board' ? 0.05 : l.kind === 'label' ? 0.08 : 0.012));

  function readTheme() {
    const kinds = Object.fromEntries(KINDS.map((k) => [k.id, cssVar(k.css) || k.fallback]));
    return {
      ink: cssVar('--ink') || '#1B2A38',
      muted: cssVar('--muted') || '#51606C',
      paper: cssVar('--map-bg') || '#F1F4F2',
      grid: cssVar('--grid') || '#DCE5E2',
      serif: cssVar('--serif') || 'Georgia, serif',
      sans: cssVar('--sans') || 'system-ui, sans-serif',
      kinds,
    };
  }

  // ---- What's showing, what's lit up ------------------------------------------------

  const active = () => hoverId || selectedId;
  function lit(id) {
    const a = active();
    if (!a) return true;
    return id === a || !!neighbours.get(a)?.has(id);
  }
  function nodeVisible(n) {
    if (n.hub) {
      if (!focus && !reveal) return true;
      return [...nodeCache.values()].some((m) => m.note && nodeVisible(m) && hubOf(m) === n.id);
    }
    if (n.labelNode) return shown.has('label') && (!focus || focus.ids.has(n.id));
    if (reveal && (n.note.createdAt || 0) > reveal) return false;
    if (focus && !focus.ids.has(n.id)) return false;
    return true;
  }
  function linkVisible(l) {
    if (l.kind !== 'hub' && !shown.has(l.kind)) return false;
    const [s, t] = ends(l);
    return !!(s && t && nodeVisible(s) && nodeVisible(t));
  }
  const hubOf = (n) => (n.note.inbox || !n.note.region || !nodeCache.has(`hub:${n.note.region}`) ? 'hub:__inbox' : `hub:${n.note.region}`);

  function nodeRadius(n) {
    if (n.hub) return n.unsorted ? 6 : 9;
    if (n.labelNode) return 4.5;
    const deg = n.degree || 0;
    return 3.2 + Math.min(4.5, Math.sqrt(deg) * 1.3);
  }

  function isDimmed(n) {
    if (n.hub) return false;
    if (matches && !n.labelNode && !matches.has(n.id)) return true;
    return !lit(n.id);
  }

  function touchesActive(l) {
    const a = active();
    if (!a || l.kind === 'hub') return false;
    return idOf(l.source) === a || idOf(l.target) === a;
  }

  function linkColor(l) {
    const [s, t] = ends(l);
    if (l.kind === 'hub') {
      const c = regionColors(l.region).dot;
      const faded = active() || (s && t && (isDimmed(s) || isDimmed(t)));
      return withAlpha(c, faded ? 0.08 : 0.4);
    }
    const c = theme.kinds[l.kind] || theme.ink;
    if (active()) return withAlpha(c, touchesActive(l) ? 0.95 : 0.07);
    const dim = (s && isDimmed(s)) || (t && isDimmed(t));
    return withAlpha(c, dim ? 0.12 : l.kind === 'related' ? 0.75 : 0.8);
  }
  function linkWidth(l) {
    if (l.kind === 'hub') return 0.8;
    const w = kindOf(l.kind)?.width || 1;
    return touchesActive(l) ? w + 0.9 : w;
  }

  // ---- Drawing -----------------------------------------------------------------------

  function drawNode(node, ctx, scale) {
    const r = nodeRadius(node);
    const dim = isDimmed(node);
    ctx.save();
    ctx.globalAlpha = dim ? 0.16 : 1;
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
    } else if (node.labelNode) {
      // A label as a small tag.
      const c = node.label.color || theme.kinds.label;
      const w = r * 2.6;
      ctx.beginPath();
      ctx.moveTo(node.x - w / 2, node.y - r);
      ctx.lineTo(node.x + w / 2, node.y - r);
      ctx.lineTo(node.x + w / 2, node.y + r);
      ctx.lineTo(node.x - w / 2, node.y + r);
      ctx.lineTo(node.x - w / 2 - r * 0.9, node.y);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      if (scale > 0.6 || lit(node.id)) label(ctx, node.label.name, node.x + w / 2 + 4 / scale, node.y + 4 / scale, { font: `600 ${11 / scale}px ${theme.sans}`, color: c, scale, align: 'left' });
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
      if (selected || node.id === hoverId) {
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
      const deg = node.degree || 0;
      const near = active() && lit(node.id);
      const showLabel = selected || node.id === hoverId || near || focus || scale > 1.5 || (deg >= 2 && scale > 0.75) || (deg >= 4 && scale > 0.45) || (matches && matches.has(node.id) && filter.query);
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
      if (!hub.hub || hub.unsorted || !nodeVisible(hub)) continue;
      const members = nodes.filter((n) => n.note && !n.note.inbox && n.note.region === hub.region.id && nodeVisible(n));
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
      const dim = (filter.regions && !filter.regions.has(hub.region.id)) || active();
      const rings = [[1, 0.32], [0.72, 0.48], [0.44, 0.7]];
      rings.forEach(([k, alpha], i) => {
        ctx.beginPath();
        ctx.ellipse(hub.x, hub.y, rx * k, ry * k, 0, 0, 2 * Math.PI);
        if (i === 2) { ctx.fillStyle = withAlpha(c, dim ? 0.03 : 0.08); ctx.fill(); }
        ctx.strokeStyle = withAlpha(c, dim ? alpha * 0.35 : alpha);
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      });
    }
    // Themes: a dashed ring and a name around notes that belong together.
    for (const th of themeList) {
      const pts = th.ids.map((id) => nodeCache.get(id)).filter((n) => n && Number.isFinite(n.x) && nodeVisible(n));
      if (pts.length < 3) continue;
      const reg = state.config.regions.find((r) => r.id === th.region);
      const c = regionColors(reg);
      const mx = pts.reduce((s, n) => s + n.x, 0) / pts.length;
      const my = pts.reduce((s, n) => s + n.y, 0) / pts.length;
      const rx = Math.max(22, ...pts.map((n) => Math.abs(n.x - mx))) + 14;
      const ry = Math.max(18, ...pts.map((n) => Math.abs(n.y - my))) + 14;
      const dim = active() || (filter.regions && !filter.regions.has(th.region));
      ctx.save();
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.strokeStyle = withAlpha(c.dot, dim ? 0.15 : 0.55);
      ctx.lineWidth = 1.2 / scale;
      ctx.beginPath();
      ctx.ellipse(mx, my, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
      if (!dim && scale > 0.45) label(ctx, th.name, mx, my - ry - 5 / scale, { font: `italic 600 ${12 / scale}px ${theme.sans}`, color: c.text, scale, align: 'center' });
    }
    ctx.restore();
  }

  function hubPositions(regions) {
    const slots = regions.length + 1;
    const R = ringRadius(slots);
    const out = new Map();
    regions.forEach((r, i) => {
      const ang = (Math.PI / 2) + ((i + 1) * 2 * Math.PI) / slots;
      out.set(r.id, { x: Math.cos(ang) * R, y: Math.sin(ang) * R });
    });
    out.set('__inbox', { x: 0, y: R * 0.92 });
    return out;
  }

  // ---- Building --------------------------------------------------------------------

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
      n.degree = 0;
      nodes.push(n);
      const reg = regions.find((r) => r.id === note.region);
      links.push({ source: note.id, target: hubId, kind: 'hub', region: note.inbox ? null : reg });
    }
    // Labels only join the layout when they're shown, so they don't pull notes around.
    const C = connections(state.notes, { labels: shown.has('label') });
    counts = C.counts;
    themeList = themes(C.edges);
    const lm = labelMap(state.config);
    const labelNodes = new Set();
    neighbours = new Map();
    const link = (a, b) => {
      if (!neighbours.has(a)) neighbours.set(a, new Set());
      if (!neighbours.has(b)) neighbours.set(b, new Set());
      neighbours.get(a).add(b);
      neighbours.get(b).add(a);
    };
    for (const e of C.edges) {
      if (e.kind === 'label') {
        const lid = e.b;
        const def = lm.get(lid.slice(6)) || { id: lid.slice(6), name: lid.slice(6), color: theme.kinds.label };
        const ln = get(lid, () => ({ id: lid, labelNode: true, x: (Math.random() - 0.5) * 80, y: (Math.random() - 0.5) * 80 }));
        ln.label = def;
        if (!labelNodes.has(ln)) { labelNodes.add(ln); nodes.push(ln); }
      }
      links.push({ source: e.a, target: e.b, kind: e.kind, why: e.why });
      if (shown.has(e.kind)) {
        link(e.a, e.b);
        if (e.kind !== 'related' && e.kind !== 'label') {
          const na = nodeCache.get(e.a);
          const nb = nodeCache.get(e.b);
          if (na) na.degree++;
          if (nb) nb.degree++;
        }
      }
    }
    for (const id of [...nodeCache.keys()]) if (!keep.has(id)) nodeCache.delete(id);
    if (focus) focus.ids = reach(focus.id, focus.depth);
    return { nodes, links };
  }

  // Notes within `depth` steps of a note, over the kinds shown.
  function reach(id, depth) {
    const seen = new Set([id]);
    let edge = [id];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const x of edge) for (const y of neighbours.get(x) || []) if (!seen.has(y)) { seen.add(y); next.push(y); }
      edge = next;
    }
    return seen;
  }

  function computeMatches() {
    const { regions, query } = filter;
    if (!regions && !query && !filter.ids && !filter.since) { matches = null; return; }
    let pool = [...state.notes.values()];
    if (filter.since) pool = pool.filter((n) => (n.updatedAt || n.createdAt || 0) >= filter.since);
    if (filter.ids) pool = pool.filter((n) => filter.ids.has(n.id));
    if (regions) pool = pool.filter((n) => !n.inbox && regions.has(n.region));
    if (query) pool = searchNotes(pool, query, 10000);
    matches = new Set(pool.map((n) => n.id));
  }

  // Fit what's showing into the area not covered by the search bar and chips.
  function fitView(ms, only = null) {
    const bb = g.getGraphBbox((n) => nodeVisible(n) && (!only || (!n.hub && only.has(n.id))));
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!bb || !w || !h) return;
    const top = 124;
    const bottom = 72;
    const side = 24;
    const bw = bb.x[1] - bb.x[0] + 60;
    const bh = bb.y[1] - bb.y[0] + 90; // room for region labels above the rings
    const k = Math.max(0.2, Math.min((w - 2 * side) / bw, (h - top - bottom) / bh, only ? 3 : 2.4));
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

  const onScheme = () => { theme = readTheme(); poke(); };
  window.addEventListener('sb-theme', onScheme);

  let lastShape = '';
  // Order doesn't matter (a saved note moves to the end of the list), so it's
  // a sum of each piece's hash: quick even with thousands of notes.
  const h32 = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const shapeOf = (d) => {
    let a = 0;
    let b = 0;
    for (const n of d.nodes) a = (a + h32(n.id)) >>> 0;
    for (const l of d.links) b = (b + h32(`${idOf(l.source)}>${idOf(l.target)}:${l.kind}:${l.region?.color || ''}`)) >>> 0;
    return `${d.nodes.length}:${a}:${d.links.length}:${b}`;
  };
  // Big maps (thousands of notes): fewer warm-up steps, and the layout
  // settles within a few seconds instead of running on.
  const setData = (d) => {
    const big = d.nodes.length > 1500;
    g.warmupTicks(big ? 14 : 80).cooldownTime(big ? 5000 : 15000).d3AlphaDecay(big ? 0.045 : 0.0228);
    g.graphData(d);
  };
  { const d = build(); lastShape = shapeOf(d); setData(d); }
  // Frame the map straight away (positions come from the warm-up ticks), then
  // again once the layout settles.
  setTimeout(() => { if (firstFit) fitView(0); }, 60);

  let playing = null;
  const refresh = () => { g.nodeVisibility(g.nodeVisibility()); g.linkVisibility(g.linkVisibility()); };
  // Ask for one redraw (the map otherwise sits still when nothing moves).
  function poke() { g.nodeVisibility(g.nodeVisibility()); }

  return {
    // A saved note usually changes nothing on the map's shape; then just
    // redraw (titles, colours) rather than restart the layout.
    update() {
      computeMatches();
      const d = build();
      const sig = shapeOf(d);
      if (sig === lastShape) { refresh(); return; }
      lastShape = sig;
      setData(d);
    },
    select(id, { center = false } = {}) {
      selectedId = id;
      poke();
      if (center && id) {
        const n = nodeCache.get(id);
        if (n && Number.isFinite(n.x)) g.centerAt(n.x, n.y, 500);
      }
    },
    setFilter(f) {
      filter = { ...filter, ...f };
      computeMatches();
      refresh();
    },
    // Which kinds of connection to draw.
    setShown(kinds) {
      shown = new Set(kinds);
      const d = build();
      lastShape = shapeOf(d);
      setData(d);
    },
    shown: () => [...shown],
    counts: () => ({ ...counts }),
    themes: () => themeList.map((t) => ({ ...t })),
    // Only this note and what it connects to (depth 1 or 2).
    focusOn(id, depth = 1) {
      focus = id ? { id, depth, ids: reach(id, depth) } : null;
      refresh();
      g.d3ReheatSimulation();
      setTimeout(() => fitView(500), 350);
    },
    focused: () => (focus ? { id: focus.id, depth: focus.depth, size: focus.ids.size } : null),
    neighboursOf: (id) => [...(neighbours.get(id) || [])],
    // Replay: notes appear in the order they were made.
    play({ ms = 7000, onTick, onDone } = {}) {
      cancelAnimationFrame(playing);
      const times = [...state.notes.values()].map((n) => n.createdAt || 0).filter(Boolean).sort((p, q) => p - q);
      if (!times.length) return;
      const t0 = times[0];
      const t1 = Date.now();
      const start = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - start) / ms);
        reveal = t0 + (t1 - t0) * k;
        refresh();
        onTick?.(reveal);
        if (k < 1) playing = requestAnimationFrame(step);
        else { reveal = null; refresh(); onDone?.(); }
      };
      playing = requestAnimationFrame(step);
    },
    stopPlay() { cancelAnimationFrame(playing); reveal = null; refresh(); },
    matchCount: () => (matches ? matches.size : null),
    fit() { fitView(400); },
    // Zoom to just these notes.
    fitTo(ids) { if (ids?.size) fitView(500, ids); },
    destroy() {
      cancelAnimationFrame(playing);
      ro.disconnect();
      window.removeEventListener('sb-theme', onScheme);
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
