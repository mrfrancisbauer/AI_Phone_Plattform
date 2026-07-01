/**
 * Call data: list recent calls, view a single call (with summary, answers and
 * decrypted transcript), delete a call (GDPR), and CSV export. Reading call
 * content is audited because it is access to sensitive personal data.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { decryptNullable, tryDecrypt } from '../lib/crypto.js';
import { notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

export async function callRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List recent calls (paginated, newest first).
  app.get('/calls', async (req) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        cursor: z.string().uuid().optional(),
        leadCategory: z.enum(['A', 'B', 'C']).optional(),
      })
      .parse(req.query);

    const rows = await prisma.call.findMany({
      where: { tenantId: req.auth!.tenantId, ...(q.leadCategory ? { leadCategory: q.leadCategory } : {}) },
      orderBy: { startedAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { summary: { select: { concern: true, callerName: true } } },
    });
    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit).map((c) => ({
      id: c.id,
      status: c.status,
      fromNumber: maskPhone(tryDecrypt(c.fromNumberEnc) ?? ''),
      callerName: c.summary?.callerName ?? null,
      concern: c.summary?.concern ?? null,
      leadCategory: c.leadCategory,
      durationSeconds: c.durationSeconds,
      totalCost: c.totalCost ? Number(c.totalCost) : null,
      startedAt: c.startedAt,
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  });

  // Single call detail (full transcript + answers) — audited.
  app.get('/calls/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenantId = req.auth!.tenantId;
    const call = await prisma.call.findFirst({
      where: { id, tenantId },
      include: {
        summary: true,
        answers: { orderBy: { createdAt: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' } },
        usageEvent: true,
        appointment: true,
      },
    });
    if (!call) throw notFound('Call not found');

    await audit({
      tenantId,
      actorId: req.auth!.userId,
      actorEmail: req.auth!.email,
      action: 'call.read',
      targetType: 'call',
      targetId: id,
      ip: req.ip,
    });

    return {
      id: call.id,
      status: call.status,
      provider: call.provider,
      fromNumber: tryDecrypt(call.fromNumberEnc) ?? '—',
      consentGiven: call.consentGiven,
      callerEmailConsent: call.callerEmailConsent,
      leadCategory: call.leadCategory,
      durationSeconds: call.durationSeconds,
      totalCost: call.totalCost ? Number(call.totalCost) : null,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      summary: call.summary
        ? {
            callerName: call.summary.callerName,
            callerEmail: decryptNullable(call.summary.callerEmailEnc),
            concern: call.summary.concern,
            summary: call.summary.summary,
            leadCategory: call.summary.leadCategory,
            recommendedAction: call.summary.recommendedAction,
          }
        : null,
      appointment: call.appointment
        ? {
            status: call.appointment.status,
            provider: call.appointment.provider,
            startAt: call.appointment.startAt,
            htmlLink: call.appointment.htmlLink,
            error: call.appointment.error,
          }
        : null,
      answers: call.answers.map((a) => ({ questionKey: a.questionKey, type: a.type, value: a.value })),
      transcript: call.messages.map((m) => ({ role: m.role, text: tryDecrypt(m.textEnc) ?? '—', at: m.createdAt })),
      usage: call.usageEvent
        ? {
            sttCost: Number(call.usageEvent.sttCost),
            ttsCost: Number(call.usageEvent.ttsCost),
            llmCost: Number(call.usageEvent.llmCost),
            telephonyCost: Number(call.usageEvent.telephonyCost),
            platformMarkup: Number(call.usageEvent.platformMarkup),
            totalCost: Number(call.usageEvent.totalCost),
          }
        : null,
    };
  });

  // CSV export of calls.
  app.get('/calls/export.csv', async (req, reply) => {
    const tenantId = req.auth!.tenantId;
    const calls = await prisma.call.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      include: { summary: { select: { callerName: true, concern: true } } },
      take: 5000,
    });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'call.export', ip: req.ip });

    const header = ['id', 'startedAt', 'durationSeconds', 'leadCategory', 'callerName', 'concern', 'totalCost'];
    const lines = calls.map((c) =>
      [
        c.id,
        c.startedAt.toISOString(),
        c.durationSeconds,
        c.leadCategory ?? '',
        csvEscape(c.summary?.callerName ?? ''),
        csvEscape(c.summary?.concern ?? ''),
        c.totalCost ? Number(c.totalCost).toFixed(6) : '',
      ].join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="calls.csv"').send(csv);
  });

  // Delete a call (GDPR right to erasure) — cascades to messages/answers/summary.
  app.delete('/calls/:id', { preHandler: [app.requireCapability('calls:delete')] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenantId = req.auth!.tenantId;
    const call = await prisma.call.findFirst({ where: { id, tenantId } });
    if (!call) throw notFound('Call not found');
    await prisma.call.delete({ where: { id } });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'call.delete', targetType: 'call', targetId: id, ip: req.ip });
    return reply.status(204).send();
  });
}

function maskPhone(e164: string): string {
  return e164.length > 4 ? `${e164.slice(0, 4)}****${e164.slice(-2)}` : '****';
}
function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
