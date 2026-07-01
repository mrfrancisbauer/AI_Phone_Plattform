/**
 * Tenant self-service settings: tenant profile, email recipients for
 * summaries, monthly budget/limit, and data-retention configuration.
 */
import type { FastifyInstance } from 'fastify';
import { dataRetentionSchema, emailRecipientSchema, updateTenantSchema } from '@ai-phone/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // --- Tenant profile / budget ---
  app.get('/settings/tenant', async (req) => {
    const t = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
    if (!t) throw notFound('Tenant not found');
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      locale: t.locale,
      monthlyBudgetLimit: t.monthlyBudgetLimit ? Number(t.monthlyBudgetLimit) : null,
      autoPauseOnBudget: t.autoPauseOnBudget,
      paused: t.paused,
      brandName: t.brandName,
      brandColor: t.brandColor,
      country: t.country,
      timezone: t.timezone,
      industry: t.industry,
    };
  });

  app.put('/settings/tenant', { preHandler: [app.requireCapability('tenant:write')] }, async (req) => {
    const body = updateTenantSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const updated = await prisma.tenant.update({ where: { id: tenantId }, data: body });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'tenant.update' });
    return { id: updated.id };
  });

  // --- Email recipients ---
  app.get('/settings/email-recipients', async (req) => {
    return prisma.emailRecipient.findMany({ where: { tenantId: req.auth!.tenantId } });
  });

  app.post('/settings/email-recipients', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const body = emailRecipientSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const created = await prisma.emailRecipient.upsert({
      where: { tenantId_email: { tenantId, email: body.email } },
      create: { tenantId, email: body.email, label: body.label },
      update: { label: body.label },
    });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'email_recipient.create', targetId: created.id });
    return reply.status(201).send(created);
  });

  app.delete('/settings/email-recipients/:id', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenantId = req.auth!.tenantId;
    const existing = await prisma.emailRecipient.findFirst({ where: { id, tenantId } });
    if (!existing) throw notFound('Recipient not found');
    await prisma.emailRecipient.delete({ where: { id } });
    return reply.status(204).send();
  });

  // --- Data retention ---
  app.get('/settings/retention', async (req) => {
    const tenantId = req.auth!.tenantId;
    const setting = await prisma.dataRetentionSetting.findUnique({ where: { tenantId } });
    return setting ?? { retentionDays: 90, storeAudio: false };
  });

  app.put('/settings/retention', { preHandler: [app.requireCapability('tenant:write')] }, async (req) => {
    const body = dataRetentionSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const updated = await prisma.dataRetentionSetting.upsert({
      where: { tenantId },
      create: { tenantId, retentionDays: body.retentionDays, storeAudio: body.storeAudio },
      update: { retentionDays: body.retentionDays, storeAudio: body.storeAudio },
    });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'retention.update' });
    return updated;
  });
}
