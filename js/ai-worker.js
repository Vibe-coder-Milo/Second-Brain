// Runs the on-device models (search by meaning, transcription, handwriting) off the main
// thread. Models load from this app's own files; nothing goes over the network
// to anyone else, and nothing you write leaves the device.

import { pipeline, env, InferenceSession, Tensor } from '../vendor/transformers.bundle.js';

const base = new URL('../vendor/', import.meta.url).href;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${base}models/`;
env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = `${base}ort/`;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

const loading = {};
function load(kind) {
  if (!loading[kind]) {
    const progress = (p) => {
      if (p.status === 'progress' && p.total) self.postMessage({ type: 'progress', kind, loaded: p.loaded, total: p.total, file: p.file });
    };
    loading[kind] = kind === 'embed'
      ? pipeline('feature-extraction', 'minilm', { dtype: 'q8', progress_callback: progress })
      : pipeline('automatic-speech-recognition', 'whisper-tiny', { dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, progress_callback: progress });
    loading[kind].then(() => self.postMessage({ type: 'ready', kind }), () => { loading[kind] = null; });
  }
  return loading[kind];
}

// Handwriting: a text-line recogniser run directly with ONNX Runtime.
let hand = null;
function loadHand() {
  if (!hand) {
    hand = (async () => {
      const [buf, dict] = await Promise.all([
        fetch(`${base}models/handwriting/rec.onnx`).then((r) => { if (!r.ok) throw new Error('Couldn’t load the handwriting reader.'); return r.arrayBuffer(); }),
        fetch(`${base}models/handwriting/dict.txt`).then((r) => r.text()),
      ]);
      const sess = await InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] });
      const chars = dict.replace(/\n$/, '').split('\n');
      chars.push(' ');
      self.postMessage({ type: 'ready', kind: 'hand' });
      return { sess, chars };
    })();
    hand.catch(() => { hand = null; });
  }
  return hand;
}

// Greedy CTC decoding: best class per column, repeats merged, blanks dropped.
function decode(out, chars) {
  const [, T, C] = out.dims;
  const p = out.data;
  let text = '';
  let last = -1;
  let conf = 0;
  let n = 0;
  for (let t = 0; t < T; t++) {
    let best = 0;
    let bv = -Infinity;
    const o = t * C;
    for (let c = 0; c < C; c++) { const v = p[o + c]; if (v > bv) { bv = v; best = c; } }
    if (best !== last && best !== 0) { text += chars[best] ?? ''; conf += bv; n++; }
    last = best;
  }
  return { text: text.replace(/\s+/g, ' ').trim(), conf: n ? conf / n : 0 };
}

self.onmessage = async (e) => {
  const { id, op, data } = e.data;
  try {
    if (op === 'embed') {
      const model = await load('embed');
      const out = await model(data.texts, { pooling: 'mean', normalize: true });
      const dim = out.dims[out.dims.length - 1];
      const flat = new Float32Array(out.data);
      self.postMessage({ id, ok: true, result: { dim, flat } }, [flat.buffer]);
    } else if (op === 'transcribe') {
      const model = await load('asr');
      const opts = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: 'transcribe' };
      if (data.language) opts.language = data.language;
      const out = await model(data.audio, opts);
      self.postMessage({ id, ok: true, result: { text: out.text, chunks: (out.chunks || []).map((c) => ({ t: c.timestamp, text: c.text })) } });
    } else if (op === 'hand') {
      const { sess, chars } = await loadHand();
      const out = [];
      for (const l of data.lines) {
        const t = new Tensor('float32', l.data, [1, 3, 48, l.w]);
        const r = await sess.run({ [sess.inputNames[0]]: t });
        out.push(decode(r[sess.outputNames[0]], chars));
      }
      self.postMessage({ id, ok: true, result: out });
    } else if (op === 'warm') {
      if (data.kind === 'hand') { await loadHand(); self.postMessage({ id, ok: true, result: true }); return; }
      await load(data.kind);
      self.postMessage({ id, ok: true, result: true });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
