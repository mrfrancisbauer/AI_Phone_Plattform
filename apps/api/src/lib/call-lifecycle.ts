/**
 * Pure end-of-call logic (no DB / no framework).
 *
 * Twilio's status callback tells us a call has ended. What to do depends on how
 * far the conversation got — this decides it, so the webhook stays thin and the
 * rules are unit-testable:
 *
 *  - finalize  — caller consented and answered at least one question but hung
 *                up before the regular goodbye: run the full finalization
 *                (summary, lead scoring, emails, costs) on what we have.
 *  - abandon   — hung up before consent / without any answers: close the call
 *                as failed and record duration + per-minute costs only. No
 *                consent means no LLM processing of the (trivial) transcript.
 *  - backfill  — call already ended regularly (completed/declined) but the
 *                status callback carries the authoritative duration: persist
 *                duration + usage if missing.
 *  - ignore    — nothing to do (unknown call, non-final status, …).
 */

export type EndOfCallAction = 'finalize' | 'abandon' | 'backfill' | 'ignore';

/** Twilio call statuses that mean the call has ended. */
const FINAL_TWILIO_STATUSES = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

export function isFinalTwilioStatus(twilioStatus: string): boolean {
  return FINAL_TWILIO_STATUSES.has(twilioStatus);
}

export interface EndOfCallInput {
  /** Twilio CallStatus from the status callback. */
  twilioStatus: string;
  /** Our persisted call status at the time the callback arrives. */
  callStatus: string;
  consentGiven: boolean;
  answerCount: number;
}

export function classifyEndOfCall(i: EndOfCallInput): EndOfCallAction {
  if (!isFinalTwilioStatus(i.twilioStatus)) return 'ignore';

  switch (i.callStatus) {
    case 'completed':
    case 'declined':
    case 'failed':
      return 'backfill';
    case 'in_progress':
    case 'summarizing':
      return i.consentGiven && i.answerCount > 0 ? 'finalize' : 'abandon';
    case 'ringing':
    case 'consent_pending':
      return 'abandon';
    default:
      return 'ignore';
  }
}

/** Parse Twilio's CallDuration (seconds, string) defensively. */
export function parseCallDuration(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
