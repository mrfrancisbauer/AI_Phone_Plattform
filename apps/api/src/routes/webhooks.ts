/**
 * Telephony webhook endpoints (Twilio voice). These are the only unauthenticated
 * endpoints; they are protected instead by provider signature validation.
 *
 * Flow:
 *   POST /webhooks/twilio/voice           inbound call → greeting + consent
 *   POST /webhooks/twilio/gather?callId=  each caller utterance → next prompt
 */
import type { FastifyInstance } from 'fastify';
import { twilioVoiceWebhookSchema } from '@ai-phone/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { blindHash, encrypt } from '../lib/crypto.js';
import { validateTwilioSignature, twimlGather, twimlHangup } from '../lib/twilio.js';
import { logger } from '../logger.js';
import { handleTurn } from '../services/conversation.service.js';
import { audit } from '../lib/audit.js';

export async function webhookRoutes(app: FastifyInstance) {
  // Reply helper: TwiML content type.
  const twiml = (reply: import('fastify').FastifyReply, xml: string) =>
    reply.header('Content-Type', 'text/xml').send(xml);

  function verify(req: import('fastify').FastifyRequest): boolean {
    const fullUrl = `${config.API_PUBLIC_URL}${req.url}`;
    const params = req.body as Record<string, string>;
    const signature = req.headers['x-twilio-signature'] as string | undefined;
    return validateTwilioSignature(fullUrl, params ?? {}, signature);
  }

  // --- Inbound call ---
  app.post('/webhooks/twilio/voice', async (req, reply) => {
    if (!verify(req)) return reply.status(403).send('invalid signature');

    const parsed = twilioVoiceWebhookSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send('bad request');
    const { CallSid, From, To } = parsed.data;

    // Identify the tenant via the dialed number (blind hash lookup).
    const phone = await prisma.phoneNumber.findUnique({
      where: { e164Hash: blindHash(To) },
      include: {
        tenant: true,
        assistant: { include: { questionnaire: true } },
      },
    });

    if (!phone || !phone.active || !phone.assistant) {
      return twiml(reply, twimlHangup('Diese Nummer ist derzeit nicht erreichbar. Auf Wiederhören.'));
    }
    if (phone.tenant.paused) {
      return twiml(reply, twimlHangup('Dieser Dienst ist vorübergehend pausiert. Bitte versuchen Sie es später erneut.'));
    }

    const assistant = phone.assistant;

    // Idempotency: reuse an existing call for repeated webhook on same CallSid.
    const call = await prisma.call.upsert({
      where: { providerCallId: CallSid },
      create: {
        tenantId: phone.tenantId,
        assistantId: assistant.id,
        phoneNumberId: phone.id,
        provider: phone.provider,
        providerCallId: CallSid,
        status: 'consent_pending',
        fromNumberEnc: encrypt(From),
        state: { phase: 'consent', pendingQuestionKey: null, clarifyCount: 0 },
      },
      update: {},
    });

    await audit({
      tenantId: phone.tenantId,
      action: 'call.inbound',
      targetType: 'call',
      targetId: call.id,
      metadata: { provider: phone.provider },
    });

    const greeting = `${assistant.greetingText} ${assistant.consentText}`;
    const action = `${config.API_PUBLIC_URL}/webhooks/twilio/gather?callId=${call.id}`;
    return twiml(reply, twimlGather(greeting, action, { language: localeToTwilio(assistant.locale) }));
  });

  // --- Caller turn ---
  app.post('/webhooks/twilio/gather', async (req, reply) => {
    if (!verify(req)) return reply.status(403).send('invalid signature');

    const callId = (req.query as { callId?: string }).callId;
    if (!callId) return reply.status(400).send('missing callId');

    const body = req.body as Record<string, string>;
    const speech = body.SpeechResult ?? body.Digits ?? '';

    let result;
    try {
      result = await handleTurn(callId, speech);
    } catch (err) {
      logger.error({ err, callId }, 'handleTurn failed');
      return twiml(reply, twimlHangup('Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.'));
    }

    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { assistant: { select: { locale: true } } },
    });
    const language = localeToTwilio(call?.assistant.locale ?? 'de');
    const action = `${config.API_PUBLIC_URL}/webhooks/twilio/gather?callId=${callId}`;

    if (result.action === 'hangup') {
      return twiml(reply, twimlHangup(result.say, { language }));
    }
    return twiml(reply, twimlGather(result.say, action, { language }));
  });
}

function localeToTwilio(locale: string): string {
  return locale === 'en' ? 'en-US' : 'de-DE';
}
