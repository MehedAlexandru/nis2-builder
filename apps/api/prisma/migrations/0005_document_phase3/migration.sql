-- Phase 3: document ownership, pinned template versions and version authors.

ALTER TABLE "document_templates"
  DROP CONSTRAINT IF EXISTS "document_templates_key_key";

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_key_version_key" UNIQUE ("key", "version");

CREATE INDEX "document_templates_key_isActive_idx" ON "document_templates"("key", "isActive");

ALTER TABLE "documents"
  ADD COLUMN "templateVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "document_revisions"
  ADD COLUMN "templateVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "document_versions"
  ADD COLUMN "createdById" TEXT;

CREATE INDEX "documents_ownerUserId_idx" ON "documents"("ownerUserId");

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_revisions"
  ADD CONSTRAINT "document_revisions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
