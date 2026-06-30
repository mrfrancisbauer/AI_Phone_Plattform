# Database

PostgreSQL via Prisma. Schema: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
Initial migration: `apps/api/prisma/migrations/0001_init/migration.sql`.

## Multi-tenancy rule

Every table that holds tenant-scoped data carries a **`tenantId`** column and is
indexed on it. The application always filters by the `tenantId` from the
authenticated context. Optional Postgres **Row-Level Security** (`prisma/rls.sql`)
enforces the same boundary at the database level.

## Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `tenants` | A customer / mandant | `slug`, `monthlyBudgetLimit`, `autoPauseOnBudget`, `paused`, `brandName/brandColor` |
| `users` | Login identities | `email`, `passwordHash` |
| `tenant_users` | User↔tenant membership + role | `tenantId`, `userId`, `role` (unique pair) |
| `phone_numbers` | Inbound numbers | `e164Enc` (encrypted), `e164Hash` (unique blind hash), `assistantId`, `active` |
| `assistants` | Assistant config | `greetingText`, `consentText`, `systemPrompt`, `voice`, `locale`, `recordAudio`, `questionnaireId` |
| `questionnaires` | A questionnaire | `name`, `version` |
| `questionnaire_questions` | Questions | `key`, `prompt`, `type`, `required`, `order`, `options/scaleMin/scaleMax/condition` (JSON) |
| `calls` | One call | `providerCallId` (unique), `status`, `fromNumberEnc`, `consentGiven`, `callerEmailConsent`, `leadCategory`, `durationSeconds`, `totalCost`, `state` (JSON) |
| `call_messages` | Transcript turns | `role`, `textEnc` (encrypted) |
| `call_answers` | Structured answers | `questionKey`, `type`, `value` (JSON), `rawTextEnc` (encrypted), unique per `(callId, questionKey)` |
| `call_summaries` | Generated summary | `callerName`, `callerEmailEnc`, `concern`, `summary`, `leadCategory`, `recommendedAction` |
| `usage_events` | Billing per call | `durationSeconds`, `sttCost`, `ttsCost`, `llmCost`, `telephonyCost`, `platformMarkup`, `totalCost` |
| `invoices` | Monthly rollups | `periodStart/End`, `totalAmount`, `status`, `stripeId` |
| `email_recipients` | Where summaries go | `email`, `label` |
| `email_logs` | Every send | `toEnc`, `subject`, `kind`, `status`, `error` |
| `audit_logs` | Access/mutation trail | `actorId`, `action`, `targetType/Id`, `ip`, `metadata` |
| `data_retention_settings` | Per-tenant retention | `retentionDays`, `storeAudio` |

### Encrypted (PII) columns

Stored as AES-256-GCM ciphertext (base64 `iv|tag|ciphertext`), suffix `Enc`:
`phone_numbers.e164Enc`, `calls.fromNumberEnc`, `call_messages.textEnc`,
`call_answers.rawTextEnc`, `call_summaries.callerEmailEnc`, `email_logs.toEnc`.

To look up a phone number without decrypting every row, `phone_numbers.e164Hash`
stores a deterministic keyed HMAC-SHA256 (`blindHash`) — equal numbers hash
equally, but the hash is not reversible.

## Migrations

```bash
# Development (creates + applies a migration against your dev DB)
npm run db:migrate:dev --workspace @ai-phone/api

# Production (apply committed migrations)
npm run db:migrate
```

The committed `0001_init` migration was generated with `prisma migrate diff`
and covers the full schema.

## Row-Level Security (Supabase / hardened Postgres)

`prisma/rls.sql` enables and forces RLS on every tenant-scoped table with a
`tenant_isolation` policy keyed on `current_tenant_id()`, which reads
`current_setting('app.tenant_id')`. To use it:

1. Apply migrations, then run `rls.sql` once.
2. Connect the API with a **non-superuser** role.
3. At the start of each request/transaction, set the tenant context:
   ```sql
   SELECT set_config('app.tenant_id', '<tenantId from JWT>', true);
   ```

This is defense-in-depth: even a missing `where` clause cannot leak across
tenants.

## Indexing

Hot paths are indexed: `tenantId` on every scoped table, composite
`(tenantId, startedAt)` on `calls` and `(tenantId, createdAt)` on `usage_events`
and `audit_logs` for dashboard time-range queries, and unique constraints on
`phone_numbers.e164Hash`, `calls.providerCallId`, and `(callId, questionKey)`.
