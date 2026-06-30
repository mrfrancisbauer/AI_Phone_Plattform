/**
 * Lead-scoring engine.
 *
 * Produces an A/B/C category from the structured answers collected during a
 * call. The rules mirror the spec:
 *
 *   A-Lead: concrete request, complete contact data, high urgency, clear need,
 *           appointment/callback wish.
 *   B-Lead: interest present, need still unclear, contact data present.
 *   C-Lead: unspecific, no contact data, no concrete need.
 *
 * The scorer is intentionally deterministic and explainable: it returns the
 * category, a numeric score, and the reasons that drove it, so the tenant can
 * audit why a lead was rated the way it was.
 */
import type { LeadCategory } from './constants.js';

export interface LeadSignals {
  hasEmail: boolean;
  hasPhone: boolean;
  /** Caller stated a name. */
  hasName: boolean;
  /** Urgency answer normalized to 0..1 (1 = very urgent). */
  urgency: number | null;
  /** Caller asked for a callback or appointment. */
  wantsCallback: boolean;
  /** A concrete budget was provided. */
  hasBudget: boolean;
  /** The primary concern/need was captured and non-empty. */
  hasConcreteNeed: boolean;
}

export interface LeadScore {
  category: LeadCategory;
  score: number;
  reasons: string[];
}

const WEIGHTS = {
  hasEmail: 15,
  hasPhone: 15,
  hasName: 10,
  urgency: 25, // multiplied by urgency 0..1
  wantsCallback: 15,
  hasBudget: 10,
  hasConcreteNeed: 20,
} as const;

export function scoreLead(signals: LeadSignals): LeadScore {
  let score = 0;
  const reasons: string[] = [];

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  if (signals.hasConcreteNeed) add(WEIGHTS.hasConcreteNeed, 'concrete need captured');
  if (signals.hasEmail) add(WEIGHTS.hasEmail, 'email provided');
  if (signals.hasPhone) add(WEIGHTS.hasPhone, 'phone available');
  if (signals.hasName) add(WEIGHTS.hasName, 'name provided');
  if (signals.wantsCallback) add(WEIGHTS.wantsCallback, 'callback/appointment requested');
  if (signals.hasBudget) add(WEIGHTS.hasBudget, 'budget indicated');
  if (signals.urgency !== null && signals.urgency > 0) {
    const pts = Math.round(WEIGHTS.urgency * Math.min(1, Math.max(0, signals.urgency)));
    if (pts > 0) add(pts, `urgency ${(signals.urgency * 100).toFixed(0)}%`);
  }

  const contactComplete = signals.hasPhone && (signals.hasEmail || signals.hasName);
  const highUrgency = (signals.urgency ?? 0) >= 0.6;

  let category: LeadCategory;
  if (signals.hasConcreteNeed && contactComplete && (highUrgency || signals.wantsCallback)) {
    category = 'A';
  } else if (signals.hasConcreteNeed || (contactComplete && score >= 30)) {
    category = 'B';
  } else {
    category = 'C';
  }

  return { category, score, reasons };
}

/**
 * Suggest the next action for the tenant's team based on the lead category and
 * urgency. Used in the internal summary email.
 */
export function recommendNextAction(score: LeadScore, urgency: number | null): string {
  if (score.category === 'A') {
    return urgency !== null && urgency >= 0.8
      ? 'Sofort zurückrufen (heute, hohe Dringlichkeit).'
      : 'Innerhalb von 24 Stunden zurückrufen und Angebot vorbereiten.';
  }
  if (score.category === 'B') {
    return 'In den nächsten 2-3 Werktagen kontaktieren, Bedarf qualifizieren.';
  }
  return 'Niedrige Priorität: bei Kapazität nachfassen oder Infomaterial senden.';
}
