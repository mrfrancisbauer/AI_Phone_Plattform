# API reference

Base URL: `http://localhost:4000` (configurable).
Two surfaces:

- `/api/**` — JSON REST, authenticated with a **Bearer JWT**.
- `/webhooks/**` — telephony callbacks, authenticated by **provider signature**.

All request bodies are validated with Zod; invalid input returns
`400 { error: "validation_error", issues: [...] }`. Errors are
`{ error, message }` with the appropriate status code.

> **Tenant scoping:** the `tenantId` is taken from the JWT, never from the
> request. There is no `tenantId` parameter on any `/api` endpoint.

## Auth

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | `{ email, password, tenantId? }` | Returns `{ token, tenants[] }` |
| POST | `/api/auth/magic-link` | `{ email }` | Always `200` (no user enumeration); emails a link |
| POST | `/api/auth/magic-link/verify` | `{ token }` | Returns `{ token }` |
| GET | `/api/auth/me` | — | Current `{ userId, tenantId, role, email }` |
| POST | `/api/auth/switch-tenant` | `{ tenantId }` | New token for another membership |

## Tenants (super admin)

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/admin/tenants` | super_admin — list with user/number/call counts |
| POST | `/api/admin/tenants` | super_admin — bare tenant |
| POST | `/api/admin/provision-tenant` | super_admin — tenant + admin + starter content; returns `magicLink` |
| GET | `/api/admin/tenants/:id/users` | super_admin |
| POST | `/api/admin/tenants/:id/resume` | super_admin or owning tenant admin |
| POST | `/api/admin/tenants/:id/pause` | super_admin |

`provision-tenant` body: `{ tenant: {...createTenant}, admin: { email, name?, password? }, seedStarterContent? }`.

## Users (tenant-scoped)

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/users` | tenant:read — members of the current tenant |
| POST | `/api/users` | users:write — `{ email, name?, role, password? }` → `{ userId, magicLink }` |
| PUT | `/api/users/:userId/role` | users:write — `{ role }` |
| DELETE | `/api/users/:userId` | users:write — removes the membership |

Only a super admin may assign the `super_admin` role; you cannot change/remove yourself.

## Assistants

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/assistants` | tenant:read |
| GET | `/api/assistants/:id` | tenant:read |
| POST | `/api/assistants` | tenant:write |
| PUT | `/api/assistants/:id` | tenant:write |

## Questionnaires

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/questionnaires` | tenant:read |
| GET | `/api/questionnaires/:id` | tenant:read |
| POST | `/api/questionnaires` | questionnaire:write |
| PUT | `/api/questionnaires/:id` | questionnaire:write (bumps `version`) |

Question object: `{ key, prompt, type, required, order, options?, scaleMin?, scaleMax?, condition? }`
where `type ∈ {free_text, yes_no, multiple_choice, scale, datetime, phone, email, budget, urgency}`
and `condition = { questionKey, operator: equals|not_equals|gte|lte|truthy, value? }`.

## Phone numbers

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/phone-numbers` | tenant:read |
| GET | `/api/phone-numbers/webhook-info` | tenant:read — webhook URL + whether Twilio creds are set |
| POST | `/api/phone-numbers` | tenant:write — `{ provider, e164, assistantId?, active }` |
| POST | `/api/phone-numbers/:id/configure-webhook` | tenant:write — points the Twilio number's voice webhook at the platform |
| DELETE | `/api/phone-numbers/:id` | tenant:write |

## Calls

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/calls?limit=&cursor=&leadCategory=` | Paginated list; phone numbers masked |
| GET | `/api/calls/:id` | Full detail incl. transcript — **audited** |
| GET | `/api/calls/export.csv` | CSV export — audited |
| DELETE | `/api/calls/:id` | GDPR erasure — capability `calls:delete` |

## Usage & cost

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/usage/stats?days=30` | Daily series, MTD spend, budget limit |
| GET | `/api/usage/history` | Per-month totals |
| POST | `/api/usage/estimate` | `{ durationSeconds, llmInputTokens, llmOutputTokens }` → cost breakdown |

## Settings

| Method | Path |
|--------|------|
| GET/PUT | `/api/settings/tenant` |
| GET/POST/DELETE | `/api/settings/email-recipients[/:id]` |
| GET/PUT | `/api/settings/retention` |

## GDPR (capability `calls:delete`)

| Method | Path | Body |
|--------|------|------|
| POST | `/api/gdpr/export` | `{ phone }` → everything stored about that caller |
| POST | `/api/gdpr/erase` | `{ phone }` → `{ deleted }` |

## Simulation (agent test mode)

| Method | Path | Body |
|--------|------|------|
| POST | `/api/simulate/start` | `{ assistantId }` → `{ callId, say }` |
| POST | `/api/simulate/:callId/say` | `{ text }` → `{ say, action }` |

## Webhooks (signature-authenticated)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/webhooks/twilio/voice` | Inbound call → TwiML greeting + consent |
| POST | `/webhooks/twilio/gather?callId=` | Each caller turn → TwiML next prompt / hangup |

## Health

| Method | Path |
|--------|------|
| GET | `/health` |
| GET | `/health/ready` (checks DB) |

## Example

```bash
TOKEN=$(curl -s localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@demo-kanzlei.de","password":"demo-password-123"}' | jq -r .token)

curl -s localhost:4000/api/usage/stats?days=30 -H "authorization: Bearer $TOKEN" | jq
```
