/**
 * Starter content for a freshly provisioned tenant: a default system prompt,
 * a generic intake questionnaire and an assistant wired to it. Lets a new
 * customer go live (or open the test mode) immediately after onboarding.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export const DEFAULT_SYSTEM_PROMPT = `Du bist ein freundlicher, professioneller KI-Telefonassistent.

Deine Aufgabe:
- Begrüße den Anrufer herzlich und führe ein natürliches, höfliches Gespräch.
- Arbeite den hinterlegten Fragebogen ab und stelle immer NUR EINE Frage auf einmal.
- Höre aktiv zu. Wenn eine Antwort unklar oder unvollständig ist, stelle eine kurze Rückfrage.
- Erkenne, wenn eine Frage bereits beantwortet wurde, und überspringe sie.
- Fasse am Ende das Gespräch kurz zusammen und frage, ob alles korrekt ist.

Strikte Regeln:
- Erfinde niemals Informationen und gib keine verbindlichen Zusagen.
- Vermeide sensible oder rechtlich kritische Aussagen.
- Wenn du etwas nicht sicher weißt, sage exakt: "Das kann ich nicht zuverlässig beantworten, ich gebe es an das Team weiter."
- Bleibe stets sachlich, empathisch und kurz. Keine langen Monologe.`;

export const DEFAULT_CONSENT_TEXT =
  'Hinweis: Dieses Gespräch wird von einem KI-Assistenten geführt und zur Bearbeitung Ihres Anliegens transkribiert. Sind Sie damit einverstanden?';

export const DEFAULT_GREETING = 'Guten Tag, hier ist der digitale Telefonassistent.';

/** Generic intake questionnaire usable by most B2C/B2B service businesses. */
function starterQuestions(tenantId: string): Prisma.QuestionnaireQuestionCreateWithoutQuestionnaireInput[] {
  return [
    { tenantId, key: 'caller_name', prompt: 'Wie ist Ihr Name?', type: 'free_text', required: true, order: 1 },
    { tenantId, key: 'anliegen', prompt: 'Worum geht es bei Ihrem Anliegen?', type: 'free_text', required: true, order: 2 },
    { tenantId, key: 'is_urgent', prompt: 'Ist Ihr Anliegen dringend?', type: 'yes_no', required: true, order: 3 },
    {
      tenantId,
      key: 'callback_time',
      prompt: 'Wann dürfen wir Sie am besten zurückrufen?',
      type: 'free_text',
      required: false,
      order: 4,
      condition: { questionKey: 'is_urgent', operator: 'equals', value: true } as Prisma.InputJsonValue,
    },
    { tenantId, key: 'caller_phone', prompt: 'Unter welcher Telefonnummer erreichen wir Sie?', type: 'phone', required: true, order: 5 },
    { tenantId, key: 'caller_email', prompt: 'Wie lautet Ihre E-Mail-Adresse?', type: 'email', required: false, order: 6 },
  ];
}

/** Create a starter questionnaire + assistant for a tenant inside a transaction. */
export async function createStarterContent(
  tx: Prisma.TransactionClient | PrismaClient,
  tenantId: string,
): Promise<{ assistantId: string; questionnaireId: string }> {
  const questionnaire = await tx.questionnaire.create({
    data: {
      tenantId,
      name: 'Standard-Erstkontakt',
      questions: { create: starterQuestions(tenantId) },
    },
  });

  const assistant = await tx.assistant.create({
    data: {
      tenantId,
      name: 'Telefonassistent',
      greetingText: DEFAULT_GREETING,
      consentText: DEFAULT_CONSENT_TEXT,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      voice: 'alloy',
      locale: 'de',
      recordAudio: false,
      questionnaireId: questionnaire.id,
    },
  });

  return { assistantId: assistant.id, questionnaireId: questionnaire.id };
}
