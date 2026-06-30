/**
 * Standalone entrypoint for the retention cleanup job. Schedule this with your
 * platform's cron (e.g. a daily Render/Fly cron job, a Kubernetes CronJob, or
 * Supabase pg_cron calling an edge function):
 *
 *   node dist/jobs/retention-cron.js
 */
import { runRetentionCleanup } from '../services/retention.service.js';
import { logger } from '../logger.js';
import { prisma } from '../db.js';

async function main() {
  const result = await runRetentionCleanup();
  logger.info(result, 'retention cron finished');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'retention cron failed');
  process.exit(1);
});
