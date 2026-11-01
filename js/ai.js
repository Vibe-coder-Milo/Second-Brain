// Talks to the on-device model worker. Each call returns a promise.

let worker = null;
let seq = 0;
const pending = new Map();
const listeners = new Set();
export const aiState = { embed: 'idle', asr: 'idle', progress: {} };

function get() {
  if (worker) return worker;
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module', name: 'second-brain-ai' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      aiState.progress[m.kind] = { loaded: m.loaded, total: m.total };
      aiState[m.kind === 'embed' ? 'embed' : 'asr'] = 'loading';
      listeners.forEach((f) => f({ type: 'progress', ...m }));
      return;
    }
    if (m.type === 'ready') {
      aiState[m.kind === 'embed' ? 'embed' : 'asr'] = 'ready';
      listeners.forEach((f) => f({ type: 'ready', kind: m.kind }));
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'The on-device model stopped.');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker = null;
  };
  return worker;
}

function call(op, data, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    get().postMessage({ id, op, data }, transfer);
  });
}

export const onAI = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Vectors for a list of texts (each 384 numbers, unit length).
export async function embed(texts) {
  if (!texts.length) return [];
  const { dim, flat } = await call('embed', { texts });
  return texts.map((_, i) => flat.subarray(i * dim, (i + 1) * dim));
}

// Text with timestamps for 16 kHz mono audio.
export function transcribe(audio, { language = null } = {}) {
  return call('transcribe', { audio, language }, [audio.buffer]);
}

export const warm = (kind) => call('warm', { kind });

export function stopAI() {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(new Error('Stopped'));
  pending.clear();
}

// Decode any recording the browser can play into 16 kHz mono samples.
export async function audioToPcm16k(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let decoded;
  try {
    decoded = await new Promise((res, rej) => {
      const p = ctx.decodeAudioData(buf.slice(0), res, rej);
      if (p?.then) p.then(res, rej);
    });
  } finally { ctx.close?.(); }
  const frames = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, Math.max(1, frames), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}
