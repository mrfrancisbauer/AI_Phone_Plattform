import assert from 'node:assert/strict';
import { test } from 'node:test';

// Required env before importing config-dependent modules.
process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';

const { buildApp } = await import('./app.js');
const { signSession } = await import('./lib/auth.js');

/**
 * Regression test: validation errors on /api routes must be caught by our
 * error handler (clean 400 with error:"validation_error"), not fall through to
 * Fastify's default 500 handler. The routes live in an encapsulated /api child,
 * so the handler must be registered before the routes to be inherited.
 */
test('invalid input on an /api route returns a clean 400, not a 500', async () => {
  const app = await buildApp();
  await app.ready();
  try {
    const token = await signSession({
      sub: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      role: 'tenant_admin',
      email: 'admin@example.com',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/phone-numbers',
      headers: { authorization: `Bearer ${token}` },
      payload: { provider: 'twilio', e164: '+1 814 637 3426', active: true },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error: string };
    assert.equal(body.error, 'validation_error');
  } finally {
    await app.close();
  }
});

test('missing bearer token returns 401 (not 500)', async () => {
  const app = await buildApp();
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/calls' });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});
