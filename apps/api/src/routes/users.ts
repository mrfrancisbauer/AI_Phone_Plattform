/**
 * Tenant user management. A tenant admin can list, invite, re-role and remove
 * users within their OWN tenant (tenantId from the auth context). Inviting a
 * user returns a one-time magic link the admin can hand over; an optional
 * initial password can be set instead.
 */
import type { FastifyInstance } from 'fastify';
import { createUserSchema, updateUserRoleSchema, ROLES } from '@ai-phone/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { hashPassword, signMagicLink } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List users of the current tenant.
  app.get('/users', async (req) => {
    const memberships = await prisma.tenantUser.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
      orderBy: { user: { createdAt: 'asc' } },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      createdAt: m.user.createdAt,
    }));
  });

  // Invite / create a user in the current tenant.
  app.post('/users', { preHandler: [app.requireCapability('users:write')] }, async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;

    // Only a super admin may grant the super_admin role.
    if (body.role === ROLES.SUPER_ADMIN && req.auth!.role !== ROLES.SUPER_ADMIN) {
      throw forbidden('Only a super admin can assign the super_admin role');
    }

    const result = await upsertTenantUser(tenantId, body);
    await audit({
      tenantId,
      actorId: req.auth!.userId,
      actorEmail: req.auth!.email,
      action: 'user.invite',
      targetType: 'user',
      targetId: result.userId,
      metadata: { role: body.role },
    });

    const magicLink = body.password
      ? null
      : `${config.WEB_ORIGIN}/auth/callback?token=${encodeURIComponent(
          await signMagicLink(body.email, tenantId),
        )}`;

    return reply.status(201).send({ userId: result.userId, role: body.role, magicLink });
  });

  // Change a user's role within the current tenant.
  app.put('/users/:userId/role', { preHandler: [app.requireCapability('users:write')] }, async (req) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const { role } = updateUserRoleSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;

    if (role === ROLES.SUPER_ADMIN && req.auth!.role !== ROLES.SUPER_ADMIN) {
      throw forbidden('Only a super admin can assign the super_admin role');
    }
    if (userId === req.auth!.userId) throw badRequest('You cannot change your own role');

    const membership = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) throw notFound('User not found in this tenant');

    await prisma.tenantUser.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { role },
    });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'user.role_change', targetId: userId, metadata: { role } });
    return { userId, role };
  });

  // Remove a user from the current tenant (deletes the membership, not the user).
  app.delete('/users/:userId', { preHandler: [app.requireCapability('users:write')] }, async (req, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const tenantId = req.auth!.tenantId;
    if (userId === req.auth!.userId) throw badRequest('You cannot remove yourself');

    const membership = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) throw notFound('User not found in this tenant');

    await prisma.tenantUser.delete({ where: { tenantId_userId: { tenantId, userId } } });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'user.remove', targetId: userId });
    return reply.status(204).send();
  });
}

/**
 * Create the user if needed (by email) and attach a tenant membership with the
 * given role. Shared by user invite and tenant provisioning.
 */
export async function upsertTenantUser(
  tenantId: string,
  input: { email: string; name?: string; role: string; password?: string },
): Promise<{ userId: string }> {
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;

  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: { email: input.email, name: input.name, passwordHash },
    update: {
      name: input.name ?? undefined,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    create: { tenantId, userId: user.id, role: input.role as never },
    update: { role: input.role as never },
  });

  return { userId: user.id };
}
