// Light, dark, or follow the device. The choice is also kept in localStorage
// (it isn't private) so the lock screen uses it before the vault is open.

const KEY = 'sb-theme';
const mql = window.matchMedia('(prefers-color-scheme: dark)');
const BAR = { light: '#F1F4F2', dark: '#13202D' };

export function themePref() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

// Is the app showing its dark colours right now?
export function isDarkUI() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : mql.matches;
}

export function applyTheme(t = themePref()) {
  try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* private mode */ }
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  for (const m of document.querySelectorAll('meta[name=theme-color]')) {
    const forMedia = (m.media || '').includes('dark') ? 'dark' : 'light';
    m.content = BAR[t === 'auto' ? forMedia : t];
  }
  window.dispatchEvent(new Event('sb-theme'));
}

// Run fn whenever the app switches between light and dark. Returns a cleanup.
export function onTheme(fn) {
  window.addEventListener('sb-theme', fn);
  return () => window.removeEventListener('sb-theme', fn);
}

// The default text from Settings, as CSS variables the editors read: size,
// font, and colour (with its brightened twin for dark backgrounds).
export function applyTextDefaults(t, fontCss) {
  const st = document.documentElement.style;
  if (!t) { for (const k of ['--note-size', '--default-note-font', '--note-ink', '--note-ink-dark']) st.removeProperty(k); return; }
  st.setProperty('--note-size', `${t.size}px`);
  if (t.font) st.setProperty('--default-note-font', fontCss(t.font)); else st.removeProperty('--default-note-font');
  if (t.color) { st.setProperty('--note-ink', t.color); st.setProperty('--note-ink-dark', darkInk(t.color)); } else { st.removeProperty('--note-ink'); st.removeProperty('--note-ink-dark'); }
}

mql.addEventListener?.('change', () => { if (!document.documentElement.dataset.theme) window.dispatchEvent(new Event('sb-theme')); });

// ---- Colours on dark backgrounds ------------------------------------------------

const toneCache = new Map();
// Colour as [r, g, b] (0-1) and any alpha suffix, from #RGB, #RRGGBB(AA) or rgb().
function parseColour(c) {
  if (typeof c !== 'string') return null;
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  if (m) return { rgb: [m[1], m[2], m[3]].map((v) => Number(v) / 255), alpha: '' };
  if (c[0] !== '#') return null;
  let hex = c.slice(1);
  if (hex.length === 3) hex = [...hex].map((x) => x + x).join('');
  if (hex.length !== 6 && hex.length !== 8) return null;
  return { rgb: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), alpha: hex.length === 8 ? hex.slice(6) : '' };
}
function toHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslHex(h, S, L) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = S * Math.min(L, 1 - L);
    return Math.round((L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

// How a pen or text colour shows on a dark page: dark ink reads as soft
// white, colours are brightened a little.
export function darkInk(c) {
  const hit = toneCache.get(c);
  if (hit) return hit;
  const p = parseColour(c);
  if (!p) return c;
  const { alpha } = p;
  const [h, sat, l] = toHsl(p.rgb);
  let L = l;
  let S = sat;
  if (sat < 0.25 || l < 0.22) {
    // Black, greys and near-black navy read as soft white.
    if (l < 0.6) { L = 0.9 - l * 0.3; S = Math.min(sat, 0.18); }
  } else if (l < 0.66) {
    L = 0.62 + l * 0.18;
    S = Math.min(sat, 0.72);
  }
  const out = `${hslHex(h, S, L)}${alpha.toUpperCase()}`;
  toneCache.set(c, out);
  return out;
}

// A highlight colour for dark mode: a deep, muted version of the same hue,
// so highlighted text stays light and readable (like Notion's dark mode).
const hlCache = new Map();
export function darkHighlight(c) {
  const hit = hlCache.get(c);
  if (hit) return hit;
  const p = parseColour(c);
  if (!p) return c;
  const [h, s] = toHsl(p.rgb);
  const out = s < 0.12 ? '#3A4652' : hslHex(h, Math.min(0.55, s * 0.6 + 0.12), 0.27);
  hlCache.set(c, out);
  return out;
}
