import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { loggerOptions } from './logger.js';
import { HttpError } from './lib/errors.js';
import { authPlugin } from './plugins/auth.js';
import { registerRoutes } from './routes/index.js';

/** Build the Fastify app (separated from listen() so it can be unit-tested). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
    bodyLimit: 1_000_000,
    genReqId: () => crypto.randomUUID(),
  });

  // Parse form-encoded bodies (telephony webhooks post application/x-www-form-urlencoded).
  await app.register(formbody);

  await app.register(cors, {
    origin: config.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Per-IP rate limiting. Tenant-scoped limits can be layered on top via a
  // keyGenerator that reads req.auth (see docs/SECURITY.md).
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.auth?.tenantId ?? req.ip,
  });

  await app.register(authPlugin);
  await registerRoutes(app);

  // Central error handler — maps typed errors to status codes, never leaks
  // internals in production.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'validation_error', issues: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    // Prisma "not found" on findUniqueOrThrow etc.
    if ((err as { code?: string }).code === 'P2025') {
      return reply.status(404).send({ error: 'not_found' });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: 'internal_error' });
  });

  return app;
}
