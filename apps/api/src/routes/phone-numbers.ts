/**
 * Phone-number management. Numbers are stored encrypted with a deterministic
 * blind hash for inbound routing. A tenant may own several numbers; each maps
 * to one assistant.
 */
import type { FastifyInstance } from 'fastify';
import { createPhoneNumberSchema } from '@ai-phone/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { blindHash, decrypt, encrypt } from '../lib/crypto.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import {
  configureNumberWebhook,
  twilioConfigured,
  voiceWebhookUrl,
} from '../services/twilio-provisioning.js';

export async function phoneNumberRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/phone-numbers', async (req) => {
    const rows = await prisma.phoneNumber.findMany({ where: { tenantId: req.auth!.tenantId } });
    // Decrypt for display (caller is an authenticated tenant user).
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      e164: decrypt(r.e164Enc),
      assistantId: r.assistantId,
      active: r.active,
    }));
  });

  app.post('/phone-numbers', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const body = createPhoneNumberSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const hash = blindHash(body.e164);
    const existing = await prisma.phoneNumber.findUnique({ where: { e164Hash: hash } });
    if (existing) throw conflict('This phone number is already registered');
    if (body.assistantId) {
      const a = await prisma.assistant.findFirst({ where: { id: body.assistantId, tenantId } });
      if (!a) throw notFound('Assistant not found');
    }
    const created = await prisma.phoneNumber.create({
      data: {
        tenantId,
        provider: body.provider,
        e164Enc: encrypt(body.e164),
        e164Hash: hash,
        assistantId: body.assistantId ?? null,
        active: body.active,
      },
    });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.create', targetId: created.id });
    return reply.status(201).send({ id: created.id });
  });

  // The webhook URL Twilio should call + whether platform creds are present.
  app.get('/phone-numbers/webhook-info', async () => {
    return { voiceWebhookUrl: voiceWebhookUrl(), twilioConfigured: twilioConfigured() };
  });

  // One-click: point this number's Twilio voice webhook at the platform.
  app.post(
    '/phone-numbers/:id/configure-webhook',
    { preHandler: [app.requireCapability('tenant:write')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const tenantId = req.auth!.tenantId;
      const number = await prisma.phoneNumber.findFirst({ where: { id, tenantId } });
      if (!number) throw notFound('Phone number not found');
      if (number.provider !== 'twilio') {
        throw badRequest('Automatic webhook configuration is only available for Twilio numbers.');
      }
      const result = await configureNumberWebhook(decrypt(number.e164Enc));
      await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.configure_webhook', targetId: id });
      return result;
    },
  );

  app.delete('/phone-numbers/:id', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenantId = req.auth!.tenantId;
    const existing = await prisma.phoneNumber.findFirst({ where: { id, tenantId } });
    if (!existing) throw notFound('Phone number not found');
    await prisma.phoneNumber.delete({ where: { id } });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.delete', targetId: id });
    return reply.status(204).send();
  });
}
