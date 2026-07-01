/**
 * Google Calendar adapter (OAuth2 + Calendar API v3, plain REST).
 * Scopes: calendar.events (write events) + openid/email (to show the account).
 */
import { config } from '../../config.js';
import type { AppointmentDraft } from '../../lib/calendar-appointment.js';
import {
  calendarRedirectUri,
  emailFromIdToken,
  type CalendarPort,
  type CreatedEvent,
  type OAuthTokens,
} from './types.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events openid email';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}

function toTokens(data: GoogleTokenResponse): OAuthTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    scope: data.scope ?? null,
    accountEmail: emailFromIdToken(data.id_token),
  };
}

export class GoogleCalendarAdapter implements CalendarPort {
  readonly provider = 'google' as const;

  configured(): boolean {
    return Boolean(config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET);
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.GOOGLE_OAUTH_CLIENT_ID ?? '',
      redirect_uri: calendarRedirectUri(),
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline', // request a refresh token
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH}?${params}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        redirect_uri: calendarRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed (${res.status}).`);
    return toTokens((await res.json()) as GoogleTokenResponse);
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(`Google token refresh failed (${res.status}).`);
    const tokens = toTokens((await res.json()) as GoogleTokenResponse);
    // Google usually omits a new refresh token on refresh — keep the old one.
    tokens.refreshToken = tokens.refreshToken ?? refreshToken;
    return tokens;
  }

  async createEvent(accessToken: string, calendarId: string, draft: AppointmentDraft): Promise<CreatedEvent> {
    const cal = encodeURIComponent(calendarId || 'primary');
    const res = await fetch(`${API}/calendars/${cal}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: draft.title,
        description: draft.description,
        start: { dateTime: draft.startISO },
        end: { dateTime: draft.endISO },
      }),
    });
    if (!res.ok) throw new Error(`Google event creation failed (${res.status}).`);
    const data = (await res.json()) as { id: string; htmlLink?: string };
    return { eventId: data.id, htmlLink: data.htmlLink ?? null };
  }
}
