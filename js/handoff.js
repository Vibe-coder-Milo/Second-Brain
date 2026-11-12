// Handing a file from one screen to the next: a PDF, Word, PowerPoint or
// picture file chosen in a notebook or Capture, or dropped on the map, opens
// as a new handwritten note with its pages to write on.

let pending = null;
export const handOff = (file) => { pending = file; };
export const takeHandOff = () => { const f = pending; pending = null; return f; };
export const isPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
