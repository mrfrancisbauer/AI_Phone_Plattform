import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.API_PUBLIC_URL = 'https://api.example.com';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'g-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'g-secret';
process.env.MICROSOFT_OAUTH_CLIENT_ID = 'm-id';
process.env.MICROSOFT_OAUTH_CLIENT_SECRET = 'm-secret';

const { GoogleCalendarAdapter } = await import('./google.js');
const { MicrosoftCalendarAdapter } = await import('./microsoft.js');

interface Captured { url: string; init: RequestInit | undefined }
let calls: Captured[] = [];
let responder: (url: string) => unknown = () => ({});
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => responder(String(url)) } as Response;
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const draft = { title: 'Termin mit Max', description: 'desc', startISO: '2026-07-06T09:00:00.000Z', endISO: '2026-07-06T09:30:00.000Z' };

// --- Google ---
test('google.getBusy parses free/busy intervals', async () => {
  responder = () => ({ calendars: { primary: { busy: [{ start: '2026-07-06T09:00:00Z', end: '2026-07-06T10:00:00Z' }] } } });
  const busy = await new GoogleCalendarAdapter().getBusy('tok', 'primary', 'a', 'b');
  assert.equal(busy.length, 1);
  assert.equal(busy[0]!.start.toISOString(), '2026-07-06T09:00:00.000Z');
  assert.match(calls[0]!.url, /freeBusy$/);
});

test('google.createEvent posts summary/start/end and parses id + link', async () => {
  responder = () => ({ id: 'ev1', htmlLink: 'https://cal/ev1' });
  const res = await new GoogleCalendarAdapter().createEvent('tok', 'primary', draft);
  assert.deepEqual(res, { eventId: 'ev1', htmlLink: 'https://cal/ev1' });
  const body = JSON.parse(String(calls[0]!.init!.body));
  assert.equal(body.summary, 'Termin mit Max');
  assert.equal(body.start.dateTime, draft.startISO);
});

test('google.createEvent targets the chosen (non-primary) calendar', async () => {
  responder = () => ({ id: 'ev2' });
  await new GoogleCalendarAdapter().createEvent('tok', 'team@group.calendar.google.com', draft);
  assert.match(calls[0]!.url, /calendars\/team%40group\.calendar\.google\.com\/events$/);
});

test('microsoft.createEvent targets the chosen (non-primary) calendar', async () => {
  responder = () => ({ id: 'm2' });
  await new MicrosoftCalendarAdapter().createEvent('tok', 'AAMkAGI1', draft);
  assert.match(calls[0]!.url, /\/me\/calendars\/AAMkAGI1\/events$/);
});

test('google.listCalendars maps items', async () => {
  responder = () => ({ items: [{ id: 'primary', summary: 'Haupt', primary: true }] });
  const cals = await new GoogleCalendarAdapter().listCalendars('tok');
  assert.deepEqual(cals, [{ id: 'primary', name: 'Haupt', primary: true }]);
});

// --- Microsoft ---
test('microsoft.getBusy drops "free" events and treats naive times as UTC', async () => {
  responder = () => ({
    value: [
      { start: { dateTime: '2026-07-06T09:00:00.000' }, end: { dateTime: '2026-07-06T10:00:00.000' }, showAs: 'busy' },
      { start: { dateTime: '2026-07-06T12:00:00.000' }, end: { dateTime: '2026-07-06T13:00:00.000' }, showAs: 'free' },
    ],
  });
  const busy = await new MicrosoftCalendarAdapter().getBusy('tok', 'primary', 'a', 'b');
  assert.equal(busy.length, 1);
  assert.equal(busy[0]!.start.toISOString(), '2026-07-06T09:00:00.000Z');
  assert.match(calls[0]!.url, /calendarView/);
});

test('microsoft.createEvent posts subject + graph datetime and parses id + webLink', async () => {
  responder = () => ({ id: 'm1', webLink: 'https://outlook/m1' });
  const res = await new MicrosoftCalendarAdapter().createEvent('tok', 'primary', draft);
  assert.deepEqual(res, { eventId: 'm1', htmlLink: 'https://outlook/m1' });
  const body = JSON.parse(String(calls[0]!.init!.body));
  assert.equal(body.subject, 'Termin mit Max');
  assert.equal(body.start.timeZone, 'UTC');
  assert.equal(body.start.dateTime, '2026-07-06T09:00:00.000'); // Z stripped
});

test('microsoft.listCalendars maps value with isDefaultCalendar', async () => {
  responder = () => ({ value: [{ id: 'c1', name: 'Kalender', isDefaultCalendar: true }] });
  const cals = await new MicrosoftCalendarAdapter().listCalendars('tok');
  assert.deepEqual(cals, [{ id: 'c1', name: 'Kalender', primary: true }]);
});
