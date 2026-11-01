// Scanning paper: take or choose a photo, check the corners, pick a clean-up,
// and add as many pages as you like. Everything happens on this device.

import { html, raw, $, toast } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { icons } from '../icons.js';
import { openSheet } from '../ui.js';
import { detectPage, straighten, enhance, rotateCanvas, canvasToJpeg, FILTERS } from '../scan.js';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t open that image.')); };
    img.src = url;
  });
}

// Resolves with [{ bytes, w, h, type }] for each page kept, or [] if cancelled.
export function openScanner({ title = 'Scan', done = 'Save' } = {}) {
  return new Promise((resolve) => {
    const pages = []; // { canvas, jpeg }
    let cur = null; // { img, url, corners, turns }
    let filter = state.device?.scanFilter || 'colour';
    let stage = 'pick';
    let straight = null;
    let finished = false;
    const s = openSheet(`${html`<div class="scan" id="scan"></div>`}`, {
      label: title,
      onClose: async (v) => {
        if (cur) URL.revokeObjectURL(cur.url);
        if (finished) return;
        resolve(v === 'save' ? await Promise.all(pages.map((p) => p.jpeg)) : []);
      },
    });
    s.el.classList.add('scan-sheet');
    const root = $('#scan', s.el);

    const head = (left, mid, right) => html`<div class="sheet-head">${left}<h2>${mid}</h2>${right}</div>`;

    function draw() {
      if (stage === 'pick') drawPick();
      else if (stage === 'crop') drawCrop();
      else drawEnhance();
    }

    function drawPick() {
      root.innerHTML = `${html`${head(html`<button type="button" class="btn btn-ghost side" data-x="cancel" style="justify-content:flex-start;padding:0">Cancel</button>`, title, html`<span class="side">${pages.length ? html`<button type="button" class="btn btn-ghost" data-x="save" style="font-weight:700;padding:0;justify-content:flex-end">${done}</button>` : ''}</span>`)}
        ${pages.length ? html`<ol class="scan-pages">${pages.map((p, i) => html`<li><img alt="Page ${i + 1}" data-pg="${i}"><button type="button" class="remove" data-rm="${i}" aria-label="Remove page ${i + 1}">${icons.close({ size: 14 })}</button><span>${i + 1}</span></li>`)}</ol>` : html`<p class="muted scan-intro">Lay the page on a darker surface, fill most of the frame, and avoid shadows. The edges are found for you.</p>`}
        <div class="scan-pick">
          <label class="btn btn-primary">${icons.camera({ size: 20 })}${pages.length ? 'Scan another page' : 'Take a photo'}<input type="file" accept="image/*" capture="environment" class="sr-only" data-in="camera"></label>
          <label class="btn">${icons.image({ size: 20 })}Choose from Photos<input type="file" accept="image/*" multiple class="sr-only" data-in="photos"></label>
        </div>`}`;
      root.querySelectorAll('[data-pg]').forEach(async (img) => { const p = pages[Number(img.dataset.pg)]; img.src = p.thumb; });
      root.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { pages.splice(Number(b.dataset.rm), 1); draw(); }; });
      root.querySelector('[data-x=cancel]').onclick = () => s.close();
      const sv = root.querySelector('[data-x=save]');
      if (sv) sv.onclick = () => s.close('save');
      root.querySelectorAll('[data-in]').forEach((inp) => {
        inp.onchange = async () => {
          const files = [...inp.files];
          inp.value = '';
          if (!files.length) return;
          if (files.length > 1) {
            // Several photos: find each page and keep it, then review.
            for (const [i, f] of files.entries()) {
              toast(`Scanning ${i + 1} of ${files.length}…`);
              try {
                const im = await loadImage(f);
                const { corners } = detectPage(im.img);
                await keep(straighten(im.img, corners), filter);
                URL.revokeObjectURL(im.url);
              } catch (e) { toast(e.message); }
            }
            draw();
            return;
          }
          try {
            const im = await loadImage(files[0]);
            const det = detectPage(im.img);
            cur = { ...im, corners: det.corners, found: det.found, turns: 0 };
            stage = 'crop';
            draw();
          } catch (e) { toast(e.message); }
        };
      });
    }

    function drawCrop() {
      root.innerHTML = `${html`${head(html`<button type="button" class="btn btn-ghost side" data-x="back" style="justify-content:flex-start;padding:0">Retake</button>`, 'Edges', html`<span class="side"><button type="button" class="btn btn-ghost" data-x="next" style="font-weight:700;padding:0;justify-content:flex-end">Next</button></span>`)}
        <p class="hint">${cur.found ? 'Drag a corner if it isn’t quite on the edge of the page.' : 'Couldn’t find the page’s edges. Drag the corners onto them.'}</p>
        <div class="crop-stage" id="crop-stage"><img src="${cur.url}" alt="Your photo" draggable="false"><svg class="crop-svg" aria-hidden="true"><polygon></polygon></svg>
          ${[0, 1, 2, 3].map((i) => html`<button type="button" class="crop-handle" data-h="${i}" aria-label="${['Top left', 'Top right', 'Bottom right', 'Bottom left'][i]} corner"></button>`)}</div>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-x="auto">Find edges</button><button type="button" class="btn btn-sm" data-x="all">Whole photo</button></div>`}`;
      const box = $('#crop-stage', root);
      const img = box.querySelector('img');
      const poly = box.querySelector('polygon');
      const handles = [...box.querySelectorAll('[data-h]')];
      const place = () => {
        const w = img.clientWidth;
        const h = img.clientHeight;
        box.querySelector('svg').setAttribute('viewBox', `0 0 ${w} ${h}`);
        poly.setAttribute('points', cur.corners.map(([x, y]) => `${x * w},${y * h}`).join(' '));
        handles.forEach((b, i) => { b.style.left = `${cur.corners[i][0] * w}px`; b.style.top = `${cur.corners[i][1] * h}px`; });
      };
      if (img.complete) place(); else img.onload = place;
      new ResizeObserver(place).observe(img);
      handles.forEach((b, i) => {
        b.onpointerdown = (e) => {
          e.preventDefault();
          b.setPointerCapture(e.pointerId);
          const move = (ev) => {
            const r = img.getBoundingClientRect();
            cur.corners[i] = [Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))];
            place();
          };
          b.onpointermove = move;
          b.onpointerup = () => { b.onpointermove = null; };
        };
        // Arrow keys nudge a corner.
        b.onkeydown = (e) => {
          const step = e.shiftKey ? 0.02 : 0.005;
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
          if (!d) return;
          e.preventDefault();
          cur.corners[i] = [Math.max(0, Math.min(1, cur.corners[i][0] + d[0])), Math.max(0, Math.min(1, cur.corners[i][1] + d[1]))];
          place();
        };
      });
      root.querySelector('[data-x=back]').onclick = () => { URL.revokeObjectURL(cur.url); cur = null; stage = 'pick'; draw(); };
      root.querySelector('[data-x=auto]').onclick = () => { const d = detectPage(img); cur.corners = d.corners; cur.found = d.found; place(); if (!d.found) toast('Couldn’t find the edges in this photo.'); };
      root.querySelector('[data-x=all]').onclick = () => { cur.corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; place(); };
      root.querySelector('[data-x=next]').onclick = () => {
        root.querySelector('[data-x=next]').textContent = 'Straightening…';
        setTimeout(() => {
          straight = straighten(img, cur.corners);
          stage = 'enhance';
          draw();
        }, 20);
      };
    }

    let previewUrl = null;
    function drawEnhance() {
      root.innerHTML = `${html`${head(html`<button type="button" class="btn btn-ghost side" data-x="edges" style="justify-content:flex-start;padding:0">Edges</button>`, 'Clean up', html`<span class="side"><button type="button" class="btn btn-ghost" data-x="keep" style="font-weight:700;padding:0;justify-content:flex-end">Keep</button></span>`)}
        <div class="scan-preview"><img id="sc-prev" alt="The cleaned-up page"></div>
        <div class="chips" role="radiogroup" aria-label="Clean-up">${FILTERS.map((f) => html`<button type="button" class="chip" role="radio" aria-checked="${filter === f.id ? 'true' : 'false'}" aria-pressed="${filter === f.id ? 'true' : 'false'}" data-f="${f.id}">${f.name}</button>`)}
          <button type="button" class="chip" data-x="rotate">${raw('↻')} Rotate</button></div>`}`;
      const paint = () => {
        const c = enhance(rotateCanvas(straight, cur.turns), filter);
        c.toBlob((b) => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(b); const im = $('#sc-prev', root); if (im) im.src = previewUrl; }, 'image/jpeg', 0.8);
      };
      paint();
      root.querySelectorAll('[data-f]').forEach((b) => {
        b.onclick = () => {
          filter = b.dataset.f;
          V.updateDevice({ scanFilter: filter }).catch(() => {});
          root.querySelectorAll('[data-f]').forEach((x) => { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
          paint();
        };
      });
      root.querySelector('[data-x=rotate]').onclick = () => { cur.turns = (cur.turns + 1) % 4; paint(); };
      root.querySelector('[data-x=edges]').onclick = () => { stage = 'crop'; draw(); };
      root.querySelector('[data-x=keep]').onclick = async () => {
        await keep(rotateCanvas(straight, cur.turns), filter);
        URL.revokeObjectURL(cur.url);
        cur = null;
        straight = null;
        stage = 'pick';
        draw();
      };
    }

    async function keep(canvas, f) {
      const c = enhance(canvas, f);
      const t = document.createElement('canvas');
      const k = 160 / Math.max(c.width, c.height);
      t.width = Math.round(c.width * k);
      t.height = Math.round(c.height * k);
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      pages.push({ jpeg: canvasToJpeg(c, f === 'bw' ? 0.8 : 0.86), thumb: t.toDataURL('image/jpeg', 0.7) });
    }

    draw();
    void finished;
  });
}
