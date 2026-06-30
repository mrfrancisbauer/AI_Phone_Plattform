/**
 * Tenant administration. Super admins can list, create and fully provision
 * tenants across the platform, and manage each tenant's users. Everyone else
 * only ever sees their own tenant (enforced by the capability/role checks).
 */
import type { FastifyInstance } from 'fastify';
import { createTenantSchema, provisionTenantSchema, ROLES } from '@ai-phone/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { signMagicLink } from '../lib/auth.js';
import { forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { createStarterContent } from '../lib/starter-content.js';
import { upsertTenantUser } from './users.js';

function assertSuperAdmin(role: string) {
  if (role !== ROLES.SUPER_ADMIN) throw forbidden('Super admin only');
}

export async function tenantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List all tenants with high-level stats.
  app.get('/admin/tenants', async (req) => {
    assertSuperAdmin(req.auth!.role);
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tenantUsers: true, phoneNumbers: true, calls: true } } },
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      paused: t.paused,
      monthlyBudgetLimit: t.monthlyBudgetLimit ? Number(t.monthlyBudgetLimit) : null,
      users: t._count.tenantUsers,
      phoneNumbers: t._count.phoneNumbers,
      calls: t._count.calls,
      createdAt: t.createdAt,
    }));
  });

  // Create a bare tenant (no users). Prefer /provision-tenant for onboarding.
  app.post('/admin/tenants', async (req, reply) => {
    assertSuperAdmin(req.auth!.role);
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

  /**
   * One-shot onboarding: create a tenant, its first admin user, retention
   * settings and (optionally) starter assistant + questionnaire. Returns a
   * magic link for the admin when no password was provided.
   */
  app.post('/admin/provision-tenant', async (req, reply) => {
    assertSuperAdmin(req.auth!.role);
    const body = provisionTenantSchema.parse(req.body);

    const existing = await prisma.tenant.findUnique({ where: { slug: body.tenant.slug } });
    if (existing) throw forbidden('A tenant with this slug already exists');

    const tenant = await prisma.tenant.create({
      data: {
        name: body.tenant.name,
        slug: body.tenant.slug,
        locale: body.tenant.locale,
        monthlyBudgetLimit: body.tenant.monthlyBudgetLimit ?? null,
        autoPauseOnBudget: body.tenant.autoPauseOnBudget,
        retentionSetting: { create: { retentionDays: 90 } },
      },
    });

    const { userId } = await upsertTenantUser(tenant.id, {
      email: body.admin.email,
      name: body.admin.name,
      role: ROLES.TENANT_ADMIN,
      password: body.admin.password,
    });

    // The admin's email is a sensible default summary recipient.
    await prisma.emailRecipient.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: body.admin.email } },
      create: { tenantId: tenant.id, email: body.admin.email, label: 'Admin' },
      update: {},
    });

    if (body.seedStarterContent) {
      await createStarterContent(prisma, tenant.id);
    }

    await audit({
      tenantId: tenant.id,
      actorId: req.auth!.userId,
      action: 'tenant.provision',
      targetId: tenant.id,
      metadata: { admin: body.admin.email, seeded: body.seedStarterContent },
    });

    const magicLink = body.admin.password
      ? null
      : `${config.WEB_ORIGIN}/auth/callback?token=${encodeURIComponent(
          await signMagicLink(body.admin.email, tenant.id),
        )}`;

    return reply.status(201).send({ tenantId: tenant.id, slug: tenant.slug, adminUserId: userId, magicLink });
  });

  // List the users of any tenant.
  app.get('/admin/tenants/:id/users', async (req) => {
    assertSuperAdmin(req.auth!.role);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw notFound('Tenant not found');
    const memberships = await prisma.tenantUser.findMany({
      where: { tenantId: id },
      include: { user: { select: { email: true, name: true } } },
    });
    return memberships.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, role: m.role }));
  });

  // Resume a paused tenant (super admin or that tenant's admin).
  app.post('/admin/tenants/:id/resume', async (req) => {
    const id = (req.params as { id: string }).id;
    if (req.auth!.role !== ROLES.SUPER_ADMIN && req.auth!.tenantId !== id) throw forbidden();
    await prisma.tenant.update({ where: { id }, data: { paused: false } });
    await audit({ tenantId: id, actorId: req.auth!.userId, action: 'tenant.resume' });
    return { ok: true };
  });

  // Pause a tenant manually (super admin).
  app.post('/admin/tenants/:id/pause', async (req) => {
    assertSuperAdmin(req.auth!.role);
    const id = (req.params as { id: string }).id;
    await prisma.tenant.update({ where: { id }, data: { paused: true } });
    await audit({ tenantId: id, actorId: req.auth!.userId, action: 'tenant.pause' });
    return { ok: true };
  });
}
