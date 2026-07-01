import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNaturalDateTime, type NlNow } from './datetime-nl.js';

// Reference "now": Wednesday, 2026-07-01, 10:00 (weekday 3 = Wednesday).
const NOW: NlNow = { year: 2026, month: 7, day: 1, hour: 10, minute: 0, weekday: 3 };

test('German: "morgen um 14 Uhr" → next day 14:00, explicit time', () => {
  const r = parseNaturalDateTime('morgen um 14 Uhr', NOW);
  assert.ok(r);
  assert.deepEqual([r!.year, r!.month, r!.day, r!.hour, r!.minute], [2026, 7, 2, 14, 0]);
  assert.equal(r!.assumedTime, false);
});

test('German: "übermorgen Nachmittag" → +2 days, 15:00, assumed time', () => {
  const r = parseNaturalDateTime('übermorgen Nachmittag', NOW);
  assert.ok(r);
  assert.deepEqual([r!.month, r!.day, r!.hour], [7, 3, 15]);
  assert.equal(r!.assumedTime, true);
});

test('German: "nächsten Dienstag um 10" → following Tuesday 10:00', () => {
  const r = parseNaturalDateTime('nächsten Dienstag um 10', NOW);
  assert.ok(r);
  // From Wed 2026-07-01, next Tuesday is 2026-07-07.
  assert.deepEqual([r!.month, r!.day, r!.hour], [7, 7, 10]);
});

test('German: "halb drei" time and DD.MM.YYYY date', () => {
  const r = parseNaturalDateTime('am 15.07.2026 um halb drei', NOW);
  assert.ok(r);
  assert.deepEqual([r!.day, r!.month, r!.hour, r!.minute], [15, 7, 2, 30]);
});

test('English: "next Monday at 3pm" → following Monday 15:00', () => {
  const r = parseNaturalDateTime('next Monday at 3pm', NOW, 'en');
  assert.ok(r);
  // Next Monday after Wed 2026-07-01 is 2026-07-06.
  assert.deepEqual([r!.month, r!.day, r!.hour], [7, 6, 15]);
  assert.equal(r!.assumedTime, false);
});

test('English: "tomorrow afternoon" → +1 day 15:00 assumed', () => {
  const r = parseNaturalDateTime('tomorrow afternoon', NOW, 'en');
  assert.ok(r);
  assert.deepEqual([r!.day, r!.hour], [2, 15]);
  assert.equal(r!.assumedTime, true);
});

test('ISO date is recognised', () => {
  const r = parseNaturalDateTime('2026-08-20T09:30', NOW);
  assert.ok(r);
  assert.deepEqual([r!.year, r!.month, r!.day, r!.hour, r!.minute], [2026, 8, 20, 9, 30]);
});

test('"in 3 Tagen" relative offset', () => {
  const r = parseNaturalDateTime('in 3 Tagen', NOW);
  assert.ok(r);
  assert.equal(r!.day, 4);
});

test('ambiguous / no date → null (assistant must ask again)', () => {
  assert.equal(parseNaturalDateTime('irgendwann bald', NOW), null);
  assert.equal(parseNaturalDateTime('so schnell wie möglich', NOW), null);
  assert.equal(parseNaturalDateTime('um 14 Uhr', NOW), null); // time but no day
  assert.equal(parseNaturalDateTime('', NOW), null);
});
