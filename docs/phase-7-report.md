# Phase 7 report - findings, audit lifecycle and audit reports

> This tool supports compliance preparation and does not constitute legal advice. The Romanian
> templates remain `pending-legal-review`; confirm DNSC registration and reporting channels before
> submission.

## 1. Delivered

### Findings and remediation register

- Organization-scoped register with code (`F-0001`), title, description, NIS2 Art. 21 category,
  severity, likelihood, impact, risk score, affected devices, organization-wide scope, evidence,
  proposed solution, effort, cost estimate, owner, due date and status.
- Status workflow: `OPEN`, `IN_PROGRESS`, `MITIGATED`, `ACCEPTED_RISK`, `CLOSED`.
- Risk acceptance requires a justification and a named approver; the decision, approver and time are
  stored with the finding and shown in the report.
- Immutable `FindingHistory` entries record field changes, status transitions, manual notes and the
  actor who made the change.
- Affected-device links use the existing `finding_devices` table; organisation-wide findings cannot
  also target individual devices.
- Delete removes the linked risk-register entry and the finding history.

### Automatic suggestions

`packages/shared/src/schemas/findings.ts` maps every device risk code to a finding rule:

- endpoint protection missing/expired or licence expiring;
- OS end of life and overdue patching;
- no backup or backups never restore-tested;
- MFA missing for remote access;
- default credentials, internet exposure;
- logging disabled or not centralised;
- missing disk encryption.

The API recomputes risk codes from the current assessment, excludes suggestions already dismissed
for the audit/device/risk combination, and excludes risks already converted into `AUTO:<riskCode>`
findings. Dismissals are persisted in `finding_suggestion_decisions` with tenant RLS.

### Risk-register feed and dashboard

- Each finding creates or updates a `risk_register_entries` row with asset, threat, vulnerability,
  likelihood, impact, score, treatment and status.
- The dashboard shows open findings, severity counts and a direct link to the register.

### Audit lifecycle

- Closing an audit sets `closedAt`; reopening clears it. The UI exposes both actions.
- `GET /api/audits/:auditId/compare` compares:
  - device count, average completeness and devices with at least one risk;
  - findings opened, closed, carried and still open;
  - severity distribution and open risk score;
- Matching uses the finding code, falling back to a normalized title. Without an explicit
  `previousAuditId`, the latest earlier audit is selected.

### Audit report export

`POST /api/exports/audits/:auditId` queues a DOCX or PDF report. The worker loads the audit snapshot,
renders a network diagram from the saved zones/devices/connections with `sharp`, and builds:

- cover page, executive summary and scope/methodology;
- generated network diagram image;
- device inventory table and per-device information sheets;
- findings table sorted by severity and risk score with severity colour bands;
- NIS2 Art. 21 mapping with legal references;
- remediation roadmap split into quick wins, 30-60 days and 60-90 days;
- 5×5 risk heat map with finding counts;
- comparison with the previous audit;
- signature/appendices block, disclaimer and legal-review notice.

DOCX uses the existing professional Word styles, headings, tables, headers and footers. PDF uses the
existing PDFKit renderer and embedded DejaVu/Arial font selection.

### API

| Method | Path                                 | Purpose                              |
| ------ | ------------------------------------ | ------------------------------------ |
| GET    | `/api/findings`                      | List/filter findings and counts      |
| GET    | `/api/findings/:findingId`           | Finding detail with devices/history  |
| POST   | `/api/findings`                      | Create finding                       |
| PATCH  | `/api/findings/:findingId`           | Update fields/status/risk acceptance |
| DELETE | `/api/findings/:findingId`           | Delete finding and risk entry        |
| GET    | `/api/findings/suggestions?auditId=` | Current unconfirmed suggestions      |
| POST   | `/api/findings/suggestions/confirm`  | Convert suggestion into a finding    |
| POST   | `/api/findings/suggestions/dismiss`  | Persist a dismissal                  |
| GET    | `/api/audits/:auditId/compare`       | Audit trend comparison               |
| POST   | `/api/exports/audits/:auditId`       | Queue DOCX/PDF audit report          |

New actions: `FINDING_CREATED`, `FINDING_UPDATED`, `FINDING_DELETED`,
`FINDING_SUGGESTION_DISMISSED`. Audit updates and export jobs continue to use the existing audit and
export actions.

### UI

- `/findings` under **Compliance → Findings**:
  - counts for total/open/critical/high/overdue;
  - audit, status, severity and search filters;
  - automatic suggestion cards with Confirm/Dismiss;
  - sortable register table with detail, edit and delete;
  - create/edit modal with device multi-select, risk calculator inputs, owner, effort, cost, due
    date, evidence, proposed solution and risk-acceptance fields.
- `/network` now has Compare audits, Audit PDF, Audit DOCX and Close/Reopen audit actions, plus a
  comparison dialog.
- The device panel has **Add finding for this device**, which opens `/findings` with the audit and
  device preselected.
- Dashboard has a findings severity summary card.
- English and Romanian strings are present for the new screens and actions.

### Data and infrastructure

- Migration `0008_findings_phase7` creates `finding_suggestion_decisions`, its unique key, indexes,
  foreign keys and tenant RLS policy.
- `sharp` was added to the API for server-side SVG-to-PNG network diagram rendering.
- No new environment variables.

## 2. Verification

- `pnpm test` - **151 passing**: shared 106 (4 suggestion/comparison tests added), API 34 (2 audit
  report renderer tests added), web 11.
- API typecheck, web typecheck and lint pass.
- Audit report renderer tests validate DOCX ZIP structure, embedded media, finding text, heat map
  heading and PDF signature.
- Docker smoke against the demo tenant:
  - login and active organization;
  - suggestion list returned 9 items for the demo audit;
  - created `F-0001`, risk score 16, linked one device;
  - status change to `IN_PROGRESS` created history entries;
  - comparison returned current totals and zero previous audit;
  - confirmed an automatic suggestion (`F-0002`, default credentials);
  - queued audit report PDF, worker reached `READY`, download returned `%PDF-` (129 KB);
  - queued audit report DOCX, download returned `PK` (75 KB);
  - deleted the smoke findings, leaving zero findings in the demo audit.
- UI smoke (headless Chrome):
  - `/findings` rendered the heading, suggestions, register and navigation;
  - create dialog opened with the expected fields;
  - suggestion cards exposed Confirm/Dismiss;
  - `/network` exposed Compare audits, Audit PDF, Audit DOCX and Close/Reopen;
  - device panel showed **Add finding for this device**, linked to `/findings` and opened the create
    dialog with the device preselected;
  - no page errors.

## 3. Assumptions and decisions

- The register is the current remediation view; `auditId` links a finding to a dated snapshot but
  editing a closed audit is not hard-locked. Closing records a decision point and `closedAt`; a
  future phase can add immutable snapshots or a formal sign-off.
- Comparison matches findings by code, falling back to normalized title. This tolerates copies of
  findings into a new audit while still showing opened/closed/carried trends.
- Automatic suggestions are derived from the same `evaluateDeviceCompleteness` risk engine as the
  mapper, so UI badges and suggested findings cannot disagree.
- Dismissal is per audit/device/risk code. A newly introduced device or a changed risk code produces
  a fresh suggestion.
- Risk acceptance is stored as JSON on the finding because the approver may be an external person;
  approver user id is included when the current user accepts.
- The report diagram is generated from saved layout coordinates, not from a browser screenshot, so
  exports work in the headless worker.
- `sharp` renders the diagram server-side; PDF and DOCX share the same PNG, which keeps both outputs
  visually consistent.
- The audit report is a compliance inventory report, not a penetration test; the limitation text is
  included in the report.

## 4. Known gaps

- No dedicated risk-register UI yet; findings feed the underlying table and dashboard counts.
- No attachment upload for evidence; evidence is a text field pending the attachment/scanner work.
- Audit close does not yet make the map read-only or create an immutable copy.
- Comparison does not deep-diff individual field changes between audits.
- The report's remediation roadmap is heuristic (effort/severity), not a scheduling engine.
- No PDF visual-regression golden files or LibreOffice DOCX open test yet.
- No automated cross-tenant authorization tests for the new endpoints; tenant RLS and organization
  scoping are applied consistently, but the Phase 7 smoke is single-tenant.
- Automatic suggestion text is English server-side; the UI translates labels and categories.
- Legal review of Romanian template wording and DNSC channels remains outstanding.
