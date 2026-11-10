-- Defense in depth: PostgreSQL Row Level Security on every tenant-scoped table.
--
-- The application sets `app.organization_id` per transaction:
--   SET LOCAL app.organization_id = '<uuid>';
--
-- Runtime role model (Phase 1):
--   * migration/seed role: owns the schema, may bypass RLS;
--   * application role: non-owner, subject to FORCE RLS, minimal grants.
-- This migration creates the policies. Role separation is introduced in Phase 1
-- together with the Prisma tenant-context extension.

CREATE SCHEMA IF NOT EXISTS app;

-- IDs are UUID v7 values stored as text (Prisma's default String mapping).
-- The function therefore returns text so policies can use existing indexes
-- without a per-row cast.
CREATE OR REPLACE FUNCTION app.current_organization_id() RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')
$$;

-- Tenant-scoped tables that carry "organizationId".
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'memberships',
    'invites',
    'company_profiles',
    'classification_runs',
    'documents',
    'document_revisions',
    'document_versions',
    'approvals',
    'attachments',
    'audits',
    'agents',
    'scan_jobs',
    'zones',
    'devices',
    'device_assessments',
    'connections',
    'findings',
    'finding_devices',
    'finding_history',
    'risk_register_entries',
    'suppliers',
    'training_records',
    'notifications',
    'export_jobs'
  ]::text[]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', target_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organizationId" = app.current_organization_id()) WITH CHECK ("organizationId" = app.current_organization_id())',
      target_table
    );
  END LOOP;
END;
$$;

-- Organizations are matched on their own primary key.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON organizations;
CREATE POLICY tenant_isolation ON organizations
  USING (id = app.current_organization_id())
  WITH CHECK (id = app.current_organization_id());

-- The audit log is readable by its own tenant and append-only.
-- Phase 1 adds a user-scoped policy for organization discovery at login.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant_read ON audit_log;
CREATE POLICY audit_log_tenant_read ON audit_log
  FOR SELECT
  USING ("organizationId" = app.current_organization_id());
DROP POLICY IF EXISTS audit_log_append ON audit_log;
CREATE POLICY audit_log_append ON audit_log
  FOR INSERT
  WITH CHECK ("organizationId" IS NULL OR "organizationId" = app.current_organization_id());

CREATE OR REPLACE FUNCTION app.reject_audit_log_mutation() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION app.reject_audit_log_mutation();

COMMENT ON TABLE audit_log IS
  'Append-only security audit trail. UPDATE/DELETE are rejected by trigger and grants.';
