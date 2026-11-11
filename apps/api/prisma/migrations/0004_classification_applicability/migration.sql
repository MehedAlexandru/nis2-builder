-- Phase 2: classification result applicability drives the Phase 3 document
-- catalogue (which documents are required and their priority). Stored as a
-- snapshot on the immutable run so later pack changes do not rewrite history.
ALTER TABLE "classification_runs" ADD COLUMN IF NOT EXISTS "applicability" JSONB;
ALTER TABLE "classification_runs" ADD COLUMN IF NOT EXISTS "ruleId" TEXT;
ALTER TABLE "classification_runs" ADD COLUMN IF NOT EXISTS "reasonKey" TEXT;
