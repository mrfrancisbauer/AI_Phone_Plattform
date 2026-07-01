export function money(n: number | null | undefined, currency = 'EUR'): string {
  if (n == null) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n);
}

export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')} min`;
}

export function dateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function leadColor(category: string | null): string {
  switch (category) {
    case 'A':
      return '#0a7d2c';
    case 'B':
      return '#b8860b';
    case 'C':
      return '#888';
    default:
      return '#bbb';
  }
}

/** German label for a call status (raw enum values are not customer language). */
export function callStatusLabel(status: string): string {
  switch (status) {
    case 'ringing': return 'Klingelt';
    case 'consent_pending': return 'Aufgelegt (Begrüßung)';
    case 'in_progress': return 'Laufend';
    case 'summarizing': return 'Wird ausgewertet';
    case 'completed': return 'Abgeschlossen';
    case 'declined': return 'Abgelehnt';
    case 'failed': return 'Abgebrochen';
    default: return status;
  }
}
