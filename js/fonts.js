// The fonts typed text can use, and the text sizes, in one place: the
// typed-note editor, text boxes on handwritten pages, PDF export and the
// "Default text" setting all read them from here. No other imports, so any
// module can use it.

export const FONTS = [
  // Serifs
  { id: 'Spectral', name: 'Spectral', note: 'Book serif', css: "'Spectral', Georgia, serif" },
  { id: 'Lora', name: 'Lora', note: 'Reading serif', css: "'Lora', Georgia, serif" },
  { id: 'EB Garamond', name: 'EB Garamond', note: 'Classic serif', css: "'EB Garamond', Garamond, Georgia, serif" },
  { id: 'Merriweather', name: 'Merriweather', note: 'Sturdy serif', css: "'Merriweather', Georgia, serif" },
  { id: 'Fraunces', name: 'Fraunces', note: 'Display serif', css: "'Fraunces', Georgia, serif" },
  { id: 'Playfair Display', name: 'Playfair Display', note: 'Elegant display', css: "'Playfair Display', Georgia, serif" },
  // Sans
  { id: 'Overpass', name: 'Overpass', note: 'Clean sans', css: "'Overpass', system-ui, sans-serif" },
  { id: 'Inter', name: 'Inter', note: 'Modern sans', css: "'Inter', system-ui, sans-serif" },
  { id: 'Nunito', name: 'Nunito', note: 'Rounded', css: "'Nunito', system-ui, sans-serif" },
  { id: 'Lexend', name: 'Lexend', note: 'Easy reading sans', css: "'Lexend', system-ui, sans-serif" },
  { id: 'Atkinson Hyperlegible', name: 'Atkinson Hyperlegible', note: 'Easy to read', css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  // Handwriting
  { id: 'Caveat', name: 'Caveat', note: 'Handwritten', css: "'Caveat', cursive" },
  { id: 'Patrick Hand', name: 'Patrick Hand', note: 'Neat handwriting', css: "'Patrick Hand', cursive" },
  { id: 'Kalam', name: 'Kalam', note: 'Pen handwriting', css: "'Kalam', cursive" },
  // Monospace
  { id: 'JetBrains Mono', name: 'JetBrains Mono', note: 'Monospace', css: "'JetBrains Mono', ui-monospace, monospace" },
];
export const FONT_IDS = FONTS.map((f) => f.id);
// The usual fonts: typed notes use Spectral, text boxes on handwritten pages Overpass.
export const NOTE_FONT = 'Spectral';
export const BOX_FONT = 'Overpass';
// A font's CSS stack; an unknown id gets the fallback's.
export const fontCss = (id, fallback = NOTE_FONT) => (FONTS.find((f) => f.id === id) || FONTS.find((f) => f.id === fallback)).css;

// Fonts load only when first used. Canvas text (PDF export, page pictures)
// draws with a font only once it is loaded, so those callers first load the
// fonts their content names: `fontIdsIn(data)` finds them, `loadFonts(ids)`
// loads just those (unknown ids are ignored, and a browser without the
// Font Loading API just skips it).
export const fontIdsIn = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => fontIdsIn(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if ((k === 'font' || k === 'fontFamily') && typeof v === 'string' && FONTS.some((f) => f.id === v)) out.add(v);
      else fontIdsIn(v, out);
    }
  }
  return out;
};
export async function loadFonts(ids) {
  const fonts = document.fonts;
  if (!fonts?.load) return;
  const list = [...new Set(ids)].filter((id) => FONTS.some((f) => f.id === id));
  await Promise.all(list.flatMap((id) => [fonts.load(`400 16px "${id}"`), fonts.load(`700 16px "${id}"`)])).catch(() => {});
}

// Text sizes offered in Settings, and the usual one. Sizes in typed text
// (`fontSize` marks) are measured against TEXT_SIZE, so in a text box on a
// handwritten page an 18 px mark is the box's own size.
export const TEXT_SIZES = [14, 16, 18, 20, 22, 24, 28];
export const TEXT_SIZE = 18;
// A text box's size is in page units (the page is 1000 wide): 20 units
// matches typed text at 18.
export const BOX_SIZE = 20;
export const boxSize = (size) => Math.round((size * BOX_SIZE) / TEXT_SIZE);
