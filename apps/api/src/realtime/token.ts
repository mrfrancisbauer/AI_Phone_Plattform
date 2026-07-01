/**
 * Signed, short-lived call token for the ConversationRelay WebSocket handshake.
 * Twilio cannot present an X-Twilio-Signature on the WS upgrade, so the wss URL
 * carries this token instead: only our own /voice webhook (which verified the
 * Twilio signature) can mint it, and it is scoped to one call.
 */
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);
const PURPOSE = 'realtime_call';

export async function signCallToken(callId: string): Promise<string> {
  return new SignJWT({ callId, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}

/** Returns the callId, or null when the token is invalid/expired/wrong-purpose. */
export async function verifyCallToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== PURPOSE || typeof payload.callId !== 'string') return null;
    return payload.callId;
  } catch {
    return null;
  }
}
