// The player for a note's recordings: switch recording, speed, scrub, skip,
// a transcript you can tap to jump to, and transcribing on this device.

import { html, raw, $, toast, fmtDate, fmtTime } from '../util.js';
import * as V from '../vault.js';
import { state } from '../vault.js';
import { icons } from '../icons.js';
import { confirmSheet, menuSheet } from '../ui.js';
import { makePlayer, fmtClock, transcribeRecording } from '../recorder.js';

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
const busy = new Map(); // recording id -> progress text (survives redraws)

export function mountPlayer(host, noteId, { index = 0, onTime, onClose, compact = false, showTranscript = false } = {}) {
  let i = index;
  let player = null;
  let speed = state.device?.playbackRate || 1;
  let raf = 0;
  let open = showTranscript;
  let destroyed = false;
  const note = () => state.notes.get(noteId);
  const recs = () => note()?.recordings || [];

  host.classList.add('player');
  if (compact) host.classList.add('compact');

  async function load() {
    player?.destroy();
    player = null;
    const r = recs()[i];
    draw();
    if (!r) return;
    try {
      player = await makePlayer(r);
      if (destroyed) { player.destroy(); return; }
      player.rate(speed);
      player.audio.addEventListener('play', paintState);
      player.audio.addEventListener('pause', paintState);
      player.audio.addEventListener('ended', paintState);
      player.audio.addEventListener('loadedmetadata', paintTime);
      paintState();
    } catch (e) { $('.pl-msg', host).textContent = e.message; }
  }

  function draw() {
    const list = recs();
    const r = list[i];
    if (!r) { host.innerHTML = `${html`<p class="hint">No recordings yet.</p>`}`; return; }
    const tr = r.transcript;
    const job = busy.get(r.id);
    host.innerHTML = `${html`<div class="pl-top">
        <button type="button" class="pl-which" data-pl="which" aria-label="Choose a recording">${list.length > 1 ? `Recording ${i + 1} of ${list.length}` : 'Recording'}<span class="muted">${fmtDate(r.start)}, ${fmtTime(r.start)}</span></button>
        <button type="button" class="chip sm" data-pl="speed" aria-label="Playback speed ${speed} times">${speed}×</button>
        <button type="button" class="icon-btn bare" data-pl="more" aria-label="Recording options">${icons.more({ size: 18 })}</button>
        ${onClose ? html`<button type="button" class="icon-btn bare" data-pl="close" aria-label="Close player">${icons.close({ size: 18 })}</button>` : ''}
      </div>
      <input type="range" class="pl-scrub" min="0" max="${r.dur}" step="0.1" value="0" aria-label="Position in recording">
      <div class="pl-times"><span id="pl-now">0:00</span><span>${fmtClock(r.dur)}</span></div>
      <div class="pl-ctrls">
        <button type="button" class="icon-btn bare" data-pl="back" aria-label="Back 15 seconds">${icons.back15({ size: 26 })}</button>
        <button type="button" class="pl-play" data-pl="play" aria-label="Play">${icons.play({ size: 26 })}</button>
        <button type="button" class="icon-btn bare" data-pl="fwd" aria-label="Forward 15 seconds">${icons.fwd15({ size: 26 })}</button>
      </div>
      <p class="pl-msg hint" aria-live="polite">${job || ''}</p>
      <div class="pl-tr">
        ${tr ? html`<button type="button" class="pl-tr-toggle" data-pl="tr" aria-expanded="${open ? 'true' : 'false'}">${icons.transcript({ size: 18 })}Transcript</button>
          ${open ? html`<ol class="transcript">${tr.chunks.map((c, k) => html`<li><button type="button" data-seek="${c.t[0]}" data-k="${k}"><span class="ts">${fmtClock(c.t[0])}</span><span class="tx">${c.text}</span></button></li>`)}</ol>` : ''}`
          : job ? '' : html`<button type="button" class="btn btn-sm" data-pl="transcribe">${icons.transcript({ size: 18 })}Transcribe on this device</button>`}
      </div>`}`;
    bind();
    paintState();
  }

  function bind() {
    const on = (k, fn) => host.querySelectorAll(`[data-pl=${k}]`).forEach((b) => { b.onclick = (e) => fn(b, e); });
    on('play', () => { if (!player) return; if (player.audio.paused) player.play(); else player.pause(); });
    on('back', () => player && player.seek(player.time - 15));
    on('fwd', () => player && player.seek(player.time + 15));
    on('speed', () => {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      player?.rate(speed);
      V.updateDevice({ playbackRate: speed }).catch(() => {});
      host.querySelector('[data-pl=speed]').textContent = `${speed}×`;
    });
    on('close', () => onClose?.());
    on('tr', () => { open = !open; draw(); });
    on('transcribe', () => runTranscribe());
    on('which', async () => {
      const list = recs();
      if (list.length < 2) return;
      const v = await menuSheet('Recordings', list.map((r, k) => ({ value: String(k), label: `Recording ${k + 1}: ${fmtDate(r.start)}, ${fmtTime(r.start)} (${fmtClock(r.dur)})` })));
      if (v !== null) { i = Number(v); load(); }
    });
    on('more', async () => {
      const r = recs()[i];
      const items = [];
      if (r.transcript) items.push({ value: 'redo', label: 'Transcribe again' });
      items.push({ value: 'save', label: 'Save the audio file' });
      items.push({ value: 'delete', label: 'Delete this recording', danger: true });
      const act = await menuSheet('Recording', items);
      if (act === 'redo') runTranscribe();
      if (act === 'save') {
        const { recordingBlob } = await import('../recorder.js');
        const { downloadBlob } = await import('../util.js');
        const b = await recordingBlob(r);
        if (b) downloadBlob(`Recording ${fmtDate(r.start)}.${/mp4/.test(r.mime) ? 'm4a' : 'webm'}`, b);
      }
      if (act === 'delete') {
        const ok = await confirmSheet({ title: 'Delete this recording?', body: 'The audio and its transcript go. Your writing stays. This syncs to your other devices.', confirm: 'Delete', danger: true });
        if (!ok) return;
        const n = note();
        await V.saveNote({ ...n, recordings: n.recordings.filter((x) => x.id !== r.id) });
        await V.deleteFile(r.fileId);
        i = Math.max(0, i - 1);
        if (!recs().length) { onClose?.(); return; }
        load();
      }
    });
    const scrub = host.querySelector('.pl-scrub');
    if (scrub) {
      scrub.oninput = () => { player?.seek(Number(scrub.value)); paintTime(); };
    }
    host.querySelectorAll('[data-seek]').forEach((b) => { b.onclick = () => { if (!player) return; player.seek(Number(b.dataset.seek)); player.play(); }; });
  }

  async function runTranscribe() {
    const r = recs()[i];
    if (!r || busy.has(r.id)) return;
    busy.set(r.id, 'Getting the transcriber ready (the first time takes a moment)…');
    draw();
    const msg = () => $('.pl-msg', host);
    try {
      const tr = await transcribeRecording(r, { onProgress: (k, n, text) => { busy.set(r.id, text); const m = msg(); if (m) m.textContent = text; } });
      const n = note();
      if (!n) return;
      await V.saveNote({ ...n, recordings: n.recordings.map((x) => (x.id === r.id ? { ...x, transcript: tr } : x)) });
      busy.delete(r.id);
      open = true;
      if (!destroyed) draw();
      toast(tr.chunks.length ? 'Transcript ready' : 'No speech found in this recording');
    } catch (e) {
      busy.delete(r.id);
      if (!destroyed) { draw(); const m = msg(); if (m) m.textContent = e.message || 'Couldn’t transcribe.'; }
    }
  }

  function paintState() {
    const b = host.querySelector('[data-pl=play]');
    if (!b) return;
    const playing = player && !player.audio.paused;
    b.innerHTML = String(playing ? icons.pause({ size: 26 }) : icons.play({ size: 26 }));
    b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    cancelAnimationFrame(raf);
    if (playing) {
      const loop = () => { paintTime(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    paintTime();
  }

  let lastT = -1;
  function paintTime() {
    if (!player) return;
    const t = player.time;
    const now = host.querySelector('#pl-now');
    if (now) now.textContent = fmtClock(t);
    const scrub = host.querySelector('.pl-scrub');
    if (scrub && document.activeElement !== scrub) scrub.value = String(t);
    // Highlight the line being spoken.
    const tr = recs()[i]?.transcript;
    if (tr && open) {
      let cur = -1;
      tr.chunks.forEach((c, k) => { if (t >= c.t[0] - 0.05) cur = k; });
      host.querySelectorAll('.transcript [data-k]').forEach((b) => b.classList.toggle('now', Number(b.dataset.k) === cur));
    }
    if (Math.abs(t - lastT) > 0.04) { lastT = t; onTime?.(t, recs()[i]); }
  }

  load();
  return {
    get recording() { return recs()[i]; },
    seek(t, play = true) { if (!player) return; player.seek(t); if (play) player.play(); paintTime(); },
    refresh() { if (!recs()[i]) { i = 0; } draw(); },
    destroy() { destroyed = true; cancelAnimationFrame(raf); player?.destroy(); player = null; host.innerHTML = ''; host.classList.remove('player', 'compact'); },
  };
}
