# Security

How the platform meets the security requirements (spec §14).

## Authentication

- Every `/api` endpoint requires a valid session **JWT** (HS256, `jose`).
  Unauthenticated requests get `401`. The only unauthenticated endpoints are the
  telephony webhooks, which are instead authenticated by **provider signature**.
- Passwords are hashed with **scrypt** (per-user random salt); verification is
  constant-time. Passwordless **magic links** are short-lived signed tokens
  (default 15 min) bound to an email + tenant.

## Tenant isolation (never trust the client's tenant)

- The `tenantId` lives **inside the signed JWT**. The auth plugin
  (`plugins/auth.ts`) is the single place it is read from the token and attached
  to `req.auth`.
- Route handlers use `req.auth.tenantId` **only** — it is never accepted from a
  body, query param or header. There is no tenant parameter on any `/api` route.
- Every tenant-scoped DB query filters by that `tenantId`; every scoped table has
  a `tenantId` column.
- **Defense in depth:** `prisma/rls.sql` enables PostgreSQL Row-Level Security so
  the database itself rejects cross-tenant rows (see `docs/DATABASE.md`).

## Authorization (RBAC)

Roles: `super_admin`, `tenant_admin`, `tenant_member`, `read_only`
(`packages/shared/constants.ts`). Capabilities are checked with
`requireCapability(...)` guards:

| Capability | admin | member | read_only |
|------------|:-----:|:------:|:---------:|
| `tenant:read`, `calls:read` | ✓ | ✓ | ✓ |
| `calls:export` | ✓ | ✓ | |
| `tenant:write`, `questionnaire:write`, `calls:delete`, `users:write`, `billing:read` | ✓ | | |

`super_admin` bypasses tenant capability checks and can manage all tenants.

## Secrets

- Validated at startup (`config.ts`); the process won't boot with a missing or
  malformed secret.
- **No API keys in the frontend** — the dashboard only reads `NEXT_PUBLIC_API_URL`.
- In production, load secrets from a **secret manager**, not a committed `.env`.
  `.env*` is gitignored.

## Field-level encryption

PII (phone numbers, caller email, transcript text) is encrypted at rest with
**AES-256-GCM** (random 96-bit IV per value, auth tag verified on decrypt) via
`lib/crypto.ts`. The key is `ENCRYPTION_KEY` (32 bytes, hex). For blind equality
lookups (matching an inbound number to a tenant) a deterministic keyed
**HMAC-SHA256** hash is stored alongside the ciphertext.

> Use database/disk encryption **in addition** (e.g. Supabase/RDS at-rest
> encryption) for full coverage.

## Webhook signature validation

`/webhooks/twilio/*` verify the `X-Twilio-Signature` header (HMAC-SHA1 over the
full URL + sorted params) in constant time before doing any work
(`lib/twilio.ts`). Controlled by `TWILIO_VALIDATE_SIGNATURE` (keep `true` in
production).

## Rate limiting

`@fastify/rate-limit` keys on `req.auth.tenantId` when authenticated (per-tenant
limits) and on IP otherwise. Tune `max` / `timeWindow` in `app.ts`.

## Audit logging

`audit_logs` records security-relevant actions: logins, **reads of call content**
(`call.read`), exports, deletes, questionnaire/assistant/tenant changes, GDPR
export/erase, and retention cleanups — with actor, target, IP and metadata.
Audit writes never break the request they describe.

## Transport & misc

- Run behind TLS; the app trusts `X-Forwarded-*` (`trustProxy`) for correct
  client IPs in audit logs and rate limiting.
- Body size is capped; CORS is restricted to `WEB_ORIGIN`.
- Logs **redact** authorization headers, cookies, passwords and known PII fields.
- The central error handler never leaks internals in production.

## Checklist mapping (spec §14)

| Requirement | Where |
|-------------|-------|
| Authenticate all API endpoints | auth plugin + per-route `authenticate` |
| Never trust `tenant_id` from frontend | derived from JWT only |
| Always filter queries by tenant | every Prisma query + RLS |
| Secrets in a secret manager | `config.ts` + gitignored `.env`; load from manager in prod |
| No API keys in frontend | dashboard reads only `NEXT_PUBLIC_API_URL` |
| Rate limits per tenant | `@fastify/rate-limit` keyed on tenantId |
| Verify webhook signatures | `lib/twilio.ts` |
| Audit logs for critical actions | `lib/audit.ts` + `audit_logs` |
| Encrypt sensitive fields | `lib/crypto.ts` (AES-256-GCM) |
| Log access to call content | `call.read` audit entry on `GET /calls/:id` |
