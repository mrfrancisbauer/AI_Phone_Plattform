import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { config } from './config.js';
import { loggerOptions } from './logger.js';
import { HttpError } from './lib/errors.js';
import { authPlugin } from './plugins/auth.js';
import { registerRoutes } from './routes/index.js';

/** True for a Zod validation error, robust to differing module copies. */
function isZodError(err: unknown): err is ZodError {
  return (
    err instanceof ZodError ||
    (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'ZodError' && Array.isArray((err as { issues?: unknown }).issues))
  );
}

/**
 * Central error handler — maps typed errors to status codes and never leaks
 * internals. Registered on the root instance BEFORE routes so it is inherited
 * by the encapsulated /api child context (Fastify snapshots the handler when
 * a child is created).
 */
function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  if (isZodError(err)) {
    return reply.status(400).send({ error: 'validation_error', issues: err.issues });
  }
  if (err instanceof HttpError) {
    return reply.status(err.statusCode).send({ error: err.code, message: err.message });
  }
  // Fastify's own body validation errors carry a statusCode (usually 400).
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return reply.status(err.statusCode).send({ error: err.code ?? 'bad_request', message: err.message });
  }
  if ((err as { code?: string }).code === 'P2025') {
    return reply.status(404).send({ error: 'not_found' });
  }
  req.log.error({ err }, 'unhandled error');
  return reply.status(500).send({ error: 'internal_error' });
}

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

  // WebSocket support for the realtime (ConversationRelay) endpoint.
  await app.register(websocket);

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

  // Register the error handler BEFORE routes so the encapsulated /api child
  // inherits it (otherwise validation errors fall through to Fastify's default
  // 500 handler and leak raw messages).
  app.setErrorHandler(errorHandler);

  await app.register(authPlugin);
  await registerRoutes(app);

  return app;
}
