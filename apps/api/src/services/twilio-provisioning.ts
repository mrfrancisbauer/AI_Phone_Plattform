/**
 * Twilio number provisioning helpers (no SDK — plain REST + Basic auth).
 *
 * Used to wire an owned number's "A call comes in" voice webhook to this
 * platform automatically, so a tenant doesn't have to configure it by hand in
 * the Twilio console. Uses the platform Twilio credentials from env.
 */
import { config } from '../config.js';
import { logger } from '../logger.js';

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

function authHeader(): string {
  const token = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

export function twilioConfigured(): boolean {
  return Boolean(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN);
}

/** The voice webhook URL inbound calls should hit. */
export function voiceWebhookUrl(): string {
  return `${config.API_PUBLIC_URL}/webhooks/twilio/voice`;
}

/** The status callback URL — fires when a call ends (incl. caller hang-ups),
 *  so abandoned calls still get finalized with duration + costs. */
export function statusWebhookUrl(): string {
  return `${config.API_PUBLIC_URL}/webhooks/twilio/status`;
}

interface IncomingNumber {
  sid: string;
  phone_number: string;
  voice_url: string;
}

/** Look up the IncomingPhoneNumber SID for an E.164 number on the account. */
async function findIncomingNumberSid(e164: string): Promise<IncomingNumber | null> {
  const url = `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164)}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`Twilio lookup failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { incoming_phone_numbers: IncomingNumber[] };
  return data.incoming_phone_numbers[0] ?? null;
}

/**
 * Point a number's voice webhook at this platform. Returns the configured URL.
 * Throws with a clear message when the number isn't on the account or creds
 * are missing.
 */
export async function configureNumberWebhook(e164: string): Promise<{ voiceUrl: string }> {
  if (!twilioConfigured()) {
    throw new Error('Twilio credentials are not configured on the platform (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).');
  }
  const number = await findIncomingNumberSid(e164);
  if (!number) {
    throw new Error(`Number ${e164} was not found on the connected Twilio account.`);
  }

  const voiceUrl = voiceWebhookUrl();
  const body = new URLSearchParams({
    VoiceUrl: voiceUrl,
    VoiceMethod: 'POST',
    StatusCallback: statusWebhookUrl(),
    StatusCallbackMethod: 'POST',
  });
  const res = await fetch(
    `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${number.sid}.json`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  if (!res.ok) throw new Error(`Twilio update failed (${res.status}): ${await res.text()}`);
  logger.info({ e164: '[redacted]' }, 'configured Twilio voice webhook');
  return { voiceUrl };
}
