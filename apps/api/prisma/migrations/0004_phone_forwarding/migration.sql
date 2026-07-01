-- "Keep your number" forwarding model (additive, non-destructive).
--
-- A phone number now distinguishes the ROUTING DID (the platform-owned number
-- an inbound call lands on, already stored in e164Enc/e164Hash) from the
-- customer's OWN business number they keep and forward from. The latter is
-- pure display metadata and is stored encrypted like other PII.
--
-- forwardingStatus tracks the "keep your number" lifecycle: it starts at
-- 'pending' and the inbound webhook flips it to 'active' the first time a call
-- is actually received on the DID. Existing numbers are already reachable, so
-- they are backfilled to 'active'.
ALTER TABLE "phone_numbers" ADD COLUMN "displayNumberEnc" TEXT;
ALTER TABLE "phone_numbers" ADD COLUMN "forwardingStatus" TEXT NOT NULL DEFAULT 'pending';

-- Numbers that already exist were provisioned before the forwarding model and
-- are known to work, so mark them verified.
UPDATE "phone_numbers" SET "forwardingStatus" = 'active';
