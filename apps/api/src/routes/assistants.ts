/**
 * Assistant configuration: greeting text, consent text, system prompt, voice,
 * locale, audio-recording flag and linked questionnaire. Tenant-scoped.
 */
import type { FastifyInstance } from 'fastify';
import { upsertAssistantSchema } from '@ai-phone/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

export async function assistantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/assistants', async (req) => {
    return prisma.assistant.findMany({ where: { tenantId: req.auth!.tenantId } });
  });

  app.get('/assistants/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const a = await prisma.assistant.findFirst({ where: { id, tenantId: req.auth!.tenantId } });
    if (!a) throw notFound('Assistant not found');
    return a;
  });

  app.post('/assistants', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const body = upsertAssistantSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    if (body.questionnaireId) await assertOwnedQuestionnaire(tenantId, body.questionnaireId);
    const created = await prisma.assistant.create({ data: { tenantId, ...body } });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'assistant.create', targetId: created.id });
    return reply.status(201).send(created);
  });

  app.put('/assistants/:id', { preHandler: [app.requireCapability('tenant:write')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = upsertAssistantSchema.partial().parse(req.body);
    const tenantId = req.auth!.tenantId;
    const existing = await prisma.assistant.findFirst({ where: { id, tenantId } });
    if (!existing) throw notFound('Assistant not found');
    if (body.questionnaireId) await assertOwnedQuestionnaire(tenantId, body.questionnaireId);
    const updated = await prisma.assistant.update({ where: { id }, data: body });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'assistant.update', targetId: id });
    return updated;
  });
}

async function assertOwnedQuestionnaire(tenantId: string, questionnaireId: string) {
  const q = await prisma.questionnaire.findFirst({ where: { id: questionnaireId, tenantId } });
  if (!q) throw notFound('Questionnaire not found');
}
