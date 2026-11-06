// The fonts typed text can use, and the text sizes, in one place: the
// typed-note editor, text boxes on handwritten pages, PDF export and the
// "Default text" setting all read them from here. No other imports, so any
// module can use it.

export const FONTS = [
  { id: 'Spectral', name: 'Spectral', note: 'Book serif', css: "'Spectral', Georgia, serif" },
  { id: 'Overpass', name: 'Overpass', note: 'Clean sans', css: "'Overpass', system-ui, sans-serif" },
  { id: 'Fraunces', name: 'Fraunces', note: 'Display serif', css: "'Fraunces', Georgia, serif" },
  { id: 'Nunito', name: 'Nunito', note: 'Rounded', css: "'Nunito', system-ui, sans-serif" },
  { id: 'Atkinson Hyperlegible', name: 'Atkinson Hyperlegible', note: 'Easy to read', css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { id: 'JetBrains Mono', name: 'JetBrains Mono', note: 'Monospace', css: "'JetBrains Mono', ui-monospace, monospace" },
  { id: 'Caveat', name: 'Caveat', note: 'Handwritten', css: "'Caveat', cursive" },
];
export const FONT_IDS = FONTS.map((f) => f.id);
// The usual fonts: typed notes use Spectral, text boxes on handwritten pages Overpass.
export const NOTE_FONT = 'Spectral';
export const BOX_FONT = 'Overpass';
// A font's CSS stack; an unknown id gets the fallback's.
export const fontCss = (id, fallback = NOTE_FONT) => (FONTS.find((f) => f.id === id) || FONTS.find((f) => f.id === fallback)).css;

// Text sizes offered in Settings, and the usual one. Sizes in typed text
// (`fontSize` marks) are measured against TEXT_SIZE, so in a text box on a
// handwritten page an 18 px mark is the box's own size.
export const TEXT_SIZES = [14, 16, 18, 20, 22, 24, 28];
export const TEXT_SIZE = 18;
// A text box's size is in page units (the page is 1000 wide): 20 units
// matches typed text at 18.
export const BOX_SIZE = 20;
export const boxSize = (size) => Math.round((size * BOX_SIZE) / TEXT_SIZE);
