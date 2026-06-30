# Go-Live Runbook

From a fresh deploy to taking real phone calls and onboarding paying tenants.
Covers super-admin setup, tenant onboarding, connecting a real number, and the
production checklist.

---

## 0. Prerequisites

- A PostgreSQL database in an **EU region** (Supabase / Neon / RDS).
- A **Twilio** account (or Telnyx/SIP) with a voice-capable number.
- Optional: **OpenAI** key (better summaries) and **Resend** key (real emails).
- The API deployed with a public HTTPS URL (Render / Fly.io / AWS / GCP) and the
  dashboard deployed (Vercel).

## 1. Configure & migrate

```bash
cp .env.example apps/api/.env
# Required, non-negotiable for production:
#   DATABASE_URL          → your EU Postgres
#   JWT_SECRET            → openssl rand -base64 48
#   ENCRYPTION_KEY        → node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   API_PUBLIC_URL        → https://api.yourdomain.com   (used to build webhook URLs)
#   WEB_ORIGIN            → https://app.yourdomain.com
#   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
#   TWILIO_VALIDATE_SIGNATURE=true
#   EMAIL_PROVIDER=resend / RESEND_API_KEY / EMAIL_FROM
#   OPENAI_API_KEY (optional)

npm run db:generate
npm run db:migrate
```

> **Store secrets in a secret manager** (not the committed `.env`) in production.
> See `docs/SECURITY.md`.

## 2. Create the first super admin

The super admin manages all tenants. Two options:

**A. Seed the demo super admin** (fastest for a first deploy):

```bash
npm run db:seed
# creates super@platform.local / super-password-123  (CHANGE THIS PASSWORD)
```

**B. Create your own** via a one-off script / SQL: insert a `users` row with a
scrypt `passwordHash`, then a `tenant_users` row with `role = super_admin` for
any tenant. (A dedicated `create-super-admin` CLI is a small future addition.)

Log in at `https://app.yourdomain.com/login`. As a super admin you'll see the
**Admin (Mandanten)** entry in the navigation.

## 3. Onboard a tenant (customer)

In the dashboard → **Admin (Mandanten)** → *Neuen Mandanten anlegen*:

- Enter the company name, a unique slug, and the customer admin's email.
- Optionally set a monthly budget (alerts at 50/80/100 %, auto-pause at 100 %).
- Submit. The platform creates the tenant, the admin user, a **starter assistant
  and example questionnaire**, and returns a **one-time login link** to hand to
  the customer admin.

Equivalent API call (super-admin token):

```bash
curl -s $API/api/admin/provision-tenant -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{
    "tenant": { "name": "Acme GmbH", "slug": "acme-gmbh", "locale": "de",
                "monthlyBudgetLimit": 250, "autoPauseOnBudget": true },
    "admin":  { "email": "admin@acme.de" },
    "seedStarterContent": true
  }'
# → { tenantId, slug, adminUserId, magicLink }
```

The customer admin opens the magic link, lands in their (isolated) dashboard,
and can immediately edit the **Assistent** (greeting, consent text, system
prompt) and **Fragebogen**, and invite colleagues under **Nutzer**.

## 4. Connect a real phone number

1. Buy a voice number in the Twilio console (prefer an EU number for EU callers).
2. In the dashboard → **Einstellungen → Telefonnummern**, add the number in
   E.164 form (e.g. `+4930123456789`) with provider `twilio`.
3. Wire the inbound webhook — two ways:
   - **One click:** if the platform's Twilio credentials are set, press
     **„Webhook einrichten"**. This calls Twilio and points the number's
     *A call comes in* voice URL at `…/webhooks/twilio/voice` automatically.
   - **Manual:** copy the webhook URL shown on that page into the Twilio console
     under the number's *Voice → A call comes in* (HTTP POST).
4. Keep `TWILIO_VALIDATE_SIGNATURE=true` so only genuine Twilio requests are
   accepted.

### Test the call

Call the number. The assistant greets, asks for consent, runs the questionnaire
one question at a time, confirms, and (with email + consent) offers a caller
summary. After hang-up:

- the **tenant summary email** is sent to the configured recipients,
- a **usage event** with the full cost breakdown is recorded,
- the call appears in **Gespräche** with transcript, structured answers and cost.

Before going live you can rehearse the exact flow in **Testmodus** (no telephony
needed).

## 5. Voice quality / latency (optional upgrade)

This MVP uses turn-based speech (Twilio `<Gather>` STT + `<Say>` TTS), which is
robust and provider-agnostic. For low-latency, interruptible conversations,
replace the webhook transport with a **media-streams WebSocket** bridged to the
OpenAI Realtime API (or Vapi/Retell). The conversation/questionnaire engine and
all persistence stay unchanged — see `docs/ARCHITECTURE.md` → "Realtime voice".

## 6. Operations

- **Retention cleanup:** schedule the job daily (each tenant's configured window):
  ```bash
  node dist/jobs/retention-cron.js
  ```
  e.g. a Render/Fly cron, a Kubernetes CronJob, or Supabase pg_cron.
- **Health checks:** point your platform's probe at `/health/ready` (checks DB).
- **Backups:** enable automated Postgres backups (provider-side).
- **Monitoring:** ship the API's JSON logs to your aggregator; watch for
  `email send failed`, `finalizeCall failed`, and budget auto-pause events.

## 7. Production checklist

- [ ] `JWT_SECRET` and `ENCRYPTION_KEY` are strong and stored in a secret manager
- [ ] Demo/seed passwords changed or seed not run in prod
- [ ] `TWILIO_VALIDATE_SIGNATURE=true`
- [ ] `WEB_ORIGIN` restricted to your dashboard domain (CORS)
- [ ] HTTPS everywhere; API behind TLS (the app trusts `X-Forwarded-*`)
- [ ] Database at-rest encryption enabled; EU region
- [ ] Cost rates (`*_PRICE_PER_MINUTE`, `LLM_PRICE_*`, `PLATFORM_MARKUP_PERCENT`)
      set to your real numbers
- [ ] Email provider verified domain (`EMAIL_FROM`)
- [ ] Retention cron scheduled
- [ ] DPAs/AVV signed with Twilio, OpenAI, Resend (see `docs/GDPR.md`)
- [ ] At least one summary recipient per tenant (otherwise no internal email)

## 8. What's next (post-MVP)

Stripe billing (the `invoices` + `usage_events` tables already model it), CRM and
Slack/Teams hooks from `finalizeCall`, calendar booking, knowledge base, live
call transfer, white-label theming (`tenants.brandName/brandColor`). Extension
points are mapped in `docs/ARCHITECTURE.md` → "Roadmap & extension points".
