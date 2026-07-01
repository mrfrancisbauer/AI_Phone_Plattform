/**
 * Calendar integrations. Authenticated endpoints let a tenant admin connect or
 * disconnect Google/Outlook; the OAuth callback is a separate PUBLIC route
 * (browser redirect, no session) protected by a signed state token.
 */
import type { FastifyInstance } from 'fastify';
import {
  CALENDAR_PROVIDERS,
  CALENDAR_PROVIDER_LABELS,
  type CalendarProvider,
} from '@ai-phone/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../logger.js';
import {
  calendarStatus,
  completeOAuth,
  disconnectCalendar,
} from '../services/calendar.service.js';
import { getCalendar, configuredCalendarProviders } from '../services/calendar/index.js';
import { signCalendarState } from '../services/calendar/state.js';

const providerParam = z.object({ provider: z.enum(CALENDAR_PROVIDERS) });

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Status: which providers are available and which are connected.
  app.get('/integrations/calendar', async (req) => {
    const connections = await calendarStatus(req.auth!.tenantId);
    const byProvider = new Map(connections.map((c) => [c.provider, c]));
    const configured = new Set(configuredCalendarProviders());
    return {
      anyConfigured: configured.size > 0,
      providers: CALENDAR_PROVIDERS.map((p) => ({
        provider: p,
        label: CALENDAR_PROVIDER_LABELS[p],
        configured: configured.has(p),
        connection: byProvider.get(p) ?? null,
      })),
    };
  });

  // Begin OAuth: return the provider consent URL (frontend redirects to it).
  app.post('/integrations/calendar/:provider/connect', { preHandler: [app.requireCapability('tenant:write')] }, async (req) => {
    const { provider } = providerParam.parse(req.params);
    const port = getCalendar(provider);
    if (!port.configured()) {
      throw badRequest('Diese Kalender-Integration ist derzeit nicht verfügbar.');
    }
    const state = await signCalendarState({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      provider,
    });
    return { url: port.authorizeUrl(state) };
  });

  app.delete('/integrations/calendar/:provider', { preHandler: [app.requireCapability('tenant:write')] }, async (req, reply) => {
    const { provider } = providerParam.parse(req.params);
    await disconnectCalendar(req.auth!.tenantId, provider, req.auth!.userId);
    return reply.status(204).send();
  });
}

/** PUBLIC OAuth callback (no auth): verifies signed state, stores the tokens. */
export async function integrationCallbackRoutes(app: FastifyInstance) {
  app.get('/integrations/calendar/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const dest = (status: string, provider?: CalendarProvider) => {
      const params = new URLSearchParams({ calendar: status });
      if (provider) params.set('provider', provider);
      return `${config.WEB_ORIGIN}/company/integrations?${params}`;
    };

    if (q.error || !q.code || !q.state) {
      return reply.redirect(dest('error'));
    }
    try {
      const provider = await completeOAuth(q.state, q.code);
      return reply.redirect(dest('connected', provider));
    } catch (err) {
      logger.error({ err }, 'calendar OAuth callback failed');
      return reply.redirect(dest('error'));
    }
  });
}
