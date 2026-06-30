/**
 * Authentication primitives: password hashing (scrypt), session JWTs and
 * single-use magic-link tokens. We use `jose` for JWTs and node's built-in
 * scrypt so there are no native build dependencies.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';
import type { Role } from '@ai-phone/shared';

const scrypt = promisify(scryptCb);
const secret = new TextEncoder().encode(config.JWT_SECRET);

export interface SessionClaims {
  sub: string; // user id
  tenantId: string;
  role: Role;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = (await scrypt(password, Buffer.from(saltHex, 'hex'), 64)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ tenantId: claims.tenantId, role: claims.role, email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: String(payload.sub),
    tenantId: String(payload.tenantId),
    role: payload.role as Role,
    email: String(payload.email),
  };
}

/** Sign a short-lived magic-link token bound to an email + tenant. */
export async function signMagicLink(email: string, tenantId: string): Promise<string> {
  return new SignJWT({ email, tenantId, purpose: 'magic_link' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${config.MAGIC_LINK_TTL_MINUTES}m`)
    .sign(secret);
}

export async function verifyMagicLink(
  token: string,
): Promise<{ email: string; tenantId: string }> {
  const { payload } = await jwtVerify(token, secret);
  if (payload.purpose !== 'magic_link') throw new Error('invalid magic link');
  return { email: String(payload.email), tenantId: String(payload.tenantId) };
}
