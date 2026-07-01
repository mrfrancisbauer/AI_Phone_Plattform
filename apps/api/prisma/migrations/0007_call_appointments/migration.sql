-- Records the calendar-booking outcome for each call (detected / booked /
-- conflict / failed), so the call protocol and dashboard can show what happened.
CREATE TABLE "call_appointments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "provider" TEXT,
  "calendarId" TEXT,
  "status" TEXT NOT NULL,
  "startAt" TIMESTAMP(3),
  "eventId" TEXT,
  "htmlLink" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "call_appointments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_appointments_callId_key" ON "call_appointments"("callId");
CREATE INDEX "call_appointments_tenantId_idx" ON "call_appointments"("tenantId");
CREATE INDEX "call_appointments_tenantId_createdAt_idx" ON "call_appointments"("tenantId", "createdAt");

ALTER TABLE "call_appointments"
  ADD CONSTRAINT "call_appointments_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
