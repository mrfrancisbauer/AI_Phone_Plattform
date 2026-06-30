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
import { conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

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
