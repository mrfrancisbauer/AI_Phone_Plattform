import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSlotFree, proposeFreeSlots, type Interval } from './calendar-availability.js';

const iso = (s: string) => new Date(s);
const busy: Interval[] = [
  { start: iso('2026-07-06T09:00:00Z'), end: iso('2026-07-06T10:00:00Z') },
  { start: iso('2026-07-06T11:00:00Z'), end: iso('2026-07-06T12:00:00Z') },
];

test('isSlotFree: free slot in a gap', () => {
  assert.equal(isSlotFree(iso('2026-07-06T10:00:00Z'), 30, busy), true);
});

test('isSlotFree: overlapping the start of a busy block is not free', () => {
  assert.equal(isSlotFree(iso('2026-07-06T09:30:00Z'), 30, busy), false);
});

test('isSlotFree: a slot straddling a busy block is not free', () => {
  assert.equal(isSlotFree(iso('2026-07-06T08:45:00Z'), 30, busy), false);
});

test('proposeFreeSlots: skips busy blocks and returns free alternatives', () => {
  const within = () => true; // ignore business hours for this test
  const slots = proposeFreeSlots({
    desiredStart: iso('2026-07-06T09:00:00Z'), // occupied
    durationMin: 30,
    busy,
    isWithinHours: within,
    now: iso('2026-07-06T08:00:00Z'),
    stepMin: 30,
    count: 3,
  });
  assert.equal(slots.length, 3);
  // First free 30-min slot at/after 09:00 that avoids 09:00-10:00 is 10:00.
  assert.equal(slots[0]!.toISOString(), '2026-07-06T10:00:00.000Z');
  // 10:30 would overlap 11:00 only if 60min; 30min at 10:30 ends 11:00 → free.
  assert.equal(slots[1]!.toISOString(), '2026-07-06T10:30:00.000Z');
  // 11:00-12:00 busy, so next is 12:00.
  assert.equal(slots[2]!.toISOString(), '2026-07-06T12:00:00.000Z');
});

test('proposeFreeSlots: never proposes a slot in the past', () => {
  const slots = proposeFreeSlots({
    desiredStart: iso('2026-07-06T09:00:00Z'),
    durationMin: 30,
    busy: [],
    isWithinHours: () => true,
    now: iso('2026-07-06T13:07:00Z'), // "now" is later than desired
    stepMin: 30,
    count: 1,
  });
  assert.equal(slots[0]!.toISOString(), '2026-07-06T13:30:00.000Z');
});

test('proposeFreeSlots: respects the business-hours predicate', () => {
  const businessOnly = (d: Date) => d.getUTCHours() >= 8 && d.getUTCHours() < 18;
  const slots = proposeFreeSlots({
    desiredStart: iso('2026-07-06T19:00:00Z'), // after hours
    durationMin: 30,
    busy: [],
    isWithinHours: businessOnly,
    now: iso('2026-07-06T19:00:00Z'),
    stepMin: 30,
    count: 1,
    horizonDays: 2,
  });
  // Next in-hours slot is the following morning at 08:00.
  assert.equal(slots[0]!.toISOString(), '2026-07-07T08:00:00.000Z');
});
