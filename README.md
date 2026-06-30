# AI Phone Platform

A scalable, **multi-tenant SaaS** for an AI telephone assistant. A caller dials a
number; the assistant answers, holds a natural conversation driven by a
**tenant-specific questionnaire**, captures structured answers, summarizes the
call, and emails the summary to the tenant (and optionally to the caller, with
consent). Every tenant has fully isolated data, configuration, questionnaires,
phone numbers, call logs, costs and users.

> This repository implements **MVP v1** (see [the MVP scope](#mvp-scope)) on a
> clean, typed, well-documented foundation that the later features (Stripe
> billing, CRM, calendar, knowledge base, white-label) plug into.

---

## Table of contents

- [Architecture](#architecture)
- [Monorepo layout](#monorepo-layout)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Connecting a phone number (Twilio)](#connecting-a-phone-number-twilio)
- [Call flow](#call-flow)
- [Multi-tenant isolation](#multi-tenant-isolation)
- [Cost model](#cost-model)
- [Lead scoring](#lead-scoring)
- [GDPR / data protection](#gdpr--data-protection)
- [API overview](#api-overview)
- [MVP scope](#mvp-scope)
- [Further docs](#further-docs)

---

## Architecture

```
                +-------------------+        webhooks         +------------------------+
   Caller  ───► | Twilio / Telnyx   | ──────────────────────► |  API (Fastify, TS)     |
   (phone)      | / SIP trunk       | ◄────── TwiML ───────── |                        |
                +-------------------+                          |  • webhook + signature │
                                                               |  • conversation engine │
                                                               |  • questionnaire engine│
   Tenant user ─► +------------------+     REST (JWT)          |  • cost + lead scoring  │
   (browser)      | Dashboard        | ─────────────────────► |  • email service        │
                  | (Next.js)        | ◄───────────────────── |  • GDPR + audit         │
                  +------------------+                          +-----------+------------+
                                                                            │ Prisma
                                                                            ▼
                                                               +------------------------+
                                                               |  PostgreSQL (EU)       |
                                                               |  tenant_id on every    |
                                                               |  scoped table + RLS    |
                                                               +------------------------+
                                          external (optional): OpenAI · Resend · Stripe
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the detailed design.

## Monorepo layout

```
.
├── packages/
│   └── shared/                 # Framework-agnostic domain logic (typed, tested)
│       ├── constants.ts        #   roles, question types, lead categories, …
│       ├── cost.ts             #   per-call cost calculation
│       ├── lead-scoring.ts     #   A/B/C lead scoring + next action
│       ├── questionnaire-engine.ts  # next-question, conditions, answer parsing
│       ├── schemas.ts          #   Zod validation (shared with the frontend)
│       └── types.ts
├── apps/
│   ├── api/                    # Backend (Fastify + Prisma + PostgreSQL)
│   │   ├── prisma/             #   schema, migration, RLS SQL, seed
│   │   └── src/
│   │       ├── routes/         #   auth, tenants, assistants, questionnaires,
│   │       │                   #   phone-numbers, calls, usage, settings, gdpr,
│   │       │                   #   webhooks, simulate, health
│   │       ├── services/       #   conversation, summary, cost, llm, email, retention
│   │       ├── lib/            #   crypto, auth, audit, errors, twilio
│   │       └── plugins/        #   auth/RBAC
│   └── web/                    # Dashboard (Next.js App Router)
└── docs/                       # ARCHITECTURE, DATABASE, API, SECURITY, GDPR
```

## Tech stack

| Concern        | Choice                                   | Why |
|----------------|------------------------------------------|-----|
| Language       | **TypeScript** everywhere                | One type system across API, shared logic and UI |
| Backend        | **Fastify**                              | Fast, small, first-class webhook/raw-body support |
| ORM / DB       | **Prisma** + **PostgreSQL**              | Typed queries; EU-region friendly (Supabase/Neon/RDS) |
| Validation     | **Zod**                                  | Same schemas validate API input and dashboard forms |
| Auth           | **JWT** + magic link (`jose`, scrypt)    | No vendor lock-in; swap for Clerk/Auth0/Supabase Auth |
| Frontend       | **Next.js** (App Router)                 | Dashboard + optional per-tenant landing pages |
| Telephony      | **Twilio** (Telnyx/SIP analogous)        | Inbound webhooks + TwiML |
| LLM / summary  | **OpenAI** (pluggable, local fallback)   | Runs with zero external setup for dev/CI |
| Email          | **Resend** (console/SendGrid/SES-ready)  | Tenant + caller summary delivery |

## Quick start

Prerequisites: **Node 20+**, and either **Docker** (for the bundled Postgres) or
an external **PostgreSQL**.

### Recommended: the `./dev` toolbox

A single script handles setup, secrets, the database, and running everything.
Clone the repo (don't download a zip — a clone lets `./dev update` pull changes
and keeps your `.env`), then:

```bash
./dev setup     # generates secrets + .env, starts Postgres, migrates, seeds
./dev start     # runs API (:4000) + dashboard (:3000) with hot reload
./dev doctor    # diagnoses your environment (Node, DB, env, ports, integrations)
```

Other commands: `stop`, `restart`, `reset` (recreate DB), `update` (git pull +
deps + migrate), `seed`, `admin` (create a super admin), `logs`, `build`.
`./dev help` lists them all.

> **Why this fixes "reconfigure every time":** `./dev setup` auto-generates
> `ENCRYPTION_KEY`/`JWT_SECRET` into `apps/api/.env`, and the backend now loads
> that `.env` automatically. Use `git pull` / `./dev update` instead of fresh
> zip downloads so the config and database persist.

### Manual setup (without the toolbox)

```bash
npm install
cp .env.example apps/api/.env       # then edit; generate a real key:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:generate
npm run db:migrate                  # applies prisma/migrations
npm run db:seed                     # demo tenant + example questionnaire
npm run dev:api                     # API on http://localhost:4000
npm run dev:web                     # Dashboard on http://localhost:3000
```

Log in at <http://localhost:3000/login> with the seeded account:

```
admin@demo-kanzlei.de  /  demo-password-123
```

Then open **Testmodus** in the dashboard to run a full simulated call
(consent → questionnaire → summary → email) without any telephony provider.
With `EMAIL_PROVIDER=console` the summary email is logged by the API.

> **No OpenAI/Resend keys needed for local dev.** The LLM service falls back to
> a deterministic local summarizer and the email service logs to the console,
> so the entire call → summary → email flow works offline.

## Environment variables

The API validates its environment on startup and refuses to boot if anything
required is missing or malformed. Full reference: [`.env.example`](.env.example).
Highlights:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (prefer an **EU** region) |
| `JWT_SECRET` | Signs session + magic-link tokens (≥ 32 chars) |
| `ENCRYPTION_KEY` | 32-byte hex key for field-level PII encryption |
| `TWILIO_AUTH_TOKEN`, `TWILIO_VALIDATE_SIGNATURE` | Webhook signature validation |
| `OPENAI_API_KEY` | Optional — enables real LLM summaries |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Email delivery |
| `*_PRICE_PER_MINUTE`, `LLM_PRICE_*`, `PLATFORM_MARKUP_PERCENT` | Cost model rates |

The dashboard only ever reads `NEXT_PUBLIC_API_URL` — **no secrets in the frontend.**

## Connecting a phone number (Twilio)

1. Add the number to a tenant in the dashboard (or via `POST /api/phone-numbers`).
2. In the Twilio console, set the number's **A call comes in** webhook to:
   ```
   POST  https://<your-api-host>/webhooks/twilio/voice
   ```
3. Keep `TWILIO_VALIDATE_SIGNATURE=true` so only genuine Twilio requests are
   accepted (the `X-Twilio-Signature` header is verified — see
   `src/lib/twilio.ts`).

Telnyx and raw SIP work the same way; the provider-specific parsing is isolated
in `lib/twilio.ts` and the webhook route.

## Call flow

On an inbound call the platform:

1. **Identifies the number** → loads the tenant, assistant config and questionnaire
   (number matched via a deterministic blind hash, so it is never stored or
   queried in plaintext).
2. **Asks for consent** with the tenant's configurable GDPR text. No consent →
   the assistant ends politely (and can offer an alternative contact).
3. **Runs the questionnaire** one question at a time, parsing each answer into a
   typed value, asking clarifying follow-ups on unclear input, and honoring
   conditional/branching questions.
4. **Confirms** a short read-back ("ist alles korrekt?").
5. **Asks email consent** if the caller gave an email address.
6. **Finalizes**: generates the summary, scores the lead (A/B/C), records a
   usage event with the cost breakdown, and sends the emails.

The engine is a turn-based state machine (`services/conversation.service.ts`)
with state persisted on the call row, so it is stateless between webhook hits
and scales horizontally.

## Multi-tenant isolation

Isolation is enforced at a single chokepoint and defended in depth:

- The session **JWT carries the `tenantId`**; the auth plugin attaches it to the
  request. Route handlers take `tenantId` **only** from `req.auth` — never from
  the body, query or headers.
- **Every** tenant-scoped Prisma query filters by that `tenantId`, and every
  scoped table has a `tenantId` column + index.
- Optional **PostgreSQL Row-Level Security** (`prisma/rls.sql`) adds a
  database-enforced second layer for Supabase deployments.
- Cross-tenant access is therefore impossible by construction; see
  [`docs/SECURITY.md`](docs/SECURITY.md).

## Cost model

Each call produces a `usage_event` with a transparent breakdown:

```
telephony = minutes × telephonyPerMinute
stt       = minutes × sttPerMinute
tts       = minutes × ttsPerMinute
llm       = inTok/1000 × llmInputPer1k + outTok/1000 × llmOutputPer1k
subtotal  = telephony + stt + tts + llm
markup    = subtotal × PLATFORM_MARKUP_PERCENT
total     = subtotal + markup
```

Implemented as a pure, unit-tested function (`packages/shared/cost.ts`) reused by
the dashboard's per-call **cost calculator**. Monthly spend is tracked per tenant
with **budget alerts at 50 / 80 / 100 %** and optional **auto-pause** at 100 %.

## Lead scoring

Optional, deterministic and explainable (`packages/shared/lead-scoring.ts`):

- **A** — concrete need, complete contact data, high urgency or callback wish.
- **B** — interest present, need still unclear, contact data present.
- **C** — unspecific, no contact data, no concrete need.

The score and a recommended next action are included in the internal email.

## GDPR / data protection

Privacy by design: data minimization, **no audio stored by default** (transcripts
only), configurable consent text, **field-level AES-256-GCM encryption** of PII
(phone, email, transcript), role-based access, **audit logs** for access to call
data, configurable **retention** (7/30/90/180 days) with automatic deletion, plus
**export** and **erasure** endpoints for data-subject requests. Details in
[`docs/GDPR.md`](docs/GDPR.md).

## API overview

REST under `/api` (JWT-authenticated) and `/webhooks` (signature-authenticated).
Full list in [`docs/API.md`](docs/API.md). A taste:

```
POST   /api/auth/login                 POST   /webhooks/twilio/voice
GET    /api/calls                      POST   /webhooks/twilio/gather
GET    /api/calls/:id                  PUT    /api/questionnaires/:id
GET    /api/usage/stats                POST   /api/usage/estimate
GET    /api/calls/export.csv           POST   /api/gdpr/export
POST   /api/simulate/start             POST   /api/gdpr/erase
```

## MVP scope

Implemented in this repo (MVP v1): tenant management, number→tenant mapping,
inbound call handling, AI conversation with the questionnaire, structured answer
storage, tenant summary email, optional caller email, dashboard with call list &
costs, GDPR consent at the start of the call, and per-call cost calculation.

Designed-for-later (clear extension points exist): Stripe billing, CRM
integrations, live call transfer, calendar booking, knowledge base, white-label,
advanced analytics. See `docs/ARCHITECTURE.md` → "Roadmap & extension points".

## Further docs

- [`docs/ADMIN_CONSOLE.md`](docs/ADMIN_CONSOLE.md) — the Super-Admin platform console (`/admin`)
- [`docs/GO_LIVE.md`](docs/GO_LIVE.md) — runbook: super admin, tenant onboarding, real calls, prod checklist
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Docker Compose & managed-PaaS deployment
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, data flow, roadmap
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema, tables, RLS
- [`docs/API.md`](docs/API.md) — endpoint reference
- [`docs/SECURITY.md`](docs/SECURITY.md) — auth, tenant isolation, secrets, rate limits
- [`docs/GDPR.md`](docs/GDPR.md) — privacy controls and operations

## Testing & quality

```bash
npm run typecheck     # all workspaces
npm test              # unit tests (cost, lead scoring, questionnaire engine, crypto)
npm run build         # build shared + API; the web build runs `next build`
```

## License

Proprietary / unlicensed — for evaluation. Add your license before distribution.
