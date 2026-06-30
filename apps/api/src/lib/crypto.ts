/**
 * Field-level encryption for PII at rest (phone numbers, caller email,
 * transcript text). Uses AES-256-GCM with a random 96-bit IV per value.
 *
 * Stored format: base64( iv[12] || authTag[16] || ciphertext ).
 *
 * For values we must look up without decrypting (e.g. matching an inbound
 * phone number to a tenant), we additionally store a keyed SHA-256 hash —
 * deterministic, so equal plaintext yields an equal hash, but not reversible.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { config } from '../config.js';

const KEY = Buffer.from(config.ENCRYPTION_KEY, 'hex'); // 32 bytes
const IV_LEN = 12;
const TAG_LEN = 16;

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Nullable convenience wrappers. */
export function encryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : encrypt(value);
}
export function decryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : decrypt(value);
}

/** Deterministic keyed hash for blind equality lookups (e.g. phone number). */
export function blindHash(value: string): string {
  return createHmac('sha256', KEY).update(value.trim()).digest('hex');
}

/** Constant-time string comparison helper. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
