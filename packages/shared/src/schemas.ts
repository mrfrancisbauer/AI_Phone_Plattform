/**
 * Zod validation schemas for API input. The API validates every request body
 * against these before it touches the database. Sharing them with the frontend
 * lets the dashboard validate forms with the exact same rules.
 */
import { z } from 'zod';
import {
  LEAD_CATEGORIES,
  QUESTION_TYPES,
  RETENTION_DAYS,
  ROLES,
  TELEPHONY_PROVIDERS,
} from './constants.js';

export const roleSchema = z.enum([
  ROLES.SUPER_ADMIN,
  ROLES.TENANT_ADMIN,
  ROLES.TENANT_MEMBER,
  ROLES.READ_ONLY,
]);

export const questionTypeSchema = z.enum([
  QUESTION_TYPES.FREE_TEXT,
  QUESTION_TYPES.YES_NO,
  QUESTION_TYPES.MULTIPLE_CHOICE,
  QUESTION_TYPES.SCALE,
  QUESTION_TYPES.DATETIME,
  QUESTION_TYPES.PHONE,
  QUESTION_TYPES.EMAIL,
  QUESTION_TYPES.BUDGET,
  QUESTION_TYPES.URGENCY,
]);

export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'must be E.164 format, e.g. +4930123456');

// --- Tenants ---
export const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes only'),
  locale: z.enum(['de', 'en']).default('de'),
  monthlyBudgetLimit: z.number().nonnegative().nullable().optional(),
  autoPauseOnBudget: z.boolean().default(false),
});

export const updateTenantSchema = createTenantSchema.partial().omit({ slug: true });

// --- Assistants ---
export const upsertAssistantSchema = z.object({
  name: z.string().min(1).max(120),
  greetingText: z.string().min(1).max(2000),
  consentText: z.string().min(1).max(2000),
  systemPrompt: z.string().min(1).max(20000),
  voice: z.string().min(1).max(60).default('alloy'),
  locale: z.enum(['de', 'en']).default('de'),
  recordAudio: z.boolean().default(false),
  questionnaireId: z.string().uuid().nullable().optional(),
});

// --- Phone numbers ---
export const createPhoneNumberSchema = z.object({
  provider: z.enum(TELEPHONY_PROVIDERS),
  e164: e164Schema,
  assistantId: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
});

// --- Questionnaire ---
export const questionConditionSchema = z.object({
  questionKey: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'gte', 'lte', 'truthy']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const questionSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9_]+$/, 'lowercase letters, numbers and underscores only'),
    prompt: z.string().min(1).max(1000),
    type: questionTypeSchema,
    required: z.boolean().default(false),
    order: z.number().int().nonnegative(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    scaleMin: z.number().int().optional(),
    scaleMax: z.number().int().optional(),
    condition: questionConditionSchema.nullable().optional(),
  })
  .refine(
    (q) => q.type !== QUESTION_TYPES.MULTIPLE_CHOICE || (q.options?.length ?? 0) >= 2,
    { message: 'multiple_choice questions need at least 2 options', path: ['options'] },
  )
  .refine(
    (q) =>
      q.type !== QUESTION_TYPES.SCALE ||
      (typeof q.scaleMin === 'number' &&
        typeof q.scaleMax === 'number' &&
        q.scaleMax > q.scaleMin),
    { message: 'scale questions need scaleMin < scaleMax', path: ['scaleMax'] },
  );

export const upsertQuestionnaireSchema = z
  .object({
    name: z.string().min(1).max(120),
    questions: z.array(questionSchema).min(1).max(100),
  })
  .refine(
    (q) => new Set(q.questions.map((x) => x.key)).size === q.questions.length,
    { message: 'question keys must be unique', path: ['questions'] },
  );

// --- Auth ---
export const magicLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

// --- Settings ---
export const dataRetentionSchema = z.object({
  retentionDays: z.union(
    RETENTION_DAYS.map((d) => z.literal(d)) as [
      z.ZodLiteral<number>,
      z.ZodLiteral<number>,
      ...z.ZodLiteral<number>[],
    ],
  ),
  storeAudio: z.boolean().default(false),
});

export const emailRecipientSchema = z.object({
  email: z.string().email(),
  label: z.string().max(120).optional(),
});

// --- Telephony webhook (Twilio voice form-encoded subset) ---
export const twilioVoiceWebhookSchema = z.object({
  CallSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
  CallStatus: z.string().optional(),
  SpeechResult: z.string().optional(),
  Digits: z.string().optional(),
});

export const leadCategorySchema = z.enum(LEAD_CATEGORIES);

// --- User management ---
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  role: roleSchema,
  // Optional initial password; if omitted the user is onboarded via magic link.
  password: z.string().min(8).max(200).optional(),
});

export const updateUserRoleSchema = z.object({
  role: roleSchema,
});

// --- Tenant provisioning (super admin one-shot onboarding) ---
export const provisionTenantSchema = z.object({
  tenant: createTenantSchema,
  admin: z.object({
    email: z.string().email(),
    name: z.string().max(120).optional(),
    password: z.string().min(8).max(200).optional(),
  }),
  // Optionally seed a starter assistant + questionnaire so the tenant can go
  // live immediately.
  seedStarterContent: z.boolean().default(true),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ProvisionTenantInput = z.infer<typeof provisionTenantSchema>;
export type UpsertAssistantInput = z.infer<typeof upsertAssistantSchema>;
export type UpsertQuestionnaireInput = z.infer<typeof upsertQuestionnaireSchema>;
export type CreatePhoneNumberInput = z.infer<typeof createPhoneNumberSchema>;
export type TwilioVoiceWebhook = z.infer<typeof twilioVoiceWebhookSchema>;
