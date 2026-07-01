/**
 * Minimal IANA-timezone helpers built on Intl (no external tz library).
 * Used to interpret caller phrases and business hours in the TENANT's timezone
 * and to convert wall-clock components back to a correct UTC instant.
 */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0=Sunday .. 6=Saturday
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall-clock parts of `date` as seen in `tz`. */
export function zonedParts(date: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // some runtimes emit 24 for midnight
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour,
    minute: Number(p.minute),
    weekday: WEEKDAY_INDEX[p.weekday!] ?? 0,
  };
}

/** "Now" in the given timezone, as wall-clock parts. */
export function nowInZone(tz: string, now: Date = new Date()): ZonedParts {
  return zonedParts(now, tz);
}

/** Convert wall-clock components in `tz` to the corresponding UTC instant. */
export function zonedWallToUtc(
  w: { year: number; month: number; day: number; hour: number; minute: number },
  tz: string,
): Date {
  const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const seen = zonedParts(new Date(asUTC), tz);
  const asIfLocal = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  const offset = asIfLocal - asUTC; // how far `tz` is ahead of UTC at this instant
  return new Date(asUTC - offset);
}

/** True when `date` falls within Mon–Fri business hours [startHour, endHour) in `tz`. */
export function isBusinessHours(date: Date, tz: string, startHour = 8, endHour = 18): boolean {
  const p = zonedParts(date, tz);
  if (p.weekday === 0 || p.weekday === 6) return false;
  return p.hour >= startHour && p.hour < endHour;
}
