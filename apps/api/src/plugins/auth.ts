import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ROLE_CAPABILITIES, ROLES, type Role } from '@ai-phone/shared';
import { verifySession } from '../lib/auth.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface RequestAuth {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: RequestAuth;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireCapability: (
      capability: string,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function hasCapability(role: Role, capability: string): boolean {
  const caps = ROLE_CAPABILITIES[role] ?? [];
  return caps.includes('*') || caps.includes(capability);
}

/**
 * Registers `authenticate` (verifies the Bearer token and attaches req.auth)
 * and `requireCapability` (RBAC guard). The tenantId is ALWAYS taken from the
 * verified token here — never from a request body, param or header — which is
 * the single chokepoint that enforces tenant isolation.
 */
export const authPlugin = fp(async (app) => {
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('Missing bearer token');
    try {
      const claims = await verifySession(header.slice('Bearer '.length));
      req.auth = {
        userId: claims.sub,
        tenantId: claims.tenantId,
        role: claims.role,
        email: claims.email,
      };
    } catch {
      throw unauthorized('Invalid or expired token');
    }
  });

  app.decorate('requireCapability', (capability: string) => {
    return async (req: FastifyRequest) => {
      if (!req.auth) throw unauthorized();
      // Super admins bypass tenant capability checks entirely.
      if (req.auth.role === ROLES.SUPER_ADMIN) return;
      if (!hasCapability(req.auth.role, capability)) {
        throw forbidden(`Missing capability: ${capability}`);
      }
    };
  });
});
