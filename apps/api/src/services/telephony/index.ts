/**
 * Telephony port factory. Call routing never depends on the concrete provider —
 * it goes through the adapter returned here, keyed by the number's stored
 * provider. `provisioningProvider()` reports which provider (if any) can
 * search/buy DIDs over its API right now, so the UI can offer or hide that path.
 */
import type { TelephonyProvider } from '@ai-phone/shared';
import { twilioConfigured, voiceWebhookUrl } from '../twilio-provisioning.js';
import { ManualAdapter } from './manual.js';
import { TelnyxAdapter } from './telnyx.js';
import { TwilioAdapter } from './twilio.js';
import type { TelephonyPort } from './types.js';

export type { AvailableNumber, SearchOptions, TelephonyPort } from './types.js';

/** The adapter for a stored number's provider. */
export function getTelephony(provider: TelephonyProvider): TelephonyPort {
  switch (provider) {
    case 'twilio':
      return new TwilioAdapter();
    case 'telnyx':
      return new TelnyxAdapter();
    case 'sip':
    default:
      return new ManualAdapter('sip');
  }
}

/** The provider that can provision DIDs via API right now, or null (manual only). */
export function provisioningProvider(): TelephonyProvider | null {
  if (twilioConfigured()) return 'twilio';
  return null;
}

/** Public voice webhook URL inbound calls (forwarded or direct) must reach. */
export { voiceWebhookUrl };
