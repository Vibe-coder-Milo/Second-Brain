// Capture sheet: a thought, screenshots/photos and/or a link, saved in seconds.

import { html, $, toast } from '../util.js';
import * as V from '../vault.js';
import { newNote } from '../model.js';
import { compressImage, looksLikeScreenshot } from '../images.js';
import { openSheet } from '../ui.js';
import { icons } from '../icons.js';

export function openCapture({ files = [], text = '' } = {}, ctx) {
  const picked = []; // { file, url }
  let dest = '';
  let showUrl = false;
  let saving = false;

  const s = openSheet(`${html`<form id="cap" novalidate style="display:flex;flex-direction:column;gap:18px">
    <div class="sheet-head"><button type="button" class="btn btn-ghost side" data-cancel style="justify-content:flex-start;padding:0">Cancel</button><h2>Capture</h2><span class="side"></span></div>
    <div class="cap-kinds"><button type="button" class="btn" data-kind="note">${icons.lines({ size: 18 })}Typed note</button><button type="button" class="btn" data-kind="ink">${icons.pen({ size: 18 })}Handwritten</button><button type="button" class="btn" data-kind="board">${icons.board({ size: 18 })}Whiteboard</button></div>
    <div class="field"><label class="sr-only" for="cap-text">Thought</label>
      <textarea id="cap-text" class="serif" rows="4" placeholder="What’s on your mind?">${text}</textarea></div>
    <div class="field" style="gap:10px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px"><span class="label">Screenshots and photos</span><span class="hint">Text is read on this device</span></div>
      <div class="shots" id="cap-shots"></div>
      <p class="hint" id="cap-split" hidden></p>
    </div>
    <div class="btn-row">
      <label class="btn" style="flex:1">${icons.camera()}Take photo<input type="file" accept="image/*" capture="environment" class="sr-only" id="cap-camera"></label>
      <button type="button" class="btn" style="flex:1" id="cap-scan">${icons.scan({ size: 18 })}Scan</button>
      <button type="button" class="btn" style="flex:1" id="cap-link-btn">${icons.link({ size: 18 })}Add link</button>
    </div>
    <div class="field" id="cap-url-wrap" hidden><label for="cap-url">Link</label><input id="cap-url" type="url" placeholder="https://" autocapitalize="off" autocorrect="off"></div>
    <div class="field"><label for="cap-dest">Save to</label><select id="cap-dest">
      <option value="">Inbox, sort later</option>
      ${V.state.config.regions.map((r) => html`<option value="${r.id}">${r.name}</option>`)}
    </select></div>
    <p class="error" id="cap-err" role="alert" hidden></p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button type="submit" class="btn btn-primary btn-block" id="cap-save">Save to inbox</button>
      <p class="hint" style="text-align:center">Encrypted before it’s saved or synced</p>
    </div>
  </form>`}`, {
    label: 'Capture',
    onClose: () => picked.forEach((p) => URL.revokeObjectURL(p.url)),
  });

  const el = s.el;
  const ta = $('#cap-text', el);

  const addFiles = (list) => {
    for (const f of list) if (f && f.type?.startsWith('image/')) picked.push({ file: f, url: URL.createObjectURL(f) });
    drawShots();
  };

  function drawShots() {
    const box = $('#cap-shots', el);
    box.innerHTML = `${html`${picked.map((p, i) => html`<div class="shot"><img src="${p.url}" alt="Selected image ${i + 1}"><button type="button" class="remove" data-rm="${i}" aria-label="Remove image ${i + 1}">${icons.close({ size: 14 })}</button></div>`)}
      <label class="shot"><span class="add">${icons.image({ size: 24 })}Add from Photos<input type="file" accept="image/*" multiple class="sr-only" id="cap-photos"></span></label>`}`;
    box.querySelectorAll('[data-rm]').forEach((b) => {
      b.onclick = () => { const [p] = picked.splice(Number(b.dataset.rm), 1); URL.revokeObjectURL(p.url); drawShots(); };
    });
    $('#cap-photos', el).onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
    drawHint();
  }

  function drawHint() {
    const hint = $('#cap-split', el);
    const hasText = !!ta.value.trim();
    if (picked.length > 1) {
      hint.hidden = false;
      hint.textContent = hasText ? 'Saved together as one note with your text.' : `Each image becomes its own note (${picked.length} notes).`;
    } else hint.hidden = true;
  }

  ta.addEventListener('input', drawHint);
  $('#cap-camera', el).onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#cap-link-btn', el).onclick = () => {
    showUrl = !showUrl;
    $('#cap-url-wrap', el).hidden = !showUrl;
    if (showUrl) $('#cap-url', el).focus();
  };
  $('#cap-dest', el).onchange = (e) => {
    dest = e.target.value;
    const r = V.state.config.regions.find((x) => x.id === dest);
    $('#cap-save', el).textContent = r ? `Save to ${r.name}` : 'Save to inbox';
  };
  el.querySelector('[data-cancel]').onclick = () => s.close();
  // Scan paper into one note (all pages together), read on this device.
  $('#cap-scan', el).onclick = async () => {
    const { openScanner } = await import('./scanner.js');
    const pages = await openScanner({ title: 'Scan', done: 'Save' });
    if (!pages.length) return;
    try {
      const files = [];
      for (const pg of pages) {
        const fid = await V.addFile(pg.bytes, { type: pg.type });
        files.push({ id: fid, w: pg.w, h: pg.h, type: pg.type, ocr: '', ocrStatus: 'pending', ocrBy: V.state.deviceId });
      }
      await V.saveNote(newNote({ region: dest || null, inbox: !dest, body: ta.value.trim(), files, source: 'scan' }));
      s.close(true);
      const where = dest ? V.state.config.regions.find((r) => r.id === dest)?.name : 'inbox';
      toast(`Scanned ${pages.length} page${pages.length === 1 ? '' : 's'} to ${where}`);
      ctx.runOcr();
    } catch (e) { toast(e.message || 'Couldn’t save the scan.'); }
  };
  el.querySelectorAll('[data-kind]').forEach((b) => {
    b.onclick = () => {
      s.close();
      const r = dest ? `region=${dest}` : '';
      const k = b.dataset.kind;
      ctx.navigate(k === 'ink' || k === 'board' ? `#/note/new?kind=${k}${r ? `&${r}` : ''}` : `#/note/new${r ? `?${r}` : ''}`);
    };
  });

  // Paste images or text straight into the sheet (desktop / iPad keyboard).
  el.addEventListener('paste', (e) => {
    const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); addFiles(imgs); }
  });

  $('#cap', el).onsubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const err = $('#cap-err', el);
    const textVal = ta.value.trim();
    const url = $('#cap-url', el)?.value.trim() || '';
    if (!textVal && !picked.length && !url) { err.textContent = 'Write something, add an image or paste a link.'; err.hidden = false; return; }
    if (url && !/^https?:\/\//i.test(url)) { err.textContent = 'Links need to start with https://'; err.hidden = false; return; }
    err.hidden = true;
    saving = true;
    const btn = $('#cap-save', el);
    btn.disabled = true;
    const base = { region: dest || null, inbox: !dest };
    try {
      const images = [];
      for (let i = 0; i < picked.length; i++) {
        btn.textContent = picked.length > 1 ? `Saving image ${i + 1} of ${picked.length}…` : 'Saving…';
        const img = await compressImage(picked[i].file);
        const fid = await V.addFile(img.bytes);
        images.push({ id: fid, w: img.w, h: img.h, type: img.type, ocr: '', ocrStatus: 'pending', ocrBy: V.state.deviceId, shot: looksLikeScreenshot(picked[i].file, img.w, img.h) });
      }
      const fileEntry = ({ shot, ...f }) => f;
      const notes = [];
      if (textVal || url || images.length <= 1) {
        const src = images.length ? (images[0].shot ? 'screenshot' : 'photo') : url && !textVal ? 'link' : 'thought';
        notes.push(newNote({ ...base, body: textVal, title: '', titleAuto: true, files: images.map(fileEntry), url: url || null, source: src }));
        if (!textVal && url) notes[0].title = url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80);
      } else {
        for (const im of images) notes.push(newNote({ ...base, files: [fileEntry(im)], source: im.shot ? 'screenshot' : 'photo' }));
      }
      for (const n of notes) await V.saveNote(n);
      s.close(true);
      const where = dest ? V.state.config.regions.find((r) => r.id === dest)?.name : 'inbox';
      toast(notes.length > 1 ? `${notes.length} notes saved to ${where}` : `Saved to ${where}`);
      ctx.runOcr();
    } catch (ex) {
      console.error(ex);
      err.textContent = ex.message || 'Couldn’t save. Try again.';
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Try again';
      saving = false;
    }
  };

  addFiles(files);
  drawShots();
  if (!files.length) requestAnimationFrame(() => ta.focus());
  return s;
}
