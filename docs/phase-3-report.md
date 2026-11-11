# Phase 3 report - documentation centre and template engine

> This tool supports compliance preparation and does not constitute legal advice. The Romanian
> templates are `pending-legal-review`; confirm DNSC registration and reporting channels before use.

## 1. Delivered

### Data-driven template catalogue

- 24 bilingual templates in `packages/shared/src/data/document-templates/catalog.ts`, validated at
  import time by `documentTemplateCatalogSchema`.
- Coverage: governance/registration, management approval/training, information security policy,
  risk register, asset inventory, incident response, incident reporting (24h/72h/1 month),
  business continuity, supply chain, secure development, effectiveness/audit, awareness training,
  cryptography, HR, MFA/secure communications, patch/change, network segmentation, logging,
  statement of applicability, access control, vulnerability management, physical security, backup
  and management reporting.
- Every field carries bilingual labels/help/examples, required flag, weight (1-5), optional
  validation, conditional visibility, prefill key and export mapping.
- Template keys align with the Phase 2 classification document snapshot; new supporting templates
  appear as optional until a classification rule references them.

### Progress and validation engine

`packages/shared/src/documents/progress.ts` provides:

- weighted completion across visible fields and sections;
- per-field validation for text length, patterns, options, tables, checklists, risk matrices and
  signatures;
- conditional fields excluded from the denominator when not applicable;
- required-field counters and section percentages;
- payload diff by field and company-profile prefill via stable `prefillKey` paths.

### Documentation centre

- Overall progress ring, required/complete counts and classification badge.
- Search plus status and category filters.
- Cards show title, description, legal reference, status, weighted progress, last edit/author,
  version, next review, overdue flag, owner role, lock state and required/optional state.
- DOCX/PDF buttons are present but disabled until Phase 4, as planned.

### Form engine

- Rendered entirely from the template definition: text, rich text, select, multi-select, date,
  datetime, table/repeater, people picker, checklist, yes/no, risk matrix, signature and attachment
  placeholder.
- Autosave after 2.5 seconds, manual save, `beforeunload` guard, live section progress and
  "what auditors look for" guidance.
- Validation errors are shown inline; partial documents can be saved and resumed.
- Company profile values (legal name, registration number, VAT, address, DPO/CISO) prefill new
  documents.
- Attachment upload is deliberately deferred to Phase 4 (storage + malware scanning).

### Revisions, history, restore, versions and approvals

- Every changed save creates an immutable `document_revisions` row with revision number, pinned
  template version, payload, changed field keys, change note and author.
- History timeline supports selecting any two revisions for a side-by-side field diff.
- Restore creates a new revision from the selected payload and never deletes history.
- Named versions pin the current revision; approval records the approver, role, comment, signature
  JSON and timestamp; approving a version supersedes the previous approved version.
- Optimistic concurrency: saves carry `expectedRevisionNo`; a stale save returns
  `409 DOCUMENT_CONFLICT` with the current revision.
- Edit locks: 10-minute `lockOwnerId`/`lockExpiresAt`; a second editor gets `409 DOCUMENT_LOCKED`
  and a read-only view.

### API

| Method | Path                                               | Purpose                                |
| ------ | -------------------------------------------------- | -------------------------------------- |
| GET    | `/api/documents`                                   | Catalogue, cards, overall progress     |
| POST   | `/api/documents`                                   | Open or lazily create by `templateKey` |
| GET    | `/api/documents/:id`                               | Full document, template and history    |
| PATCH  | `/api/documents/:id`                               | Autosave/manual save, new revision     |
| POST   | `/api/documents/:id/lock`                          | Acquire edit lock                      |
| DELETE | `/api/documents/:id/lock`                          | Release edit lock                      |
| GET    | `/api/documents/:id/revisions`                     | Revision summaries                     |
| GET    | `/api/documents/:id/revisions/:revisionNo`         | Revision payload                       |
| POST   | `/api/documents/:id/revisions/:revisionNo/restore` | Restore as a new revision              |
| GET    | `/api/documents/:id/versions`                      | Named versions and approvals           |
| POST   | `/api/documents/:id/versions`                      | Publish a named version                |
| POST   | `/api/documents/:id/versions/:versionId/approve`   | Approve a version                      |

Audit actions: `DOCUMENT_CREATED`, `DOCUMENT_SAVED`, `DOCUMENT_RESTORED`,
`DOCUMENT_VERSION_PUBLISHED` and `DOCUMENT_VERSION_APPROVED`.

### Data model

Migration `0005_document_phase3` adds:

- `documents.ownerUserId` and `documents.templateVersion`;
- `document_revisions.templateVersion`;
- `document_versions.createdById`;
- foreign keys to `users` and a composite unique `(key, version)` on `document_templates`.

All tenant-scoped document reads and writes run in `TenantPrismaService.runInTenant`, so the
PostgreSQL RLS context is set even for list/detail/history queries. Payloads with field keys that do
not belong to the pinned template are rejected with `DOCUMENT_PAYLOAD_INVALID`; payloads over
256 KB are rejected.

## 2. Verification

- `pnpm lint` - 3/3 packages.
- `pnpm typecheck` - 4/4 tasks.
- `pnpm test` - 131 passing: shared 96 (including 11 document tests), API 24, web 11.
- `pnpm build` - web, API and shared.
- `pnpm openapi:generate` - `/documents` endpoints published in `docs/openapi/openapi.json`.
- Migration `0005_document_phase3` applied; seed upserts 24 templates and two demo documents.
- Docker smoke flow:
  - catalogue returned 24 templates, 17 required for the demo `IMPORTANT` classification;
  - opened the risk document, saved a complete payload (100%, `COMPLETE`, revision 2);
  - listed revisions, restored revision 1 (new revision 3, history preserved);
  - published version `1.0`, approved it with a role/comment (approval attached);
  - acquired and released the edit lock;
  - invalid CSRF-less writes rejected; authenticated reads and writes scoped to the active tenant.

## 3. Assumptions and decisions

- Templates live in a TypeScript catalogue for type safety, but are serialized to JSONB and
  rendered/exported from the stored JSON definition. The UI never hand-codes a document form.
- One active template version per key; older versions remain in `document_templates` for pinned
  revisions. `Document.templateVersion` flags documents that need review after a template bump.
- Lifecycle status is derived: overdue review or template change = `NEEDS_REVIEW`; 100% =
  `COMPLETE`; partial = `IN_PROGRESS`; empty = `NOT_STARTED`.
- Attachments are represented in the schema but upload/storage/scanning is deferred to Phase 4.
- Company-profile editing UI is not part of Phase 3; existing profile data is reused. A later
  phase should expose profile management and propagate deliberate updates.
- Assets and suppliers will become single-source entities in Phase 5; the register tables are
  ready to display/export that data.

## 4. Known gaps

- Romanian template wording and legal references still need qualified legal review.
- DOCX/PDF export, ZIP export and the compliance summary are Phase 4.
- Attachment upload, malware scanning and encrypted S3 storage are Phase 4.
- No Playwright E2E test yet; the form renderer has component tests and the API flow was smoke
  tested against Docker.
- Admin cross-tenant document drill-down is Phase 8.
- Review-due email/in-app reminders are Phase 7; cards already expose the overdue state.
