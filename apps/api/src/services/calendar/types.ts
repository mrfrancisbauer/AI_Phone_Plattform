/**
 * Provider-agnostic calendar port. Mirrors the telephony port: one narrow
 * interface, one adapter per provider (Google, Microsoft), selected by a
 * factory. OAuth tokens are secrets — they flow through here but are only ever
 * persisted encrypted by the calendar service, never returned to the frontend.
 */
import type { CalendarProvider } from '@ai-phone/shared';
import { config } from '../../config.js';
import type { AppointmentDraft } from '../../lib/calendar-appointment.js';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  /** Absolute expiry of the access token. */
  expiresAt?: Date | null;
  scope?: string | null;
  /** The connected account's email, when derivable from the id_token. */
  accountEmail?: string | null;
}

export interface CreatedEvent {
  eventId: string;
  htmlLink?: string | null;
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
}

/** A busy time range on the calendar (absolute instants). */
export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface CalendarPort {
  readonly provider: CalendarProvider;
  /** Whether OAuth client credentials for this provider are configured. */
  configured(): boolean;
  /** Build the provider consent URL; `state` is an opaque signed token. */
  authorizeUrl(state: string): string;
  /** Exchange an authorization code for tokens. */
  exchangeCode(code: string): Promise<OAuthTokens>;
  /** Refresh an access token using a stored refresh token. */
  refresh(refreshToken: string): Promise<OAuthTokens>;
  /** List the account's calendars (for choosing a default). */
  listCalendars(accessToken: string): Promise<CalendarInfo[]>;
  /** Busy intervals on `calendarId` between two ISO instants (free/busy). */
  getBusy(accessToken: string, calendarId: string, fromISO: string, toISO: string): Promise<BusyInterval[]>;
  /** Create an event on `calendarId` using a valid access token. */
  createEvent(accessToken: string, calendarId: string, draft: AppointmentDraft): Promise<CreatedEvent>;
}

/** The single OAuth redirect URI shared by all providers (provider is in state). */
export function calendarRedirectUri(): string {
  return `${config.API_PUBLIC_URL}/integrations/calendar/callback`;
}

/** Best-effort decode of an OpenID id_token to extract the account email. */
export function emailFromIdToken(idToken?: string | null): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1]!, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { email?: string; preferred_username?: string };
    return payload.email ?? payload.preferred_username ?? null;
  } catch {
    return null;
  }
}
