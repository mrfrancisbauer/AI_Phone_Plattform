/**
 * Cost & usage analytics for the dashboard: call counts over time, current
 * month spend vs. limit, cost history, and a per-call cost calculator.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calculateCallCost } from '@ai-phone/shared';
import { costRates } from '../config.js';
import { prisma } from '../db.js';
import { monthToDateSpend } from '../services/cost.service.js';

export async function usageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Aggregate stats for a date range bucketed by day.
  app.get('/usage/stats', async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const tenantId = req.auth!.tenantId;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const calls = await prisma.call.findMany({
      where: { tenantId, startedAt: { gte: since } },
      select: { startedAt: true, durationSeconds: true, totalCost: true },
    });

    const byDay = new Map<string, { calls: number; durationSeconds: number; cost: number }>();
    for (const c of calls) {
      const key = c.startedAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? { calls: 0, durationSeconds: 0, cost: 0 };
      bucket.calls += 1;
      bucket.durationSeconds += c.durationSeconds;
      bucket.cost += c.totalCost ? Number(c.totalCost) : 0;
      byDay.set(key, bucket);
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const monthSpend = await monthToDateSpend(tenantId);

    return {
      totalCalls: calls.length,
      totalDurationSeconds: calls.reduce((s, c) => s + c.durationSeconds, 0),
      monthToDateSpend: monthSpend,
      monthlyBudgetLimit: tenant?.monthlyBudgetLimit ? Number(tenant.monthlyBudgetLimit) : null,
      series: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
    };
  });

  // Cost history: per-month totals.
  app.get('/usage/history', async (req) => {
    const tenantId = req.auth!.tenantId;
    const events = await prisma.usageEvent.findMany({
      where: { tenantId },
      select: { createdAt: true, totalCost: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const byMonth = new Map<string, number>();
    for (const e of events) {
      const key = e.createdAt.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(e.totalCost));
    }
    return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, total]) => ({ month, total }));
  });

  // Per-call cost calculator (transparent breakdown) using platform rates.
  app.post('/usage/estimate', async (req) => {
    const body = z
      .object({
        durationSeconds: z.number().nonnegative(),
        llmInputTokens: z.number().nonnegative().default(0),
        llmOutputTokens: z.number().nonnegative().default(0),
      })
      .parse(req.body);
    return calculateCallCost(body, costRates);
  });
}
