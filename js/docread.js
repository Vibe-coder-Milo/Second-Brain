// Reads Word (.docx) and PowerPoint (.pptx) files on the device and turns them
// into plain data. Nothing is shown or stored here and nothing leaves the
// device: a .docx/.pptx is a zip of XML files, opened with the bundled zip
// library and the browser's own XML parser.
//
//   readDocx(bytes) -> { kind: 'docx', doc, images, sections, title, warnings }
//     doc       a typed-note document (the editor's JSON). Beyond the editor's
//               own nodes it holds { type: 'pageBreak' } markers (explicit page
//               breaks in the Word file); the editor does not know that node, so
//               take them out (or lay pages out on them) before saving as a note.
//     images    [{ id, bytes, type, w, h }]; `imageFile` nodes in doc use `id`
//               as their fileId until the caller swaps in a stored file's id.
//     sections  [{ title, level, block, isTitle }] every heading in order;
//               `block` is the index into doc.content.
//   readPptx(bytes) -> { kind: 'pptx', width, height, slides, images, sections,
//                        title, warnings }   (width/height in EMU; positions
//                        are fractions of the slide, 0 to 1)
//   documentKind(file) -> 'pdf' | 'docx' | 'pptx' | 'image' | null

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMU_PX = 9525;

// ---- Small helpers --------------------------------------------------------------

export function documentKind(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/) || [])[1] || '';
  if (ext === 'docx' || ext === 'docm' || type.includes('wordprocessingml.document')) return 'docx';
  if (ext === 'pptx' || ext === 'pptm' || type.includes('presentationml.presentation')) return 'pptx';
  if (ext === 'doc' || ext === 'ppt' || type === 'application/msword' || type === 'application/vnd.ms-powerpoint') return null;
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/') || /^(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/.test(ext)) return 'image';
  return null;
}

async function openZip(bytes, what) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fail = () => new Error(`This ${what} file couldn’t be read.`);
  let files;
  try {
    const { unzipSync } = await import('../vendor/fflate.min.js');
    files = unzipSync(u8, { filter: (e) => !/^docProps\/thumbnail/i.test(e.name) });
  } catch { throw fail(); }
  const dec = new TextDecoder('utf-8');
  const cache = new Map();
  const xml = (path) => {
    if (cache.has(path)) return cache.get(path);
    let out = null;
    const f = files[path];
    if (f) {
      try {
        const d = new DOMParser().parseFromString(dec.decode(f), 'application/xml');
        out = d.getElementsByTagName('parsererror').length ? null : d.documentElement;
      } catch { out = null; }
    }
    cache.set(path, out);
    return out;
  };
  return { files, xml, fail };
}

// Child elements (not text), optionally by local name.
const kids = (el, name) => {
  const out = [];
  if (!el) return out;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (!name || c.localName === name) out.push(c);
  return out;
};
const kid = (el, name) => {
  if (!el) return null;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c;
  return null;
};
const path = (el, ...names) => { let e = el; for (const n of names) { e = kid(e, n); if (!e) return null; } return e; };
const attr = (el, name, ns) => (el ? (ns ? el.getAttributeNS(ns, name) : el.getAttribute(name)) ?? el.getAttribute(`w:${name}`) ?? null : null);
const wval = (el) => (el ? el.getAttributeNS(W_NS, 'val') ?? el.getAttribute('w:val') ?? el.getAttribute('val') : null);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const isOff = (v) => v === '0' || v === 'false' || v === 'off' || v === 'none';

function dirOf(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
function resolvePath(base, target) {
  if (!target) return null;
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dirOf(base) + target).split('/');
  const out = [];
  for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); }
  return out.join('/');
}
// Relationships of a part: id -> { type, target (full path), external }.
function relsOf(zip, partPath) {
  const dir = dirOf(partPath);
  const rels = new Map();
  const root = zip.xml(`${dir}_rels/${partPath.slice(dir.length)}.rels`);
  for (const r of kids(root, 'Relationship')) {
    const external = r.getAttribute('TargetMode') === 'External';
    rels.set(r.getAttribute('Id'), { type: (r.getAttribute('Type') || '').split('/').pop(), target: external ? null : resolvePath(partPath, r.getAttribute('Target')), external });
  }
  return rels;
}
const relByType = (rels, type) => { for (const r of rels.values()) if (r.type === type) return r; return null; };

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff' };

// Collects the pictures of a file once each (the same picture used twice gets
// one entry), skipping types a browser can't show (EMF, WMF, ...).
function imageStore(zip, warnings) {
  const byPath = new Map();
  const images = [];
  let n = 0;
  return {
    images,
    get(p, w, h) {
      if (!p) return null;
      if (byPath.has(p)) return byPath.get(p);
      const f = zip.files[p];
      const type = IMAGE_TYPES[(p.split('.').pop() || '').toLowerCase()];
      let img = null;
      if (f && type && f.length) {
        img = { id: `img${++n}`, bytes: f, type, w: Math.round(w) || 0, h: Math.round(h) || 0 };
        images.push(img);
      } else if (f) warnings.push(`A picture (${p.split('/').pop()}) is in a format that can’t be shown and was left out.`);
      byPath.set(p, img);
      return img;
    },
  };
}

function coreTitle(zip) {
  const root = zip.xml('docProps/core.xml');
  for (const c of kids(root)) if (c.localName === 'title') { const t = (c.textContent || '').trim(); if (t) return t; }
  return null;
}

// ---- Word -----------------------------------------------------------------------

function readStyles(zip) {
  const styles = new Map();
  for (const s of kids(zip.xml('word/styles.xml'), 'style')) {
    const id = s.getAttributeNS(W_NS, 'styleId') || s.getAttribute('w:styleId');
    if (!id) continue;
    const ppr = kid(s, 'pPr');
    const numPr = kid(ppr, 'numPr');
    styles.set(id, {
      name: (wval(kid(s, 'name')) || '').toLowerCase(),
      basedOn: wval(kid(s, 'basedOn')),
      numId: numPr && kid(numPr, 'numId') ? wval(kid(numPr, 'numId')) : null,
      ilvl: numPr && kid(numPr, 'ilvl') ? num(wval(kid(numPr, 'ilvl'))) : null,
      outline: kid(ppr, 'outlineLvl') ? num(wval(kid(ppr, 'outlineLvl')), -1) : null,
    });
  }
  return styles;
}
// A style's own value, else its parent's (a few steps up).
function styleProp(styles, id, prop) {
  for (let i = 0; id && i < 10; i++) {
    const s = styles.get(id);
    if (!s) return null;
    if (s[prop] != null) return s[prop];
    id = s.basedOn;
  }
  return null;
}
function styleNames(styles, id) {
  const out = [];
  for (let i = 0; id && i < 10; i++) { const s = styles.get(id); if (!s) break; out.push(s.name); id = s.basedOn; }
  return out;
}

// numbering.xml: numId -> level -> 'bullet' | 'ordered'.
function readNumbering(zip) {
  const abs = new Map();
  const nums = new Map();
  const root = zip.xml('word/numbering.xml');
  for (const a of kids(root, 'abstractNum')) {
    const lv = new Map();
    for (const l of kids(a, 'lvl')) {
      const fmt = wval(kid(l, 'numFmt'));
      lv.set(num(l.getAttributeNS(W_NS, 'ilvl') ?? l.getAttribute('w:ilvl')), { fmt, start: num(wval(kid(l, 'start')), 1) });
    }
    abs.set(a.getAttributeNS(W_NS, 'abstractNumId') ?? a.getAttribute('w:abstractNumId'), lv);
  }
  for (const n of kids(root, 'num')) {
    nums.set(n.getAttributeNS(W_NS, 'numId') ?? n.getAttribute('w:numId'), wval(kid(n, 'abstractNumId')));
  }
  return (numId, ilvl) => {
    const lv = abs.get(nums.get(numId));
    const l = lv && (lv.get(ilvl) || lv.get(0));
    if (!l) return { type: 'bullet', start: 1 };
    return { type: l.fmt === 'bullet' || l.fmt === 'none' ? 'bullet' : 'ordered', start: l.start };
  };
}

export async function readDocx(bytes) {
  const zip = await openZip(bytes, 'Word');
  const body = path(zip.xml('word/document.xml'), 'body');
  if (!body) throw zip.fail();
  const warnings = [];
  const styles = readStyles(zip);
  const listInfo = readNumbering(zip);
  const rels = relsOf(zip, 'word/document.xml');
  const store = imageStore(zip, warnings);
  const sections = [];

  // One run's formatting -> editor marks.
  const markOf = (rpr, rstyle) => {
    const names = styleNames(styles, rstyle);
    const has = (n) => { const e = kid(rpr, n); return !!e && !isOff(wval(e)); };
    const marks = [];
    if (has('b') || names.includes('strong')) marks.push({ type: 'bold' });
    if (has('i') || names.includes('emphasis')) marks.push({ type: 'italic' });
    const u = kid(rpr, 'u');
    if (u && !isOff(wval(u))) marks.push({ type: 'underline' });
    if (has('strike') || has('dstrike')) marks.push({ type: 'strike' });
    return marks;
  };

  // The picture in a run (w:drawing or old-style w:pict), as an imageFile node.
  const pictureOf = (run) => {
    const out = [];
    const find = (el) => {
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (c.localName === 'drawing') {
          const ext = (c.getElementsByTagNameNS('*', 'extent')[0]);
          const blip = c.getElementsByTagNameNS(A_NS, 'blip')[0];
          const id = blip && (blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed'));
          const w = num(ext?.getAttribute('cx')) / EMU_PX, h = num(ext?.getAttribute('cy')) / EMU_PX;
          out.push({ id, w, h });
        } else if (c.localName === 'pict') {
          const im = c.getElementsByTagNameNS('*', 'imagedata')[0];
          const id = im && (im.getAttributeNS(R_NS, 'id') || im.getAttribute('r:id'));
          const st = (c.getElementsByTagNameNS('*', 'shape')[0]?.getAttribute('style') || '');
          const pt = (k) => { const m = st.match(new RegExp(`${k}:([\\d.]+)pt`)); return m ? Number(m[1]) * 4 / 3 : 0; };
          out.push({ id, w: pt('width'), h: pt('height') });
        } else if (c.localName === 'AlternateContent') { const f = kid(c, 'Choice') || kid(c, 'Fallback'); if (f) find(f); }
      }
    };
    find(run);
    return out.map((p) => {
      const rel = rels.get(p.id);
      const img = rel && store.get(rel.target, p.w, p.h);
      return img ? { type: 'imageFile', attrs: { fileId: img.id, w: Math.round(p.w) || img.w || null, h: Math.round(p.h) || img.h || null } } : null;
    }).filter(Boolean);
  };

  // A paragraph's pieces: text/hardBreak inline nodes, with page breaks and
  // pictures coming out as separate blocks between paragraphs.
  // Returns a list of 'parts': { inline: [...] } | { block: node }.
  const paragraphParts = (p) => {
    const parts = [];
    let cur = [];
    const flush = () => { if (cur.length) parts.push({ inline: cur }); cur = []; };
    const addText = (text, marks) => {
      if (!text) return;
      const last = cur[cur.length - 1];
      const same = last && last.type === 'text' && JSON.stringify(last.marks || []) === JSON.stringify(marks);
      if (same) last.text += text;
      else cur.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
    };
    const walk = (el) => {
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        const ln = c.localName;
        if (ln === 'r') {
          const rpr = kid(c, 'rPr');
          const marks = markOf(rpr, wval(kid(rpr, 'rStyle')));
          for (let x = c.firstElementChild; x; x = x.nextElementSibling) {
            const xn = x.localName;
            if (xn === 't') addText(x.textContent, marks);
            else if (xn === 'tab') addText('\t', marks);
            else if (xn === 'noBreakHyphen') addText('-', marks);
            else if (xn === 'br' || xn === 'cr') {
              const t = x.getAttributeNS(W_NS, 'type') || x.getAttribute('w:type');
              if (t === 'page') { flush(); parts.push({ block: { type: 'pageBreak' } }); }
              else cur.push({ type: 'hardBreak' });
            } else if (xn === 'drawing' || xn === 'pict' || xn === 'AlternateContent') {
              const pics = pictureOf(c);
              if (pics.length) { flush(); for (const pic of pics) parts.push({ block: pic }); }
              break;
            }
          }
        } else if (ln === 'hyperlink' || ln === 'ins' || ln === 'smartTag' || ln === 'fldSimple' || ln === 'sdt' || ln === 'sdtContent' || ln === 'customXml') walk(c);
      }
    };
    walk(p);
    flush();
    return parts;
  };

  const headingOf = (p, ppr) => {
    const sid = wval(kid(ppr, 'pStyle'));
    const names = styleNames(styles, sid);
    if (names.includes('title')) return { level: 1, isTitle: true };
    for (const n of names) { const m = n.match(/^heading\s*(\d)/); if (m) return { level: Math.min(3, Math.max(1, +m[1])), isTitle: false }; }
    const ol = kid(ppr, 'outlineLvl') ? num(wval(kid(ppr, 'outlineLvl')), -1) : styleProp(styles, sid, 'outline');
    if (ol != null && ol >= 0 && ol < 9) return { level: Math.min(3, ol + 1), isTitle: false };
    return null;
  };

  // A run of blocks (the body, or a table cell) -> editor blocks.
  const blocksOf = (container, top) => {
    const out = [];
    let stack = []; // open lists: { ilvl, type, node }
    const push = (node, heading) => {
      out.push(node);
      stack = [];
      if (heading && top) {
        const text = (node.content || []).map((t) => t.text || '').join('').trim();
        if (text) sections.push({ title: text, level: heading.level, block: out.length - 1, isTitle: heading.isTitle });
      }
    };
    const addListItem = (inline, numId, ilvl) => {
      const info = listInfo(numId, ilvl);
      const item = { type: 'listItem', content: [inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' }] };
      while (stack.length && stack[stack.length - 1].ilvl > ilvl) stack.pop();
      if (stack.length && stack[stack.length - 1].ilvl === ilvl && stack[stack.length - 1].type !== info.type) stack.pop();
      let cur = stack[stack.length - 1];
      if (cur && cur.ilvl === ilvl) { cur.node.content.push(item); return; }
      const list = { type: info.type === 'bullet' ? 'bulletList' : 'orderedList', content: [item] };
      if (info.type === 'ordered' && info.start !== 1) list.attrs = { start: info.start };
      if (!cur) { out.push(list); stack = [{ ilvl, type: info.type, node: list }]; return; }
      // Deeper than the open list: nest it inside that list's last item.
      const host = cur.node.content[cur.node.content.length - 1];
      host.content.push(list);
      stack.push({ ilvl, type: info.type, node: list });
    };

    for (const el of kids(container)) {
      const ln = el.localName;
      if (ln === 'p') {
        const ppr = kid(el, 'pPr');
        const parts = paragraphParts(el);
        if (kid(ppr, 'pageBreakBefore') && !isOff(wval(kid(ppr, 'pageBreakBefore')))) push({ type: 'pageBreak' });
        const sid = wval(kid(ppr, 'pStyle'));
        const head = headingOf(el, ppr);
        // List membership: the paragraph's own numbering, else its style's.
        const npr = kid(ppr, 'numPr');
        let numId = npr && kid(npr, 'numId') ? wval(kid(npr, 'numId')) : styleProp(styles, sid, 'numId');
        let ilvl = npr && kid(npr, 'ilvl') ? num(wval(kid(npr, 'ilvl'))) : styleProp(styles, sid, 'ilvl');
        if (ilvl == null) { const m = styleNames(styles, sid)[0]?.match(/list\s+(?:bullet|number|paragraph)\s+(\d)$/); ilvl = m ? +m[1] - 1 : 0; }
        const isList = !head && numId && numId !== '0';
        for (const part of parts) {
          if (part.block) { push(part.block); continue; }
          if (isList) { addListItem(part.inline, numId, ilvl); continue; }
          const inline = part.inline;
          // Only spaces or line breaks is Word's spacing, not content.
          if (!inline.some((n) => (n.type === 'text' ? n.text.trim() : n.type !== 'hardBreak'))) continue;
          if (head) push({ type: 'heading', attrs: { level: head.level }, content: inline }, head);
          else push({ type: 'paragraph', content: inline });
        }
      } else if (ln === 'tbl') {
        const rows = [];
        const trs = kids(el, 'tr');
        trs.forEach((tr, ri) => {
          const cells = [];
          const marked = !!kid(kid(tr, 'trPr'), 'tblHeader');
          for (const tc of kids(tr, 'tc')) {
            const content = blocksOf(tc, false).filter((b) => b.type !== 'pageBreak');
            const tcpr = kid(tc, 'tcPr');
            const span = num(wval(kid(tcpr, 'gridSpan')), 1);
            const cell = { type: ri === 0 || marked ? 'tableHeader' : 'tableCell', content: content.length ? content : [{ type: 'paragraph' }] };
            if (span > 1) cell.attrs = { colspan: span };
            cells.push(cell);
          }
          if (cells.length) rows.push({ type: 'tableRow', content: cells });
        });
        if (rows.length) push({ type: 'table', content: rows });
      } else if (ln === 'sdt') {
        const inner = kid(el, 'sdtContent');
        if (inner) { for (const b of blocksOf(inner, top)) push(b); }
      }
    }
    return out;
  };

  const content = blocksOf(body, true);
  // Sub-blocks pushed via sdt above are appended without section info; fine.
  if (!content.length) content.push({ type: 'paragraph' });
  const doc = { type: 'doc', content };
  const title = coreTitle(zip) || sections[0]?.title || null;
  return { kind: 'docx', doc, images: store.images, sections, title, warnings };
}

// ---- PowerPoint -----------------------------------------------------------------

const hex = (v) => (/^[0-9a-f]{6}$/i.test(v || '') ? `#${v.toUpperCase()}` : null);

export async function readPptx(bytes) {
  const zip = await openZip(bytes, 'PowerPoint');
  const pres = zip.xml('ppt/presentation.xml');
  if (!pres) throw zip.fail();
  const warnings = [];
  const store = imageStore(zip, warnings);
  const sz = kid(pres, 'sldSz');
  const width = num(sz?.getAttribute('cx'), 12192000), height = num(sz?.getAttribute('cy'), 6858000);
  const presRels = relsOf(zip, 'ppt/presentation.xml');

  // Slides in order (and their ids, for sections).
  const order = [];
  for (const s of kids(kid(pres, 'sldIdLst'), 'sldId')) {
    const rel = presRels.get(s.getAttributeNS(R_NS, 'id') || s.getAttribute('r:id'));
    if (rel?.target && zip.xml(rel.target)) order.push({ id: s.getAttribute('id'), part: rel.target });
  }

  // Theme colours, through the master's colour map.
  const themeCache = new Map();
  const themeColors = (masterPart) => {
    if (themeCache.has(masterPart)) return themeCache.get(masterPart);
    const theme = relByType(relsOf(zip, masterPart), 'theme');
    const scheme = path(zip.xml(theme?.target), 'themeElements', 'clrScheme');
    const t = {};
    for (const c of kids(scheme)) {
      const v = kid(c, 'srgbClr')?.getAttribute('val') || kid(c, 'sysClr')?.getAttribute('lastClr');
      if (v) t[c.localName] = v;
    }
    const map = {};
    const cm = kid(zip.xml(masterPart), 'clrMap');
    for (const a of cm ? cm.attributes : []) map[a.name] = a.value;
    const res = (name) => { const m = map[name] || name; return t[m] || t[{ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }[name]] || null; };
    themeCache.set(masterPart, res);
    return res;
  };
  // A fill/colour element (a:solidFill etc.) -> '#RRGGBB' or null.
  const colorOf = (holder, theme) => {
    const fill = kid(holder, 'solidFill');
    const c = fill && kids(fill)[0];
    if (!c) return null;
    if (c.localName === 'srgbClr') return hex(c.getAttribute('val'));
    if (c.localName === 'sysClr') return hex(c.getAttribute('lastClr'));
    if (c.localName === 'schemeClr') return hex(theme?.(c.getAttribute('val')));
    return null;
  };

  // Where a shape sits: a:xfrm / p:xfrm -> { x, y, w, h } in EMU, or null.
  const xfrmOf = (el) => {
    const x = el && (kid(kid(el, 'spPr'), 'xfrm') || kid(el, 'xfrm'));
    const off = kid(x, 'off'), ext = kid(x, 'ext');
    if (!off || !ext) return null;
    return { x: num(off.getAttribute('x')), y: num(off.getAttribute('y')), w: num(ext.getAttribute('cx')), h: num(ext.getAttribute('cy')) };
  };
  const phOf = (sp) => {
    const ph = path(sp, 'nvSpPr', 'nvPr', 'ph') || path(sp, 'nvPicPr', 'nvPr', 'ph') || path(sp, 'nvGraphicFramePr', 'nvPr', 'ph');
    if (!ph) return null;
    let type = ph.getAttribute('type') || 'body';
    const idx = ph.getAttribute('idx');
    return { type, idx: idx == null ? null : idx };
  };
  const family = (type) => (type === 'ctrTitle' || type === 'title' ? 'title' : type === 'subTitle' || type === 'body' || type === 'obj' ? 'body' : type);
  // Placeholders of a layout or master, found once per part.
  const phCache = new Map();
  const placeholdersOf = (part) => {
    if (phCache.has(part)) return phCache.get(part);
    const list = [];
    for (const sp of kids(path(zip.xml(part), 'cSld', 'spTree'))) {
      const ph = phOf(sp);
      if (ph) list.push({ ph, el: sp });
    }
    phCache.set(part, list);
    return list;
  };
  const findPh = (part, ph) => {
    const list = placeholdersOf(part);
    return (ph.idx != null && ph.idx !== '0' && list.find((p) => p.ph.idx === ph.idx)) || list.find((p) => family(p.ph.type) === family(ph.type) && (ph.idx == null || p.ph.idx === ph.idx || family(ph.type) === 'title')) || list.find((p) => family(p.ph.type) === family(ph.type)) || null;
  };

  const layoutOf = new Map(), masterOf = new Map();
  const chainOf = (part) => {
    if (!layoutOf.has(part)) {
      const lay = relByType(relsOf(zip, part), 'slideLayout')?.target || null;
      layoutOf.set(part, lay);
      masterOf.set(part, lay ? relByType(relsOf(zip, lay), 'slideMaster')?.target || null : null);
    }
    return { layout: layoutOf.get(part), master: masterOf.get(part) };
  };

  const DEF_SIZE = { title: 40, body: 24, other: 18 };
  const textLevelProps = (holder, lvl) => kid(kid(holder, 'lstStyle'), `lvl${lvl + 1}pPr`);

  const slides = [];
  const bgOf = (part, theme) => colorOf(path(zip.xml(part), 'cSld', 'bg', 'bgPr'), theme);

  for (const { part } of order) {
    const root = zip.xml(part);
    const { layout, master } = chainOf(part);
    const theme = master ? themeColors(master) : null;
    const rels = relsOf(zip, part);
    const txStyles = master ? kid(zip.xml(master), 'txStyles') : null;
    const shapes = [];
    let title = null;

    const textShape = (sp, box, tr) => {
      const ph = phOf(sp);
      const fam = ph ? family(ph.type) : 'other';
      const layPh = ph && layout ? findPh(layout, ph) : null;
      const masPh = ph && master ? findPh(master, ph) : null;
      const styleRoot = fam === 'title' ? kid(txStyles, 'titleStyle') : ph ? kid(txStyles, 'bodyStyle') : kid(txStyles, 'otherStyle');
      const body = kid(sp, 'txBody');
      const paragraphs = [];
      for (const p of kids(body, 'p')) {
        const ppr = kid(p, 'pPr');
        const lvl = Math.min(8, num(ppr?.getAttribute('lvl')));
        const srcs = [ppr, textLevelProps(body, lvl), layPh && textLevelProps(kid(layPh.el, 'txBody'), lvl), masPh && textLevelProps(kid(masPh.el, 'txBody'), lvl), kid(styleRoot, `lvl${lvl + 1}pPr`)].filter(Boolean);
        const defs = srcs.map((s) => kid(s, 'defRPr')).filter(Boolean);
        const runs = [];
        for (const r of kids(p)) {
          let text = null, rpr = null;
          if (r.localName === 'r' || r.localName === 'fld') { text = kid(r, 't')?.textContent ?? ''; rpr = kid(r, 'rPr'); }
          else if (r.localName === 'br') { text = '\n'; rpr = kid(r, 'rPr'); }
          if (text == null || text === '') continue;
          const rs = [rpr, ...defs];
          const pick = (f) => { for (const e of rs) { const v = e && f(e); if (v != null) return v; } return null; };
          const flag = (name) => pick((e) => (e.hasAttribute(name) ? e.getAttribute(name) === '1' || e.getAttribute(name) === 'true' : null));
          const szv = pick((e) => (e.getAttribute('sz') ? num(e.getAttribute('sz')) / 100 : null));
          runs.push({
            text, bold: !!flag('b'), italic: !!flag('i'),
            underline: (pick((e) => e.getAttribute('u')) || 'none') !== 'none',
            size: szv || DEF_SIZE[fam] || 18,
            color: pick((e) => colorOf(e, theme)),
          });
        }
        const bu = (() => {
          for (const s of srcs) {
            if (kid(s, 'buNone')) return false;
            if (kid(s, 'buChar') || kid(s, 'buAutoNum') || kid(s, 'buBlip')) return true;
          }
          return false;
        })();
        const alg = srcs.map((s) => s.getAttribute('algn')).find(Boolean);
        paragraphs.push({ runs, level: lvl, bullet: bu && runs.length > 0, align: { ctr: 'center', r: 'right', just: 'justify' }[alg] || 'left' });
      }
      if (!paragraphs.some((p) => p.runs.length)) return null;
      const isTitle = !!ph && fam === 'title';
      if (isTitle && title == null) title = paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim() || null;
      // Position: this shape, else the layout's placeholder, else the master's.
      let x = xfrmOf(sp);
      if (x && tr) x = tr(x);
      if (!x && ph) x = xfrmOf(layPh?.el) || xfrmOf(masPh?.el);
      if (!x) return null;
      return { type: 'text', ...frac(x), paragraphs, isTitle };
    };
    const frac = (b) => ({ x: b.x / width, y: b.y / height, w: b.w / width, h: b.h / height });

    const walk = (container, tr) => {
      for (const el of kids(container)) {
        const ln = el.localName;
        if (ln === 'sp') {
          const s = textShape(el, null, tr);
          if (s) shapes.push(s);
        } else if (ln === 'pic') {
          let b = xfrmOf(el);
          if (b && tr) b = tr(b);
          const blip = el.getElementsByTagNameNS(A_NS, 'blip')[0];
          const rel = rels.get(blip && (blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed')));
          if (!b) continue;
          const img = rel && store.get(rel.target, b.w / EMU_PX, b.h / EMU_PX);
          if (img) shapes.push({ type: 'picture', ...frac(b), imageId: img.id });
        } else if (ln === 'graphicFrame') {
          let b = xfrmOf(el);
          if (b && tr) b = tr(b);
          const tbl = el.getElementsByTagNameNS(A_NS, 'tbl')[0];
          if (tbl && b) {
            const rows = kids(tbl, 'tr').map((tr2) => kids(tr2, 'tc').map((tc) => kids(kid(tc, 'txBody'), 'p').map((p) => kids(p).map((r) => (r.localName === 'br' ? '\n' : kid(r, 't')?.textContent || '')).join('')).join('\n')));
            shapes.push({ type: 'table', ...frac(b), rows });
          } else if (!tbl) warnings.push(`Slide ${slides.length + 1} has a chart or diagram that can’t be shown.`);
        } else if (ln === 'grpSp') {
          // A group: children are placed in the group's own coordinates.
          const gx = kid(kid(el, 'grpSpPr'), 'xfrm');
          const off = kid(gx, 'off'), ext = kid(gx, 'ext'), co = kid(gx, 'chOff'), ce = kid(gx, 'chExt');
          let inner = tr;
          if (off && ext && co && ce) {
            const sx = num(ce.getAttribute('cx')) ? num(ext.getAttribute('cx')) / num(ce.getAttribute('cx')) : 1;
            const sy = num(ce.getAttribute('cy')) ? num(ext.getAttribute('cy')) / num(ce.getAttribute('cy')) : 1;
            const ox = num(off.getAttribute('x')), oy = num(off.getAttribute('y')), cx0 = num(co.getAttribute('x')), cy0 = num(co.getAttribute('y'));
            inner = (b) => { const m = { x: ox + (b.x - cx0) * sx, y: oy + (b.y - cy0) * sy, w: b.w * sx, h: b.h * sy }; return tr ? tr(m) : m; };
          }
          walk(el, inner);
        }
      }
    };
    walk(path(root, 'cSld', 'spTree'), null);

    // Notes: the text of the notes page's body placeholder.
    let notes = null;
    const nrel = relByType(rels, 'notesSlide');
    if (nrel?.target) {
      const lines = [];
      for (const sp of kids(path(zip.xml(nrel.target), 'cSld', 'spTree'), 'sp')) {
        const ph = phOf(sp);
        if (ph?.type !== 'body') continue;
        for (const p of kids(kid(sp, 'txBody'), 'p')) lines.push(kids(p).map((r) => kid(r, 't')?.textContent || '').join(''));
      }
      notes = lines.join('\n').trim() || null;
    }
    const slide = { title, shapes, background: bgOf(part, theme) || (layout && bgOf(layout, theme)) || (master && bgOf(master, theme)) || null };
    if (notes) slide.notes = notes;
    slides.push(slide);
  }

  // PowerPoint's own sections (a list of slide ids per name).
  const sections = [];
  const byId = new Map(order.map((o, i) => [o.id, i]));
  const ext = kid(pres, 'extLst');
  for (const e of kids(ext, 'ext')) {
    for (const list of kids(e, 'sectionLst')) {
      for (const s of kids(list, 'section')) {
        const ids = kids(kid(s, 'sldIdLst'), 'sldId').map((x) => byId.get(x.getAttribute('id'))).filter((i) => i != null);
        sections.push({ name: s.getAttribute('name') || '', slides: ids });
      }
    }
  }

  const title = coreTitle(zip) || slides[0]?.title || null;
  return { kind: 'pptx', width, height, slides, images: store.images, sections, title, warnings };
}
