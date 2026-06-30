/**
 * Data-retention enforcement. For each tenant, deletes calls (and their
 * cascaded messages/answers/summaries) older than the tenant's configured
 * retention window. Run on a schedule (cron / worker) — see docs/GDPR.md.
 */
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { audit } from '../lib/audit.js';

export async function runRetentionCleanup(now = new Date()): Promise<{ deleted: number }> {
  const settings = await prisma.dataRetentionSetting.findMany();
  let total = 0;

  for (const s of settings) {
    const cutoff = new Date(now.getTime() - s.retentionDays * 24 * 60 * 60 * 1000);
    const { count } = await prisma.call.deleteMany({
      where: { tenantId: s.tenantId, startedAt: { lt: cutoff } },
    });
    if (count > 0) {
      total += count;
      await audit({
        tenantId: s.tenantId,
        action: 'retention.cleanup',
        metadata: { deleted: count, retentionDays: s.retentionDays },
      });
      logger.info({ tenantId: s.tenantId, deleted: count }, 'retention cleanup');
    }
  }

  // Tenants without an explicit setting default to 90 days.
  return { deleted: total };
}
