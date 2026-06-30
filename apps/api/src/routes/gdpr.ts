/**
 * GDPR data-subject endpoints: export (Auskunftsersuchen, Art. 15) and
 * erasure (Recht auf Löschung, Art. 17) for a given caller phone number.
 * Both are audited.
 */
import type { FastifyInstance } from 'fastify';
import { e164Schema } from '@ai-phone/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { blindHash, decrypt, decryptNullable } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';

export async function gdprRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Export everything stored about a caller (by phone number) within the tenant.
  app.post('/gdpr/export', { preHandler: [app.requireCapability('calls:delete')] }, async (req) => {
    const { phone } = z.object({ phone: e164Schema }).parse(req.body);
    const tenantId = req.auth!.tenantId;
    const target = blindHash(phone);

    const calls = await prisma.call.findMany({
      where: { tenantId },
      include: { summary: true, answers: true, messages: true },
    });
    // fromNumber is encrypted; match by re-hashing decrypted value.
    const matched = calls.filter((c) => blindHash(decrypt(c.fromNumberEnc)) === target);

    await audit({ tenantId, actorId: req.auth!.userId, action: 'gdpr.export', ip: req.ip, metadata: { matches: matched.length } });

    return matched.map((c) => ({
      callId: c.id,
      startedAt: c.startedAt,
      fromNumber: decrypt(c.fromNumberEnc),
      summary: c.summary
        ? {
            callerName: c.summary.callerName,
            callerEmail: decryptNullable(c.summary.callerEmailEnc),
            concern: c.summary.concern,
            summary: c.summary.summary,
          }
        : null,
      answers: c.answers.map((a) => ({ questionKey: a.questionKey, value: a.value })),
      transcript: c.messages.map((m) => ({ role: m.role, text: decrypt(m.textEnc), at: m.createdAt })),
    }));
  });

  // Erase all calls for a caller phone number within the tenant.
  app.post('/gdpr/erase', { preHandler: [app.requireCapability('calls:delete')] }, async (req) => {
    const { phone } = z.object({ phone: e164Schema }).parse(req.body);
    const tenantId = req.auth!.tenantId;
    const target = blindHash(phone);

    const calls = await prisma.call.findMany({ where: { tenantId }, select: { id: true, fromNumberEnc: true } });
    const ids = calls.filter((c) => blindHash(decrypt(c.fromNumberEnc)) === target).map((c) => c.id);
    if (ids.length > 0) {
      await prisma.call.deleteMany({ where: { id: { in: ids }, tenantId } });
    }
    await audit({ tenantId, actorId: req.auth!.userId, action: 'gdpr.erase', ip: req.ip, metadata: { deleted: ids.length } });
    return { deleted: ids.length };
  });
}
