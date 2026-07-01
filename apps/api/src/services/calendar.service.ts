/**
 * Calendar connection lifecycle, free/busy checks and appointment creation.
 *
 * OAuth tokens are stored encrypted (AES-256-GCM) and only ever decrypted here
 * to call the provider. Access tokens are refreshed transparently when expired.
 * Provider specifics live entirely behind the CalendarPort — conversation and
 * finalization code call this service, never a provider directly.
 *
 * Booking is best-effort and fail-CLOSED on conflicts: if a slot cannot be
 * verified free, no event is created (no double bookings). Failures are logged,
 * audited and recorded on the call, but never break the summary or emails.
 */
import { DEFAULT_APPOINTMENT_MINUTES, type CalendarProvider } from '@ai-phone/shared';
import { prisma } from '../db.js';
import { decrypt, decryptNullable, encrypt, encryptNullable } from '../lib/crypto.js';
import type { AppointmentDraft } from '../lib/calendar-appointment.js';
import { isSlotFree, proposeFreeSlots, type Interval } from '../lib/calendar-availability.js';
import { isBusinessHours } from '../lib/timezone.js';
import { logger } from '../logger.js';
import { audit } from '../lib/audit.js';
import { getCalendar, type CalendarInfo, type OAuthTokens } from './calendar/index.js';
import { verifyCalendarState } from './calendar/state.js';

type ConnectionRow = {
  id: string;
  provider: string;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
  calendarId: string;
  status: string;
};

/** Map a stored connection status to a UI traffic-light colour. */
function uiStatus(status: string): 'green' | 'yellow' | 'red' {
  if (status === 'active') return 'green';
  if (status === 'attention') return 'yellow';
  return 'red';
}

/** Public (frontend-safe) view of a tenant's calendar connections. */
export async function calendarStatus(tenantId: string) {
  const rows = await prisma.calendarConnection.findMany({ where: { tenantId } });
  return rows.map((r) => ({
    provider: r.provider as CalendarProvider,
    status: r.status,
    color: uiStatus(r.status),
    accountEmail: r.accountEmail,
    calendarId: r.calendarId,
    connectedAt: r.createdAt,
  }));
}

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

/** Return a valid access token for a connection, refreshing (+persisting) it if expired. */
async function validAccessToken(row: ConnectionRow): Promise<string> {
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

/** The tenant's active calendar connection (the first one), or null. */
async function activeConnection(tenantId: string, provider?: CalendarProvider): Promise<ConnectionRow | null> {
  return prisma.calendarConnection.findFirst({
    where: { tenantId, ...(provider ? { provider } : {}) },
    orderBy: { createdAt: 'asc' },
  });
}

/** List the account's calendars for a connected provider. */
export async function getCalendars(tenantId: string, provider: CalendarProvider): Promise<CalendarInfo[]> {
  const row = await activeConnection(tenantId, provider);
  if (!row) return [];
  const token = await validAccessToken(row);
  return getCalendar(provider).listCalendars(token);
}

/** Save the tenant's chosen default calendar for a provider. */
export async function setDefaultCalendar(tenantId: string, provider: CalendarProvider, calendarId: string, actorId?: string): Promise<void> {
  await prisma.calendarConnection.updateMany({ where: { tenantId, provider }, data: { calendarId } });
  await audit({ tenantId, actorId, action: 'calendar.set_default', metadata: { provider, calendarId } });
}

/** Verify a connection works (lists calendars); updates status accordingly. */
export async function testConnection(tenantId: string, provider: CalendarProvider): Promise<{ ok: boolean; message: string }> {
  const row = await activeConnection(tenantId, provider);
  if (!row) return { ok: false, message: 'Nicht verbunden.' };
  try {
    const token = await validAccessToken(row);
    await getCalendar(provider).listCalendars(token);
    await prisma.calendarConnection.update({ where: { id: row.id }, data: { status: 'active' } });
    return { ok: true, message: 'Verbindung erfolgreich.' };
  } catch (err) {
    logger.warn({ err, tenantId, provider }, 'calendar test failed');
    await prisma.calendarConnection.update({ where: { id: row.id }, data: { status: 'error' } }).catch(() => {});
    return { ok: false, message: 'Verbindung fehlgeschlagen. Bitte neu verbinden.' };
  }
}

export interface AvailabilityResult {
  hasCalendar: boolean;
  available: boolean;
  /** Proposed free alternatives (UTC), when the desired slot is busy. */
  alternatives: Date[];
}

/**
 * Check whether `startUtc` (+duration) is free on the tenant's calendar.
 * Fail-open for the LIVE flow: when there is no calendar or availability can't
 * be verified, returns available=true so the caller isn't blocked — the hard
 * no-double-booking guarantee is enforced again at booking time.
 */
export async function checkAvailability(
  tenantId: string,
  startUtc: Date,
  tz: string,
  durationMin = DEFAULT_APPOINTMENT_MINUTES,
): Promise<AvailabilityResult> {
  const row = await activeConnection(tenantId);
  if (!row) return { hasCalendar: false, available: true, alternatives: [] };

  try {
    const busy = await loadBusy(row, startUtc);
    if (isSlotFree(startUtc, durationMin, busy)) {
      return { hasCalendar: true, available: true, alternatives: [] };
    }
    const alternatives = proposeFreeSlots({
      desiredStart: startUtc,
      durationMin,
      busy,
      isWithinHours: (d) => isBusinessHours(d, tz),
      count: 3,
    });
    return { hasCalendar: true, available: false, alternatives };
  } catch (err) {
    logger.warn({ err, tenantId }, 'availability check failed (fail-open live)');
    await prisma.calendarConnection.update({ where: { id: row.id }, data: { status: 'attention' } }).catch(() => {});
    return { hasCalendar: true, available: true, alternatives: [] };
  }
}

/** Load busy intervals around the desired slot (day start → +14 days). */
async function loadBusy(row: ConnectionRow, startUtc: Date): Promise<Interval[]> {
  const token = await validAccessToken(row);
  const from = new Date(Math.min(Date.now(), startUtc.getTime()));
  const to = new Date(startUtc.getTime() + 14 * 24 * 60 * 60_000);
  return getCalendar(row.provider as CalendarProvider).getBusy(token, row.calendarId, from.toISOString(), to.toISOString());
}

async function recordAppointment(tenantId: string, callId: string, data: {
  provider?: string; calendarId?: string; status: string; startAt?: Date | null; eventId?: string | null; htmlLink?: string | null; error?: string | null;
}) {
  await prisma.callAppointment.upsert({
    where: { callId },
    create: { tenantId, callId, ...data },
    update: { ...data },
  }).catch((err) => logger.error({ err, callId }, 'recordAppointment failed'));
}

/**
 * Create the appointment on the tenant's calendar. Fail-closed on conflict:
 * re-checks free/busy right before booking and does NOT create when busy.
 * Records the outcome on the call. Returns true only when an event was created.
 */
export async function createAppointment(
  tenantId: string,
  draft: AppointmentDraft,
  callId: string,
  tz: string,
  durationMin = DEFAULT_APPOINTMENT_MINUTES,
): Promise<boolean> {
  const startAt = new Date(draft.startISO);
  const row = await activeConnection(tenantId);
  if (!row) {
    await recordAppointment(tenantId, callId, { status: 'detected', startAt });
    return false;
  }

  try {
    const busy = await loadBusy(row, startAt);
    if (!isSlotFree(startAt, durationMin, busy)) {
      await recordAppointment(tenantId, callId, { provider: row.provider, calendarId: row.calendarId, status: 'conflict', startAt });
      logger.info({ tenantId, callId }, 'appointment slot busy at booking time — not created');
      return false;
    }
    const token = await validAccessToken(row);
    const event = await getCalendar(row.provider as CalendarProvider).createEvent(token, row.calendarId, draft);
    await prisma.calendarConnection.update({ where: { id: row.id }, data: { status: 'active' } }).catch(() => {});
    await recordAppointment(tenantId, callId, { provider: row.provider, calendarId: row.calendarId, status: 'booked', startAt, eventId: event.eventId, htmlLink: event.htmlLink ?? null });
    await audit({ tenantId, action: 'calendar.event_created', targetType: 'call', targetId: callId, metadata: { provider: row.provider, eventId: event.eventId } });
    logger.info({ tenantId, provider: row.provider, callId }, 'calendar appointment created');
    return true;
  } catch (err) {
    await prisma.calendarConnection.update({ where: { id: row.id }, data: { status: 'error' } }).catch(() => {});
    await recordAppointment(tenantId, callId, { provider: row.provider, calendarId: row.calendarId, status: 'failed', startAt, error: err instanceof Error ? err.message.slice(0, 300) : 'unknown' });
    logger.error({ err, tenantId, callId }, 'calendar appointment creation failed');
    return false;
  }
}

/** Today's booked / failed appointment counts for a tenant (dashboard widget). */
export async function appointmentStats(tenantId: string): Promise<{ bookedToday: number; failedToday: number }> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [bookedToday, failedToday] = await Promise.all([
    prisma.callAppointment.count({ where: { tenantId, status: 'booked', createdAt: { gte: startOfDay } } }),
    prisma.callAppointment.count({ where: { tenantId, status: { in: ['failed', 'conflict'] }, createdAt: { gte: startOfDay } } }),
  ]);
  return { bookedToday, failedToday };
}
