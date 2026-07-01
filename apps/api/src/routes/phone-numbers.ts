/**
 * Phone-number management. The stored number is the ROUTING DID (a
 * platform-owned forward target); the customer's own business number is kept
 * as encrypted display metadata. Numbers are stored encrypted with a
 * deterministic blind hash for inbound routing. A tenant may own several
 * numbers; each maps to one assistant.
 *
 * Provisioning is provider-agnostic: everything goes through the telephony
 * port, so Twilio auto-purchase and manual DID entry share one code path and
 * Telnyx can be added as an adapter later.
 */
import type { FastifyInstance } from 'fastify';
import {
  createPhoneNumberSchema,
  purchaseNumberSchema,
  searchNumbersSchema,
} from '@ai-phone/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { blindHash, encrypt, tryDecrypt } from '../lib/crypto.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { initialForwardingStatus, resolveAssistantForNumber } from '../lib/phone-routing.js';
import { audit } from '../lib/audit.js';
import { logger } from '../logger.js';
import {
  getTelephony,
  provisioningProvider,
  voiceWebhookUrl,
} from '../services/telephony/index.js';

export async function phoneNumberRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/phone-numbers', async (req) => {
    const rows = await prisma.phoneNumber.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: { assistant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // Decrypt for display (caller is an authenticated tenant user).
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      e164: tryDecrypt(r.e164Enc) ?? '—',
      displayNumber: r.displayNumberEnc ? tryDecrypt(r.displayNumberEnc) : null,
      forwardingStatus: r.forwardingStatus,
      assistantId: r.assistantId,
      assistantName: r.assistant?.name ?? null,
      active: r.active,
    }));
  });

  app.post('/phone-numbers', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const body = createPhoneNumberSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const hash = blindHash(body.e164);
    const existing = await prisma.phoneNumber.findUnique({ where: { e164Hash: hash } });
    if (existing) throw conflict('Diese Telefonnummer ist bereits registriert.');

    // A number must always be bound to exactly one assistant of THIS tenant so
    // inbound routing works. tenantId always comes from the auth context.
    const assistants = await prisma.assistant.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const resolved = resolveAssistantForNumber(assistants, body.assistantId);
    if (!resolved.ok) throw badRequest(resolved.message);

    const created = await prisma.phoneNumber.create({
      data: {
        tenantId,
        provider: body.provider,
        e164Enc: encrypt(body.e164),
        e164Hash: hash,
        displayNumberEnc: body.displayNumber ? encrypt(body.displayNumber) : null,
        forwardingStatus: initialForwardingStatus(body.displayNumber),
        assistantId: resolved.assistantId,
        active: body.active,
      },
    });

    // Best effort: point the DID's inbound webhook at the platform. For manual
    // connections this is a no-op; for unconfigured providers it fails quietly
    // and the wizard shows the URL to configure by hand.
    let webhookConfigured = false;
    try {
      const port = getTelephony(body.provider);
      if (port.configured() && body.provider === 'twilio') {
        await port.setInboundWebhook(body.e164);
        webhookConfigured = true;
      }
    } catch (err) {
      logger.warn({ err, provider: body.provider }, 'auto webhook configuration failed');
    }

    await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.create', targetId: created.id, metadata: { assistantId: resolved.assistantId, mode: body.mode ?? null } });
    return reply.status(201).send({ id: created.id, assistantId: resolved.assistantId, webhookConfigured });
  });

  // Reassign a number to a different assistant of the same tenant.
  app.patch('/phone-numbers/:id', { preHandler: [app.requireCapability('tenant:write')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { assistantId } = z.object({ assistantId: z.string().uuid() }).parse(req.body);
    const tenantId = req.auth!.tenantId;

    const number = await prisma.phoneNumber.findFirst({ where: { id, tenantId } });
    if (!number) throw notFound('Phone number not found');
    const assistant = await prisma.assistant.findFirst({ where: { id: assistantId, tenantId } });
    if (!assistant) throw badRequest('Der ausgewählte Assistent gehört nicht zu diesem Mandanten.');

    await prisma.phoneNumber.update({ where: { id }, data: { assistantId } });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.reassign', targetId: id, metadata: { assistantId } });
    return { id, assistantId };
  });

  // Telephony capabilities for the tenant UI: the webhook URL to forward to,
  // and whether the platform can provision (search/buy) DIDs via a provider API.
  app.get('/phone-numbers/telephony-info', async () => {
    const provProvider = provisioningProvider();
    return {
      voiceWebhookUrl: voiceWebhookUrl(),
      canProvision: provProvider !== null,
      provisioningProvider: provProvider,
    };
  });

  // Backwards-compatible alias used by the current dashboard.
  app.get('/phone-numbers/webhook-info', async () => {
    const provProvider = provisioningProvider();
    return { voiceWebhookUrl: voiceWebhookUrl(), twilioConfigured: provProvider === 'twilio' };
  });

  // Search the active provider's inventory for purchasable DIDs.
  app.get('/phone-numbers/available', async (req) => {
    const query = searchNumbersSchema.parse(req.query);
    const provProvider = provisioningProvider();
    if (!provProvider) return { provider: null, numbers: [] };
    const port = getTelephony(provProvider);
    const numbers = await port.searchNumbers({ ...query, limit: 20 });
    return { provider: provProvider, numbers };
  });

  // Buy a DID from the active provider and register it for this tenant.
  app.post('/phone-numbers/purchase', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const body = purchaseNumberSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const provProvider = provisioningProvider();
    if (!provProvider) throw badRequest('Automatischer Nummernkauf ist derzeit nicht verfügbar.');

    const hash = blindHash(body.e164);
    const existing = await prisma.phoneNumber.findUnique({ where: { e164Hash: hash } });
    if (existing) throw conflict('Diese Telefonnummer ist bereits registriert.');

    const assistants = await prisma.assistant.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const resolved = resolveAssistantForNumber(assistants, body.assistantId);
    if (!resolved.ok) throw badRequest(resolved.message);

    const port = getTelephony(provProvider);
    try {
      await port.buyNumber(body.e164);
    } catch (err) {
      logger.error({ err, provider: provProvider }, 'DID purchase failed');
      throw badRequest('Die Nummer konnte nicht gekauft werden. Bitte später erneut versuchen.');
    }

    // A purchased number is dialed directly — no forwarding to verify.
    const created = await prisma.phoneNumber.create({
      data: {
        tenantId,
        provider: provProvider,
        e164Enc: encrypt(body.e164),
        e164Hash: hash,
        forwardingStatus: 'active',
        assistantId: resolved.assistantId,
        active: true,
      },
    });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.purchase', targetId: created.id, metadata: { provider: provProvider } });
    return reply.status(201).send({ id: created.id, assistantId: resolved.assistantId });
  });

  // One-click: (re)point this number's provider voice webhook at the platform.
  app.post(
    '/phone-numbers/:id/configure-webhook',
    { preHandler: [app.requireCapability('tenant:write')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const tenantId = req.auth!.tenantId;
      const number = await prisma.phoneNumber.findFirst({ where: { id, tenantId } });
      if (!number) throw notFound('Phone number not found');
      const port = getTelephony(number.provider);
      if (!port.configured() || number.provider !== 'twilio') {
        throw badRequest('Automatische Webhook-Konfiguration ist für diese Anbindung nicht verfügbar.');
      }
      const e164 = tryDecrypt(number.e164Enc);
      if (!e164) throw badRequest('Die Telefonnummer konnte nicht gelesen werden.');
      const result = await port.setInboundWebhook(e164);
      await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.configure_webhook', targetId: id });
      return result;
    },
  );

  app.delete('/phone-numbers/:id', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenantId = req.auth!.tenantId;
    const existing = await prisma.phoneNumber.findFirst({ where: { id, tenantId } });
    if (!existing) throw notFound('Phone number not found');
    await prisma.phoneNumber.delete({ where: { id } });
    await audit({ tenantId, actorId: req.auth!.userId, action: 'phone_number.delete', targetId: id });
    return reply.status(204).send();
  });
}
