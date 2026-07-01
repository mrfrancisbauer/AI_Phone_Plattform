import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAppointmentDraft, parseDateValue } from './calendar-appointment.js';

test('parseDateValue: accepts ISO strings, Dates and epoch millis; rejects junk', () => {
  assert.equal(parseDateValue('2026-07-15T14:00:00Z')?.toISOString(), '2026-07-15T14:00:00.000Z');
  const d = new Date('2026-07-15T14:00:00Z');
  assert.equal(parseDateValue(d)?.getTime(), d.getTime());
  assert.equal(parseDateValue(d.getTime())?.getTime(), d.getTime());
  assert.equal(parseDateValue('not a date'), null);
  assert.equal(parseDateValue(''), null);
  assert.equal(parseDateValue(null), null);
  assert.equal(parseDateValue(undefined), null);
});

test('parseDateValue: German day-first format with and without time', () => {
  const dateOnly = parseDateValue('15.07.2026');
  assert.equal(dateOnly?.getFullYear(), 2026);
  assert.equal(dateOnly?.getMonth(), 6); // July (0-indexed)
  assert.equal(dateOnly?.getDate(), 15);
  const withTime = parseDateValue('15.07.2026 14:30');
  assert.equal(withTime?.getHours(), 14);
  assert.equal(withTime?.getMinutes(), 30);
  assert.equal(parseDateValue('15.07.2026 um 09:00')?.getHours(), 9);
  // Overflow guard: 32.13.2026 is not a real date.
  assert.equal(parseDateValue('32.13.2026'), null);
});

test('buildAppointmentDraft: no datetime answer → null', () => {
  const draft = buildAppointmentDraft({
    answers: [{ key: 'name', type: 'free_text', value: 'Max' }],
    tenantName: 'Kanzlei Test',
  });
  assert.equal(draft, null);
});

test('buildAppointmentDraft: unparseable datetime → null', () => {
  const draft = buildAppointmentDraft({
    answers: [{ key: 'termin', type: 'datetime', value: 'irgendwann' }],
    tenantName: 'Kanzlei Test',
  });
  assert.equal(draft, null);
});

test('buildAppointmentDraft: builds a 30-min event with caller + summary', () => {
  const draft = buildAppointmentDraft({
    answers: [{ key: 'termin', type: 'datetime', value: '2026-07-15T14:00:00Z' }],
    tenantName: 'Kanzlei Test',
    callerName: 'Max Mustermann',
    callerPhone: '+4930123456',
    summary: 'Erstberatung Mietrecht',
  });
  assert.ok(draft);
  assert.equal(draft!.title, 'Termin mit Max Mustermann');
  assert.equal(draft!.startISO, '2026-07-15T14:00:00.000Z');
  assert.equal(draft!.endISO, '2026-07-15T14:30:00.000Z');
  assert.match(draft!.description, /Erstberatung Mietrecht/);
  assert.match(draft!.description, /\+4930123456/);
  assert.match(draft!.description, /Kanzlei Test/);
});

test('buildAppointmentDraft: honours a custom duration and falls back to "Anrufer"', () => {
  const draft = buildAppointmentDraft({
    answers: [{ key: 'termin', type: 'datetime', value: '2026-07-15T09:00:00Z' }],
    tenantName: 'Praxis',
    durationMinutes: 60,
  });
  assert.ok(draft);
  assert.equal(draft!.title, 'Termin mit Anrufer');
  assert.equal(draft!.endISO, '2026-07-15T10:00:00.000Z');
});
