# Super-Admin Console

A platform-operator console layered on top of the existing app — same auth,
same tenant model, same design system. It is reachable at **`/admin`** and is
visible only to platform-staff roles.

## Access & roles

Platform roles (assignable only by a super admin):

| Role | Can |
|------|-----|
| `super_admin` | Everything across all tenants |
| `platform_support` | View tenants, test telephony, view logs/monitoring/system/audit. **Cannot** change providers, see secrets, or delete tenants |
| `billing` | Dashboard + Abrechnung only |

The navigation and every backend endpoint are gated by the same capability map
(`PLATFORM_CAPS` in `@ai-phone/shared`). The frontend only hides UI; the **server
enforces every capability** on each route. `tenantId` is never taken from the
client — admin endpoints are cross-tenant by design and audited.

Create a super admin: `npm run create:super-admin --workspace @ai-phone/api -- --email you@co.com --password ...`
(see `docs/GO_LIVE.md`). Demo: `super@platform.local` / `super-password-123`.

## Sections

| Section | Route | What |
|---------|-------|------|
| Dashboard | `/admin` | KPIs (tenants, calls, minutes, OpenAI/telephony cost, revenue, profit, MRR/ARR, API/DB status) + charts (calls/cost/new tenants/avg duration, lead distribution) |
| Mandanten | `/admin/tenants` | Search/filter/paginate, 6-step create wizard, deactivate/delete, detail with 11 tabs |
| Benutzer | `/admin/users` | Global users: reset password, magic link, lock/unlock, change role, delete |
| Telefonnummern | `/admin/phone-numbers` | All numbers across tenants, Twilio webhook test |
| Provider | `/admin/providers` | Twilio / OpenAI / Mail / Stripe status + connection tests (secrets never shown) |
| KI | `/admin/ai` | Global model defaults + system-prompt versioning with rollback |
| Abrechnung | `/admin/billing` | Cost/revenue/profit by today/month/year, MRR/ARR, CSV export |
| Monitoring | `/admin/monitoring` | Service health + CPU/RAM/disk gauges (auto-refresh) |
| Logs | `/admin/logs` | App logs by channel/level with search + download |
| Audit Log | `/admin/audit` | Every admin action: user, action, tenant, IP, browser |
| System | `/admin/system` | App/build/Node/Prisma/DB versions, applied migrations |
| Backups | `/admin/backups` | Backup runs + start (wire `pg_dump` → storage in infra for real dumps) |

## Data model additions

Migration `0002_admin_console`:

- `Role` += `platform_support`, `billing`; new `Plan` enum
- `tenants` += `industry`, `country`, `timezone`, `plan`, `telephonyMode`, `openaiMode`
- `users` += `locked`, `lastLoginAt` (locked accounts cannot log in)
- New tables: `platform_settings`, `prompt_versions`, `backups`, `app_logs`

Secrets stay in the environment/secret manager — `platform_settings` only holds
non-secret config (AI defaults, etc.). Run `npm run db:migrate && npm run db:seed`
to apply and load development dummy data.

## Notes on derived/stub data

Infra-dependent items are honest about their source: disk metrics and Redis
require host/infra access (shown as n/a / not_configured locally), and backups
record metadata with a derived size until a real `BACKUP_COMMAND` is wired.
Everything else is computed from real platform data.
