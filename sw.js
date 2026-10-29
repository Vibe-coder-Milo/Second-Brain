// Offline support. The app shell is cached so it opens without a connection;
// your notes live in encrypted on-device storage, not in this cache.
// Bump VERSION whenever app files change.

const VERSION = 'sb-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/claude.js',
  './js/crypto.js',
  './js/db.js',
  './js/graph.js',
  './js/icons.js',
  './js/images.js',
  './js/markdown.js',
  './js/model.js',
  './js/ocr.js',
  './js/sync.js',
  './js/ui.js',
  './js/util.js',
  './js/vault.js',
  './js/views/ask.js',
  './js/views/capture.js',
  './js/views/gate.js',
  './js/views/inbox.js',
  './js/views/map.js',
  './js/views/note.js',
  './js/views/notes.js',
  './js/views/review.js',
  './js/views/settings.js',
  './js/views/shell.js',
  './vendor/force-graph.min.js',
  './vendor/marked.esm.js',
  './vendor/purify.es.mjs',
  './fonts/overpass-latin-400-normal.woff2',
  './fonts/overpass-latin-500-normal.woff2',
  './fonts/overpass-latin-600-normal.woff2',
  './fonts/overpass-latin-700-normal.woff2',
  './fonts/spectral-latin-400-normal.woff2',
  './fonts/spectral-latin-500-normal.woff2',
  './fonts/spectral-latin-400-italic.woff2',
  './fonts/spectral-latin-500-italic.woff2',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'sb-ocr').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // never touch GitHub API calls

  // The OCR engine is large and never changes for a given version: cache on first use.
  if (url.pathname.includes('/vendor/tesseract/')) {
    e.respondWith(caches.open('sb-ocr').then(async (c) => {
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
