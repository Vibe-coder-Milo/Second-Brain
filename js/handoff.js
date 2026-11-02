// Handing a file from one screen to the next: a PDF chosen in a notebook or
// in Capture opens as a new handwritten note with its pages to write on.

let pending = null;
export const handOff = (file) => { pending = file; };
export const takeHandOff = () => { const f = pending; pending = null; return f; };
export const isPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
