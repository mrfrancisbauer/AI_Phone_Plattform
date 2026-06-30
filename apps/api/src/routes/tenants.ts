/**
 * Tenant administration. Super admins can list and create tenants across the
 * platform; everyone else only ever sees their own tenant (enforced by the
 * capability guard + tenantId filter).
 */
import type { FastifyInstance } from 'fastify';
import { createTenantSchema, ROLES } from '@ai-phone/shared';
import { prisma } from '../db.js';
import { forbidden } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

export async function tenantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Super-admin only: list all tenants.
  app.get('/admin/tenants', async (req) => {
    if (req.auth!.role !== ROLES.SUPER_ADMIN) throw forbidden();
    return prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, paused: true, createdAt: true },
    });
  });

  // Super-admin only: create a tenant.
  app.post('/admin/tenants', async (req, reply) => {
    if (req.auth!.role !== ROLES.SUPER_ADMIN) throw forbidden();
    const body = createTenantSchema.parse(req.body);
    const tenant = await prisma.tenant.create({
      data: {
        name: body.name,
        slug: body.slug,
        locale: body.locale,
        monthlyBudgetLimit: body.monthlyBudgetLimit ?? null,
        autoPauseOnBudget: body.autoPauseOnBudget,
        retentionSetting: { create: { retentionDays: 90 } },
      },
    });
    await audit({ tenantId: tenant.id, actorId: req.auth!.userId, action: 'tenant.create', targetId: tenant.id });
    return reply.status(201).send({ id: tenant.id, slug: tenant.slug });
  });

  // Resume a paused tenant (super admin or tenant admin).
  app.post('/admin/tenants/:id/resume', async (req) => {
    const id = (req.params as { id: string }).id;
    if (req.auth!.role !== ROLES.SUPER_ADMIN && req.auth!.tenantId !== id) throw forbidden();
    await prisma.tenant.update({ where: { id }, data: { paused: false } });
    await audit({ tenantId: id, actorId: req.auth!.userId, action: 'tenant.resume' });
    return { ok: true };
  });
}
