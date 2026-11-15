-- Phase 6: scanner-agent enrollment, job error reporting and scan diff state.

CREATE TYPE "DeviceScanState" AS ENUM ('UNCHANGED', 'NEW', 'CHANGED', 'MISSING');

ALTER TABLE "devices"
  ADD COLUMN "scanState" "DeviceScanState" NOT NULL DEFAULT 'UNCHANGED';

ALTER TABLE "agents"
  ADD COLUMN "enrollmentExpiresAt" TIMESTAMP(3),
  ADD COLUMN "enrolledAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3);

ALTER TABLE "scan_jobs"
  ADD COLUMN "errorMessage" TEXT;

-- An agent authenticates with an opaque token before its organization is known.
-- The API sets app.agent_token_hash for the lookup transaction; the normal
-- tenant_isolation policy still protects every request with tenant context.
DROP POLICY IF EXISTS agent_token_lookup ON "agents";
CREATE POLICY agent_token_lookup ON "agents"
  FOR SELECT
  USING ("tokenHash" = NULLIF(current_setting('app.agent_token_hash', true), ''));
