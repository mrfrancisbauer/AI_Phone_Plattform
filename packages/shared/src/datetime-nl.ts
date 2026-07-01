/**
 * Pure natural-language date/time extraction (German + English).
 *
 * Works entirely on WALL-CLOCK components relative to a caller-timezone "now",
 * so it stays deterministic and framework-free. The caller (conversation
 * service) is responsible for supplying `now` in the tenant's timezone and for
 * converting the returned wall-clock result back to a UTC instant. Returns null
 * when no date can be resolved, so the assistant knows to ask again.
 */

export interface NlNow {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0=Sunday .. 6=Saturday
}

export interface NlResult {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** True when a date was clearly resolved. */
  confident: boolean;
  /** True when the time was defaulted/inferred (daypart or none) rather than stated. */
  assumedTime: boolean;
}

type Locale = 'de' | 'en';

const WEEKDAYS: Record<string, number> = {
  // German
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6,
  // English
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// Unicode-aware word boundary. JS \b is ASCII-only, so it fails around German
// letters (e.g. before "übermorgen"); this treats all letters/digits as word
// chars so keyword matching works for umlauts.
const B = (p: string) => new RegExp(`(?<![\\p{L}\\d])(?:${p})(?![\\p{L}\\d])`, 'u');

// Daypart → default hour. assumedTime stays true for these.
const DAYPARTS: Array<{ re: RegExp; hour: number }> = [
  { re: B('vormittag|morgens|früh|morning'), hour: 9 },
  { re: B('nachmittags?|afternoon'), hour: 15 },
  { re: B('mittags?|noon|lunchtime'), hour: 12 },
  { re: B('abends?|evening|tonight'), hour: 18 },
  { re: B('nachts?|night'), hour: 20 },
];

// German cardinals 1-12 (for "halb drei" style times).
const DE_NUM: Record<string, number> = {
  eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6,
  sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};

/** Add `days` to a wall-clock date using UTC as a pure calendar calculator. */
function addDays(now: NlNow, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(now.year, now.month - 1, now.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Days until the next occurrence of `target` weekday (1..7, never today). */
function daysUntilWeekday(fromWeekday: number, target: number): number {
  const diff = (target - fromWeekday + 7) % 7;
  return diff === 0 ? 7 : diff;
}

/** Parse an explicit time from text that no longer contains the date token. */
function parseTime(text: string): { hour: number; minute: number } | null {
  // English am/pm: "3pm", "3:30 pm", "at 3 pm"
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2] ? Number(ampm[2]) : 0;
    if (ampm[3] === 'pm' && h < 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    if (h <= 23 && m <= 59) return { hour: h, minute: m };
  }
  // German "halb X" → (X-1):30. Accepts digits or German words ("halb drei").
  const halb = text.match(/(?<![\p{L}\d])halb\s+([a-zäöüß]+|\d{1,2})(?![\p{L}\d])/u);
  if (halb) {
    const raw = halb[1]!;
    const n = /^\d+$/.test(raw) ? Number(raw) : DE_NUM[raw];
    if (n && n >= 1 && n <= 24) return { hour: (n + 23) % 24, minute: 30 };
  }
  // "um 14:30", "14:30 uhr", "14 uhr", "at 14:30", "um 9" — needs a time cue.
  if (/(uhr|o'?clock|:|\bum\b|\bat\b|\bgegen\b)/.test(text)) {
    const hm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:uhr|o'?clock)?\b/);
    if (hm) {
      const h = Number(hm[1]);
      const m = hm[2] ? Number(hm[2]) : 0;
      if (h <= 23 && m <= 59) return { hour: h, minute: m };
    }
  }
  return null;
}

/**
 * Resolve a caller phrase into a wall-clock date/time relative to `now`.
 * Returns null when no date is recognizable. The matched date token is removed
 * from the working text before the time is parsed, so date digits (year, day,
 * "in 3 Tagen") never leak into time detection.
 */
export function parseNaturalDateTime(text: string, now: NlNow, _locale: Locale = 'de'): NlResult | null {
  let t = ` ${text.toLowerCase().trim()} `;
  let date: { year: number; month: number; day: number } | null = null;
  let explicitTime: { hour: number; minute: number } | null = null;

  // 1) ISO date with optional time.
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{1,2}):(\d{2}))?\b/);
  if (iso) {
    date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    if (iso[4]) explicitTime = { hour: Number(iso[4]), minute: Number(iso[5]) };
    t = t.replace(iso[0], ' ');
  }

  // 2) German DD.MM.YYYY.
  if (!date) {
    const de = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if (de) {
      const day = Number(de[1]), month = Number(de[2]), year = Number(de[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        date = { year, month, day };
        t = t.replace(de[0], ' ');
      }
    }
  }

  // 3) Relative day keywords (order matters: übermorgen before morgen).
  if (!date) {
    let m: RegExpMatchArray | null;
    if ((m = t.match(B('übermorgen|overmorrow|day after tomorrow')))) { date = addDays(now, 2); }
    else if ((m = t.match(B('morgen|tomorrow')))) { date = addDays(now, 1); }
    else if ((m = t.match(B('heute|today')))) { date = addDays(now, 0); }
    else if ((m = t.match(/(?<![\p{L}\d])in\s+(\d{1,2})\s+(tagen|days?)(?![\p{L}\d])/u))) { date = addDays(now, Number(m[1])); }
    if (m) t = t.replace(m[0], ' ');
  }

  // 4) Weekday names ("nächsten Dienstag", "next Monday", bare "Freitag").
  if (!date) {
    for (const [name, wd] of Object.entries(WEEKDAYS)) {
      const m = t.match(B(name));
      if (m) {
        date = addDays(now, daysUntilWeekday(now.weekday, wd));
        t = t.replace(m[0], ' ');
        break;
      }
    }
  }

  if (!date) return null;

  let hour: number;
  let minute: number;
  let assumedTime: boolean;
  const time = explicitTime ?? parseTime(t);
  if (time) {
    hour = time.hour; minute = time.minute; assumedTime = false;
  } else {
    let daypartHour: number | null = null;
    for (const dp of DAYPARTS) if (dp.re.test(t)) { daypartHour = dp.hour; break; }
    if (daypartHour !== null) { hour = daypartHour; minute = 0; assumedTime = true; }
    else { hour = 9; minute = 0; assumedTime = true; }
  }

  return { year: date.year, month: date.month, day: date.day, hour, minute, confident: true, assumedTime };
}
