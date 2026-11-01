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

mql.addEventListener?.('change', () => { if (!document.documentElement.dataset.theme) window.dispatchEvent(new Event('sb-theme')); });
