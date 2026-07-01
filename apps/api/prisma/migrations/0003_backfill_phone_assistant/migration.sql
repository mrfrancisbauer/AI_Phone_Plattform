-- Data migration (no schema change): bind existing phone numbers that have no
-- assistant to their tenant's SOLE assistant, so inbound routing works.
--
-- Numbers belonging to tenants with zero or multiple assistants are left
-- unchanged (the dashboard surfaces them as "Kein Assistent zugeordnet" and
-- offers a reassign action). No data is deleted.
UPDATE "phone_numbers" pn
SET "assistantId" = (
  SELECT a."id" FROM "assistants" a WHERE a."tenantId" = pn."tenantId"
)
WHERE pn."assistantId" IS NULL
  AND (SELECT COUNT(*) FROM "assistants" a WHERE a."tenantId" = pn."tenantId") = 1;
