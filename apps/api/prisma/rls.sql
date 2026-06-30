-- Optional defense-in-depth: PostgreSQL Row-Level Security.
--
-- The application already filters every query by the authenticated tenantId.
-- When deployed on Supabase (or any Postgres where you connect with a role
-- that sets `app.tenant_id`), these policies add a second, database-enforced
-- layer so a query can never read across tenants even if application code has
-- a bug.
--
-- Usage: the API sets the tenant context per transaction with
--   SELECT set_config('app.tenant_id', $1, true);
-- and connects as a non-superuser role. Run this file once after migrations.

-- Helper: current tenant from session config (NULL when unset).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'phone_numbers','assistants','questionnaires','questionnaire_questions',
    'calls','call_messages','call_answers','call_summaries','usage_events',
    'invoices','email_recipients','email_logs','audit_logs',
    'data_retention_settings','tenant_users'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_tenant_id())
        WITH CHECK ("tenantId" = current_tenant_id());
    $f$, t);
  END LOOP;
END $$;
