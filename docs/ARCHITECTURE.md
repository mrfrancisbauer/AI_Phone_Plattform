# Architecture

## Overview

The platform is a TypeScript monorepo with three deployable/consumable units:

| Unit | Path | Runtime | Responsibility |
|------|------|---------|----------------|
| Shared domain | `packages/shared` | library | Pure, framework-agnostic logic (cost, lead scoring, questionnaire engine, validation, types). Unit-tested. |
| API | `apps/api` | Node (Fastify) | Webhooks, REST API, conversation engine, persistence, email, billing, GDPR. |
| Dashboard | `apps/web` | Next.js | Tenant-facing UI. Talks to the API over REST with a JWT. |

Keeping domain logic in `shared` means the **dashboard and API agree exactly** on
cost math, lead categories, question types and validation rules, and that logic
is testable without any framework.

## Components & data flow

### Inbound call (telephony → API)

```
Twilio ── POST /webhooks/twilio/voice ──► verify signature
                                          ├─ lookup PhoneNumber by blindHash(To)
                                          ├─ load Tenant + Assistant + Questionnaire
                                          ├─ create Call (status=consent_pending)
                                          └─ TwiML <Gather> greeting + consent
        ── POST /webhooks/twilio/gather ─► handleTurn(callId, speech)
                                          └─ TwiML <Gather> next prompt | <Hangup>
```

The **conversation engine** (`services/conversation.service.ts`) is a turn-based
state machine. Each webhook delivers one caller utterance; the engine advances
the state, which is persisted as JSON on the `calls` row. Because no state lives
in process memory, any API instance can handle any turn (horizontal scaling).

Phases: `consent → questions → confirm → (correction) → email_consent → done`.

The **questionnaire engine** (`packages/shared/questionnaire-engine.ts`) is pure:
given the questions and answers-so-far it returns the next active question
(respecting ordering, required flags, and conditional triggers) and normalizes a
caller's free-form answer into a typed value, emitting a clarification when it
can't parse the input.

### Finalization (end of call)

`services/summary.service.ts` runs once per call:

1. Build the structured answer view and extract well-known fields (name, email,
   phone, concern, urgency, budget) by question type/key.
2. Score the lead (A/B/C) and compute a recommended next action.
3. Generate the summary via the **LLM service** (`services/llm.ts`), which uses
   OpenAI when configured and otherwise a deterministic local summarizer.
4. Persist `CallSummary`, update the `Call`, and record a `UsageEvent` with the
   full cost breakdown (`services/cost.service.ts`).
5. Send the **tenant** summary email (always) and the **caller** summary email
   (only with email + explicit consent) via the **email service**.

### Dashboard (browser → API)

The dashboard stores the session JWT client-side and sends it as a Bearer token.
It never sends a `tenantId`; the API derives it from the token. The frontend
holds **no secrets** — only `NEXT_PUBLIC_API_URL`.

## Service abstractions (swappable)

| Service | Default | Swap to |
|---------|---------|---------|
| Telephony | Twilio webhook + TwiML | Telnyx / SIP (isolate parsing in `lib/twilio.ts`) |
| LLM / summary | Local deterministic summarizer | OpenAI (set `OPENAI_API_KEY`); Vapi/Retell for full realtime voice |
| Email | `console` logger | Resend (set `EMAIL_PROVIDER=resend`); SendGrid/SES drop-in in `services/email` |
| Auth | JWT + magic link | Clerk/Auth0/Supabase Auth (replace `lib/auth.ts` + auth plugin) |
| Payments | — | Stripe (`invoices` table + `usage_events` already model it) |

## Realtime voice note

This MVP uses **turn-based** speech via Twilio `<Gather>` (STT) and `<Say>` (TTS),
which is robust and provider-agnostic. For low-latency, barge-in capable
conversations, swap the webhook layer for a **media-streams WebSocket** bridged to
the OpenAI Realtime API (or Vapi/Retell). The conversation/questionnaire engine
and all persistence stay the same — only the transport changes.

## Scaling & deployment

- **API**: stateless; run N replicas behind a load balancer (Render/Fly.io/AWS).
  Conversation state is in Postgres, not memory.
- **DB**: PostgreSQL in an **EU region** (Supabase/Neon/RDS). Enable RLS on Supabase.
- **Dashboard**: static/serverless on Vercel.
- **Cron**: schedule `dist/jobs/retention-cron.js` daily for retention cleanup.
- **Secrets**: a secret manager (not `.env`) in production.

## Roadmap & extension points

| Later feature | Where it plugs in |
|---------------|-------------------|
| Stripe billing | `invoices` + `usage_events` already exist; add a monthly rollup job + Stripe sync |
| CRM (HubSpot/Pipedrive/Salesforce) | Emit from `finalizeCall`; add an outbound webhook/integration service |
| Slack/Teams notifications | Hook into `finalizeCall` after lead scoring |
| Live call transfer / emergency routing | Add a TwiML `<Dial>` branch in the webhook on an escalation intent |
| Calendar booking | New question type + a calendar service called from the engine |
| Knowledge base (FAQ/PDF) | Add a retrieval step in `llm.ts` before answering free-form questions |
| White-label | `tenants.brandName/brandColor` already modeled; theme the dashboard per tenant |
| Spam/robocall + blacklist | Pre-check in `/webhooks/twilio/voice` before creating the call |
| Sentiment / quality scoring | Add a post-call analysis step in `finalizeCall` |
| Multilingual (DE/EN) | `assistant.locale` already drives prompts + TwiML language |
