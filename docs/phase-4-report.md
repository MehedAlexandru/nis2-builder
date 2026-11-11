# Phase 4 report - professional exports and compliance summary

> This tool supports compliance preparation and does not constitute legal advice. Romanian
> template wording remains pending qualified legal review.

## 1. Delivered

### Queued export pipeline

- BullMQ job creation from the API; the worker loads the job, renders it, uploads it to S3-compatible
  storage and updates the job to `READY` or `FAILED`.
- Tenant-scoped export jobs with `entityId`, `entityType`, locale/format metadata, requester,
  status, storage key, error message and timestamps.
- Authenticated download endpoint streams the generated file from private storage; no public bucket
  or long-lived signed URL is exposed.
- Recent export history in the documentation centre with retry/download for completed jobs.
- Actions: one document as DOCX or PDF, compliance summary as DOCX or PDF, and all documents as ZIP.

### Canonical content model

`apps/api/src/modules/exports/export-model.ts` converts a template, payload, revision history,
versions, approvals, profile and logo into one renderer-neutral `ExportDocumentModel`. Both
renderers consume the same model, so a new form field type is implemented once.

The model includes:

- company identity, optional logo, document ID, version, classification, approval status and dates;
- visible sections and typed fields: text, rich text, selects, multi-select, dates, yes/no, tables,
  checklists, risk matrices, signatures and attachment notes;
- legal reference, disclaimer, legal-review warning;
- revision history rows and approval/signature rows.

### DOCX renderer

- Real Word styles: Heading 1-3, normal text, page size and margins.
- Cover page with logo, company, title, document ID, version, classification, approval and legal
  reference.
- Automatic table of contents field, headers/footers with page numbers and document ID.
- Styled tables with primary-600 header row, white text, primary-50 zebra rows and borders.
- Risk heat map, callout boxes, revision history table and approval/signature block.
- Compliance summary cover, overview, per-document progress table and outstanding-items list.

### PDF renderer

- PDFKit-based A4 renderer with embedded DejaVu/Arial font selection for Romanian diacritics.
- Cover page, manually generated table of contents with page numbers, section headings, styled
  tables, checklists, risk heat map, revision history and approval block.
- Headers/footers with page numbers and document identifier.
- Compliance summary PDF with overview, progress table and outstanding items.

### ZIP and summary

- ZIP contains DOCX and PDF for every active template (draft documents are included for templates
  that have not been opened), plus `compliance-summary.docx`, `compliance-summary.pdf` and
  `README.txt`.
- Compliance summary includes classification result, sector/size, pack version, overall progress,
  required/complete counts, per-document status and outstanding required fields.

### Branding upload

- Organization owners can upload a PNG or JPEG logo up to 2 MB.
- The API validates declared MIME type against magic bytes, stores the object privately and records
  `ORGANIZATION_LOGO_UPDATED`.
- The logo is displayed in the documentation centre, prefilled into cover pages and included in
  DOCX/PDF exports.

### API

| Method | Path                                 | Purpose                          |
| ------ | ------------------------------------ | -------------------------------- |
| GET    | `/api/exports`                       | Recent export jobs               |
| POST   | `/api/exports/documents/:documentId` | Queue DOCX or PDF for a document |
| POST   | `/api/exports/compliance-summary`    | Queue DOCX or PDF summary        |
| POST   | `/api/exports/all`                   | Queue ZIP bundle                 |
| GET    | `/api/exports/:jobId`                | Poll job status                  |
| GET    | `/api/exports/:jobId/download`       | Authenticated file download      |
| POST   | `/api/organizations/:id/logo`        | Upload branding logo             |
| GET    | `/api/organizations/:id/logo`        | Read branding logo               |

New audit actions: `EXPORT_REQUESTED`, `EXPORT_READY`, `EXPORT_FAILED`,
`ORGANIZATION_LOGO_UPDATED`.

### Data and infrastructure

- Migration `0006_export_entity_id` adds `export_jobs.entityId`.
- Worker Compose environment now includes S3 endpoint/bucket/credentials.
- API and worker images install `font-dejavu` for reliable Romanian PDF rendering.
- New dependencies: `docx`, `@aws-sdk/client-s3`, `jszip`.

## 2. Verification

- `pnpm lint` - 3/3 packages.
- `pnpm typecheck` - 4/4 tasks.
- `pnpm test` - **134 passing**: shared 96, API 27 (including DOCX/PDF renderer tests), web 11.
- `pnpm build` - web, API and shared.
- `pnpm openapi:generate` - export and logo endpoints published.
- Migration `0006_export_entity_id` applied.
- Docker smoke:
  - risk document DOCX: 14,363 bytes, ZIP/OOXML signature;
  - risk document PDF: 36,490 bytes, `%PDF-`;
  - compliance summary PDF: 32,956 bytes;
  - ZIP bundle: 986,212 bytes containing 24 documents in DOCX and PDF plus both summary formats
    and `README.txt`;
  - DOCX XML contains the title, risk table and revision history; `word/styles.xml` contains the
    Heading 1 style;
  - logo PNG uploaded and returned byte-for-byte; DOCX export contained one embedded image;
  - export job statuses moved from `QUEUED` to `READY` and downloads succeeded.

## 3. Assumptions and decisions

- PDF uses PDFKit with the same canonical model as DOCX. This keeps the image deterministic and
  avoids a Chromium sidecar; a headless-Chromium renderer can be added later behind the same model.
- Fonts: DejaVu is installed in Docker; Windows/macOS fall back to Arial. If no Unicode font is
  found, PDFKit falls back to Helvetica.
- DOCX contains a real TOC field; Word/LibreOffice may prompt to update fields on open. The PDF TOC
  is generated with final page numbers.
- ZIP includes draft documents for all active templates so the bundle is complete for handover.
- Exports are private S3 objects served only through authenticated API streams. Retention/cleanup
  policy is a later operational task.
- Attachment upload remains disabled; attachment fields show a platform-reference note in exports.

## 4. Known gaps

- No automated LibreOffice-headless or PDF visual-regression test yet; renderer tests verify valid
  packages, styles, embedded content and signatures.
- No export retention/cleanup job yet.
- Legal review of Romanian template wording and DNSC channels remains outstanding.
- Attachment upload, malware scanning and attachment export are still later work.
- Admin cross-tenant export drill-down remains Phase 8.
