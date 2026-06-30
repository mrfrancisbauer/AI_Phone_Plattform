import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { webhookRoutes } from './webhooks.js';
import { tenantRoutes } from './tenants.js';
import { assistantRoutes } from './assistants.js';
import { questionnaireRoutes } from './questionnaires.js';
import { phoneNumberRoutes } from './phone-numbers.js';
import { callRoutes } from './calls.js';
import { usageRoutes } from './usage.js';
import { settingsRoutes } from './settings.js';
import { gdprRoutes } from './gdpr.js';
import { simulateRoutes } from './simulate.js';

/** Register all route modules. Webhooks are mounted without the /api prefix. */
export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(webhookRoutes);

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(tenantRoutes);
      await api.register(assistantRoutes);
      await api.register(questionnaireRoutes);
      await api.register(phoneNumberRoutes);
      await api.register(callRoutes);
      await api.register(usageRoutes);
      await api.register(settingsRoutes);
      await api.register(gdprRoutes);
      await api.register(simulateRoutes);
    },
    { prefix: '/api' },
  );
}
