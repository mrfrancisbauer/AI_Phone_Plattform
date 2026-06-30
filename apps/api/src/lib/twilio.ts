/**
 * Minimal Twilio helpers with no SDK dependency:
 *  - request signature validation (X-Twilio-Signature, HMAC-SHA1)
 *  - TwiML response builders for <Gather> and <Hangup>
 *
 * Telnyx/SIP would have analogous helpers; the webhook route is written so the
 * provider-specific parsing is isolated here.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Validate an inbound Twilio webhook signature. The expected signature is
 * HMAC-SHA1(authToken, fullUrl + sortedParamKey+paramValue concatenation),
 * base64-encoded. Returns true when signature checks are disabled.
 */
export function validateTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!config.TWILIO_VALIDATE_SIGNATURE) return true;
  if (!config.TWILIO_AUTH_TOKEN || !signature) return false;

  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], fullUrl);
  const expected = createHmac('sha1', config.TWILIO_AUTH_TOKEN).update(Buffer.from(data, 'utf-8')).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface SayOpts {
  language?: string;
  voice?: string;
}

/** <Gather input="speech"> with a nested <Say>, used to ask + listen. */
export function twimlGather(say: string, actionUrl: string, opts: SayOpts = {}): string {
  const language = opts.language ?? 'de-DE';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${language}" speechTimeout="auto" action="${escapeXml(actionUrl)}" method="POST">
    <Say language="${language}">${escapeXml(say)}</Say>
  </Gather>
  <Redirect method="POST">${escapeXml(actionUrl)}</Redirect>
</Response>`;
}

/** <Say> then <Hangup>, used to end the call gracefully. */
export function twimlHangup(say: string, opts: SayOpts = {}): string {
  const language = opts.language ?? 'de-DE';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="${language}">${escapeXml(say)}</Say>
  <Hangup/>
</Response>`;
}
