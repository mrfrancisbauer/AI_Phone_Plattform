/**
 * Pure logic that turns a call's captured answers into a calendar appointment
 * draft (no DB / no provider). Returns null when the call has no usable
 * date/time, so callers can cleanly skip event creation. Kept pure so the
 * date parsing and payload shaping are exhaustively unit-testable.
 */
export interface AppointmentAnswer {
  key: string;
  type: string; // QuestionType as a string ('datetime', 'phone', …)
  value: unknown;
}

export interface AppointmentDraft {
  title: string;
  description: string;
  startISO: string;
  endISO: string;
}

export interface BuildAppointmentInput {
  answers: AppointmentAnswer[];
  tenantName: string;
  callerName?: string | null;
  callerPhone?: string | null;
  summary?: string | null;
  durationMinutes?: number;
}

/** Parse the common German `DD.MM.YYYY` / `DD.MM.YYYY HH:MM` format, or null. */
function parseGermanDateTime(text: string): Date | null {
  const m = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,]+(?:um\s+)?(\d{1,2}):(\d{2}))?/i);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh ? Number(hh) : 0, min ? Number(min) : 0);
  // Guard against overflow (e.g. 32.13.2026 rolling over).
  if (d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return isNaN(d.getTime()) ? null : d;
}

/** Coerce a stored answer value into a valid Date, or null. */
export function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    // Try the German day-first format before the generic parser, which would
    // otherwise misread or reject "15.07.2026".
    const german = parseGermanDateTime(value);
    if (german) return german;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Build an appointment draft from the first datetime answer in the call.
 * Returns null when there is no parseable date/time.
 */
export function buildAppointmentDraft(input: BuildAppointmentInput): AppointmentDraft | null {
  const dateAnswer = input.answers.find((a) => a.type === 'datetime' && a.value != null);
  if (!dateAnswer) return null;
  const start = parseDateValue(dateAnswer.value);
  if (!start) return null;

  const minutes = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : 30;
  const end = new Date(start.getTime() + minutes * 60_000);

  const who = input.callerName?.trim() || 'Anrufer';
  const title = `Termin mit ${who}`;

  const lines: string[] = [];
  if (input.summary?.trim()) lines.push(input.summary.trim());
  if (input.callerPhone?.trim()) lines.push(`Telefon: ${input.callerPhone.trim()}`);
  lines.push('');
  lines.push(`Automatisch vom KI-Telefonassistenten für ${input.tenantName} erstellt.`);

  return {
    title,
    description: lines.join('\n'),
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}
