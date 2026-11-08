// Pictures from the clipboard (Ctrl/Cmd+V, or a Paste button) and from
// drag and drop, for typed notes and handwritten pages.

// The pictures in a paste or drop event (screenshots come as image files).
export function imagesIn(dt) {
  return [...(dt?.files || [])].filter((f) => f.type.startsWith('image/'));
}

// Is this element somewhere you type (so a paste there is text, not for the page)?
export function isTypingTarget(el) {
  return !!el?.closest?.('input, textarea, [contenteditable="true"], .ProseMirror');
}

// Read pictures from the clipboard after a tap on a Paste button (iPad and
// iPhone show their own small "Paste" bubble first). Returns [] if there are none.
export async function readClipboardImages() {
  if (!navigator.clipboard?.read) throw new Error('This browser can’t read pictures from the clipboard. Press Ctrl+V (or Cmd+V) instead.');
  let items;
  try { items = await navigator.clipboard.read(); } catch (e) {
    if (e?.name === 'NotAllowedError') throw new Error('Pasting wasn’t allowed. Try again and tap Paste when it asks.');
    throw new Error('Couldn’t read the clipboard.');
  }
  const out = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    out.push(new File([blob], `Pasted ${out.length + 1}.${type.split('/')[1] || 'png'}`, { type }));
  }
  return out;
}
