/**
 * Agent test mode / conversation simulation. Lets a tenant drive a real call
 * through the conversation engine from the dashboard, without any telephony
 * provider. Useful for testing a questionnaire before going live.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import { notFound } from '../lib/errors.js';
import { handleTurn } from '../services/conversation.service.js';

export async function simulateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Start a simulated call against an assistant.
  app.post('/simulate/start', async (req) => {
    const { assistantId } = z.object({ assistantId: z.string().uuid() }).parse(req.body);
    const tenantId = req.auth!.tenantId;
    const assistant = await prisma.assistant.findFirst({ where: { id: assistantId, tenantId } });
    if (!assistant) throw notFound('Assistant not found');

    // A synthetic phone number row is not required for simulation; we attach to
    // any of the tenant's numbers, or create the call without one is not allowed
    // by schema, so require at least one number to exist.
    const phone = await prisma.phoneNumber.findFirst({ where: { tenantId } });
    if (!phone) throw notFound('Configure a phone number before simulating');

    const call = await prisma.call.create({
      data: {
        tenantId,
        assistantId: assistant.id,
        phoneNumberId: phone.id,
        provider: phone.provider,
        providerCallId: `sim_${crypto.randomUUID()}`,
        status: 'consent_pending',
        fromNumberEnc: encrypt('+490000000000'),
        state: { phase: 'consent', pendingQuestionKey: null, clarifyCount: 0 },
      },
    });

    const greeting = `${assistant.greetingText} ${assistant.consentText}`;
    return { callId: call.id, say: greeting };
  });

  // Send a caller turn into a simulated call.
  app.post('/simulate/:callId/say', async (req) => {
    const { callId } = z.object({ callId: z.string().uuid() }).parse(req.params);
    const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);
    const tenantId = req.auth!.tenantId;
    const call = await prisma.call.findFirst({ where: { id: callId, tenantId } });
    if (!call) throw notFound('Call not found');
    const result = await handleTurn(callId, text);
    return result;
  });
}
