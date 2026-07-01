/**
 * Signed OAuth `state` token. The consent redirect returns to an UNAUTHENTICATED
 * callback (no session cookie/header), so we carry the tenant/user identity in a
 * short-lived signed token and verify it on return — this doubles as CSRF
 * protection (an attacker can't forge a valid state).
 */
import { SignJWT, jwtVerify } from 'jose';
import type { CalendarProvider } from '@ai-phone/shared';
import { config } from '../../config.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);
const PURPOSE = 'calendar_oauth';

export interface CalendarState {
  tenantId: string;
  userId: string;
  provider: CalendarProvider;
}

export async function signCalendarState(s: CalendarState): Promise<string> {
  return new SignJWT({ ...s, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

export async function verifyCalendarState(token: string): Promise<CalendarState> {
  const { payload } = await jwtVerify(token, secret);
  if (payload.purpose !== PURPOSE) throw new Error('invalid state purpose');
  return {
    tenantId: String(payload.tenantId),
    userId: String(payload.userId),
    provider: payload.provider as CalendarProvider,
  };
}
