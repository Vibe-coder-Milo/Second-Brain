// Unlock with Touch ID or Face ID (or another fingerprint or face unlock).
//
// A passkey made on this device gives back a secret (WebAuthn's PRF
// extension) only after your fingerprint, face or the device's passcode. That
// secret locks a second copy of your vault key, kept on this device only:
// never synced, never in backups. Your passphrase still works, is asked for
// every 30 days so you don't forget it, and sealed notes always need the
// sealed passphrase.

import { meta } from './db.js';
import * as C from './crypto.js';
import * as V from './vault.js';
import { state } from './vault.js';
import { bytesToB64, b64ToBytes, utf8 } from './util.js';
import { deviceLabel } from './model.js';

const KEY = 'deviceUnlock';
export const PASS_EVERY_DAYS = 30;

const apple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
// What to call it on this device.
export const bioName = apple ? 'Touch ID or Face ID' : 'fingerprint or face';

// Can this browser do it at all?
export async function available() {
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials?.create) return false;
  try { if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false; } catch { return false; }
  try {
    const caps = await PublicKeyCredential.getClientCapabilities?.();
    if (caps && caps['extension:prf'] === false) return false;
  } catch { /* unknown: try it */ }
  return true;
}

// This device's setup, if it's for the vault that's here.
export async function enrolment() {
  const e = await meta.get(KEY);
  if (!e || !state.keyring || e.vaultId !== state.keyring.vaultId) return null;
  return e;
}
// Time to ask for the passphrase again?
export const passDue = (e) => !e || Date.now() - (e.passAt || 0) > PASS_EVERY_DAYS * 86400000;

function friendly(e) {
  if (e?.code) return e;
  const name = e?.name;
  const msg = name === 'NotAllowedError' ? `${bioName} was cancelled, or took too long.`
    : name === 'InvalidStateError' ? 'This device already has a passkey for Second brain. Try again.'
      : name === 'SecurityError' ? 'This only works on the app’s own web address.'
        : `${bioName} isn’t available here.`;
  const out = new Error(msg);
  out.code = name || 'FAILED';
  return out;
}

// Step 1 of turning it on: make the passkey (Touch ID or Face ID asks).
export async function register() {
  const label = deviceLabel();
  // One passkey per device and vault: turning it on again replaces it.
  const userId = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(`${state.keyring.vaultId}:${state.deviceId}`))).slice(0, 16);
  let cred;
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Second brain' },
        user: { id: userId, name: `Second brain (${label})`, displayName: `Second brain on ${label}` },
        challenge: C.randomBytes(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
        attestation: 'none',
        timeout: 90000,
        extensions: { prf: {} },
      },
    });
  } catch (e) { throw friendly(e); }
  if (!cred) throw friendly(null);
  if (cred.getClientExtensionResults?.().prf?.enabled === false) {
    const e = new Error(`${bioName} on this device can’t protect a key (it needs iPadOS or iOS 18 or later).`);
    e.code = 'NO_PRF';
    throw e;
  }
  return new Uint8Array(cred.rawId);
}

// The passkey's secret for this salt (Touch ID or Face ID asks).
export async function secret(credId, salt) {
  let cred;
  try {
    cred = await navigator.credentials.get({
      publicKey: {
        challenge: C.randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: credId }],
        userVerification: 'required',
        timeout: 90000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
  } catch (e) { throw friendly(e); }
  const out = cred?.getClientExtensionResults?.().prf?.results?.first;
  if (!out) {
    const e = new Error(`${bioName} on this device can’t protect a key (it needs iPadOS or iOS 18 or later).`);
    e.code = 'NO_PRF';
    throw e;
  }
  return new Uint8Array(out);
}

// Step 2: lock the vault key with the passkey's secret and keep it here.
export async function finish(opener, credId) {
  const salt = C.randomBytes(32);
  const s = await secret(credId, salt);
  const blob = await opener.seal(s);
  await meta.set(KEY, { v: 1, vaultId: state.keyring.vaultId, credId: bytesToB64(credId), prfSalt: bytesToB64(salt), blob, at: Date.now(), passAt: Date.now() });
}

// Unlock the vault with Touch ID or Face ID.
export async function unlock() {
  const e = await enrolment();
  if (!e) throw new Error('Not set up on this device.');
  const s = await secret(b64ToBytes(e.credId), b64ToBytes(e.prfSalt));
  const key = await C.unwrapKeyFromDevice(e.blob, s);
  await V.unlockWithKey(key);
}

// The passphrase was used to unlock: start the 30 days again.
export async function passphraseUsed() {
  const e = await meta.get(KEY);
  if (e) await meta.set(KEY, { ...e, passAt: Date.now() });
}

// Turn it off on this device. The key copy is deleted; the passkey itself is
// in the device's passwords, and browsers that can are told to remove it.
export async function disable() {
  const e = await meta.get(KEY);
  await meta.del(KEY);
  if (e?.credId && PublicKeyCredential.signalUnknownCredential) {
    const id = e.credId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: id }).catch(() => {});
  }
}
