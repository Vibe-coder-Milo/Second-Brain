// Runs the on-device models (search by meaning and transcription) off the main
// thread. Models load from this app's own files; nothing goes over the network
// to anyone else, and nothing you write leaves the device.

import { pipeline, env } from '../vendor/transformers.bundle.js';

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
    } else if (op === 'warm') {
      await load(data.kind);
      self.postMessage({ id, ok: true, result: true });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
