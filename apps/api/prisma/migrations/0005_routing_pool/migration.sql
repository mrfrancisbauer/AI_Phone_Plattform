-- Platform-owned pool of routing DIDs for the "keep your number" flow.
-- The operator pre-provisions numbers; a tenant keeping their own number claims
-- one automatically, so support never has to hand out a routing number by hand.
CREATE TABLE "routing_numbers" (
  "id" TEXT NOT NULL,
  "provider" "TelephonyProvider" NOT NULL DEFAULT 'twilio',
  "e164Enc" TEXT NOT NULL,
  "e164Hash" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'DE',
  "status" TEXT NOT NULL DEFAULT 'available',
  "webhookConfigured" BOOLEAN NOT NULL DEFAULT false,
  "assignedTenantId" TEXT,
  "assignedPhoneNumberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "routing_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "routing_numbers_e164Hash_key" ON "routing_numbers"("e164Hash");
CREATE UNIQUE INDEX "routing_numbers_assignedPhoneNumberId_key" ON "routing_numbers"("assignedPhoneNumberId");
CREATE INDEX "routing_numbers_status_idx" ON "routing_numbers"("status");
