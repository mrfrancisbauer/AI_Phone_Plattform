/**
 * Questionnaire management. Every query is filtered by req.auth.tenantId, so a
 * tenant can only ever read or mutate its own questionnaires.
 */
import type { FastifyInstance } from 'fastify';
import { upsertQuestionnaireSchema } from '@ai-phone/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

export async function questionnaireRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List questionnaires for the tenant.
  app.get('/questionnaires', async (req) => {
    return prisma.questionnaire.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: { questions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  // Get one questionnaire.
  app.get('/questionnaires/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = await prisma.questionnaire.findFirst({
      where: { id, tenantId: req.auth!.tenantId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!q) throw notFound('Questionnaire not found');
    return q;
  });

  // Create a questionnaire with its questions.
  app.post(
    '/questionnaires',
    { preHandler: [app.requireCapability('questionnaire:write')] },
    async (req, reply) => {
      const body = upsertQuestionnaireSchema.parse(req.body);
      const tenantId = req.auth!.tenantId;
      const created = await prisma.questionnaire.create({
        data: {
          tenantId,
          name: body.name,
          questions: {
            create: body.questions.map((q) => ({
              tenantId,
              key: q.key,
              prompt: q.prompt,
              type: q.type,
              required: q.required,
              order: q.order,
              options: q.options ?? undefined,
              scaleMin: q.scaleMin,
              scaleMax: q.scaleMax,
              condition: q.condition ?? undefined,
            })),
          },
        },
        include: { questions: { orderBy: { order: 'asc' } } },
      });
      await audit({ tenantId, actorId: req.auth!.userId, action: 'questionnaire.create', targetId: created.id });
      return reply.status(201).send(created);
    },
  );

  // Replace a questionnaire's questions (bumps version).
  app.put(
    '/questionnaires/:id',
    { preHandler: [app.requireCapability('questionnaire:write')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = upsertQuestionnaireSchema.parse(req.body);
      const tenantId = req.auth!.tenantId;

      const existing = await prisma.questionnaire.findFirst({ where: { id, tenantId } });
      if (!existing) throw notFound('Questionnaire not found');

      const updated = await prisma.$transaction(async (tx) => {
        await tx.questionnaireQuestion.deleteMany({ where: { questionnaireId: id } });
        return tx.questionnaire.update({
          where: { id },
          data: {
            name: body.name,
            version: { increment: 1 },
            questions: {
              create: body.questions.map((q) => ({
                tenantId,
                key: q.key,
                prompt: q.prompt,
                type: q.type,
                required: q.required,
                order: q.order,
                options: q.options ?? undefined,
                scaleMin: q.scaleMin,
                scaleMax: q.scaleMax,
                condition: q.condition ?? undefined,
              })),
            },
          },
          include: { questions: { orderBy: { order: 'asc' } } },
        });
      });
      await audit({ tenantId, actorId: req.auth!.userId, action: 'questionnaire.update', targetId: id });
      return updated;
    },
  );
}
