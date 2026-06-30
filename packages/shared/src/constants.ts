/**
 * Platform-wide enums and constants shared by the API and the dashboard.
 * Keeping these in one place guarantees the frontend and backend agree on
 * the exact string values stored in the database.
 */

/** Roles within a tenant (plus the cross-tenant super admin). */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  TENANT_MEMBER: 'tenant_member',
  READ_ONLY: 'read_only',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Coarse capability checks derived from a role. */
export const ROLE_CAPABILITIES: Record<Role, ReadonlyArray<string>> = {
  [ROLES.SUPER_ADMIN]: ['*'],
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
