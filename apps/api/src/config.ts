/**
 * Strongly-typed, validated runtime configuration. The process refuses to
 * start if a required secret is missing or malformed, so misconfiguration
 * surfaces immediately instead of at the first request.
 */
// Load apps/api/.env (and .env in cwd) before reading process.env. In
// production, env vars are injected by the platform/secret manager and this is
// a harmless no-op when no .env file exists.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),

  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VALIDATE_SIGNATURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  OPENAI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_PRICE_INPUT_PER_1K: z.coerce.number().default(0.00015),
  LLM_PRICE_OUTPUT_PER_1K: z.coerce.number().default(0.0006),

  STT_PRICE_PER_MINUTE: z.coerce.number().default(0.0043),
  TTS_PRICE_PER_MINUTE: z.coerce.number().default(0.015),
  TELEPHONY_PRICE_PER_MINUTE: z.coerce.number().default(0.0085),
  PLATFORM_MARKUP_PERCENT: z.coerce.number().default(0.3),

  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('AI Phone Assistant <assistant@example.com>'),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Calendar integrations (OAuth). All optional: when a provider's client
  // credentials are absent the integration is simply reported as unavailable.
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
  // Microsoft tenant: "common" allows work/school + personal accounts.
  MICROSOFT_OAUTH_TENANT: z.string().default('common'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;

export const costRates = {
  telephonyPerMinute: config.TELEPHONY_PRICE_PER_MINUTE,
  sttPerMinute: config.STT_PRICE_PER_MINUTE,
  ttsPerMinute: config.TTS_PRICE_PER_MINUTE,
  llmInputPer1k: config.LLM_PRICE_INPUT_PER_1K,
  llmOutputPer1k: config.LLM_PRICE_OUTPUT_PER_1K,
  markupPercent: config.PLATFORM_MARKUP_PERCENT,
};

export const isProd = config.NODE_ENV === 'production';
