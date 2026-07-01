-- Per-tenant beta flag for realtime (ConversationRelay) conversations. Off by
-- default: existing tenants keep the classic turn-based flow unchanged.
ALTER TABLE "tenants" ADD COLUMN "realtimeEnabled" BOOLEAN NOT NULL DEFAULT false;
