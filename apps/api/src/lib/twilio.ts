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
  /** A concrete neural voice token (e.g. "Google.de-DE-Neural2-C"). When set it
   *  carries its own locale, so <Say> uses `voice` instead of `language`. */
  voice?: string;
}

/**
 * Build a <Say>. A neural `voice` token already implies its locale, so we must
 * not also set `language` on the same tag (Twilio rejects the mismatch). Without
 * a voice we fall back to the legacy language-based voice.
 */
function sayTag(say: string, opts: SayOpts): string {
  if (opts.voice) return `<Say voice="${escapeXml(opts.voice)}">${escapeXml(say)}</Say>`;
  return `<Say language="${opts.language ?? 'de-DE'}">${escapeXml(say)}</Say>`;
}

/** <Gather input="speech"> with a nested <Say>, used to ask + listen. */
export function twimlGather(say: string, actionUrl: string, opts: SayOpts = {}): string {
  // Gather keeps `language` for speech RECOGNITION regardless of the TTS voice.
  const language = opts.language ?? 'de-DE';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${language}" speechTimeout="auto" action="${escapeXml(actionUrl)}" method="POST">
    ${sayTag(say, opts)}
  </Gather>
  <Redirect method="POST">${escapeXml(actionUrl)}</Redirect>
</Response>`;
}

/** <Say> then <Hangup>, used to end the call gracefully. */
export function twimlHangup(say: string, opts: SayOpts = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${sayTag(say, opts)}
  <Hangup/>
</Response>`;
}

export interface ConversationRelayOpts {
  /** wss URL of our realtime endpoint (carries the signed call token). */
  wsUrl: string;
  /** Spoken immediately by Twilio while the WS connects (greeting + consent). */
  welcomeGreeting: string;
  /** STT language, e.g. "de-DE". */
  language: string;
  /** Optional neural TTS voice (provider-native name) + its provider. */
  ttsProvider?: string;
  voice?: string;
  /** Requested when the relay session ends/fails → our fallback handler. */
  actionUrl: string;
}

/**
 * <Connect><ConversationRelay> — hands the call to Twilio's realtime bridge:
 * Twilio does streaming STT/TTS + barge-in and exchanges TEXT with our
 * WebSocket. When the session ends (or errors), Twilio requests `actionUrl`,
 * where we either hang up or fall back to the classic turn-based flow.
 */
export function twimlConversationRelay(o: ConversationRelayOpts): string {
  const voiceAttrs = o.voice && o.ttsProvider
    ? ` ttsProvider="${escapeXml(o.ttsProvider)}" voice="${escapeXml(o.voice)}"`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="${escapeXml(o.actionUrl)}">
    <ConversationRelay url="${escapeXml(o.wsUrl)}" welcomeGreeting="${escapeXml(o.welcomeGreeting)}" language="${escapeXml(o.language)}" transcriptionLanguage="${escapeXml(o.language)}"${voiceAttrs} interruptible="speech" />
  </Connect>
</Response>`;
}
