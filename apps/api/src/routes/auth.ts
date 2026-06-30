/**
 * Authentication: classic email/password login and passwordless magic links.
 * Both issue a session JWT scoped to a single (user, tenant, role) tuple.
 */
import type { FastifyInstance } from 'fastify';
import { loginSchema, magicLinkRequestSchema, type Role } from '@ai-phone/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { signMagicLink, signSession, verifyMagicLink, verifyPassword } from '../lib/auth.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { logger } from '../logger.js';
import { sendEmail } from '../services/email/index.js';

export async function authRoutes(app: FastifyInstance) {
  const loginBody = loginSchema.extend({ tenantId: z.string().uuid().optional() });

  // --- Password login ---
  app.post('/auth/login', async (req) => {
    const { email, password, tenantId } = loginBody.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenantUsers: true },
    });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Invalid credentials');
    }
    const membership = pickMembership(user.tenantUsers, tenantId);
    if (!membership) throw unauthorized('No tenant access');

    const token = await signSession({
      sub: user.id,
      tenantId: membership.tenantId,
      role: membership.role as Role,
      email: user.email,
    });
    await audit({
      tenantId: membership.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      ip: req.ip,
    });
    return { token, tenants: user.tenantUsers.map((t) => ({ tenantId: t.tenantId, role: t.role })) };
  });

  // --- Magic link request (always returns 200 to avoid user enumeration) ---
  app.post('/auth/magic-link', async (req) => {
    const { email } = magicLinkRequestSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenantUsers: true },
    });
    const membership = user ? pickMembership(user.tenantUsers) : null;
    if (user && membership) {
      const token = await signMagicLink(user.email, membership.tenantId);
      const link = `${config.WEB_ORIGIN}/auth/callback?token=${encodeURIComponent(token)}`;
      await sendEmail({
        tenantId: membership.tenantId,
        to: user.email,
        kind: 'tenant_summary', // reuse log kind; subject distinguishes
        email: {
          subject: 'Ihr Login-Link',
          text: `Hier ist Ihr Login-Link (gültig ${config.MAGIC_LINK_TTL_MINUTES} Minuten):\n${link}`,
          html: `<p>Hier ist Ihr Login-Link (gültig ${config.MAGIC_LINK_TTL_MINUTES} Minuten):</p><p><a href="${link}">Jetzt anmelden</a></p>`,
        },
      });
      logger.info({ email: '[redacted]' }, 'magic link sent');
    }
    return { ok: true };
  });

  // --- Magic link verify ---
  app.post('/auth/magic-link/verify', async (req) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    let payload: { email: string; tenantId: string };
    try {
      payload = await verifyMagicLink(token);
    } catch {
      throw badRequest('Invalid or expired link');
    }
    const user = await prisma.user.findUnique({
      where: { email: payload.email },
      include: { tenantUsers: { where: { tenantId: payload.tenantId } } },
    });
    const membership = user?.tenantUsers[0];
    if (!user || !membership) throw unauthorized('No tenant access');

    const session = await signSession({
      sub: user.id,
      tenantId: membership.tenantId,
      role: membership.role as Role,
      email: user.email,
    });
    await audit({
      tenantId: membership.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.magic_link',
      ip: req.ip,
    });
    return { token: session };
  });

  // --- Current session ---
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (req) => {
    return req.auth;
  });

  // --- Switch active tenant (for users with multiple memberships) ---
  app.post('/auth/switch-tenant', { preHandler: [app.authenticate] }, async (req) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(req.body);
    const membership = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId: req.auth!.userId } },
    });
    if (!membership) throw unauthorized('No access to that tenant');
    const token = await signSession({
      sub: req.auth!.userId,
      tenantId,
      role: membership.role as Role,
      email: req.auth!.email,
    });
    return { token };
  });
}

function pickMembership<T extends { tenantId: string; role: string }>(
  memberships: T[],
  tenantId?: string,
): T | undefined {
  if (tenantId) return memberships.find((m) => m.tenantId === tenantId);
  return memberships[0];
}
