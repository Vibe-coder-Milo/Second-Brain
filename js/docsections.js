// Sections of an imported document (a Word file's headings, a PowerPoint's
// sections and slide titles, a PDF's bookmarks), kept on a handwritten note as
// `docSections: [{ title, level, pageId }]`. They point at pages by id, not by
// number, so adding, removing or moving pages later keeps them right; entries
// whose page is gone are left out when shown.



// From an importer's list ({ title, level, page: 0-based index }) and the
// note's new pages, to what the note keeps.
export function fromIndexes(sections, pages) {
  const out = [];
  for (const s of sections || []) {
    const p = pages[Number(s.page)];
    const title = String(s.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (p && title) out.push({ title, level: Math.min(3, Math.max(1, Math.floor(Number(s.level)) || 1)), pageId: p.id });
  }
  return out;
}

// What to show now: each section with the page's current place in the note,
// in reading order. Sections whose page is gone are dropped.
export function resolve(note) {
  const at = new Map((note?.pages || []).map((p, i) => [p.id, i]));
  return (note?.docSections || [])
    .filter((s) => at.has(s.pageId))
    .map((s, k) => ({ ...s, index: at.get(s.pageId), k }))
    .sort((a, b) => a.index - b.index || a.k - b.k);
}

// A PDF's bookmarks as importer-style sections ({ title, level, page }).
export async function pdfOutline(doc) {
  let outline = null;
  try { outline = await doc.getOutline(); } catch { return []; }
  const out = [];
  const walk = async (items, level) => {
    for (const it of items || []) {
      let page = null;
      try {
        let dest = it.dest;
        if (typeof dest === 'string') dest = await doc.getDestination(dest);
        if (Array.isArray(dest) && dest[0] != null) page = typeof dest[0] === 'object' ? await doc.getPageIndex(dest[0]) : Number(dest[0]);
      } catch { page = null; }
      if (page != null && Number.isFinite(page) && String(it.title || '').trim()) out.push({ title: it.title, level: Math.min(3, level), page });
      if (it.items?.length) await walk(it.items, level + 1);
      if (out.length > 400) return;
    }
  };
  await walk(outline, 1);
  return out;
}
