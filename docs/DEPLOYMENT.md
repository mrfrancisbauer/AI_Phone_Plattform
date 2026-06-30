# Deployment

How to run the platform on a server for real customers. Pairs with the
[`GO_LIVE`](GO_LIVE.md) runbook (super-admin + tenant onboarding + telephony).

## Options at a glance

| Approach | Best for | Notes |
|----------|----------|-------|
| **Docker Compose** (`docker-compose.prod.yml`) | A single VPS / VM | Bundled Postgres or external; put a TLS proxy in front |
| **Managed PaaS** | Lowest ops | API on Render/Fly.io/AWS/GCP, dashboard on Vercel, DB on Supabase/Neon/RDS |

Either way: **EU region** where possible, secrets in a **secret manager**, HTTPS everywhere.

## A. Docker Compose (single server)

```bash
cp .env.prod.example .env.prod
#   ENCRYPTION_KEY: openssl rand -hex 32
#   JWT_SECRET:     openssl rand -base64 48
#   set API_PUBLIC_URL / WEB_ORIGIN to your real https domains
#   set POSTGRES_PASSWORD, Twilio, email, OpenAI as needed

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This builds and starts three services:

- **db** — Postgres 16 (swap for managed Postgres in real production by pointing
  the API's `DATABASE_URL` at it and removing the `db` service).
- **api** — runs `prisma migrate deploy` on boot, then serves on `:4000`.
- **web** — Next.js standalone server on `:3000`.

> **Important:** `NEXT_PUBLIC_API_URL` is **baked into the dashboard at build
> time** (it ships in the browser bundle). It is wired from `API_PUBLIC_URL`
> via the web build arg — so if you change the API domain you must **rebuild**
> the web image (`docker compose ... up -d --build web`).

### Put it behind TLS

Terminate TLS with a reverse proxy (Caddy/Traefik/Nginx) and route:

- `https://api.yourdomain.com` → `api:4000`
- `https://app.yourdomain.com` → `web:3000`

Caddy example:

```
api.yourdomain.com { reverse_proxy localhost:4000 }
app.yourdomain.com { reverse_proxy localhost:3000 }
```

Keep `TWILIO_VALIDATE_SIGNATURE=true`; the signature is computed over the public
HTTPS URL, so `API_PUBLIC_URL` must match what Twilio calls.

### First admin

After the stack is up, create the platform owner (super admin):

```bash
docker compose -f docker-compose.prod.yml exec api \
  npm run create:super-admin --workspace @ai-phone/api -- \
  --email you@yourcompany.com --password "a-strong-password"
```

Then follow [`GO_LIVE`](GO_LIVE.md) §3–4 to onboard tenants and connect numbers.

## B. Managed PaaS

- **Database:** Supabase / Neon / AWS RDS (EU). Apply migrations with
  `npm run db:migrate --workspace @ai-phone/api` (or the api image's boot step).
  On Supabase, optionally apply `apps/api/prisma/rls.sql` for RLS.
- **API:** deploy `apps/api/Dockerfile` to Render / Fly.io / Cloud Run. Set all
  env vars from `.env.example` as secrets. Expose `/health/ready` as the probe.
- **Dashboard:** deploy `apps/web` to Vercel. Set `NEXT_PUBLIC_API_URL` to the
  API's public URL (build-time env).
- **Retention cron:** schedule `node dist/jobs/retention-cron.js` daily.

## Operations

- **Migrations:** the api image runs `prisma migrate deploy` on start. For
  zero-downtime, instead run it as a one-off release step and start the server
  without it.
- **Backups:** enable automated Postgres backups (provider-side or `pg_dump`).
- **Health:** `GET /health` (liveness), `GET /health/ready` (readiness, checks DB).
- **Logs:** the API emits structured JSON; ship to your aggregator. Watch for
  `email send failed`, `finalizeCall failed`, and budget auto-pause events.
- **Scaling:** the API is stateless (conversation state lives in Postgres) — run
  multiple replicas behind the load balancer.

## Production checklist

See [`GO_LIVE.md` §7](GO_LIVE.md) for the full checklist (strong secrets in a
manager, `TWILIO_VALIDATE_SIGNATURE=true`, restricted CORS, EU + at-rest
encryption, real cost rates, verified email domain, retention cron, DPAs).
