/**
 * Manual adapter: the operator provisions a DID by hand in the provider console
 * (or a PBX/SIP trunk forwards to us). There is no provisioning API, so search
 * and buy are unsupported — but wiring is a no-op that simply returns the
 * platform voice URL the operator configures manually. This is the fallback
 * that lets the product ship without any provider's regulatory bundle.
 */
import type { TelephonyProvider } from '@ai-phone/shared';
import { voiceWebhookUrl } from '../twilio-provisioning.js';
import type { AvailableNumber, TelephonyPort } from './types.js';

export class ManualAdapter implements TelephonyPort {
  constructor(readonly provider: TelephonyProvider) {}

  configured(): boolean {
    return true; // manual is always "available"
  }

  canProvision(): boolean {
    return false;
  }

  async searchNumbers(): Promise<AvailableNumber[]> {
    throw new Error('Für diese Anbindung ist keine automatische Nummernsuche verfügbar.');
  }

  async buyNumber(): Promise<void> {
    throw new Error('Für diese Anbindung ist kein automatischer Nummernkauf verfügbar.');
  }

  async setInboundWebhook(): Promise<{ voiceUrl: string }> {
    // Nothing to call remotely — the operator points the DID/trunk at this URL.
    return { voiceUrl: voiceWebhookUrl() };
  }

  async releaseNumber(): Promise<void> {
    // Nothing to release via API; the operator manages the DID/trunk directly.
  }
}
