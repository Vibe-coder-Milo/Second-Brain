// Sticker library: the packs from the mockups, drawn as small SVGs.
// Sizes are in page units (a page is 1000 wide).

const W = '#FFFFFF';

const tab = (txt, fill) => ({ vb: '0 0 38 26', w: 66, h: 45, svg: `<path d="M0 26 V6 a6 6 0 0 1 6 -6 H32 a6 6 0 0 1 6 6 V26 Z" fill="${fill}"/><text x="19" y="18" font-family="Overpass, sans-serif" font-size="11" font-weight="700" fill="#1B2A38" text-anchor="middle">${txt}</text>` });
const prio = (txt, fill) => ({ vb: '0 0 40 40', w: 48, h: 48, svg: `<circle cx="20" cy="20" r="18" fill="${fill}" stroke="${W}" stroke-width="3"/><text x="20" y="25" font-family="Overpass, sans-serif" font-size="14" font-weight="700" fill="${W}" text-anchor="middle">${txt}</text>` });

export const PACKS = [
  { id: 'labels', name: 'Labels' },
  {
    id: 'marks',
    name: 'Marks',
    items: {
      star: { name: 'Star', vb: '0 0 34 31', w: 58, h: 53, svg: `<polygon points="17,2 20.8,11.7 31.3,12.4 23.2,19 25.8,29.1 17,23.5 8.2,29.1 10.8,19 2.7,12.4 13.2,11.7" fill="#E0A526" stroke="${W}" stroke-width="2.5" stroke-linejoin="round"/>` },
      check: { name: 'Check', vb: '-26 -26 52 52', w: 52, h: 52, svg: `<circle r="24" fill="#2F8A72" stroke="${W}" stroke-width="3"/><polyline points="-11,0 -3,8 12,-9" fill="none" stroke="${W}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>` },
      alert: { name: 'Exclamation', vb: '-26 -26 52 52', w: 52, h: 52, svg: `<circle r="24" fill="#B0413E" stroke="${W}" stroke-width="3"/><line x1="0" y1="-12" x2="0" y2="4" stroke="${W}" stroke-width="5" stroke-linecap="round"/><circle cx="0" cy="13" r="3" fill="${W}"/>` },
      arrow: { name: 'Arrow', vb: '0 0 62 56', w: 62, h: 56, svg: `<path d="M2 18 H34 V5 L60 28 L34 51 V38 H2 Z" fill="#1B2A38" stroke="${W}" stroke-width="3" stroke-linejoin="round"/>` },
      bulb: { name: 'Idea', vb: '0 0 34 34', w: 54, h: 54, svg: `<circle cx="17" cy="17" r="16" fill="${W}"/><path d="M17 5 a9 9 0 0 1 5 16.5 V25 H12 V21.5 A9 9 0 0 1 17 5 Z" fill="#F2C94C" stroke="#1B2A38" stroke-width="1.6" stroke-linejoin="round"/><line x1="12.5" y1="28.5" x2="21.5" y2="28.5" stroke="#1B2A38" stroke-width="1.6" stroke-linecap="round"/>` },
      question: { name: 'Question', vb: '-4 2 58 50', w: 56, h: 48, svg: `<path d="M4 4 H44 a6 6 0 0 1 6 6 V32 a6 6 0 0 1 -6 6 H22 L12 48 V38 H4 a6 6 0 0 1 -6 -6 V10 a6 6 0 0 1 6 -6 Z" fill="#2B5684" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><text x="24" y="31" font-family="Overpass, sans-serif" font-size="24" font-weight="700" fill="${W}" text-anchor="middle">?</text>` },
      pin: { name: 'Pin', vb: '-2 -2 40 54', w: 38, h: 52, svg: `<path d="M18 0 C 30 0, 36 9, 36 18 C 36 30, 18 50, 18 50 C 18 50, 0 30, 0 18 C 0 9, 6 0, 18 0 Z" fill="#B0413E" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><circle cx="18" cy="18" r="7" fill="${W}"/>` },
      flag: { name: 'Flag', vb: '0 0 54 60', w: 50, h: 56, svg: `<line x1="6" y1="4" x2="6" y2="56" stroke="#1B2A38" stroke-width="4" stroke-linecap="round"/><path d="M8 6 H50 L42 18 L50 30 H8 Z" fill="#C0802F" stroke="${W}" stroke-width="2.5" stroke-linejoin="round"/>` },
      heart: { name: 'Heart', vb: '0 0 40 36', w: 50, h: 45, svg: `<path d="M20 34 C 4 22, 1 14, 4 8 C 8 0, 17 2, 20 9 C 23 2, 32 0, 36 8 C 39 14, 36 22, 20 34 Z" fill="#B8578E" stroke="${W}" stroke-width="2.5" stroke-linejoin="round"/>` },
      cross: { name: 'Cross', vb: '-14 -14 28 28', w: 36, h: 36, svg: `<g stroke-linecap="round"><g stroke="${W}" stroke-width="9"><line x1="-9" y1="-9" x2="9" y2="9"/><line x1="9" y1="-9" x2="-9" y2="9"/></g><g stroke="#B0413E" stroke-width="4.5"><line x1="-9" y1="-9" x2="9" y2="9"/><line x1="9" y1="-9" x2="-9" y2="9"/></g></g>` },
    },
  },
  {
    id: 'planner',
    name: 'Planner',
    items: {
      mon: tab('Mon', '#FFD6D6'), tue: tab('Tue', '#FFE0C2'), wed: tab('Wed', '#FFF1B8'), thu: tab('Thu', '#D7F2E1'),
      fri: tab('Fri', '#CDEFFB'), sat: tab('Sat', '#CFE0F5'), sun: tab('Sun', '#F5D6EC'),
      p1: prio('P1', '#B0413E'), p2: prio('P2', '#C0802F'), p3: prio('P3', '#2F8A72'),
      week: { name: 'This week', vb: '0 0 200 36', w: 170, h: 31, svg: `<path d="M0 0 H200 L188 18 L200 36 H0 L12 18 Z" fill="#1B2A38"/><text x="100" y="25" font-family="Caveat, cursive" font-size="25" font-weight="700" fill="#FFF1B8" text-anchor="middle">This week</text>` },
      focus: { name: 'Focus', vb: '0 0 56 22', w: 84, h: 33, svg: `<rect width="56" height="22" rx="11" fill="#EEF2F1" stroke="#1B2A38" stroke-width="1"/><text x="28" y="15.5" font-family="Overpass, sans-serif" font-size="11" font-weight="700" fill="#1B2A38" text-anchor="middle">Focus</text>` },
      due: { name: 'Due', vb: '0 0 74 86', w: 60, h: 70, svg: `<rect x="1" y="1" width="72" height="84" rx="10" fill="${W}" stroke="#1B2A38" stroke-width="2"/><path d="M1 11 a10 10 0 0 1 10 -10 H63 a10 10 0 0 1 10 10 V24 H1 Z" fill="#B0413E"/><text x="37" y="17" font-family="Overpass, sans-serif" font-size="11" font-weight="700" fill="${W}" text-anchor="middle">DUE</text><line x1="16" y1="62" x2="58" y2="62" stroke="#9FB0AC" stroke-width="2"/>` },
    },
  },
  {
    id: 'tape',
    name: 'Washi tape',
    tape: true,
    items: {
      stripe: { name: 'Stripes' }, dots: { name: 'Dots' }, grid: { name: 'Grid' }, tile: { name: 'Tile' }, stitch: { name: 'Stitched' }, kraft: { name: 'Kraft' },
    },
  },
  {
    id: 'chart',
    name: 'Chart',
    items: {
      compass: { name: 'Compass', vb: '-48 -48 96 96', w: 80, h: 80, svg: `<circle r="46" fill="#1B2A38" stroke="${W}" stroke-width="3"/><circle r="34" fill="none" stroke="#A9C6EA" stroke-width="1" stroke-dasharray="2 2"/><polygon points="0,-28 6,-6 30,0 6,6 0,30 -6,6 -30,0 -6,-6" fill="#E8B97E"/><polygon points="0,-28 6,-6 0,0" fill="#C0802F"/><text x="0" y="-32" font-family="Overpass, sans-serif" font-size="9" font-weight="700" fill="${W}" text-anchor="middle">N</text>` },
      route: { name: 'Route', vb: '130 20 145 106', w: 120, h: 88, svg: `<g fill="none" stroke-linecap="round"><path d="M140 34 C 180 20, 200 70, 230 60 S 270 96, 262 112" stroke="${W}" stroke-width="8"/><path d="M140 34 C 180 20, 200 70, 230 60 S 270 96, 262 112" stroke="#1B2A38" stroke-width="3" stroke-dasharray="2 7"/></g><circle cx="140" cy="34" r="6" fill="#2F8A72" stroke="${W}" stroke-width="2.5"/><g transform="translate(262 116)" stroke-linecap="round"><g stroke="${W}" stroke-width="9"><line x1="-9" y1="-9" x2="9" y2="9"/><line x1="9" y1="-9" x2="-9" y2="9"/></g><g stroke="#B0413E" stroke-width="4.5"><line x1="-9" y1="-9" x2="9" y2="9"/><line x1="9" y1="-9" x2="-9" y2="9"/></g></g>` },
      here: { name: 'You are here', vb: '-2 -2 142 54', w: 130, h: 50, svg: `<path d="M18 0 C 30 0, 36 9, 36 18 C 36 30, 18 50, 18 50 C 18 50, 0 30, 0 18 C 0 9, 6 0, 18 0 Z" fill="#1B2A38" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><circle cx="18" cy="18" r="7" fill="${W}"/><rect x="42" y="8" width="96" height="24" rx="12" fill="${W}" stroke="#1B2A38" stroke-width="1.5"/><text x="90" y="24.5" font-family="Overpass, sans-serif" font-size="12" font-weight="700" fill="#1B2A38" text-anchor="middle">You are here</text>` },
      contour: { name: 'Contour', vb: '-58 -44 116 88', w: 96, h: 73, svg: `<g fill="none" stroke="#C0802F"><ellipse rx="54" ry="38" transform="rotate(-10)" stroke-width="1.5" stroke-opacity="0.45"/><ellipse rx="36" ry="25" transform="rotate(-10)" stroke-width="1.5" stroke-opacity="0.7"/><ellipse rx="18" ry="12" transform="rotate(-10)" stroke-width="1.5" fill="#C0802F" fill-opacity="0.15"/></g><circle r="5" fill="#C0802F"/>` },
    },
  },
  {
    id: 'botanical',
    name: 'Botanical',
    items: {
      sprig: { name: 'Sprig', vb: '-30 -86 72 192', w: 46, h: 122, svg: `<path d="M0 100 C 4 60, 10 20, 24 -80" fill="none" stroke="${W}" stroke-width="8" stroke-linecap="round"/><path d="M0 100 C 4 60, 10 20, 24 -80" fill="none" stroke="#2F6B4A" stroke-width="3" stroke-linecap="round"/><g fill="#4F8A5B" stroke="${W}" stroke-width="2"><ellipse cx="-12" cy="50" rx="9" ry="18" transform="rotate(-40 -12 50)"/><ellipse cx="20" cy="30" rx="9" ry="18" transform="rotate(40 20 30)"/><ellipse cx="-4" cy="0" rx="9" ry="18" transform="rotate(-40 -4 0)"/><ellipse cx="28" cy="-24" rx="8" ry="16" transform="rotate(40 28 -24)"/><ellipse cx="10" cy="-50" rx="8" ry="15" transform="rotate(-35 10 -50)"/></g>` },
      leaf: { name: 'Leaf', vb: '14 -4 92 140', w: 62, h: 94, svg: `<path d="M50 0 C 100 20, 106 100, 60 132 C 20 110, 10 40, 50 0 Z" fill="#2D4A3D" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><path d="M50 4 C 56 50, 62 90, 60 130" fill="none" stroke="#9DB89A" stroke-width="1.6"/><path d="M54 40 L 78 30 M57 66 L 86 58 M59 92 L 84 90 M55 54 L 32 44 M58 82 L 30 76" fill="none" stroke="#9DB89A" stroke-width="1.4" stroke-linecap="round"/>` },
      fern: { name: 'Fern', vb: '-32 -4 62 158', w: 40, h: 102, svg: `<path d="M0 0 C 2 40, 0 90, -6 150" fill="none" stroke="${W}" stroke-width="7" stroke-linecap="round"/><path d="M0 0 C 2 40, 0 90, -6 150" fill="none" stroke="#556019" stroke-width="2.4" stroke-linecap="round"/><g stroke="#7C8A2F" stroke-width="3" stroke-linecap="round"><line x1="1" y1="20" x2="22" y2="12"/><line x1="1" y1="20" x2="-20" y2="12"/><line x1="1" y1="44" x2="26" y2="36"/><line x1="1" y1="44" x2="-24" y2="36"/><line x1="0" y1="70" x2="28" y2="62"/><line x1="0" y1="70" x2="-26" y2="62"/><line x1="-2" y1="96" x2="26" y2="90"/><line x1="-2" y1="96" x2="-28" y2="90"/><line x1="-4" y1="122" x2="20" y2="118"/><line x1="-4" y1="122" x2="-24" y2="118"/></g>` },
      flower: { name: 'Flower', vb: '-26 -26 52 52', w: 46, h: 46, svg: `<g fill="#F5D6EC" stroke="${W}" stroke-width="2"><circle cx="0" cy="-14" r="10"/><circle cx="13" cy="-4" r="10"/><circle cx="8" cy="12" r="10"/><circle cx="-8" cy="12" r="10"/><circle cx="-13" cy="-4" r="10"/></g><circle r="7" fill="#E0A526"/>` },
    },
  },
  { id: 'mine', name: 'Mine' },
];

export const POSTIT_COLORS = [
  { id: 'yellow', bg: '#FFF1B8', fold: '#F1DE8E' },
  { id: 'pink', bg: '#FFD6D6', fold: '#F3BDBD' },
  { id: 'mint', bg: '#D7F2E1', fold: '#B8E3C9' },
  { id: 'blue', bg: '#CFE0F5', fold: '#B1CBEA' },
  { id: 'lilac', bg: '#F5D6EC', fold: '#E7B9D8' },
];
export const postitColor = (id) => POSTIT_COLORS.find((c) => c.id === id) || POSTIT_COLORS[0];

export function stickerDef(pack, key) {
  return PACKS.find((p) => p.id === pack)?.items?.[key] || null;
}

export function stickerSVG(def, { w, h } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${def.vb}" width="${w || def.w}" height="${h || def.h}" preserveAspectRatio="none">${def.svg}</svg>`;
}

// ---- Label tags --------------------------------------------------------------

let measureCtx;
function textWidth(text) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '700 12.5px Overpass, sans-serif';
  return measureCtx.measureText(text).width;
}
const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A tag-shaped label sticker sized to its name.
export function labelDef(label) {
  const name = label?.name || 'Label';
  const color = label?.color || '#6B7A85';
  const W0 = Math.round(Math.max(56, textWidth(name) + 42));
  const right = W0 - 5;
  const svg = `<path d="M12 3 H${right - 5} a5 5 0 0 1 5 5 V24 a5 5 0 0 1 -5 5 H12 L2 16 Z" fill="${color}" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/><circle cx="12" cy="16" r="2.6" fill="#FFFFFF"/><text x="${(18 + right) / 2}" y="20.5" font-family="Overpass, sans-serif" font-size="12.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">${escXml(name)}</text>`;
  return { name, vb: `0 0 ${W0} 32`, w: Math.round(W0 * 1.45), h: 46, svg };
}

// ---- Washi tape fills (CSS for the drawer, canvas for pages) -------------------

export const TAPE = {
  stripe: { css: 'repeating-linear-gradient(45deg,#E0A526 0 6px,#F6E3B4 6px 12px)' },
  dots: { css: 'radial-gradient(circle at 5px 5px,#2B5684 2px,transparent 2.5px) 0 0/10px 10px,#CFE0F5' },
  grid: { css: 'linear-gradient(#2F8A7266 1px,transparent 1px) 0 0/8px 8px,linear-gradient(90deg,#2F8A7266 1px,transparent 1px) 0 0/8px 8px,#D7F2E1' },
  tile: { css: 'radial-gradient(circle at 0 0,#2A8C9C 6px,transparent 6.5px) 0 0/26px 26px,radial-gradient(circle at 13px 13px,#D9644E 4px,transparent 4.5px) 0 0/26px 26px,#F6EFE2' },
  stitch: { css: 'linear-gradient(transparent 46%,#FFFFFF 46% 54%,transparent 54%) 0 0/12px 100%,#B85558' },
  kraft: { css: 'repeating-linear-gradient(90deg,#C9A574 0 3px,#BF9A66 3px 5px)' },
};

const tapeCache = new Map();
export function tapePattern(ctx, id) {
  const key = id;
  if (tapeCache.has(key)) return ctx.createPattern(tapeCache.get(key), 'repeat');
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  const S = { stripe: 17, dots: 10, grid: 8, tile: 26, stitch: 12, kraft: 5 }[id] || 10;
  c.width = S; c.height = S;
  if (id === 'stripe') {
    x.fillStyle = '#F6E3B4'; x.fillRect(0, 0, S, S);
    x.strokeStyle = '#E0A526'; x.lineWidth = 6;
    for (let i = -S; i <= S * 2; i += S) { x.beginPath(); x.moveTo(i, S); x.lineTo(i + S, 0); x.stroke(); }
  } else if (id === 'dots') {
    x.fillStyle = '#CFE0F5'; x.fillRect(0, 0, S, S); x.fillStyle = '#2B5684'; x.beginPath(); x.arc(5, 5, 2, 0, 7); x.fill();
  } else if (id === 'grid') {
    x.fillStyle = '#D7F2E1'; x.fillRect(0, 0, S, S); x.fillStyle = 'rgba(47,138,114,0.45)'; x.fillRect(0, 0, S, 1); x.fillRect(0, 0, 1, S);
  } else if (id === 'tile') {
    x.fillStyle = '#F6EFE2'; x.fillRect(0, 0, S, S); x.fillStyle = '#2A8C9C';
    for (const [a, b] of [[0, 0], [S, 0], [0, S], [S, S]]) { x.beginPath(); x.arc(a, b, 6, 0, 7); x.fill(); }
    x.fillStyle = '#D9644E'; x.beginPath(); x.arc(13, 13, 4, 0, 7); x.fill();
  } else if (id === 'stitch') {
    x.fillStyle = '#B85558'; x.fillRect(0, 0, S, S);
  } else {
    x.fillStyle = '#C9A574'; x.fillRect(0, 0, S, S); x.fillStyle = '#BF9A66'; x.fillRect(3, 0, 2, S);
  }
  tapeCache.set(key, c);
  return ctx.createPattern(c, 'repeat');
}

// ---- Drawing stickers on a canvas ----------------------------------------------

const imgCache = new Map();
export function svgImage(svgMarkup, onload) {
  if (imgCache.has(svgMarkup)) {
    const img = imgCache.get(svgMarkup);
    if (!img.complete && onload) img.addEventListener('load', onload, { once: true });
    return img;
  }
  const img = new Image();
  img.decoding = 'async';
  if (onload) img.addEventListener('load', onload, { once: true });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  imgCache.set(svgMarkup, img);
  return img;
}
