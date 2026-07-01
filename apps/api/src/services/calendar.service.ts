/**
 * Calendar connection lifecycle + appointment creation.
 *
 * OAuth tokens are stored encrypted (AES-256-GCM) and only ever decrypted here
 * to call the provider. Access tokens are refreshed transparently when expired.
 * Appointment creation is best-effort: a failure is logged and audited but never
 * breaks call finalization.
 */
import type { CalendarProvider } from '@ai-phone/shared';
import { prisma } from '../db.js';
import { decrypt, decryptNullable, encrypt, encryptNullable } from '../lib/crypto.js';
import type { AppointmentDraft } from '../lib/calendar-appointment.js';
import { logger } from '../logger.js';
import { audit } from '../lib/audit.js';
import { getCalendar, type OAuthTokens } from './calendar/index.js';
import { verifyCalendarState } from './calendar/state.js';

/** Public (frontend-safe) view of a tenant's calendar connections. */
export async function calendarStatus(tenantId: string) {
  const rows = await prisma.calendarConnection.findMany({ where: { tenantId } });
  return rows.map((r) => ({
    provider: r.provider as CalendarProvider,
    status: r.status,
    accountEmail: r.accountEmail,
    connectedAt: r.createdAt,
  }));
}

/** Persist freshly-obtained tokens as the tenant's connection for a provider. */
async function upsertConnection(tenantId: string, provider: CalendarProvider, tokens: OAuthTokens) {
  await prisma.calendarConnection.upsert({
    where: { tenantId_provider: { tenantId, provider } },
    create: {
      tenantId,
      provider,
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: encryptNullable(tokens.refreshToken ?? null),
      expiresAt: tokens.expiresAt ?? null,
      accountEmail: tokens.accountEmail ?? null,
      scope: tokens.scope ?? null,
      status: 'active',
    },
    update: {
      accessTokenEnc: encrypt(tokens.accessToken),
      // Keep the existing refresh token if the provider didn't return a new one.
      ...(tokens.refreshToken ? { refreshTokenEnc: encrypt(tokens.refreshToken) } : {}),
      expiresAt: tokens.expiresAt ?? null,
      ...(tokens.accountEmail ? { accountEmail: tokens.accountEmail } : {}),
      scope: tokens.scope ?? null,
      status: 'active',
    },
  });
}

/** Complete the OAuth dance: verify state, exchange code, store the connection. */
export async function completeOAuth(stateToken: string, code: string): Promise<CalendarProvider> {
  const state = await verifyCalendarState(stateToken);
  const port = getCalendar(state.provider);
  const tokens = await port.exchangeCode(code);
  await upsertConnection(state.tenantId, state.provider, tokens);
  await audit({ tenantId: state.tenantId, actorId: state.userId, action: 'calendar.connect', metadata: { provider: state.provider } });
  return state.provider;
}

export async function disconnectCalendar(tenantId: string, provider: CalendarProvider, actorId?: string): Promise<void> {
  await prisma.calendarConnection.deleteMany({ where: { tenantId, provider } });
  await audit({ tenantId, actorId, action: 'calendar.disconnect', metadata: { provider } });
}

/** Return a valid access token, refreshing (and persisting) it if expired. */
async function validAccessToken(row: {
  id: string;
  provider: string;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
}): Promise<string | null> {
  const notExpired = row.expiresAt && row.expiresAt.getTime() - Date.now() > 60_000;
  if (notExpired) return decrypt(row.accessTokenEnc);

  const refreshToken = decryptNullable(row.refreshTokenEnc);
  if (!refreshToken) return decrypt(row.accessTokenEnc); // no refresh token — try as-is

  const port = getCalendar(row.provider as CalendarProvider);
  const tokens = await port.refresh(refreshToken);
  await prisma.calendarConnection.update({
    where: { id: row.id },
    data: {
      accessTokenEnc: encrypt(tokens.accessToken),
      ...(tokens.refreshToken ? { refreshTokenEnc: encrypt(tokens.refreshToken) } : {}),
      expiresAt: tokens.expiresAt ?? null,
      status: 'active',
    },
  });
  return tokens.accessToken;
}

/**
 * Create an appointment on the tenant's first active calendar connection.
 * Best-effort: returns false (and logs) rather than throwing.
 */
export async function createAppointment(tenantId: string, draft: AppointmentDraft, callId?: string): Promise<boolean> {
  const row = await prisma.calendarConnection.findFirst({
    where: { tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (!row) return false;

  try {
    const accessToken = await validAccessToken(row);
    if (!accessToken) return false;
    const port = getCalendar(row.provider as CalendarProvider);
    const event = await port.createEvent(accessToken, row.calendarId, draft);
    await audit({ tenantId, action: 'calendar.event_created', targetType: 'call', targetId: callId, metadata: { provider: row.provider, eventId: event.eventId } });
    logger.info({ tenantId, provider: row.provider, callId }, 'calendar appointment created');
    return true;
  } catch (err) {
    // Mark the connection as errored so the dashboard can prompt a reconnect.
    await prisma.calendarConnection.update({ where: { id: row.id }, data: { status: 'error' } }).catch(() => {});
    logger.error({ err, tenantId, callId }, 'calendar appointment creation failed');
    return false;
  }
}
