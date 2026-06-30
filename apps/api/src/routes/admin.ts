/**
 * Super-Admin console API (platform-wide). Every route is guarded by a platform
 * capability; tenant isolation is intentionally not applied here because these
 * endpoints are the operator's cross-tenant console. Each mutation is audited.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  PLATFORM_CAPS,
  ROLES,
  adminListQuerySchema,
  platformAiSettingsSchema,
  promptVersionSchema,
  providerTestSchema,
  updateUserRoleSchema,
  type Role,
} from '@ai-phone/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { decrypt } from '../lib/crypto.js';
import { hashPassword, signMagicLink } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { logger } from '../logger.js';
import {
  DEFAULT_AI_SETTINGS,
  billingOverview,
  dashboardCharts,
  dashboardKpis,
  getSetting,
  monitoring,
  setSetting,
  systemInfo,
} from '../services/platform.service.js';
import { configureNumberWebhook, twilioConfigured, voiceWebhookUrl } from '../services/twilio-provisioning.js';

function adminAudit(req: FastifyRequest, action: string, extra: Record<string, unknown> = {}) {
  return audit({
    tenantId: req.auth!.tenantId,
    actorId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action,
    ip: req.ip,
    metadata: { ...extra, userAgent: req.headers['user-agent'] ?? null },
  });
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const cap = (c: string) => ({ preHandler: [app.requireCapability(c)] });

  // ---- Dashboard ----------------------------------------------------------
  app.get('/admin/dashboard', cap(PLATFORM_CAPS.DASHBOARD), async (req) => {
    const days = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }).parse(req.query).days;
    const [kpis, charts] = await Promise.all([dashboardKpis(), dashboardCharts(days)]);
    return { kpis, charts };
  });

  // ---- Global users -------------------------------------------------------
  app.get('/admin/users', cap(PLATFORM_CAPS.TENANTS_READ), async (req) => {
    const q = adminListQuerySchema.parse(req.query);
    const where = q.q
      ? { user: { OR: [{ email: { contains: q.q, mode: 'insensitive' as const } }, { name: { contains: q.q, mode: 'insensitive' as const } }] } }
      : {};
    const [total, rows] = await Promise.all([
      prisma.tenantUser.count({ where }),
      prisma.tenantUser.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { user: { createdAt: 'desc' } },
        include: { user: { select: { id: true, email: true, name: true, locked: true, lastLoginAt: true } }, tenant: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        role: m.role,
        status: m.user.locked ? 'locked' : 'active',
        lastLoginAt: m.user.lastLoginAt,
      })),
    };
  });

  app.post('/admin/users/:id/reset-password', cap(PLATFORM_CAPS.USERS_WRITE), async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User not found');
    const tempPassword = `Tmp-${Math.random().toString(36).slice(2, 10)}!`;
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(tempPassword) } });
    await adminAudit(req, 'user.reset_password', { userId: id });
    return { tempPassword };
  });

  app.post('/admin/users/:id/magic-link', cap(PLATFORM_CAPS.USERS_WRITE), async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const membership = await prisma.tenantUser.findFirst({ where: { userId: id }, include: { user: true } });
    if (!membership) throw notFound('User not found');
    const token = await signMagicLink(membership.user.email, membership.tenantId);
    await adminAudit(req, 'user.magic_link', { userId: id });
    return { magicLink: `${config.WEB_ORIGIN}/auth/callback?token=${encodeURIComponent(token)}` };
  });

  app.post('/admin/users/:id/lock', cap(PLATFORM_CAPS.USERS_WRITE), async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (id === req.auth!.userId) throw badRequest('You cannot lock yourself');
    await prisma.user.update({ where: { id }, data: { locked: true } });
    await adminAudit(req, 'user.lock', { userId: id });
    return { ok: true };
  });

  app.post('/admin/users/:id/unlock', cap(PLATFORM_CAPS.USERS_WRITE), async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.user.update({ where: { id }, data: { locked: false } });
    await adminAudit(req, 'user.unlock', { userId: id });
    return { ok: true };
  });

  app.put('/admin/users/:id/role', cap(PLATFORM_CAPS.USERS_WRITE), async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { role } = updateUserRoleSchema.parse(req.body);
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(req.body);
    const membership = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId, userId: id } } });
    if (!membership) throw notFound('Membership not found');
    await prisma.tenantUser.update({ where: { tenantId_userId: { tenantId, userId: id } }, data: { role: role as Role } });
    await adminAudit(req, 'user.role_change', { userId: id, tenantId, role });
    return { ok: true };
  });

  app.delete('/admin/users/:id', cap(PLATFORM_CAPS.USERS_WRITE), async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (id === req.auth!.userId) throw badRequest('You cannot delete yourself');
    await prisma.user.delete({ where: { id } });
    await adminAudit(req, 'user.delete', { userId: id });
    return reply.status(204).send();
  });

  // ---- Global phone numbers ----------------------------------------------
  app.get('/admin/phone-numbers', cap(PLATFORM_CAPS.TENANTS_READ), async () => {
    const rows = await prisma.phoneNumber.findMany({ include: { tenant: { select: { id: true, name: true, country: true } } }, orderBy: { createdAt: 'desc' } });
    return {
      voiceWebhookUrl: voiceWebhookUrl(),
      twilioConfigured: twilioConfigured(),
      items: rows.map((r) => ({
        id: r.id,
        e164: decrypt(r.e164Enc),
        provider: r.provider,
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        country: r.tenant.country,
        active: r.active,
      })),
    };
  });

  app.post('/admin/phone-numbers/:id/configure-webhook', cap(PLATFORM_CAPS.TENANTS_WRITE), async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const number = await prisma.phoneNumber.findUnique({ where: { id } });
    if (!number) throw notFound('Phone number not found');
    if (number.provider !== 'twilio') throw badRequest('Webhook auto-config is Twilio-only');
    const result = await configureNumberWebhook(decrypt(number.e164Enc));
    await adminAudit(req, 'phone_number.configure_webhook', { id });
    return result;
  });

  // ---- Providers ----------------------------------------------------------
  app.get('/admin/providers', cap(PLATFORM_CAPS.PROVIDERS_READ), async () => {
    const showSecrets = false; // never expose secrets to the frontend
    return {
      twilio: { configured: twilioConfigured(), accountSid: config.TWILIO_ACCOUNT_SID ? mask(config.TWILIO_ACCOUNT_SID) : null, validateSignature: config.TWILIO_VALIDATE_SIGNATURE, webhookUrl: voiceWebhookUrl() },
      openai: { configured: Boolean(config.OPENAI_API_KEY), defaultModel: config.LLM_MODEL, apiKey: config.OPENAI_API_KEY ? mask(config.OPENAI_API_KEY) : null },
      email: { provider: config.EMAIL_PROVIDER, configured: config.EMAIL_PROVIDER === 'console' || Boolean(config.RESEND_API_KEY), from: config.EMAIL_FROM },
      stripe: { configured: Boolean(config.STRIPE_SECRET_KEY), webhookConfigured: Boolean(config.STRIPE_WEBHOOK_SECRET) },
      _showSecrets: showSecrets,
    };
  });

  app.post('/admin/providers/test', cap(PLATFORM_CAPS.PROVIDERS_READ), async (req) => {
    const { provider } = providerTestSchema.parse(req.body);
    await adminAudit(req, 'provider.test', { provider });
    return testProvider(provider);
  });

  // ---- AI -----------------------------------------------------------------
  app.get('/admin/ai', cap(PLATFORM_CAPS.PROVIDERS_READ), async () => {
    const settings = await getSetting('ai', DEFAULT_AI_SETTINGS);
    const prompts = await prisma.promptVersion.findMany({ orderBy: { version: 'desc' }, take: 50 });
    return { settings, prompts };
  });

  app.put('/admin/ai', cap(PLATFORM_CAPS.AI_WRITE), async (req) => {
    const body = platformAiSettingsSchema.parse(req.body);
    await setSetting('ai', body, req.auth!.email);
    await adminAudit(req, 'ai.settings_update', body);
    return { ok: true };
  });

  app.post('/admin/ai/prompts', cap(PLATFORM_CAPS.AI_WRITE), async (req, reply) => {
    const body = promptVersionSchema.parse(req.body);
    const created = await prisma.$transaction(async (tx) => {
      if (body.activate) await tx.promptVersion.updateMany({ data: { active: false }, where: { active: true } });
      return tx.promptVersion.create({ data: { label: body.label, content: body.content, active: body.activate, createdBy: req.auth!.email } });
    });
    await adminAudit(req, 'ai.prompt_create', { version: created.version, active: created.active });
    return reply.status(201).send(created);
  });

  app.post('/admin/ai/prompts/:id/activate', cap(PLATFORM_CAPS.AI_WRITE), async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const prompt = await prisma.promptVersion.findUnique({ where: { id } });
    if (!prompt) throw notFound('Prompt version not found');
    await prisma.$transaction([
      prisma.promptVersion.updateMany({ data: { active: false }, where: { active: true } }),
      prisma.promptVersion.update({ where: { id }, data: { active: true } }),
    ]);
    await adminAudit(req, 'ai.prompt_activate', { version: prompt.version });
    return { ok: true };
  });

  // ---- Billing ------------------------------------------------------------
  app.get('/admin/billing', cap(PLATFORM_CAPS.BILLING_READ), async (req) => {
    const { range } = z.object({ range: z.enum(['today', 'month', 'year']).default('month') }).parse(req.query);
    return billingOverview(range);
  });

  app.get('/admin/billing/export.csv', cap(PLATFORM_CAPS.BILLING_READ), async (req, reply) => {
    const events = await prisma.usageEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: { tenant: { select: { name: true } } },
    });
    await adminAudit(req, 'billing.export');
    const header = ['createdAt', 'tenant', 'durationSeconds', 'telephonyCost', 'sttCost', 'ttsCost', 'llmCost', 'platformMarkup', 'totalCost'];
    const lines = events.map((e) =>
      [e.createdAt.toISOString(), csv(e.tenant.name), e.durationSeconds, e.telephonyCost, e.sttCost, e.ttsCost, e.llmCost, e.platformMarkup, e.totalCost].join(','),
    );
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="platform-billing.csv"').send([header.join(','), ...lines].join('\n'));
  });

  // ---- Monitoring ---------------------------------------------------------
  app.get('/admin/monitoring', cap(PLATFORM_CAPS.MONITORING), async () => monitoring());

  // ---- Logs ---------------------------------------------------------------
  app.get('/admin/logs', cap(PLATFORM_CAPS.LOGS), async (req) => {
    const q = z
      .object({
        channel: z.enum(['api', 'login', 'openai', 'telephony', 'webhook', 'system', 'error']).optional(),
        level: z.enum(['info', 'warn', 'error']).optional(),
        q: z.string().max(120).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    const where = {
      ...(q.channel ? (q.channel === 'error' ? { level: 'error' } : { channel: q.channel }) : {}),
      ...(q.level ? { level: q.level } : {}),
      ...(q.q ? { message: { contains: q.q, mode: 'insensitive' as const } } : {}),
    };
    const logs = await prisma.appLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: q.limit });
    return logs;
  });

  // ---- Audit log ----------------------------------------------------------
  app.get('/admin/audit', cap(PLATFORM_CAPS.AUDIT), async (req) => {
    const q = z.object({ q: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const rows = await prisma.auditLog.findMany({
      where: q.q ? { OR: [{ action: { contains: q.q, mode: 'insensitive' } }, { actorEmail: { contains: q.q, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      include: { tenant: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      actorEmail: r.actorEmail,
      action: r.action,
      tenantName: r.tenant.name,
      targetType: r.targetType,
      targetId: r.targetId,
      ip: r.ip,
      userAgent: (r.metadata as { userAgent?: string } | null)?.userAgent ?? null,
      createdAt: r.createdAt,
    }));
  });

  // ---- System -------------------------------------------------------------
  app.get('/admin/system', cap(PLATFORM_CAPS.SYSTEM), async () => systemInfo());

  // ---- Backups ------------------------------------------------------------
  app.get('/admin/backups', cap(PLATFORM_CAPS.BACKUPS), async () => {
    const backups = await prisma.backup.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
    return backups.map((b) => ({ ...b, sizeBytes: b.sizeBytes ? Number(b.sizeBytes) : null }));
  });

  app.post('/admin/backups', cap(PLATFORM_CAPS.BACKUPS), async (req, reply) => {
    // Records a backup run. Wire BACKUP_COMMAND (e.g. pg_dump to object storage)
    // in your infra; here we record a metadata row with a derived size estimate.
    const counts = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      "SELECT SUM(c.reltuples)::bigint AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind='r'",
    ).catch(() => [{ n: BigInt(0) }]);
    const rows = Number(counts[0]?.n ?? 0);
    const backup = await prisma.backup.create({
      data: { status: 'completed', sizeBytes: BigInt(Math.max(1, rows) * 2048), location: 'local://simulated', note: 'Simuliert – konfigurieren Sie ein echtes Backup-Ziel (BACKUP_COMMAND).', completedAt: new Date(), createdBy: req.auth!.email },
    });
    await adminAudit(req, 'backup.create', { id: backup.id });
    return reply.status(201).send({ ...backup, sizeBytes: Number(backup.sizeBytes) });
  });

  // ---- GDPR (global) ------------------------------------------------------
  app.post('/admin/gdpr/anonymize-call/:callId', cap(PLATFORM_CAPS.GDPR), async (req) => {
    const { callId } = z.object({ callId: z.string().uuid() }).parse(req.params);
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw notFound('Call not found');
    await prisma.$transaction([
      prisma.callMessage.deleteMany({ where: { callId } }),
      prisma.callSummary.updateMany({ where: { callId }, data: { callerName: null, callerEmailEnc: null } }),
      prisma.call.update({ where: { id: callId }, data: { fromNumberEnc: 'anonymized' } }),
    ]);
    await adminAudit(req, 'gdpr.anonymize_call', { callId, tenantId: call.tenantId });
    return { ok: true };
  });
}

// --- helpers ---------------------------------------------------------------
function mask(s: string): string {
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`;
}
function csv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function testProvider(provider: 'twilio' | 'openai' | 'email' | 'stripe'): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === 'twilio') {
      if (!twilioConfigured()) return { ok: false, message: 'Keine Twilio-Zugangsdaten konfiguriert.' };
      const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}.json`, { headers: { Authorization: `Basic ${auth}` } });
      return { ok: res.ok, message: res.ok ? 'Verbindung erfolgreich.' : `Twilio antwortete mit ${res.status}.` };
    }
    if (provider === 'openai') {
      if (!config.OPENAI_API_KEY) return { ok: false, message: 'Kein OpenAI-Key konfiguriert (lokaler Fallback aktiv).' };
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` } });
      return { ok: res.ok, message: res.ok ? 'Verbindung erfolgreich.' : `OpenAI antwortete mit ${res.status}.` };
    }
    if (provider === 'stripe') {
      if (!config.STRIPE_SECRET_KEY) return { ok: false, message: 'Kein Stripe-Key konfiguriert.' };
      const res = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}` } });
      return { ok: res.ok, message: res.ok ? 'Verbindung erfolgreich.' : `Stripe antwortete mit ${res.status}.` };
    }
    // email
    if (config.EMAIL_PROVIDER === 'console') return { ok: true, message: 'Console-Provider aktiv (E-Mails werden geloggt, nicht versendet).' };
    return { ok: Boolean(config.RESEND_API_KEY), message: config.RESEND_API_KEY ? 'Resend konfiguriert.' : 'RESEND_API_KEY fehlt.' };
  } catch (err) {
    logger.error({ err, provider }, 'provider test failed');
    return { ok: false, message: err instanceof Error ? err.message : 'Test fehlgeschlagen.' };
  }
}
