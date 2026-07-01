/**
 * Platform-wide enums and constants shared by the API and the dashboard.
 * Keeping these in one place guarantees the frontend and backend agree on
 * the exact string values stored in the database.
 */

/** Roles within a tenant, plus cross-tenant platform-staff roles. */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  /** Platform support: read tenants, test telephony, view logs/monitoring. */
  PLATFORM_SUPPORT: 'platform_support',
  /** Platform billing: costs, invoices, Stripe only. */
  BILLING: 'billing',
  TENANT_ADMIN: 'tenant_admin',
  TENANT_MEMBER: 'tenant_member',
  READ_ONLY: 'read_only',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Platform-staff roles that operate across tenants (Super-Admin console). */
export const PLATFORM_ROLES: ReadonlyArray<Role> = [
  ROLES.SUPER_ADMIN,
  ROLES.PLATFORM_SUPPORT,
  ROLES.BILLING,
];
export function isPlatformRole(role: Role): boolean {
  return PLATFORM_ROLES.includes(role);
}

/**
 * Platform-console capabilities. The backend enforces these on every admin
 * endpoint; the frontend uses the same map to decide which nav sections and
 * actions to render. Tenant-level capabilities are unchanged.
 */
export const PLATFORM_CAPS = {
  DASHBOARD: 'platform:dashboard',
  TENANTS_READ: 'platform:tenants:read',
  TENANTS_WRITE: 'platform:tenants:write',
  USERS_WRITE: 'platform:users:write',
  PHONE_TEST: 'platform:phone:test',
  PROVIDERS_READ: 'platform:providers:read',
  PROVIDERS_WRITE: 'platform:providers:write',
  AI_WRITE: 'platform:ai:write',
  BILLING_READ: 'platform:billing:read',
  MONITORING: 'platform:monitoring',
  LOGS: 'platform:logs',
  AUDIT: 'platform:audit',
  SYSTEM: 'platform:system',
  BACKUPS: 'platform:backups',
  GDPR: 'platform:gdpr',
} as const;

/** Coarse capability checks derived from a role. */
export const ROLE_CAPABILITIES: Record<Role, ReadonlyArray<string>> = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.PLATFORM_SUPPORT]: [
    PLATFORM_CAPS.DASHBOARD,
    PLATFORM_CAPS.TENANTS_READ,
    PLATFORM_CAPS.PHONE_TEST,
    PLATFORM_CAPS.PROVIDERS_READ,
    PLATFORM_CAPS.MONITORING,
    PLATFORM_CAPS.LOGS,
    PLATFORM_CAPS.AUDIT,
    PLATFORM_CAPS.SYSTEM,
  ],
  [ROLES.BILLING]: [PLATFORM_CAPS.DASHBOARD, PLATFORM_CAPS.BILLING_READ],
  [ROLES.TENANT_ADMIN]: [
    'tenant:read',
    'tenant:write',
    'questionnaire:write',
    'calls:read',
    'calls:delete',
    'billing:read',
    'users:write',
  ],
  [ROLES.TENANT_MEMBER]: ['tenant:read', 'calls:read', 'calls:export'],
  [ROLES.READ_ONLY]: ['tenant:read', 'calls:read'],
};

export function roleHasCapability(role: Role, capability: string): boolean {
  const caps = ROLE_CAPABILITIES[role] ?? [];
  return caps.includes('*') || caps.includes(capability);
}

/** Subscription plans and their monthly platform fee (EUR), used for MRR/ARR. */
export const PLANS = ['starter', 'business', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];
export const PLAN_PRICING: Record<Plan, number> = {
  starter: 49,
  business: 149,
  enterprise: 499,
};

/** Industry options for the tenant wizard. */
export const INDUSTRIES = [
  'Kanzlei',
  'Arztpraxis',
  'Handwerk',
  'Immobilien',
  'Versicherung',
  'E-Commerce',
  'Agentur',
  'Sonstiges',
] as const;

/** Supported questionnaire question types. */
export const QUESTION_TYPES = {
  FREE_TEXT: 'free_text',
  YES_NO: 'yes_no',
  MULTIPLE_CHOICE: 'multiple_choice',
  SCALE: 'scale',
  DATETIME: 'datetime',
  PHONE: 'phone',
  EMAIL: 'email',
  BUDGET: 'budget',
  URGENCY: 'urgency',
} as const;
export type QuestionType = (typeof QUESTION_TYPES)[keyof typeof QUESTION_TYPES];

/** Lead categories produced by the lead-scoring engine. */
export const LEAD_CATEGORIES = ['A', 'B', 'C'] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];

/** Lifecycle of a call. */
export const CALL_STATUS = {
  RINGING: 'ringing',
  CONSENT_PENDING: 'consent_pending',
  IN_PROGRESS: 'in_progress',
  SUMMARIZING: 'summarizing',
  COMPLETED: 'completed',
  DECLINED: 'declined',
  FAILED: 'failed',
} as const;
export type CallStatus = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];

/** Who said a given message. */
export const MESSAGE_ROLE = {
  ASSISTANT: 'assistant',
  CALLER: 'caller',
  SYSTEM: 'system',
} as const;
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

/** Telephony providers we can ingest webhooks from. */
export const TELEPHONY_PROVIDERS = ['twilio', 'telnyx', 'sip'] as const;
export type TelephonyProvider = (typeof TELEPHONY_PROVIDERS)[number];

/** Budget-alert thresholds (fraction of monthly limit). */
export const BUDGET_ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

/** Allowed data-retention periods in days. */
export const RETENTION_DAYS = [7, 30, 90, 180] as const;
export type RetentionDays = (typeof RETENTION_DAYS)[number];

/** The canonical sentence the assistant must use when it is unsure. */
export const UNCERTAIN_RESPONSE_DE =
  'Das kann ich nicht zuverlässig beantworten, ich gebe es an das Team weiter.';

/**
 * Customer-facing voice personas. The technical voice id (OpenAI/ElevenLabs)
 * stays internal — the customer only ever picks a friendly persona. Stored as
 * `assistant.voice` = the persona's `voiceId`.
 */
export interface VoicePersona {
  id: string;
  name: string;
  gender: 'weiblich' | 'männlich' | 'neutral';
  style: string;
  description: string;
  /** Internal TTS voice id (never shown to the customer). */
  voiceId: string;
}

export const VOICE_PERSONAS: VoicePersona[] = [
  { id: 'anna', name: 'Business Anna', gender: 'weiblich', style: 'Professionell · Ruhig', description: 'Klar und vertrauensvoll — ideal für Kanzleien und Praxen.', voiceId: 'nova' },
  { id: 'david', name: 'Business David', gender: 'männlich', style: 'Professionell · Souverän', description: 'Sachlich und souverän — passt zu Dienstleistern und B2B.', voiceId: 'onyx' },
  { id: 'lisa', name: 'Freundliche Lisa', gender: 'weiblich', style: 'Modern · Locker', description: 'Warm und zugänglich — für einen freundlichen Empfang.', voiceId: 'shimmer' },
  { id: 'julia', name: 'Premium Julia', gender: 'weiblich', style: 'Elegant · Hochwertig', description: 'Gehoben und elegant — für Premium-Marken.', voiceId: 'fable' },
  { id: 'alex', name: 'Neutral Alex', gender: 'neutral', style: 'Neutral · Ausgewogen', description: 'Ausgewogen und universell einsetzbar.', voiceId: 'alloy' },
];

export function personaByVoiceId(voiceId: string | null | undefined): VoicePersona {
  return VOICE_PERSONAS.find((p) => p.voiceId === voiceId) ?? VOICE_PERSONAS[0]!;
}

/** Assistant tasks offered in the setup wizard. */
export interface AssistantTask {
  id: string;
  label: string;
  description: string;
}

export const ASSISTANT_TASKS: AssistantTask[] = [
  { id: 'reception', label: 'Rezeption', description: 'Anrufer freundlich empfangen und weiterleiten.' },
  { id: 'support', label: 'Support', description: 'Häufige Fragen beantworten und Anliegen aufnehmen.' },
  { id: 'appointments', label: 'Terminvereinbarung', description: 'Termine erfassen und Rückrufe organisieren.' },
  { id: 'leads', label: 'Leads', description: 'Neue Interessenten qualifizieren und erfassen.' },
  { id: 'reservations', label: 'Reservierungen', description: 'Tisch-/Platzreservierungen entgegennehmen.' },
  { id: 'orders', label: 'Bestellungen', description: 'Bestellungen und Rückrufwünsche aufnehmen.' },
];

/** SIP/PBX providers offered when connecting an existing number. */
export const TELEPHONY_CARRIERS = [
  'Telekom',
  'Vodafone',
  'O2',
  'Sipgate',
  'Placetel',
  'STARFACE',
  '3CX',
  'NFON',
  'Microsoft Teams',
  'Sonstige',
] as const;
