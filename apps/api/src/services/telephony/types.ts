/**
 * Provider-agnostic telephony port.
 *
 * The platform is a SOFTWARE layer on top of a CPaaS (Twilio today, Telnyx
 * later) — the CPaaS remains the licensed carrier. Everything the platform
 * needs from a carrier is expressed through this narrow interface so a new
 * provider is a new adapter, not a rewrite. Manual provisioning (operator buys
 * a DID by hand in the provider console) is a first-class adapter too, so the
 * product ships without being gated on any provider's regulatory API.
 */
import type { TelephonyProvider } from '@ai-phone/shared';

/** A DID that can be purchased from a provider's inventory. */
export interface AvailableNumber {
  e164: string;
  friendlyName?: string;
  /** Provider's monthly price as a display string (currency varies), if known. */
  monthlyCost?: string;
}

export interface SearchOptions {
  /** ISO-3166 alpha-2 country, e.g. "DE". */
  country: string;
  areaCode?: string;
  contains?: string;
  limit?: number;
}

export interface TelephonyPort {
  readonly provider: TelephonyProvider;
  /** Whether API credentials for this provider are present. */
  configured(): boolean;
  /** Whether this provider can search & buy DIDs over its API (false = manual). */
  canProvision(): boolean;
  /** Search purchasable DIDs. Throws a clear error if provisioning is unsupported. */
  searchNumbers(opts: SearchOptions): Promise<AvailableNumber[]>;
  /** Buy a DID and point its voice webhook at the platform. Throws if unsupported. */
  buyNumber(e164: string): Promise<void>;
  /** Point an existing DID's inbound voice webhook at the platform. */
  setInboundWebhook(e164: string): Promise<{ voiceUrl: string }>;
  /** Release a DID back to the provider (best effort). */
  releaseNumber(e164: string): Promise<void>;
}
