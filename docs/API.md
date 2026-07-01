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

Telephony is provider-agnostic (Twilio today, Telnyx later) via a small port.
Customers keep their own number by **forwarding** it to a platform-owned routing
DID — the CPaaS stays the licensed carrier, the platform stays a software layer.
`e164` is the routing DID (the forward target / dialed number); `displayNumber`
is the customer's own business number, stored as encrypted display metadata.
`forwardingStatus` starts at `pending` and flips to `active` on the first
inbound call. Numbers without a `displayNumber` are dialed directly.

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/phone-numbers` | tenant:read — incl. `displayNumber`, `forwardingStatus` |
| GET | `/api/phone-numbers/telephony-info` | tenant:read — webhook URL + `canProvision` + active provisioning provider |
| GET | `/api/phone-numbers/webhook-info` | tenant:read — legacy: webhook URL + whether Twilio creds are set |
| GET | `/api/phone-numbers/available?country=DE&areaCode=&contains=` | tenant:read — purchasable DIDs from the active provider (empty if none) |
| POST | `/api/phone-numbers` | tenant:write — `{ provider, e164, displayNumber?, mode?, assistantId?, active }` |
| POST | `/api/phone-numbers/keep-number` | tenant:write — `{ displayNumber, assistantId? }`; auto-assigns a routing DID from the pool and returns `{ id, routingNumber }` |
| POST | `/api/phone-numbers/purchase` | tenant:write — `{ e164, assistantId? }` buys a DID from the active provider |
| POST | `/api/phone-numbers/:id/configure-webhook` | tenant:write — points the Twilio number's voice webhook at the platform |
| DELETE | `/api/phone-numbers/:id` | tenant:write — releases a pooled routing DID back to the pool |

### Routing-number pool (super admin)

The operator pre-fills a pool of platform-owned routing DIDs; `keep-number`
claims from it automatically. See `docs/TELEPHONY.md` for the cost/responsibility model.

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/admin/routing-numbers` | providers:read — pool with status + assignment |
| GET | `/api/admin/routing-numbers/available?country=DE` | providers:read — provider inventory to buy |
| POST | `/api/admin/routing-numbers` | providers:write — `{ e164, provider?, country?, purchase? }` (purchase=true buys it first) |
| DELETE | `/api/admin/routing-numbers/:id` | providers:write — only when unassigned |

## Integrations (calendar)

Connect a tenant's Google/Outlook calendar so appointment calls create events.
See `docs/INTEGRATIONS.md`. OAuth tokens are stored encrypted, never returned.

| Method | Path | Capability |
|--------|------|-----------|
| GET | `/api/integrations/calendar` | tenant:read — providers, configured flag, connection status + colour |
| POST | `/api/integrations/calendar/:provider/connect` | tenant:write — returns `{ url }` (provider consent) |
| GET | `/api/integrations/calendar/:provider/calendars` | tenant:read — the account's calendars |
| PATCH | `/api/integrations/calendar/:provider` | tenant:write — `{ calendarId }` set default calendar |
| POST | `/api/integrations/calendar/:provider/test` | tenant:write — verify the connection |
| GET | `/api/integrations/calendar/stats` | tenant:read — `{ bookedToday, failedToday }` |
| DELETE | `/api/integrations/calendar/:provider` | tenant:write — disconnect |
| GET | `/integrations/calendar/callback` | public — OAuth redirect target (signed `state`), **not** under `/api` |

Free/busy is checked before every booking (Google FreeBusy, Microsoft
CalendarView) — a busy slot is never double-booked; the assistant proposes free
alternatives live during the call. Bookings always use the tenant's chosen
default calendar (Primary if none selected).

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
| POST | `/webhooks/twilio/status` | Call ended (incl. caller hang-ups) → finalize/close the call, record duration + costs |

The status callback is configured automatically alongside the voice URL. For
manually managed numbers, set the number's **status callback** to
`…/webhooks/twilio/status` (POST) in the Twilio console — without it, calls
abandoned by the caller would stay open with no duration, cost or summary.

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
