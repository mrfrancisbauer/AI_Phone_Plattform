/**
 * Tenant administration (Super-Admin console). Reads are available to platform
 * staff with `platform:tenants:read`; mutations require `platform:tenants:write`
 * (super admin only). Tenant isolation is unaffected — these endpoints are
 * cross-tenant by design and gated behind platform capabilities.
 */
import type { FastifyInstance } from 'fastify';
import {
  PLATFORM_CAPS,
  adminListQuerySchema,
  createTenantSchema,
  provisionTenantSchema,
  ROLES,
} from '@ai-phone/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { signMagicLink } from '../lib/auth.js';
import { tryDecrypt } from '../lib/crypto.js';
import { forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { createStarterContent } from '../lib/starter-content.js';
import { upsertTenantUser } from './users.js';

function tenantWizardData(t: ReturnType<typeof createTenantSchema.parse>) {
  return {
    locale: t.locale,
    monthlyBudgetLimit: t.monthlyBudgetLimit ?? null,
    autoPauseOnBudget: t.autoPauseOnBudget,
    industry: t.industry ?? null,
    country: t.country ?? 'DE',
    timezone: t.timezone ?? 'Europe/Berlin',
    plan: t.plan ?? 'starter',
    telephonyMode: t.telephonyMode ?? 'platform_twilio',
    openaiMode: t.openaiMode ?? 'platform',
  };
}

export async function tenantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const canRead = { preHandler: [app.requireCapability(PLATFORM_CAPS.TENANTS_READ)] };
  const canWrite = { preHandler: [app.requireCapability(PLATFORM_CAPS.TENANTS_WRITE)] };

  // Paginated, searchable, filterable tenant list with stats.
  app.get('/admin/tenants', canRead, async (req) => {
    const q = adminListQuerySchema.parse(req.query);
    const where = {
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { slug: { contains: q.q, mode: 'insensitive' as const } }] }
        : {}),
      ...(q.status === 'active' ? { paused: false } : q.status === 'paused' ? { paused: true } : {}),
      ...(q.plan ? { plan: q.plan } : {}),
    };

    const [total, tenants] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          _count: { select: { tenantUsers: true, phoneNumbers: true, calls: true } },
          phoneNumbers: { take: 1, orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);

    // Cost per tenant (current data) in one grouped query.
    const ids = tenants.map((t) => t.id);
    const costs = ids.length
      ? await prisma.usageEvent.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _sum: { totalCost: true } })
      : [];
    const costByTenant = new Map(costs.map((c) => [c.tenantId, Number(c._sum.totalCost ?? 0)]));

    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        industry: t.industry,
        plan: t.plan,
        status: t.paused ? 'paused' : 'active',
        phoneNumber: t.phoneNumbers[0] ? tryDecrypt(t.phoneNumbers[0].e164Enc) : null,
        users: t._count.tenantUsers,
        phoneNumbers: t._count.phoneNumbers,
        calls: t._count.calls,
        cost: costByTenant.get(t.id) ?? 0,
        createdAt: t.createdAt,
      })),
    };
  });

  // Full tenant detail for the admin detail view.
  app.get('/admin/tenants/:id', canRead, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const t = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: { select: { tenantUsers: true, phoneNumbers: true, calls: true, assistants: true } },
        phoneNumbers: true,
        assistants: { select: { id: true, name: true, locale: true, questionnaireId: true } },
        retentionSetting: true,
      },
    });
    if (!t) throw notFound('Tenant not found');

    const [cost, recentCalls] = await Promise.all([
      prisma.usageEvent.aggregate({ where: { tenantId: id }, _sum: { totalCost: true, llmCost: true, telephonyCost: true } }),
      prisma.call.findMany({ where: { tenantId: id }, orderBy: { startedAt: 'desc' }, take: 10, select: { id: true, status: true, leadCategory: true, durationSeconds: true, totalCost: true, startedAt: true } }),
    ]);

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      industry: t.industry,
      country: t.country,
      timezone: t.timezone,
      locale: t.locale,
      plan: t.plan,
      status: t.paused ? 'paused' : 'active',
      telephonyMode: t.telephonyMode,
      openaiMode: t.openaiMode,
      monthlyBudgetLimit: t.monthlyBudgetLimit ? Number(t.monthlyBudgetLimit) : null,
      autoPauseOnBudget: t.autoPauseOnBudget,
      createdAt: t.createdAt,
      counts: t._count,
      retention: t.retentionSetting,
      phoneNumbers: t.phoneNumbers.map((p) => ({ id: p.id, provider: p.provider, e164: tryDecrypt(p.e164Enc), active: p.active })),
      assistants: t.assistants,
      cost: {
        total: Number(cost._sum.totalCost ?? 0),
        openai: Number(cost._sum.llmCost ?? 0),
        telephony: Number(cost._sum.telephonyCost ?? 0),
      },
      recentCalls: recentCalls.map((c) => ({ ...c, totalCost: c.totalCost ? Number(c.totalCost) : null })),
    };
  });

  // List the users of any tenant.
  app.get('/admin/tenants/:id/users', canRead, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw notFound('Tenant not found');
    const memberships = await prisma.tenantUser.findMany({
      where: { tenantId: id },
      include: { user: { select: { email: true, name: true, locked: true, lastLoginAt: true } } },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      locked: m.user.locked,
      lastLoginAt: m.user.lastLoginAt,
    }));
  });

  // Create a bare tenant (no users). Prefer /provision-tenant for onboarding.
  app.post('/admin/tenants', canWrite, async (req, reply) => {
    const body = createTenantSchema.parse(req.body);
    const tenant = await prisma.tenant.create({
      data: { name: body.name, slug: body.slug, ...tenantWizardData(body), retentionSetting: { create: { retentionDays: 90 } } },
    });
    await audit({ tenantId: tenant.id, actorId: req.auth!.userId, actorEmail: req.auth!.email, action: 'tenant.create', targetId: tenant.id, ip: req.ip });
    return reply.status(201).send({ id: tenant.id, slug: tenant.slug });
  });

  /**
   * One-shot onboarding wizard: tenant + first admin + retention + optional
   * starter content. Returns a magic link when no admin password was set.
   */
  app.post('/admin/provision-tenant', canWrite, async (req, reply) => {
    const body = provisionTenantSchema.parse(req.body);
    const existing = await prisma.tenant.findUnique({ where: { slug: body.tenant.slug } });
    if (existing) throw forbidden('A tenant with this slug already exists');

    const tenant = await prisma.tenant.create({
      data: { name: body.tenant.name, slug: body.tenant.slug, ...tenantWizardData(body.tenant), retentionSetting: { create: { retentionDays: 90 } } },
    });

    const { userId } = await upsertTenantUser(tenant.id, {
      email: body.admin.email,
      name: body.admin.name,
      role: ROLES.TENANT_ADMIN,
      password: body.admin.password,
    });

    await prisma.emailRecipient.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: body.admin.email } },
      create: { tenantId: tenant.id, email: body.admin.email, label: 'Admin' },
      update: {},
    });

    if (body.seedStarterContent) await createStarterContent(prisma, tenant.id);

    await audit({
      tenantId: tenant.id,
      actorId: req.auth!.userId,
      actorEmail: req.auth!.email,
      action: 'tenant.provision',
      targetId: tenant.id,
      ip: req.ip,
      metadata: { admin: body.admin.email, plan: tenant.plan, seeded: body.seedStarterContent },
    });

    const magicLink = body.admin.password
      ? null
      : `${config.WEB_ORIGIN}/auth/callback?token=${encodeURIComponent(await signMagicLink(body.admin.email, tenant.id))}`;
    return reply.status(201).send({ tenantId: tenant.id, slug: tenant.slug, adminUserId: userId, magicLink });
  });

  // Resume a paused tenant (super admin via TENANTS_WRITE, or that tenant's admin).
  app.post('/admin/tenants/:id/resume', async (req) => {
    const id = (req.params as { id: string }).id;
    if (req.auth!.role !== ROLES.SUPER_ADMIN && req.auth!.tenantId !== id) throw forbidden();
    await prisma.tenant.update({ where: { id }, data: { paused: false } });
    await audit({ tenantId: id, actorId: req.auth!.userId, actorEmail: req.auth!.email, action: 'tenant.resume', ip: req.ip });
    return { ok: true };
  });

  // Deactivate (pause) a tenant.
  app.post('/admin/tenants/:id/pause', canWrite, async (req) => {
    const id = (req.params as { id: string }).id;
    await prisma.tenant.update({ where: { id }, data: { paused: true } });
    await audit({ tenantId: id, actorId: req.auth!.userId, actorEmail: req.auth!.email, action: 'tenant.pause', ip: req.ip });
    return { ok: true };
  });

  // Update tenant (plan, budget, etc.).
  app.put('/admin/tenants/:id', canWrite, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = createTenantSchema.partial().omit({ slug: true }).parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw notFound('Tenant not found');
    await prisma.tenant.update({
      where: { id },
      data: {
        name: body.name,
        locale: body.locale,
        monthlyBudgetLimit: body.monthlyBudgetLimit,
        autoPauseOnBudget: body.autoPauseOnBudget,
        industry: body.industry,
        country: body.country,
        timezone: body.timezone,
        plan: body.plan,
        telephonyMode: body.telephonyMode,
        openaiMode: body.openaiMode,
      },
    });
    await audit({ tenantId: id, actorId: req.auth!.userId, actorEmail: req.auth!.email, action: 'tenant.update', targetId: id, ip: req.ip });
    return { ok: true };
  });

  // Hard-delete a tenant and all its data (cascades).
  app.delete('/admin/tenants/:id', canWrite, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw notFound('Tenant not found');
    // Audit before delete (the audit row would otherwise cascade away).
    await audit({ tenantId: req.auth!.tenantId, actorId: req.auth!.userId, actorEmail: req.auth!.email, action: 'tenant.delete', targetType: 'tenant', targetId: id, ip: req.ip, metadata: { slug: tenant.slug } });
    await prisma.tenant.delete({ where: { id } });
    return reply.status(204).send();
  });
}
