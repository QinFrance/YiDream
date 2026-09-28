// Dérivation du code du jour — identique au configurateur v1 et à UnlockManager.kt.
import { CONFIG } from './config.js';

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

export const todayString = () => new Date().toISOString().slice(0, 10);

export function deriveIntermediateKey(masterPassword) {
  return hmacSha256(new TextEncoder().encode(masterPassword), CONFIG.unlockSalt);
}

export async function deriveDailyCode(intermediateKey, dateString = todayString()) {
  const digest = await hmacSha256(intermediateKey, dateString);
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('').slice(0, 6);
}

export function bytesToBase64(bytes) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
