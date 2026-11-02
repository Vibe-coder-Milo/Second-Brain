// Offline support. The app shell is cached so it opens without a connection;
// your notes live in encrypted on-device storage, not in this cache.
// Bump VERSION whenever app files change.

const VERSION = 'sb-v12';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/notes.css',
  './fonts/atkinson-hyperlegible-latin-400-normal.woff2',
  './fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  './fonts/caveat-latin-400-normal.woff2',
  './fonts/caveat-latin-700-normal.woff2',
  './fonts/fraunces-latin-400-normal.woff2',
  './fonts/fraunces-latin-700-normal.woff2',
  './fonts/jetbrains-mono-latin-400-normal.woff2',
  './fonts/jetbrains-mono-latin-700-normal.woff2',
  './fonts/nunito-latin-400-normal.woff2',
  './fonts/nunito-latin-700-normal.woff2',
  './fonts/overpass-latin-400-normal.woff2',
  './fonts/overpass-latin-500-normal.woff2',
  './fonts/overpass-latin-600-normal.woff2',
  './fonts/overpass-latin-700-normal.woff2',
  './fonts/spectral-latin-400-italic.woff2',
  './fonts/spectral-latin-400-normal.woff2',
  './fonts/spectral-latin-500-italic.woff2',
  './fonts/spectral-latin-500-normal.woff2',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './js/ai-worker.js',
  './js/ai.js',
  './js/app.js',
  './js/appupdate.js',
  './js/boarddraw.js',
  './js/claude.js',
  './js/connections.js',
  './js/covers.js',
  './js/coverart.js',
  './js/crypto.js',
  './js/db.js',
  './js/doc.js',
  './js/editor/ink.js',
  './js/editor/pagestack.js',
  './js/editor/inkdraw.js',
  './js/editor/rich.js',
  './js/editor/toolbar.js',
  './js/editor/zoomstrip.js',
  './js/export.js',
  './js/focus.js',
  './js/graph.js',
  './js/handoff.js',
  './js/handwriting.js',
  './js/icons.js',
  './js/images.js',
  './js/markdown.js',
  './js/mapassist.js',
  './js/mapdata.js',
  './js/model.js',
  './js/minimap.js',
  './js/notework.js',
  './js/ocr.js',
  './js/organiser.js',
  './js/pdf.js',
  './js/recorder.js',
  './js/scan.js',
  './js/semantic.js',
  './js/stickers.js',
  './js/sync.js',
  './js/theme.js',
  './js/ui.js',
  './js/util.js',
  './js/vault.js',
  './js/views/ask.js',
  './js/views/board.js',
  './js/views/capture.js',
  './js/views/gate.js',
  './js/views/history.js',
  './js/views/inbox.js',
  './js/views/inknote.js',
  './js/views/labels.js',
  './js/views/map.js',
  './js/views/note.js',
  './js/views/notebooks.js',
  './js/views/notes.js',
  './js/views/organise.js',
  './js/views/recordings.js',
  './js/views/review.js',
  './js/views/scanner.js',
  './js/views/settings.js',
  './js/views/shell.js',
  './js/views/tableview.js',
  './js/views/tasks.js',
  './js/views/today.js',
  './vendor/editor.bundle.js',
  './vendor/fflate.min.js',
  './vendor/force-graph.min.js',
  './vendor/freehand.js',
  './vendor/marked.esm.js',
  './vendor/purify.es.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'sb-ocr' && k !== 'sb-ai').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // never touch GitHub API calls

  // The OCR engine, PDF libraries and on-device AI models are large and rarely
  // change: cache them on first use, and keep them across app updates.
  const big = url.pathname.includes('/vendor/tesseract/') || url.pathname.includes('/vendor/pdfjs/') || url.pathname.endsWith('/vendor/pdf-lib.esm.min.js');
  const ai = url.pathname.includes('/vendor/models/') || url.pathname.includes('/vendor/ort/');
  if (big || ai) {
    e.respondWith(caches.open(ai ? 'sb-ai' : 'sb-ocr').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Everything else: serve from cache, refresh in the background.
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const key = req.mode === 'navigate' ? './index.html' : req;
    const hit = await c.match(key, { ignoreSearch: req.mode === 'navigate' });
    const refresh = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') c.put(key, res.clone());
      return res;
    }).catch(() => hit);
    return hit || refresh;
  }));
});
