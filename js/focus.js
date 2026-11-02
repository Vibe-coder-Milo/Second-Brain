// Focus while writing: on iPad and computers, hide the side panel (and a
// notebook's list of notes) so the note gets the whole screen. Remembered on
// this device; the side panel comes back on other screens.

import { icons } from './icons.js';

const KEY = 'sb-focus';
export function focusPref() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

const label = () => (focusPref() ? 'Show the side panel' : 'Hide the side panel, for more room to write');

export const focusButtonHtml = () => `<button type="button" class="icon-btn bare focus-btn" data-act="focus" aria-label="${label()}" aria-pressed="${focusPref() ? 'true' : 'false'}">${icons.sidebar()}</button>`;

function sync() {
  for (const b of document.querySelectorAll('.focus-btn')) {
    b.setAttribute('aria-pressed', focusPref() ? 'true' : 'false');
    b.setAttribute('aria-label', label());
    b.title = label();
  }
}

// A note screen opened or closed.
export function enterNote() { document.body.classList.toggle('focus', focusPref()); sync(); }
export function leaveNote() { document.body.classList.remove('focus'); }

export function toggleFocus() {
  const on = !focusPref();
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  document.body.classList.toggle('focus', on);
  sync();
  // Pages and boards size themselves to the space they have.
  window.dispatchEvent(new Event('resize'));
}
