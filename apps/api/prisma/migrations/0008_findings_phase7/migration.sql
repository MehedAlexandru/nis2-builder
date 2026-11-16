-- Phase 7: persist dismissed auto-suggested findings so they do not reappear
-- on every audit refresh. Confirmed suggestions become normal findings with
-- source = 'AUTO:<riskCode>'.

CREATE TABLE "finding_suggestion_decisions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "riskCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISMISSED',
  "decidedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finding_suggestion_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finding_suggestion_decisions_auditId_deviceId_riskCode_key"
  ON "finding_suggestion_decisions"("auditId", "deviceId", "riskCode");
CREATE INDEX "finding_suggestion_decisions_organizationId_auditId_idx"
  ON "finding_suggestion_decisions"("organizationId", "auditId");

ALTER TABLE "finding_suggestion_decisions"
  ADD CONSTRAINT "finding_suggestion_decisions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finding_suggestion_decisions"
  ADD CONSTRAINT "finding_suggestion_decisions_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finding_suggestion_decisions"
  ADD CONSTRAINT "finding_suggestion_decisions_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finding_suggestion_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finding_suggestion_decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "finding_suggestion_decisions"
  USING ("organizationId" = app.current_organization_id())
  WITH CHECK ("organizationId" = app.current_organization_id());
