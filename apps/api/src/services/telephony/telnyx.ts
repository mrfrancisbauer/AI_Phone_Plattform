/**
 * Telnyx adapter — stub behind the same port so a second CPaaS can be added
 * without touching call routing. Provisioning is not wired yet; every operation
 * fails with a clear, customer-safe message. Numbers can still be entered
 * manually (provider = "telnyx"): routing works off the DID like any other.
 */
import type { AvailableNumber, TelephonyPort } from './types.js';

const NOT_YET = 'Telnyx wird noch nicht automatisch unterstützt. Bitte die Nummer manuell verbinden.';

export class TelnyxAdapter implements TelephonyPort {
  readonly provider = 'telnyx' as const;

  configured(): boolean {
    return false;
  }

  canProvision(): boolean {
    return false;
  }

  async searchNumbers(): Promise<AvailableNumber[]> {
    throw new Error(NOT_YET);
  }

  async buyNumber(): Promise<void> {
    throw new Error(NOT_YET);
  }

  async setInboundWebhook(): Promise<{ voiceUrl: string }> {
    throw new Error(NOT_YET);
  }

  async releaseNumber(): Promise<void> {
    // No-op until Telnyx provisioning is implemented.
  }
}
