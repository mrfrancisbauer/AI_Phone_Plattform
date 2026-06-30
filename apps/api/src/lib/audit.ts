import { prisma } from '../db.js';
import { logger } from '../logger.js';

export interface AuditInput {
  tenantId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append an entry to the tenant's audit trail. Audit writes must never break
 * the request they describe, so failures are logged and swallowed.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ip: input.ip ?? null,
        metadata: input.metadata as object | undefined,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'failed to write audit log');
  }
}
