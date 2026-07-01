/**
 * Routing-number pool (DB side). A tenant that keeps its own number claims an
 * AVAILABLE routing DID from the platform pool automatically; if the pool is
 * empty and a provider API is available, one is provisioned on demand. The
 * claim is atomic (optimistic status guard + retry) so two concurrent requests
 * never grab the same number.
 */
import type { TelephonyProvider } from '@ai-phone/shared';
import { prisma } from '../db.js';
import { blindHash, decrypt, encrypt } from '../lib/crypto.js';
import { chooseRoutingNumber } from '../lib/routing-pool.js';
import { logger } from '../logger.js';
import { getTelephony, provisioningProvider } from './telephony/index.js';

export interface AcquiredRouting {
  routingNumberId: string;
  e164: string;
  provider: TelephonyProvider;
}

/** Atomically claim an available pool number (marks it 'assigned', unlinked). */
async function claimFromPool(country?: string): Promise<AcquiredRouting | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const available = await prisma.routingNumber.findMany({
      where: { status: 'available' },
      select: { id: true, country: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    const pick = chooseRoutingNumber(available, country);
    if (!pick) return null;
    const claimed = await prisma.routingNumber.updateMany({
      where: { id: pick.id, status: 'available' },
      data: { status: 'assigned' },
    });
    if (claimed.count === 1) {
      const row = await prisma.routingNumber.findUnique({ where: { id: pick.id } });
      if (row) return { routingNumberId: row.id, e164: decrypt(row.e164Enc), provider: row.provider };
    }
    // Contended: another request claimed it first — try the next one.
  }
  return null;
}

/** Buy a fresh DID when the pool is empty and a provider API is available. */
async function provisionFresh(country: string): Promise<AcquiredRouting | null> {
  const prov = provisioningProvider();
  if (!prov) return null;
  const port = getTelephony(prov);
  try {
    const [candidate] = await port.searchNumbers({ country, limit: 1 });
    if (!candidate) return null;
    await port.buyNumber(candidate.e164);
    const created = await prisma.routingNumber.create({
      data: {
        provider: prov,
        e164Enc: encrypt(candidate.e164),
        e164Hash: blindHash(candidate.e164),
        country,
        status: 'assigned',
        webhookConfigured: true,
      },
    });
    return { routingNumberId: created.id, e164: candidate.e164, provider: prov };
  } catch (err) {
    logger.error({ err }, 'on-demand routing-number provisioning failed');
    return null;
  }
}

/** Obtain a routing DID for a tenant: claim from pool, else auto-provision. */
export async function acquireRoutingNumber(country = 'DE'): Promise<AcquiredRouting | null> {
  return (await claimFromPool(country)) ?? (await provisionFresh(country));
}

/** Link a claimed routing number to the tenant PhoneNumber that now uses it. */
export async function linkRoutingNumber(routingNumberId: string, tenantId: string, phoneNumberId: string): Promise<void> {
  await prisma.routingNumber.update({
    where: { id: routingNumberId },
    data: { assignedTenantId: tenantId, assignedPhoneNumberId: phoneNumberId },
  });
}

/** Undo a claim that was never linked (e.g. PhoneNumber creation failed). */
export async function releaseClaim(routingNumberId: string): Promise<void> {
  await prisma.routingNumber.updateMany({
    where: { id: routingNumberId, assignedPhoneNumberId: null },
    data: { status: 'available', assignedTenantId: null },
  });
}

/** Return a routing number to the pool when its PhoneNumber is deleted. */
export async function releaseByPhoneNumber(phoneNumberId: string): Promise<void> {
  await prisma.routingNumber.updateMany({
    where: { assignedPhoneNumberId: phoneNumberId },
    data: { status: 'available', assignedTenantId: null, assignedPhoneNumberId: null },
  });
}
