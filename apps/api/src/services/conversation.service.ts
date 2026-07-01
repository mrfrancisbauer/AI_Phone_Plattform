/**
 * Conversation engine (turn-based, telephony-agnostic).
 *
 * Each inbound webhook delivers one caller utterance; `handleTurn` advances the
 * state machine and returns what the assistant should say next plus whether to
 * keep listening (`gather`) or hang up. State is persisted on the call row so
 * the engine is stateless between webhook hits and horizontally scalable.
 *
 * Phases:
 *   consent       → ask GDPR consent; yes ⇒ questions, no ⇒ decline + hangup
 *   questions     → ask questionnaire questions one at a time, with clarifying
 *                   follow-ups on unparseable answers
 *   confirm       → read back a short summary, ask "ist alles korrekt?"
 *   correction    → capture a correction, then finalize
 *   email_consent → if a caller email was captured, ask consent to email them
 *   done          → finalize the call (summary + emails + usage)
 */
import {
  MESSAGE_ROLE,
  QUESTION_TYPES,
  UNCERTAIN_RESPONSE_DE,
  isComplete,
  nextQuestion,
  normalizeAnswer,
  parseNaturalDateTime,
  type AnswerMap,
  type NormalizationResult,
  type QuestionnaireQuestion,
} from '@ai-phone/shared';
import { prisma } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import { nowInZone, zonedWallToUtc } from '../lib/timezone.js';
import { logger } from '../logger.js';
import { checkAvailability } from './calendar.service.js';
import { finalizeCall } from './summary.service.js';

type Phase = 'consent' | 'questions' | 'confirm' | 'correction' | 'email_consent' | 'done';

interface CallState {
  phase: Phase;
  pendingQuestionKey: string | null;
  clarifyCount: number;
}

export interface TurnResult {
  /** What the assistant should say (read out via TTS). */
  say: string;
  /** Keep listening for another caller turn, or end the call. */
  action: 'gather' | 'hangup';
}

const YES = /\b(ja|jo|jawohl|klar|genau|korrekt|richtig|passt|yes|yep)\b/i;
const NO = /\b(nein|ne|nö|nicht|falsch|no|nope)\b/i;

function defaultState(): CallState {
  return { phase: 'consent', pendingQuestionKey: null, clarifyCount: 0 };
}

/** Convert a Prisma question row into the shared engine type. */
function toEngineQuestion(q: {
  id: string;
  questionnaireId: string;
  key: string;
  prompt: string;
  type: string;
  required: boolean;
  order: number;
  options: unknown;
  scaleMin: number | null;
  scaleMax: number | null;
  condition: unknown;
}): QuestionnaireQuestion {
  return {
    id: q.id,
    questionnaireId: q.questionnaireId,
    key: q.key,
    prompt: q.prompt,
    type: q.type as QuestionnaireQuestion['type'],
    required: q.required,
    order: q.order,
    options: (q.options as QuestionnaireQuestion['options']) ?? undefined,
    scaleMin: q.scaleMin ?? undefined,
    scaleMax: q.scaleMax ?? undefined,
    condition: (q.condition as QuestionnaireQuestion['condition']) ?? null,
  };
}

async function loadCall(callId: string) {
  return prisma.call.findUniqueOrThrow({
    where: { id: callId },
    include: {
      assistant: { include: { questionnaire: { include: { questions: true } } } },
      answers: true,
      tenant: { select: { timezone: true } },
    },
  });
}

/** Format a proposed slot for speech in the tenant's timezone. */
function formatSlot(d: Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/**
 * Resolve a datetime answer: parse the natural-language date/time in the
 * tenant's timezone, then check calendar availability. Returns a clarification
 * (so the assistant asks again) when the date is unclear or the slot is busy —
 * in the busy case it proposes free alternatives. On success the value stored
 * is a normalized UTC ISO string. All provider logic stays behind the service.
 */
async function resolveDatetimeAnswer(
  tenantId: string,
  tz: string,
  locale: string,
  rawText: string,
): Promise<NormalizationResult> {
  const now = nowInZone(tz);
  const parsed = parseNaturalDateTime(rawText, now, locale === 'en' ? 'en' : 'de');
  if (!parsed) {
    return {
      ok: false,
      value: null,
      clarification: 'Ich habe das Datum nicht ganz verstanden. Für wann möchten Sie den Termin — zum Beispiel „morgen um 14 Uhr" oder „nächsten Dienstag um 10"?',
    };
  }
  const startUtc = zonedWallToUtc(parsed, tz);
  const avail = await checkAvailability(tenantId, startUtc, tz);
  if (!avail.available) {
    const opts = avail.alternatives.map((d) => formatSlot(d, tz, locale)).join(' oder ');
    return {
      ok: false,
      value: null,
      clarification: opts
        ? `Dieser Termin ist leider schon belegt. Ich könnte Ihnen anbieten: ${opts}. Welcher passt Ihnen?`
        : 'Dieser Termin ist leider schon belegt. Können Sie mir einen anderen Wunschtermin nennen?',
    };
  }
  return { ok: true, value: startUtc.toISOString() };
}

async function logMessage(callId: string, tenantId: string, role: string, text: string) {
  await prisma.callMessage.create({
    data: { callId, tenantId, role: role as 'assistant' | 'caller' | 'system', textEnc: encrypt(text) },
  });
}

async function setState(callId: string, state: CallState) {
  await prisma.call.update({ where: { id: callId }, data: { state: state as object } });
}

function buildAnswerMap(answers: Array<{ questionKey: string; value: unknown }>): AnswerMap {
  const map: AnswerMap = {};
  for (const a of answers) map[a.questionKey] = { value: a.value, rawText: '' };
  return map;
}

/**
 * Advance the conversation. `callerText` is null on the very first turn (right
 * after greeting + consent prompt has been spoken by the greeting handler).
 */
export async function handleTurn(callId: string, callerText: string | null): Promise<TurnResult> {
  const call = await loadCall(callId);
  const state: CallState = (call.state as CallState | null) ?? defaultState();
  const assistant = call.assistant;
  const questions = (assistant.questionnaire?.questions ?? []).map(toEngineQuestion);

  if (callerText && callerText.trim()) {
    await logMessage(callId, call.tenantId, MESSAGE_ROLE.CALLER, callerText.trim());
  }

  const say = async (text: string, action: 'gather' | 'hangup' = 'gather'): Promise<TurnResult> => {
    await logMessage(callId, call.tenantId, MESSAGE_ROLE.ASSISTANT, text);
    return { say: text, action };
  };

  switch (state.phase) {
    // ----- CONSENT -----
    case 'consent': {
      if (!callerText) {
        // Should not normally happen — re-ask consent.
        return say(assistant.consentText);
      }
      if (NO.test(callerText) && !YES.test(callerText)) {
        await prisma.call.update({ where: { id: callId }, data: { status: 'declined', endedAt: new Date() } });
        return say(
          'Kein Problem, ich verstehe. Sie erreichen unser Team gerne auch persönlich. Vielen Dank für Ihren Anruf und auf Wiederhören.',
          'hangup',
        );
      }
      if (YES.test(callerText)) {
        await prisma.call.update({ where: { id: callId }, data: { consentGiven: true, status: 'in_progress' } });
        return startQuestions(call.id, call.tenantId, questions, {}, say, state);
      }
      return say('Darf ich Sie kurz fragen: Sind Sie mit der KI-gestützten Bearbeitung einverstanden? Bitte sagen Sie Ja oder Nein.');
    }

    // ----- QUESTIONS -----
    case 'questions': {
      const answers = buildAnswerMap(call.answers);
      const current = questions.find((q) => q.key === state.pendingQuestionKey);
      if (current && callerText) {
        // Datetime answers go through NL parsing + calendar availability so the
        // assistant can confirm or propose alternatives live; everything else
        // uses the pure normalizer.
        const result =
          current.type === QUESTION_TYPES.DATETIME
            ? await resolveDatetimeAnswer(call.tenantId, call.tenant.timezone, assistant.locale, callerText)
            : normalizeAnswer(current, callerText);
        if (!result.ok) {
          const clarifyCount = state.clarifyCount + 1;
          if (clarifyCount >= 3) {
            // Give up on this question after repeated failures; skip it.
            await setState(callId, { ...state, clarifyCount: 0, pendingQuestionKey: null });
          } else {
            await setState(callId, { ...state, clarifyCount });
            return say(result.clarification ?? UNCERTAIN_RESPONSE_DE);
          }
        } else {
          await prisma.callAnswer.upsert({
            where: { callId_questionKey: { callId, questionKey: current.key } },
            create: {
              tenantId: call.tenantId,
              callId,
              questionKey: current.key,
              type: current.type,
              value: result.value as object,
              rawTextEnc: encrypt(callerText),
            },
            update: { value: result.value as object, rawTextEnc: encrypt(callerText) },
          });
          answers[current.key] = { value: result.value, rawText: callerText };
        }
      }

      const next = nextQuestion(questions, answers);
      if (next) {
        await setState(callId, { phase: 'questions', pendingQuestionKey: next.key, clarifyCount: 0 });
        return say(phraseQuestion(next));
      }
      // No more questions — confirm.
      if (isComplete(questions, answers) || questions.length === 0) {
        await setState(callId, { phase: 'confirm', pendingQuestionKey: null, clarifyCount: 0 });
        return say(buildConfirmation(questions, answers));
      }
      await setState(callId, { phase: 'confirm', pendingQuestionKey: null, clarifyCount: 0 });
      return say(buildConfirmation(questions, answers));
    }

    // ----- CONFIRM -----
    case 'confirm': {
      if (callerText && NO.test(callerText) && !YES.test(callerText)) {
        await setState(callId, { ...state, phase: 'correction' });
        return say('Verstanden. Was möchten Sie gerne korrigieren oder ergänzen?');
      }
      // Treat anything else as confirmation.
      return proceedAfterConfirm(call.id, call.callerEmailConsent, call.answers, say, setStateProxy(callId));
    }

    // ----- CORRECTION -----
    case 'correction': {
      if (callerText) {
        await logMessage(callId, call.tenantId, MESSAGE_ROLE.SYSTEM, `Korrektur: ${callerText}`);
      }
      return proceedAfterConfirm(call.id, call.callerEmailConsent, call.answers, say, setStateProxy(callId));
    }

    // ----- EMAIL CONSENT -----
    case 'email_consent': {
      const consent = Boolean(callerText && YES.test(callerText) && !NO.test(callerText));
      await prisma.call.update({ where: { id: callId }, data: { callerEmailConsent: consent } });
      await setState(callId, { ...state, phase: 'done' });
      await finalize(callId);
      return say(
        consent
          ? 'Vielen Dank! Sie erhalten gleich eine Zusammenfassung per E-Mail. Auf Wiederhören.'
          : 'Alles klar, vielen Dank für Ihren Anruf. Auf Wiederhören.',
        'hangup',
      );
    }

    // ----- DONE -----
    case 'done':
    default:
      return say('Vielen Dank und auf Wiederhören.', 'hangup');
  }
}

function setStateProxy(callId: string) {
  return (state: CallState) => setState(callId, state);
}

/** Decide whether to ask for caller-email consent or finalize directly. */
async function proceedAfterConfirm(
  callId: string,
  _existingConsent: boolean,
  answers: Array<{ questionKey: string; type: string; value: unknown }>,
  say: (t: string, a?: 'gather' | 'hangup') => Promise<TurnResult>,
  persist: (s: CallState) => Promise<void>,
): Promise<TurnResult> {
  const hasEmail = answers.some((a) => a.type === QUESTION_TYPES.EMAIL && a.value);
  if (hasEmail) {
    await persist({ phase: 'email_consent', pendingQuestionKey: null, clarifyCount: 0 });
    return say(
      'Möchten Sie diese Zusammenfassung auch per E-Mail erhalten? Bitte sagen Sie Ja oder Nein.',
    );
  }
  await persist({ phase: 'done', pendingQuestionKey: null, clarifyCount: 0 });
  await finalize(callId);
  return say('Vielen Dank für Ihren Anruf. Unser Team meldet sich zeitnah. Auf Wiederhören.', 'hangup');
}

async function startQuestions(
  callId: string,
  _tenantId: string,
  questions: QuestionnaireQuestion[],
  answers: AnswerMap,
  say: (t: string, a?: 'gather' | 'hangup') => Promise<TurnResult>,
  _state: CallState,
): Promise<TurnResult> {
  const next = nextQuestion(questions, answers);
  if (!next) {
    await setState(callId, { phase: 'confirm', pendingQuestionKey: null, clarifyCount: 0 });
    return say('Vielen Dank. Ich habe alle nötigen Informationen. Ist das so korrekt?');
  }
  await setState(callId, { phase: 'questions', pendingQuestionKey: next.key, clarifyCount: 0 });
  return say(phraseQuestion(next));
}

/** Phrase a question for speech, adding option hints where helpful. */
function phraseQuestion(q: QuestionnaireQuestion): string {
  if (q.type === QUESTION_TYPES.MULTIPLE_CHOICE && q.options?.length) {
    return `${q.prompt} Zur Auswahl stehen: ${q.options.map((o) => o.label).join(', ')}.`;
  }
  if (q.type === QUESTION_TYPES.SCALE) {
    return `${q.prompt} Bitte auf einer Skala von ${q.scaleMin ?? 1} bis ${q.scaleMax ?? 10}.`;
  }
  return q.prompt;
}

function buildConfirmation(questions: QuestionnaireQuestion[], answers: AnswerMap): string {
  const parts = questions
    .filter((q) => answers[q.key] !== undefined)
    .slice(0, 5)
    .map((q) => {
      const v = answers[q.key]!.value;
      const display = q.type === QUESTION_TYPES.YES_NO ? (v ? 'Ja' : 'Nein') : String(v);
      return `${q.prompt.replace(/\?$/, '')}: ${display}`;
    });
  return `Ich fasse kurz zusammen: ${parts.join('. ')}. Ist das alles so korrekt?`;
}

/** Fire-and-forget finalize with error isolation (never breaks the hangup). */
async function finalize(callId: string): Promise<void> {
  try {
    await finalizeCall(callId);
  } catch (err) {
    logger.error({ err, callId }, 'finalizeCall failed');
    await prisma.call.update({ where: { id: callId }, data: { status: 'failed' } }).catch(() => {});
  }
}
