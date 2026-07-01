-- A tenant's connected calendar (Google / Microsoft). OAuth tokens are secrets
-- and stored encrypted at rest; never exposed to the frontend. One connection
-- per tenant + provider.
CREATE TABLE "calendar_connections" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accessTokenEnc" TEXT NOT NULL,
  "refreshTokenEnc" TEXT,
  "expiresAt" TIMESTAMP(3),
  "calendarId" TEXT NOT NULL DEFAULT 'primary',
  "accountEmail" TEXT,
  "scope" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_connections_tenantId_provider_key" ON "calendar_connections"("tenantId", "provider");
CREATE INDEX "calendar_connections_tenantId_idx" ON "calendar_connections"("tenantId");

ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
