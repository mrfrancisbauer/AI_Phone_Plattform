/**
 * Cost & billing service. Turns raw call usage into a persisted UsageEvent,
 * updates the call total, and enforces the tenant's monthly budget (alerts at
 * 50/80/100 %, optional auto-pause at 100 %).
 */
import {
  BUDGET_ALERT_THRESHOLDS,
  calculateCallCost,
  crossedBudgetThresholds,
  type CostUsage,
} from '@ai-phone/shared';
import { costRates } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { renderBudgetAlert } from './email/templates.js';
import { sendEmail } from './email/index.js';

export function computeCost(usage: CostUsage) {
  return calculateCallCost(usage, costRates);
}

/** Persist a usage event for a finished call and run budget enforcement. */
export async function recordUsage(params: {
  tenantId: string;
  callId: string;
  usage: CostUsage;
}) {
  const cost = computeCost(params.usage);

  await prisma.$transaction([
    prisma.usageEvent.upsert({
      where: { callId: params.callId },
      create: {
        tenantId: params.tenantId,
        callId: params.callId,
        durationSeconds: cost.durationSeconds,
        sttCost: cost.sttCost,
        ttsCost: cost.ttsCost,
        llmCost: cost.llmCost,
        telephonyCost: cost.telephonyCost,
        platformMarkup: cost.platformMarkup,
        totalCost: cost.totalCost,
      },
      update: {
        durationSeconds: cost.durationSeconds,
        sttCost: cost.sttCost,
        ttsCost: cost.ttsCost,
        llmCost: cost.llmCost,
        telephonyCost: cost.telephonyCost,
        platformMarkup: cost.platformMarkup,
        totalCost: cost.totalCost,
      },
    }),
    prisma.call.update({
      where: { id: params.callId },
      data: { totalCost: cost.totalCost },
    }),
  ]);

  await enforceBudget(params.tenantId, cost.totalCost);
  return cost;
}

/** Sum of all usage in the current calendar month for a tenant. */
export async function monthToDateSpend(tenantId: string, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.usageEvent.aggregate({
    where: { tenantId, createdAt: { gte: start } },
    _sum: { totalCost: true },
  });
  return Number(agg._sum.totalCost ?? 0);
}

async function enforceBudget(tenantId: string, latestCost: number) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.monthlyBudgetLimit) return;
  const limit = Number(tenant.monthlyBudgetLimit);
  if (limit <= 0) return;

  const totalAfter = await monthToDateSpend(tenantId);
  const totalBefore = totalAfter - latestCost;

  const crossed = crossedBudgetThresholds(totalBefore, totalAfter, limit, BUDGET_ALERT_THRESHOLDS);
  if (crossed.length === 0) return;

  const highest = Math.max(...crossed);
  const recipients = await prisma.emailRecipient.findMany({ where: { tenantId } });
  for (const r of recipients) {
    await sendEmail({
      tenantId,
      to: r.email,
      kind: 'budget_alert',
      email: renderBudgetAlert(tenant.name, highest, totalAfter, limit),
    });
  }

  if (highest >= 1 && tenant.autoPauseOnBudget && !tenant.paused) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { paused: true } });
    logger.warn({ tenantId }, 'tenant auto-paused: monthly budget exceeded');
  }
}
