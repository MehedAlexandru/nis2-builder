-- Phase 1: user-scoped RLS path for organization discovery and audit reads,
-- plus the session's selected organization.
--
-- The runtime application role must be non-owner and NOBYPASSRLS. The
-- migration/seed role owns the schema. Application code sets both settings per
-- transaction:
--   SELECT set_config('app.user_id', '<user-uuid>', true);
--   SELECT set_config('app.organization_id', '<organization-uuid>', true);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "organizationId" text;
CREATE INDEX IF NOT EXISTS "sessions_organizationId_idx" ON sessions ("organizationId");

-- Replay prevention for TOTP: the last accepted time step per factor.
ALTER TABLE mfa_factors ADD COLUMN IF NOT EXISTS "lastUsedStep" integer;

-- audit_log is append-only. Foreign keys with ON DELETE SET NULL would run an
-- UPDATE on the trail (and hit the append-only trigger) when a user or
-- organization is deleted. Keep the identifiers as immutable references.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS "audit_log_actorUserId_fkey";
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS "audit_log_organizationId_fkey";

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;

-- A user can read their organizations before an organization is selected.
DROP POLICY IF EXISTS tenant_isolation ON organizations;
CREATE POLICY tenant_isolation ON organizations
  USING (
    id = app.current_organization_id()
    OR id IN (
      SELECT m."organizationId"
      FROM memberships m
      WHERE m."userId" = app.current_user_id()
    )
  )
  WITH CHECK (id = app.current_organization_id());

-- Own memberships are visible for organization discovery; writes still require
-- an explicit organization context.
DROP POLICY IF EXISTS tenant_isolation ON memberships;
CREATE POLICY tenant_isolation ON memberships
  USING (
    "userId" = app.current_user_id()
    OR "organizationId" = app.current_organization_id()
  )
  WITH CHECK ("organizationId" = app.current_organization_id());

-- A user can read audit entries they produced, in addition to tenant entries.
DROP POLICY IF EXISTS audit_log_tenant_read ON audit_log;
CREATE POLICY audit_log_tenant_read ON audit_log
  FOR SELECT
  USING (
    "organizationId" = app.current_organization_id()
    OR "actorUserId" = app.current_user_id()
  );

-- An invite can be looked up by its one-time token before the user has an
-- account or an organization context.
DROP POLICY IF EXISTS invite_token_lookup ON invites;
CREATE POLICY invite_token_lookup ON invites
  FOR SELECT
  USING ("tokenHash" = NULLIF(current_setting('app.invite_token_hash', true), ''));

COMMENT ON FUNCTION app.current_user_id() IS
  'Current authenticated user id, set per transaction by the API (Phase 1 user-scoped RLS path).';
