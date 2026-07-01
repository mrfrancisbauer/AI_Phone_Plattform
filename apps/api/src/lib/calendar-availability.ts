/**
 * Pure free/busy logic (no DB / no provider). Decides whether a desired slot is
 * free given the calendar's busy intervals, and proposes the next free slots
 * when it is not. Provider adapters supply the busy intervals; timezone-aware
 * business-hours filtering is injected as a predicate so this stays pure.
 */
export interface Interval {
  start: Date;
  end: Date;
}

/** True when [start, start+durationMin) overlaps none of the busy intervals. */
export function isSlotFree(start: Date, durationMin: number, busy: Interval[]): boolean {
  const end = new Date(start.getTime() + durationMin * 60_000);
  return !busy.some((b) => start < b.end && end > b.start);
}

export interface ProposeOptions {
  desiredStart: Date;
  durationMin: number;
  busy: Interval[];
  /** Whether a candidate start is inside allowed (e.g. business) hours. */
  isWithinHours: (d: Date) => boolean;
  now?: Date;
  stepMin?: number;
  count?: number;
  horizonDays?: number;
}

/**
 * Propose up to `count` free slots at/after the desired start (never in the
 * past), aligned to `stepMin`, within allowed hours and not overlapping busy.
 */
export function proposeFreeSlots(o: ProposeOptions): Date[] {
  const stepMs = (o.stepMin ?? 30) * 60_000;
  const count = o.count ?? 3;
  const now = o.now ?? new Date();
  const horizonMs = (o.horizonDays ?? 14) * 24 * 60 * 60_000;

  const from = Math.max(o.desiredStart.getTime(), now.getTime());
  let cursor = Math.ceil(from / stepMs) * stepMs; // round up to the next step
  const limit = o.desiredStart.getTime() + horizonMs;

  const out: Date[] = [];
  while (cursor <= limit && out.length < count) {
    const d = new Date(cursor);
    if (o.isWithinHours(d) && isSlotFree(d, o.durationMin, o.busy)) out.push(d);
    cursor += stepMs;
  }
  return out;
}
