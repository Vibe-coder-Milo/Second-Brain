// Encryption. Everything stored or synced is AES-256-GCM encrypted with a random
// data key. The data key is itself encrypted ("wrapped") with a key derived from
// your passphrase (PBKDF2-SHA256), so the passphrase never leaves the device and
// changing it doesn't require re-encrypting every note.

import { bytesToB64, b64ToBytes, utf8, fromUtf8 } from './util.js';

export const KDF_ITERATIONS = 600000;
const subtle = crypto.subtle;

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKek(passphrase, salt, iterations) {
  const base = await subtle.importKey('raw', utf8(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const importDataKey = (raw) => subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

async function wrapRaw(raw, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKek(passphrase, salt, KDF_ITERATIONS);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, kek, raw);
  return { kdf: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

async function unwrapRaw(wrapped, passphrase) {
  const kek = await deriveKek(passphrase, b64ToBytes(wrapped.salt), wrapped.iterations);
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(wrapped.iv) }, kek, b64ToBytes(wrapped.ct)));
  } catch {
    const e = new Error('That passphrase doesn’t match.');
    e.code = 'WRONG_PASSPHRASE';
    throw e;
  }
}

// Make a brand-new data key protected by `passphrase`.
export async function newWrappedKey(passphrase) {
  const raw = randomBytes(32);
  const wrapped = await wrapRaw(raw, passphrase);
  const key = await importDataKey(raw);
  raw.fill(0);
  return { wrapped, key };
}

export async function unwrapKey(wrapped, passphrase) {
  const raw = await unwrapRaw(wrapped, passphrase);
  const key = await importDataKey(raw);
  raw.fill(0);
  return key;
}

// Re-protect the same data key with a new passphrase.
export async function rewrapKey(wrapped, oldPass, newPass) {
  const raw = await unwrapRaw(wrapped, oldPass);
  const next = await wrapRaw(raw, newPass);
  raw.fill(0);
  return next;
}

// Records are bound to their id (additional authenticated data), so an encrypted
// note can't be swapped into another note's slot.
export async function encryptJSON(key, kid, id, obj) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(id) }, key, utf8(JSON.stringify(obj)));
  return { v: 1, k: kid, iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

export async function decryptJSON(key, id, env) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(env.iv), additionalData: utf8(id) }, key, b64ToBytes(env.ct));
  return JSON.parse(fromUtf8(pt));
}

// Binary payloads are stored as iv (12 bytes) followed by ciphertext.
export async function encryptBytes(key, id, bytes) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(id) }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function decryptBytes(key, id, packed) {
  const data = packed instanceof Uint8Array ? packed : new Uint8Array(packed);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12), additionalData: utf8(id) }, key, data.subarray(12));
  return new Uint8Array(pt);
}

export function passphraseStrength(p) {
  const s = String(p || '');
  if (s.length < 10) return { ok: false, msg: 'Use at least 10 characters. Four random words works well.' };
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(s)).length;
  if (s.length < 14 && kinds < 3) return { ok: true, msg: 'Okay. Longer is stronger: try adding another word.' };
  return { ok: true, msg: 'Strong.' };
}
