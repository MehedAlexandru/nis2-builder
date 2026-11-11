-- Phase 4: single-entity reference for document exports.

ALTER TABLE "export_jobs" ADD COLUMN "entityId" TEXT;
