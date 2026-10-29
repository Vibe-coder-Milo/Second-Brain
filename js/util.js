// Small helpers shared across the app.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));

function renderVal(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}

// Tagged template: interpolations are escaped unless wrapped in raw() or html``.
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += renderVal(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export function uid(prefix = 'n') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36).slice(0, 4)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(ts, { year = 'auto' } = {}) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (year === 'always' || (year === 'auto' && d.getFullYear() !== now.getFullYear())) return `${base} ${d.getFullYear()}`;
  return base;
}
export function fmtTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
export function fmtAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(ts);
}
export const isoDay = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Base64 for binary data, chunked so large images don't overflow the stack.
export function bytesToB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
export function b64ToBytes(b64) {
  const s = atob(String(b64).replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const te = new TextEncoder();
const td = new TextDecoder();
export const utf8 = (s) => te.encode(s);
export const fromUtf8 = (b) => td.decode(b);
export const textToB64 = (s) => bytesToB64(te.encode(s));
export const b64ToText = (b64) => td.decode(b64ToBytes(b64));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

let toastTimer;
export function toast(msg, { ms = 2600 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function firstLine(text, max = 80) {
  const line = String(text || '')
    .split('\n')
    .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
    .find((l) => l.length > 2);
  if (!line) return '';
  return line.length > max ? line.slice(0, max - 1).trimEnd() + '…' : line;
}

export function snippet(text, max = 140) {
  const t = String(text || '').replace(/[#*_>`\[\]]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export const isWide = () => window.matchMedia('(min-width: 900px)').matches;

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the async clipboard.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function downloadText(filename, text, type = 'text/markdown') {
  const blob = new Blob([text], { type });
  downloadBlob(filename, blob);
}
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function readFileText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}
