/**
 * Pure questionnaire engine.
 *
 * Given a questionnaire and the answers collected so far, it decides which
 * question to ask next (respecting ordering, required flags and conditional
 * triggers) and normalizes a caller's free-form answer into a typed value.
 *
 * Pure + deterministic so the conversation flow is testable without any
 * telephony or LLM dependency.
 */
import { QUESTION_TYPES } from './constants.js';
import type { QuestionCondition, QuestionnaireQuestion } from './types.js';

export type AnswerMap = Record<string, { value: unknown; rawText: string }>;

/** Evaluate a single conditional trigger against the answers collected so far. */
export function evaluateCondition(condition: QuestionCondition, answers: AnswerMap): boolean {
  const answer = answers[condition.questionKey];
  if (answer === undefined) return false;
  const a = answer.value;
  switch (condition.operator) {
    case 'truthy':
      return Boolean(a);
    case 'equals':
      return a === condition.value;
    case 'not_equals':
      return a !== condition.value;
    case 'gte':
      return typeof a === 'number' && typeof condition.value === 'number' && a >= condition.value;
    case 'lte':
      return typeof a === 'number' && typeof condition.value === 'number' && a <= condition.value;
    default:
      return false;
  }
}

/** Whether a question is currently eligible to be asked (condition satisfied). */
export function isQuestionActive(q: QuestionnaireQuestion, answers: AnswerMap): boolean {
  if (!q.condition) return true;
  return evaluateCondition(q.condition, answers);
}

/**
 * Pick the next unanswered, active question in order. Returns null when the
 * questionnaire is complete (all active required questions answered).
 */
export function nextQuestion(
  questions: QuestionnaireQuestion[],
  answers: AnswerMap,
): QuestionnaireQuestion | null {
  const ordered = [...questions].sort((a, b) => a.order - b.order);
  for (const q of ordered) {
    if (answers[q.key] !== undefined) continue;
    if (!isQuestionActive(q, answers)) continue;
    return q;
  }
  return null;
}

/** Are all currently-active required questions answered? */
export function isComplete(questions: QuestionnaireQuestion[], answers: AnswerMap): boolean {
  return questions
    .filter((q) => q.required && isQuestionActive(q, answers))
    .every((q) => answers[q.key] !== undefined);
}

const YES_WORDS = ['ja', 'jo', 'jawohl', 'klar', 'yes', 'yeah', 'yep', 'genau', 'korrekt', 'richtig'];
const NO_WORDS = ['nein', 'ne', 'nö', 'no', 'nope', 'nicht'];

export interface NormalizationResult {
  ok: boolean;
  value: unknown;
  /** When ok is false, a short clarification prompt to read back to the caller. */
  clarification?: string;
}

/**
 * Normalize a caller's spoken/typed answer into a typed value for a question.
 * Returns ok=false with a clarification when the answer cannot be parsed, so
 * the assistant can ask a follow-up instead of storing garbage.
 */
export function normalizeAnswer(
  q: QuestionnaireQuestion,
  rawText: string,
): NormalizationResult {
  const text = rawText.trim();
  if (!text) return { ok: false, value: null, clarification: 'Entschuldigung, das habe ich nicht verstanden. Können Sie das wiederholen?' };
  const lower = text.toLowerCase();

  switch (q.type) {
    case QUESTION_TYPES.YES_NO: {
      if (YES_WORDS.some((w) => lower.includes(w))) return { ok: true, value: true };
      if (NO_WORDS.some((w) => lower.includes(w))) return { ok: true, value: false };
      return { ok: false, value: null, clarification: 'Meinen Sie damit Ja oder Nein?' };
    }
    case QUESTION_TYPES.EMAIL: {
      const match = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
      if (match) return { ok: true, value: match[0].toLowerCase() };
      return { ok: false, value: null, clarification: 'Können Sie Ihre E-Mail-Adresse noch einmal buchstabieren?' };
    }
    case QUESTION_TYPES.PHONE: {
      const digits = text.replace(/[^\d+]/g, '');
      if (digits.replace(/\D/g, '').length >= 7) return { ok: true, value: digits };
      return { ok: false, value: null, clarification: 'Welche Telefonnummer erreiche ich Sie am besten?' };
    }
    case QUESTION_TYPES.SCALE: {
      const num = parseFirstNumber(text);
      const min = q.scaleMin ?? 1;
      const max = q.scaleMax ?? 10;
      if (num !== null && num >= min && num <= max) return { ok: true, value: num };
      return { ok: false, value: null, clarification: `Bitte nennen Sie eine Zahl zwischen ${min} und ${max}.` };
    }
    case QUESTION_TYPES.URGENCY: {
      const urgency = parseUrgency(lower);
      if (urgency !== null) return { ok: true, value: urgency };
      return { ok: false, value: null, clarification: 'Wie dringend ist Ihr Anliegen — eher niedrig, mittel oder hoch?' };
    }
    case QUESTION_TYPES.BUDGET: {
      const num = parseFirstNumber(text.replace(/\./g, '').replace(',', '.'));
      if (num !== null) return { ok: true, value: num };
      // Accept a free-text budget if no number was given.
      return { ok: true, value: text };
    }
    case QUESTION_TYPES.MULTIPLE_CHOICE: {
      const opt = (q.options ?? []).find(
        (o) => lower.includes(o.label.toLowerCase()) || lower.includes(o.value.toLowerCase()),
      );
      if (opt) return { ok: true, value: opt.value };
      return {
        ok: false,
        value: null,
        clarification: `Bitte wählen Sie: ${(q.options ?? []).map((o) => o.label).join(', ')}.`,
      };
    }
    case QUESTION_TYPES.DATETIME:
    case QUESTION_TYPES.FREE_TEXT:
    default:
      return { ok: true, value: text };
  }
}

function parseFirstNumber(text: string): number | null {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Map an urgency phrase to a 0..1 score. */
export function parseUrgency(lower: string): number | null {
  if (/(sehr dringend|sofort|notfall|asap|umgehend)/.test(lower)) return 1;
  if (/(dringend|schnell|bald|hoch)/.test(lower)) return 0.8;
  if (/(mittel|normal|diese woche)/.test(lower)) return 0.5;
  if (/(nicht dringend|keine eile|niedrig|irgendwann|gering)/.test(lower)) return 0.2;
  const num = parseFirstNumber(lower);
  if (num !== null) return Math.min(1, Math.max(0, num / 10));
  return null;
}
