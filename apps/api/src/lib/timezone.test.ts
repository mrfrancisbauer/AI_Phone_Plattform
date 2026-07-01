import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBusinessHours, nowInZone, zonedParts, zonedWallToUtc } from './timezone.js';

test('zonedParts: UTC instant seen in Europe/Berlin (summer = UTC+2)', () => {
  const p = zonedParts(new Date('2026-07-01T12:00:00Z'), 'Europe/Berlin');
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute], [2026, 7, 1, 14, 0]);
});

test('zonedWallToUtc: Berlin summer wall 14:00 → 12:00 UTC', () => {
  const utc = zonedWallToUtc({ year: 2026, month: 7, day: 1, hour: 14, minute: 0 }, 'Europe/Berlin');
  assert.equal(utc.toISOString(), '2026-07-01T12:00:00.000Z');
});

test('zonedWallToUtc: Berlin winter wall 14:00 → 13:00 UTC (UTC+1)', () => {
  const utc = zonedWallToUtc({ year: 2026, month: 1, day: 15, hour: 14, minute: 0 }, 'Europe/Berlin');
  assert.equal(utc.toISOString(), '2026-01-15T13:00:00.000Z');
});

test('isBusinessHours: weekday inside hours vs weekend', () => {
  // 2026-07-01 is a Wednesday. 09:00 Berlin = 07:00Z.
  assert.equal(isBusinessHours(new Date('2026-07-01T07:00:00Z'), 'Europe/Berlin'), true);
  // 2026-07-04 is a Saturday.
  assert.equal(isBusinessHours(new Date('2026-07-04T10:00:00Z'), 'Europe/Berlin'), false);
  // 21:00 Berlin is outside hours.
  assert.equal(isBusinessHours(new Date('2026-07-01T19:00:00Z'), 'Europe/Berlin'), false);
});

test('nowInZone returns weekday index', () => {
  const p = nowInZone('Europe/Berlin', new Date('2026-07-01T12:00:00Z'));
  assert.equal(p.weekday, 3); // Wednesday
});
