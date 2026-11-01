// Thin IndexedDB wrapper. Stores only encrypted data (plus wrapped keys and
// bookkeeping like sync state).
//
// meta:    key/value (keyring, encrypted device settings, sync bookkeeping)
// records: { id, env, rev, dirty, deleted, remoteSha }   env = encrypted JSON
// files:   { id, k, data, rev, dirty, deleted, remoteSha } data = iv||ciphertext
// local:   { id, k, data } things worked out on this device and never synced
//          (the search-by-meaning index), encrypted like everything else

const DB_NAME = 'second-brain';
const VERSION = 2;
let dbPromise;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('local')) db.createObjectStore('local', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Close other Second brain tabs and try again.'));
    });
  }
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage transaction aborted'));
  });
}

export const meta = {
  get: (k) => run('meta', 'readonly', (s) => wrap(s.get(k))),
  set: (k, v) => run('meta', 'readwrite', (s) => wrap(s.put(v, k))),
  del: (k) => run('meta', 'readwrite', (s) => wrap(s.delete(k))),
};

function table(name) {
  return {
    get: (id) => run(name, 'readonly', (s) => wrap(s.get(id))),
    put: (rec) => run(name, 'readwrite', (s) => wrap(s.put(rec))),
    del: (id) => run(name, 'readwrite', (s) => wrap(s.delete(id))),
    all: () => run(name, 'readonly', (s) => wrap(s.getAll())),
    putMany: (recs) => run(name, 'readwrite', (s) => Promise.all(recs.map((r) => wrap(s.put(r))))),
    clear: () => run(name, 'readwrite', (s) => wrap(s.clear())),
  };
}

export const records = table('records');
export const files = table('files');
export const local = table('local');

export async function wipeAll() {
  const db = await openDB();
  db.close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = resolve;
  });
}
