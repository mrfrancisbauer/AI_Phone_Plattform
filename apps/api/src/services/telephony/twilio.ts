/**
 * Twilio adapter for the telephony port (plain REST + Basic auth, no SDK).
 *
 * Twilio is the licensed carrier; we only ask it to (a) list purchasable DIDs,
 * (b) buy one and wire its voice webhook to us, and (c) release it. Wiring the
 * webhook of an already-owned number is reused from twilio-provisioning.ts.
 */
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import {
  configureNumberWebhook,
  statusWebhookUrl,
  twilioConfigured,
  voiceWebhookUrl,
} from '../twilio-provisioning.js';
import type { AvailableNumber, SearchOptions, TelephonyPort } from './types.js';

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

function authHeader(): string {
  const token = Buffer.from(
    `${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`,
  ).toString('base64');
  return `Basic ${token}`;
}

function ensureConfigured(): void {
  if (!twilioConfigured()) {
    throw new Error(
      'Twilio ist auf der Plattform nicht konfiguriert (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).',
    );
  }
}

export class TwilioAdapter implements TelephonyPort {
  readonly provider = 'twilio' as const;

  configured(): boolean {
    return twilioConfigured();
  }

  canProvision(): boolean {
    return twilioConfigured();
  }

  async searchNumbers(opts: SearchOptions): Promise<AvailableNumber[]> {
    ensureConfigured();
    const params = new URLSearchParams({ VoiceEnabled: 'true' });
    if (opts.areaCode) params.set('AreaCode', opts.areaCode);
    if (opts.contains) params.set('Contains', opts.contains);
    if (opts.limit) params.set('PageSize', String(opts.limit));
    const country = encodeURIComponent(opts.country.toUpperCase());
    const url = `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/${country}/Local.json?${params}`;
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    if (!res.ok) throw new Error(`Twilio number search failed (${res.status}).`);
    const data = (await res.json()) as {
      available_phone_numbers?: Array<{ phone_number: string; friendly_name?: string }>;
    };
    return (data.available_phone_numbers ?? []).map((n) => ({
      e164: n.phone_number,
      friendlyName: n.friendly_name,
    }));
  }

  async buyNumber(e164: string): Promise<void> {
    ensureConfigured();
    const body = new URLSearchParams({
      PhoneNumber: e164,
      VoiceUrl: voiceWebhookUrl(),
      VoiceMethod: 'POST',
      StatusCallback: statusWebhookUrl(),
      StatusCallbackMethod: 'POST',
    });
    const res = await fetch(
      `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!res.ok) throw new Error(`Twilio purchase failed (${res.status}).`);
    logger.info({ provider: 'twilio' }, 'purchased Twilio DID');
  }

  async setInboundWebhook(e164: string): Promise<{ voiceUrl: string }> {
    return configureNumberWebhook(e164);
  }

  async releaseNumber(e164: string): Promise<void> {
    ensureConfigured();
    const lookup = `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164)}`;
    const res = await fetch(lookup, { headers: { Authorization: authHeader() } });
    if (!res.ok) throw new Error(`Twilio lookup failed (${res.status}).`);
    const data = (await res.json()) as { incoming_phone_numbers?: Array<{ sid: string }> };
    const sid = data.incoming_phone_numbers?.[0]?.sid;
    if (!sid) return; // already gone
    const del = await fetch(
      `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`,
      { method: 'DELETE', headers: { Authorization: authHeader() } },
    );
    if (!del.ok && del.status !== 404) {
      throw new Error(`Twilio release failed (${del.status}).`);
    }
  }
}
