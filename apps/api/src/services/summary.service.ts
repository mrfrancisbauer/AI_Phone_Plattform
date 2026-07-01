/**
 * Call finalization: builds the structured summary, scores the lead, persists
 * everything, computes & records cost, and dispatches the summary emails.
 *
 * This is the last step of the call lifecycle (see docs/ARCHITECTURE.md →
 * "Gesprächslogik").
 */
import {
  QUESTION_TYPES,
  recommendNextAction,
  scoreLead,
  type LeadSignals,
  type QuestionType,
} from '@ai-phone/shared';
import { prisma } from '../db.js';
import { decrypt, decryptNullable, encryptNullable } from '../lib/crypto.js';
import { buildAppointmentDraft } from '../lib/calendar-appointment.js';
import { logger } from '../logger.js';
import { estimateTokens, generateSummary } from './llm.js';
import { recordUsage } from './cost.service.js';
import { createAppointment } from './calendar.service.js';
import { sendEmail } from './email/index.js';
import { renderCallerSummary, renderTenantSummary } from './email/templates.js';

/** Human-readable rendering of a stored, normalized answer value. */
function displayValue(type: QuestionType, value: unknown): string {
  if (value === null || value === undefined) return '–';
  switch (type) {
    case QUESTION_TYPES.YES_NO:
      return value ? 'Ja' : 'Nein';
    case QUESTION_TYPES.URGENCY: {
      const n = Number(value);
      if (n >= 0.8) return 'Hoch';
      if (n >= 0.4) return 'Mittel';
      return 'Niedrig';
    }
    case QUESTION_TYPES.BUDGET:
      return typeof value === 'number'
        ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
        : String(value);
    default:
      return String(value);
  }
}

export async function finalizeCall(callId: string): Promise<void> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      assistant: { include: { questionnaire: { include: { questions: true } } } },
      tenant: true,
      answers: true,
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!call) throw new Error(`call ${callId} not found`);
  if (call.status === 'completed') return; // idempotent

  const questions = call.assistant.questionnaire?.questions ?? [];
  const questionByKey = new Map(questions.map((q) => [q.key, q]));

  // Build the answer list in questionnaire order.
  const orderedAnswers = [...call.answers].sort((a, b) => {
    const oa = questionByKey.get(a.questionKey)?.order ?? 999;
    const ob = questionByKey.get(b.questionKey)?.order ?? 999;
    return oa - ob;
  });

  const answerView = orderedAnswers.map((a) => ({
    key: a.questionKey,
    type: a.type as QuestionType,
    question: questionByKey.get(a.questionKey)?.prompt ?? a.questionKey,
    answer: displayValue(a.type as QuestionType, a.value),
    rawValue: a.value,
  }));

  // Extract well-known fields by question type / key convention.
  const findByType = (t: QuestionType) => answerView.find((a) => a.type === t);
  const findByKey = (re: RegExp) => answerView.find((a) => re.test(a.key));

  const callerEmail = (findByType(QUESTION_TYPES.EMAIL)?.rawValue as string | undefined) ?? null;
  const callerPhoneAnswer = findByType(QUESTION_TYPES.PHONE)?.rawValue as string | undefined;
  const callerName = (findByKey(/name/)?.rawValue as string | undefined) ?? null;
  const concern = (findByKey(/anliegen|concern|grund|reason/)?.rawValue as string | undefined) ?? null;
  const urgencyRaw = findByType(QUESTION_TYPES.URGENCY)?.rawValue;
  const urgency = typeof urgencyRaw === 'number' ? urgencyRaw : null;
  const callerPhone = callerPhoneAnswer ?? decrypt(call.fromNumberEnc);

  // Lead scoring.
  const signals: LeadSignals = {
    hasEmail: Boolean(callerEmail),
    hasPhone: Boolean(callerPhone),
    hasName: Boolean(callerName),
    urgency,
    wantsCallback: answerView.some((a) => /callback|rueckruf|rückruf|termin/i.test(a.key)),
    hasBudget: Boolean(findByType(QUESTION_TYPES.BUDGET)),
    hasConcreteNeed: Boolean(concern),
  };
  const lead = scoreLead(signals);
  const recommendedAction = recommendNextAction(lead, urgency);

  // Transcript for the summarizer.
  const transcript = call.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('caller' as const),
      text: decrypt(m.textEnc),
    }));

  const { summary, usage } = await generateSummary({
    systemPrompt: call.assistant.systemPrompt,
    transcript,
    answers: answerView.map((a) => ({ question: a.question, answer: a.answer })),
    locale: call.assistant.locale,
  });

  const durationSeconds =
    call.durationSeconds > 0
      ? call.durationSeconds
      : Math.max(1, Math.round((Date.now() - call.startedAt.getTime()) / 1000));

  // Token usage = summarizer usage + a rough estimate for the live dialogue.
  const dialogueTokens = transcript.reduce((sum, m) => sum + estimateTokens(m.text), 0);

  await prisma.callSummary.upsert({
    where: { callId: call.id },
    create: {
      tenantId: call.tenantId,
      callId: call.id,
      callerName,
      callerEmailEnc: encryptNullable(callerEmail),
      concern,
      summary,
      leadCategory: lead.category,
      recommendedAction,
    },
    update: { summary, leadCategory: lead.category, recommendedAction },
  });

  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: 'completed',
      endedAt: new Date(),
      durationSeconds,
      leadCategory: lead.category,
    },
  });

  const cost = await recordUsage({
    tenantId: call.tenantId,
    callId: call.id,
    usage: {
      durationSeconds,
      llmInputTokens: usage.inputTokens + dialogueTokens,
      llmOutputTokens: usage.outputTokens,
    },
  });

  // --- Emails ---
  const recipients = await prisma.emailRecipient.findMany({ where: { tenantId: call.tenantId } });
  const tenantEmail = renderTenantSummary({
    tenantName: call.tenant.name,
    callerName,
    callerPhone,
    callerEmail,
    concern,
    answers: answerView.map((a) => ({ question: a.question, answer: a.answer })),
    summary,
    recommendedAction,
    leadCategory: lead.category,
    durationSeconds,
    cost,
    startedAt: call.startedAt,
  });
  for (const r of recipients) {
    await sendEmail({
      tenantId: call.tenantId,
      callId: call.id,
      to: r.email,
      kind: 'tenant_summary',
      email: tenantEmail,
    });
  }
  if (recipients.length === 0) {
    logger.warn({ tenantId: call.tenantId }, 'no email recipients configured; tenant summary not sent');
  }

  // Optional caller email — only with email + explicit consent.
  if (call.callerEmailConsent && callerEmail) {
    const callerMail = renderCallerSummary({
      tenantName: call.tenant.name,
      callerName,
      summary,
      nextSteps: 'Unser Team meldet sich zeitnah bei Ihnen. Bei Rückfragen erreichen Sie uns über die unten genannten Kontaktdaten.',
      contact: {},
    });
    await sendEmail({
      tenantId: call.tenantId,
      callId: call.id,
      to: callerEmail,
      kind: 'caller_summary',
      email: callerMail,
    });
  }

  // --- Calendar (best-effort) ---
  // If the call captured a date/time and the tenant has a connected calendar,
  // write the appointment. Never let a calendar failure break finalization.
  const appointment = buildAppointmentDraft({
    answers: answerView.map((a) => ({ key: a.key, type: a.type, value: a.rawValue })),
    tenantName: call.tenant.name,
    callerName,
    callerPhone,
    summary,
  });
  if (appointment) {
    await createAppointment(call.tenantId, appointment, call.id, call.tenant.timezone).catch((err) =>
      logger.error({ err, callId: call.id }, 'createAppointment threw'),
    );
  }

  logger.info({ callId: call.id, lead: lead.category, cost: cost.totalCost }, 'call finalized');
}
