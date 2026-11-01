// Audio recordings on notes: record (with pause), play back, and transcribe on
// this device. Each recording is an encrypted file like any image; the note
// keeps a small description of it, including when each stretch was recorded so
// handwriting can be replayed in step with the audio.

import { html, raw, uid, toast } from './util.js';
import * as V from './vault.js';
import { icons } from './icons.js';

export const fmtClock = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

function pickMime() {
  const opts = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return null;
  return opts.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

// Map the moment something was written to a time in the recording (seconds),
// or null if it wasn't written while this recording was running.
export function recordingTime(rec, at) {
  if (!rec || !at || !rec.segs?.length) return null;
  for (let i = rec.segs.length - 1; i >= 0; i--) {
    const s = rec.segs[i];
    if (at >= s.w && at <= s.w + s.d * 1000 + 1500) return Math.min(s.a + s.d, s.a + (at - s.w) / 1000);
  }
  return null;
}

// ---- Recording ------------------------------------------------------------------

let active = null;
export const isRecording = () => !!active;

// Starts recording and shows the recording bar. Resolves with the saved
// recording (or null if cancelled) once you stop.
export function startRecording({ sealed = false, label = 'Recording' } = {}) {
  if (active) return active.done;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast('Recording isn’t available in this browser.');
    return Promise.resolve(null);
  }
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  active = { done };
  (async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast('Allow microphone access to record.');
      active = null;
      resolveDone(null);
      return;
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 48000 });
    const parts = [];
    const segs = [];
    let audioPos = 0;
    let segStart = Date.now();
    let paused = false;
    const startedAt = segStart;
    rec.ondataavailable = (e) => { if (e.data?.size) parts.push(e.data); };

    // Level meter
    let ctx = null;
    let analyser = null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
    } catch { /* meter is optional */ }

    const bar = document.createElement('div');
    bar.className = 'rec-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Recording');
    bar.innerHTML = String(html`<span class="rec-dot" aria-hidden="true"></span>
      <span class="rec-t"><strong>${label}</strong><span id="rec-time" aria-live="off">0:00</span></span>
      <canvas class="rec-wave" width="240" height="40" aria-hidden="true"></canvas>
      <button type="button" class="icon-btn" data-rec="pause" aria-label="Pause recording">${raw(icons.pause({ size: 20 }))}</button>
      <button type="button" class="btn btn-primary btn-sm" data-rec="stop">Stop</button>`);
    document.body.appendChild(bar);
    document.body.classList.add('recording');
    const wave = bar.querySelector('.rec-wave');
    const levels = new Array(48).fill(0);
    const elapsed = () => audioPos + (paused ? 0 : (Date.now() - segStart) / 1000);
    let raf = 0;
    let lastTick = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - lastTick < 90) return;
      lastTick = now;
      bar.querySelector('#rec-time').textContent = fmtClock(elapsed());
      if (!analyser) return;
      const buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      levels.push(paused ? 0 : Math.min(1, peak / 64));
      levels.shift();
      const c = wave.getContext('2d');
      c.clearRect(0, 0, wave.width, wave.height);
      c.fillStyle = getComputedStyle(bar).color;
      levels.forEach((l, i) => { const h = Math.max(2, l * 34); c.fillRect(i * 5, (40 - h) / 2, 3, h); });
    };
    raf = requestAnimationFrame(tick);

    const endSeg = () => { const d = (Date.now() - segStart) / 1000; segs.push({ w: segStart, a: audioPos, d }); audioPos += d; };
    bar.querySelector('[data-rec=pause]').onclick = (e) => {
      const b = e.currentTarget;
      if (!paused) {
        rec.pause?.();
        endSeg();
        paused = true;
        b.innerHTML = String(icons.mic({ size: 20 }));
        b.setAttribute('aria-label', 'Resume recording');
        bar.classList.add('paused');
      } else {
        rec.resume?.();
        segStart = Date.now();
        paused = false;
        b.innerHTML = String(icons.pause({ size: 20 }));
        b.setAttribute('aria-label', 'Pause recording');
        bar.classList.remove('paused');
      }
    };
    const stopped = new Promise((r) => { rec.onstop = r; });
    active.stop = async () => {
      if (!paused) endSeg();
      rec.stop();
      await stopped;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close?.();
      bar.remove();
      document.body.classList.remove('recording');
      const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
      const blob = new Blob(parts, { type });
      active = null;
      if (!blob.size || audioPos < 0.5) { resolveDone(null); return; }
      try {
        const fileId = await V.addFile(new Uint8Array(await blob.arrayBuffer()), { sealed, type });
        resolveDone({ id: uid('r'), fileId, mime: type, start: startedAt, dur: Math.round(audioPos * 10) / 10, segs, size: blob.size, transcript: null });
      } catch (e) {
        toast(e.message || 'Couldn’t save the recording.');
        resolveDone(null);
      }
    };
    bar.querySelector('[data-rec=stop]').onclick = () => active?.stop();
    rec.start(1000);
  })();
  return done;
}

export const stopRecording = () => active?.stop?.();

// ---- Playback ------------------------------------------------------------------------

export async function recordingBlob(rec) {
  const f = await V.fileBytes(rec.fileId);
  if (!f) return null;
  return new Blob([f.bytes || f], { type: rec.mime || 'audio/mp4' });
}

export async function makePlayer(rec) {
  const blob = await recordingBlob(rec);
  if (!blob) throw new Error('This recording hasn’t downloaded yet. Try again after a sync.');
  const url = URL.createObjectURL(blob);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  return {
    audio,
    get time() { return audio.currentTime; },
    get duration() { return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : rec.dur; },
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    seek: (t) => { audio.currentTime = Math.max(0, Math.min(rec.dur, t)); },
    rate: (r) => { audio.playbackRate = r; },
    destroy: () => { audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); },
  };
}

// ---- Transcription (on this device) --------------------------------------------------

// Cut the audio into windows of about 28 seconds, at the quietest moment near
// each cut, so words aren't split and progress can be shown.
function windows(pcm, rate = 16000) {
  const out = [];
  const win = 28 * rate;
  let start = 0;
  while (start < pcm.length) {
    let end = Math.min(pcm.length, start + win);
    if (end < pcm.length) {
      const from = end - 3 * rate;
      const step = rate / 50;
      let best = end;
      let bestE = Infinity;
      for (let p = from; p < end; p += step) {
        let e = 0;
        for (let i = p; i < p + step; i++) e += pcm[i] * pcm[i];
        if (e < bestE) { bestE = e; best = p + step / 2; }
      }
      end = Math.round(best);
    }
    out.push([start, end]);
    start = end;
  }
  return out;
}

export async function transcribeRecording(rec, { onProgress, language = 'english' } = {}) {
  const { audioToPcm16k, transcribe } = await import('./ai.js');
  const blob = await recordingBlob(rec);
  if (!blob) throw new Error('This recording hasn’t downloaded yet.');
  onProgress?.(0, 1, 'Preparing the audio…');
  const pcm = await audioToPcm16k(blob);
  const wins = windows(pcm);
  const chunks = [];
  for (const [i, [a, b]] of wins.entries()) {
    onProgress?.(i, wins.length, `Transcribing ${fmtClock(a / 16000)} of ${fmtClock(pcm.length / 16000)}…`);
    const piece = pcm.slice(a, b);
    // Skip near-silent stretches.
    let energy = 0;
    for (let k = 0; k < piece.length; k += 16) energy += piece[k] * piece[k];
    if (energy / (piece.length / 16) < 1e-6) continue;
    const r = await transcribe(piece, { language });
    const off = a / 16000;
    for (const c of r.chunks?.length ? r.chunks : [{ t: [0, (b - a) / 16000], text: r.text }]) {
      const text = String(c.text || '').trim();
      if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) continue;
      chunks.push({ t: [Math.round((off + (c.t?.[0] ?? 0)) * 10) / 10, Math.round((off + (c.t?.[1] ?? (b - a) / 16000)) * 10) / 10], text });
    }
  }
  onProgress?.(wins.length, wins.length, 'Done');
  return { text: chunks.map((c) => c.text).join(' '), chunks, at: Date.now(), model: 'whisper-tiny' };
}
