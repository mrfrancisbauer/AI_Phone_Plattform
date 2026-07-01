/**
 * Microsoft Outlook adapter (Microsoft identity platform v2 + Graph API).
 * Scopes: Calendars.ReadWrite + offline_access (refresh token) + openid/email.
 */
import { config } from '../../config.js';
import type { AppointmentDraft } from '../../lib/calendar-appointment.js';
import {
  calendarRedirectUri,
  emailFromIdToken,
  type BusyInterval,
  type CalendarInfo,
  type CalendarPort,
  type CreatedEvent,
  type OAuthTokens,
} from './types.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'offline_access openid email Calendars.ReadWrite';

function authBase(): string {
  return `https://login.microsoftonline.com/${config.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0`;
}

interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}

function toTokens(data: MsTokenResponse): OAuthTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    scope: data.scope ?? null,
    accountEmail: emailFromIdToken(data.id_token),
  };
}

/** Graph wants a naive local dateTime plus an explicit timeZone (we use UTC). */
function toGraphDateTime(iso: string): { dateTime: string; timeZone: string } {
  return { dateTime: iso.replace(/Z$/, ''), timeZone: 'UTC' };
}

export class MicrosoftCalendarAdapter implements CalendarPort {
  readonly provider = 'microsoft' as const;

  configured(): boolean {
    return Boolean(config.MICROSOFT_OAUTH_CLIENT_ID && config.MICROSOFT_OAUTH_CLIENT_SECRET);
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.MICROSOFT_OAUTH_CLIENT_ID ?? '',
      response_type: 'code',
      redirect_uri: calendarRedirectUri(),
      response_mode: 'query',
      scope: SCOPE,
      state,
    });
    return `${authBase()}/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const res = await fetch(`${authBase()}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.MICROSOFT_OAUTH_CLIENT_ID ?? '',
        client_secret: config.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
        redirect_uri: calendarRedirectUri(),
        grant_type: 'authorization_code',
        scope: SCOPE,
      }),
    });
    if (!res.ok) throw new Error(`Microsoft token exchange failed (${res.status}).`);
    return toTokens((await res.json()) as MsTokenResponse);
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch(`${authBase()}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.MICROSOFT_OAUTH_CLIENT_ID ?? '',
        client_secret: config.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        scope: SCOPE,
      }),
    });
    if (!res.ok) throw new Error(`Microsoft token refresh failed (${res.status}).`);
    const tokens = toTokens((await res.json()) as MsTokenResponse);
    tokens.refreshToken = tokens.refreshToken ?? refreshToken;
    return tokens;
  }

  async listCalendars(accessToken: string): Promise<CalendarInfo[]> {
    const res = await fetch(`${GRAPH}/me/calendars?$select=id,name,isDefaultCalendar`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Microsoft calendar list failed (${res.status}).`);
    const data = (await res.json()) as { value?: Array<{ id: string; name?: string; isDefaultCalendar?: boolean }> };
    return (data.value ?? []).map((c) => ({ id: c.id, name: c.name ?? c.id, primary: Boolean(c.isDefaultCalendar) }));
  }

  async getBusy(accessToken: string, calendarId: string, fromISO: string, toISO: string): Promise<BusyInterval[]> {
    const base = !calendarId || calendarId === 'primary'
      ? `${GRAPH}/me/calendarView`
      : `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView`;
    const url = `${base}?startDateTime=${encodeURIComponent(fromISO)}&endDateTime=${encodeURIComponent(toISO)}&$select=start,end,showAs&$top=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    });
    if (!res.ok) throw new Error(`Microsoft free/busy failed (${res.status}).`);
    const data = (await res.json()) as {
      value?: Array<{ start: { dateTime: string }; end: { dateTime: string }; showAs?: string }>;
    };
    // Graph returns naive UTC datetimes (Prefer header) — treat as UTC. Events
    // marked "free" don't block the slot.
    const asUtc = (s: string) => new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
    return (data.value ?? [])
      .filter((e) => e.showAs !== 'free')
      .map((e) => ({ start: asUtc(e.start.dateTime), end: asUtc(e.end.dateTime) }));
  }

  async createEvent(accessToken: string, calendarId: string, draft: AppointmentDraft): Promise<CreatedEvent> {
    const path = !calendarId || calendarId === 'primary'
      ? `${GRAPH}/me/events`
      : `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events`;
    const res = await fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: draft.title,
        body: { contentType: 'text', content: draft.description },
        start: toGraphDateTime(draft.startISO),
        end: toGraphDateTime(draft.endISO),
      }),
    });
    if (!res.ok) throw new Error(`Microsoft event creation failed (${res.status}).`);
    const data = (await res.json()) as { id: string; webLink?: string };
    return { eventId: data.id, htmlLink: data.webLink ?? null };
  }
}
