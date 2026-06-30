/**
 * Shared domain types. These describe the shape of data crossing the
 * API boundary (and are kept in sync with the Prisma models on the server).
 */
import type {
  CallStatus,
  LeadCategory,
  MessageRole,
  QuestionType,
  Role,
  TelephonyProvider,
} from './constants.js';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  /** Default locale, e.g. "de" or "en". */
  locale: string;
  monthlyBudgetLimit: number | null;
  autoPauseOnBudget: boolean;
  createdAt: string;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  role: Role;
}

export interface PhoneNumber {
  id: string;
  tenantId: string;
  provider: TelephonyProvider;
  /** E.164, e.g. +4930123456. Stored encrypted at rest. */
  e164: string;
  assistantId: string | null;
  active: boolean;
}

export interface Assistant {
  id: string;
  tenantId: string;
  name: string;
  greetingText: string;
  consentText: string;
  systemPrompt: string;
  voice: string;
  locale: string;
  /** When false, transcripts only — no audio is ever stored. */
  recordAudio: boolean;
  questionnaireId: string | null;
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionCondition {
  /** Key of the question this one depends on. */
  questionKey: string;
  /** Operator applied to the referenced answer. */
  operator: 'equals' | 'not_equals' | 'gte' | 'lte' | 'truthy';
  value?: string | number | boolean;
}

export interface QuestionnaireQuestion {
  id: string;
  questionnaireId: string;
  /** Stable machine key, e.g. "is_urgent". Used in answers + conditions. */
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  order: number;
  options?: QuestionOption[];
  /** Scale bounds for SCALE type. */
  scaleMin?: number;
  scaleMax?: number;
  /** Only ask this question when the condition holds. */
  condition?: QuestionCondition | null;
}

export interface Questionnaire {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  questions: QuestionnaireQuestion[];
}

export interface CallAnswer {
  questionKey: string;
  type: QuestionType;
  /** Normalized value (string/number/boolean serialized as JSON). */
  value: unknown;
  rawText: string;
}

export interface CallMessage {
  id: string;
  role: MessageRole;
  text: string;
  at: string;
}

export interface CallSummary {
  callerName: string | null;
  callerEmail: string | null;
  concern: string | null;
  summary: string;
  leadCategory: LeadCategory;
  recommendedAction: string;
}

export interface Call {
  id: string;
  tenantId: string;
  assistantId: string;
  phoneNumberId: string;
  provider: TelephonyProvider;
  status: CallStatus;
  fromNumber: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  consentGiven: boolean;
  callerEmailConsent: boolean;
  leadCategory: LeadCategory | null;
  totalCost: number | null;
}

export interface UsageEvent {
  id: string;
  tenantId: string;
  callId: string;
  durationSeconds: number;
  sttCost: number;
  ttsCost: number;
  llmCost: number;
  telephonyCost: number;
  platformMarkup: number;
  totalCost: number;
  createdAt: string;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
}
