# MASTER PROMPT: NIS2 Compliance Assistant Web Application

## 0. ROLE AND WORKING METHOD

You are a senior full-stack engineer and DevSecOps architect with 15+ years of experience, and a practitioner of EU cybersecurity regulation (NIS2 Directive 2022/2555, ISO 27001, and national transpositions). You are building a production-grade SaaS web application called **NIS2 Compass** (working name).

How you must work:
1. **Before writing code**, produce: (a) the architecture, (b) data model (ERD), (c) API contract (OpenAPI), (d) folder structure, (e) the phased delivery plan in section 14. Wait for my approval of the plan, then implement phase by phase.
2. **Work in small, verifiable increments.** After each phase: runnable code, tests passing, README updated, a git commit following Conventional Commits.
3. **If you find a gap, ambiguity or contradiction in this spec, do not silently guess.** List it under "Assumptions and Decisions" with your chosen solution and the reason. Section 13 already lists gaps I identified. Add any others you find.
4. Never invent legal content. Legal references must point to the actual article/annex of NIS2 or the national law. Include a visible disclaimer: *"This tool supports compliance preparation and does not constitute legal advice."*
5. Default language of the UI: **English and Romanian** (i18n from day one, `ro` and `en`). Default jurisdiction pack: **Romania** (OUG 155/2024 transposing NIS2, authority DNSC). The jurisdiction layer must be pluggable so other EU member states can be added as data, not code.

---

## 1. PRODUCT GOAL

Help organizations (primarily SMEs) to:
1. **Determine whether NIS2 applies to them and what type of entity they are** (Essential, Important, or Out of scope).
2. **Build the mandatory documentation** through guided forms, with versioning and professional exports (DOCX and PDF).
3. **Perform an IT security audit** with a network map, per-device security data, a findings/remediation register and an exportable audit report.
4. **Track compliance progress**, with an administrator overview across all customers.

---

## 2. TECH STACK (fixed unless you justify a change)

- **Frontend:** React 18 + TypeScript + Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind CSS (palette in section 3), shadcn/ui or Radix primitives, **React Flow** for the network canvas, Recharts for admin graphs, react-i18next.
- **Backend:** Node.js 20 + TypeScript, **NestJS** (or Fastify if justified), Zod/class-validator validation, OpenAPI generated automatically.
- **Database:** PostgreSQL 16 with Prisma or TypeORM migrations. Use JSONB for form payloads, with JSON Schema validation per document template.
- **Cache / queues:** Redis (rate limiting, session blacklist, export job queue via BullMQ).
- **File storage:** S3-compatible (MinIO in dev, any S3 in prod) for generated exports and attachments.
- **Document generation:** `docx` (npm) for DOCX; HTML to PDF with Playwright/Chromium (or WeasyPrint as a sidecar) for PDF. Both must come from the **same template definition** so the look is identical.
- **Network scanner:** separate **Scanner Agent** (see section 7), written in Go or Python, shipped as a small Docker image and as a static binary.
- **Testing:** Vitest/Jest (unit), Supertest (API), Playwright (E2E), k6 (basic load test).
- **Quality:** ESLint, Prettier, Husky + lint-staged, commitlint, strict TypeScript.

---

## 3. DESIGN SYSTEM (color palette based on `hsl(206, 100%, 32%)`)

Base primary: `hsl(206, 100%, 32%)` (a strong corporate blue). Generate the full scale as CSS variables (light and dark mode), keeping hue 206 and WCAG AA contrast:

| Token | Value |
|---|---|
| `--primary-50` | hsl(206, 100%, 96%) |
| `--primary-100` | hsl(206, 100%, 90%) |
| `--primary-300` | hsl(206, 95%, 66%) |
| `--primary-500` | hsl(206, 100%, 42%) |
| `--primary-600` (base) | **hsl(206, 100%, 32%)** |
| `--primary-700` | hsl(206, 100%, 25%) |
| `--primary-900` | hsl(206, 100%, 14%) |

Complementary semantic colors (derive harmonically): success (green ~hsl(152, 60%, 35%)), warning (amber ~hsl(38, 95%, 48%)), danger (red ~hsl(355, 75%, 48%)), accent (teal ~hsl(176, 70%, 36%)), neutral grays tinted with hue 206 and low saturation.

Rules: progress bars use a gradient from warning, through primary, to success depending on percentage; severity badges (Low/Medium/High/Critical) use fixed semantic colors; full dark mode; keyboard accessible; WCAG 2.2 AA; responsive (desktop first, usable on tablet).
The **same palette** must be used in DOCX/PDF exports (table headers in primary-600 with white text, zebra rows in primary-50, highlight boxes in warning/danger tints).

---

## 4. AUTHENTICATION, AUTHORIZATION AND TENANCY

### 4.1 Roles
- **USER**: sees and edits only the data of their own organization.
- **ADMIN**: platform administrator, with a dashboard across all users/organizations and read access (and edit where specified) to all their data.

### 4.2 Data model rule (gap fix)
A user belongs to an **Organization** (tenant). All business data is scoped by `organization_id`. This allows several colleagues of the same company to collaborate, and prevents data being lost when one employee leaves. Within an organization: the first user is the **owner**; the owner may invite colleagues (still role USER). Enforce tenant isolation at the query layer **and** with PostgreSQL Row Level Security as defense in depth.

### 4.3 Auth requirements
- Registration with email verification; password reset by one-time token (expiring, single use).
- Passwords hashed with **Argon2id**; minimum length 12; check against a breached-password list (k-anonymity HIBP API or offline list); no composition-rule theatre.
- **MFA (TOTP)** with recovery codes: optional for USER (strongly encouraged in UI), **mandatory for ADMIN**. WebAuthn/passkeys as stretch goal.
- Short-lived access token (10-15 min) + rotating refresh token in `HttpOnly; Secure; SameSite=Strict` cookie; refresh token reuse detection (revoke the whole family).
- CSRF protection, strict CORS, rate limiting per IP and per account, progressive lockout, generic error messages (no user enumeration).
- Session management page: list and revoke active sessions.
- **Audit log** (append-only): logins, failed logins, role changes, document edits/exports, **every ADMIN access to another organization's data** (this is also a GDPR requirement). Visible to the organization owner for their own data and to ADMIN globally.
- First ADMIN created by a one-time CLI seed command, never through the public UI. Admin cannot be created or promoted by a USER under any circumstance.
- Account deletion and **data export/erasure** (GDPR Art. 15, 17, 20).
- Security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors none), dependency scanning, secrets never in the repo.

---

## 5. MODULE A: ENTITY CLASSIFICATION WIZARD

A guided questionnaire (stepper) that outputs a **classification result with the reasoning shown** and a PDF summary. It must implement NIS2 logic faithfully and be driven by data (JSON rules), not hardcoded.

### 5.1 Inputs
1. Country/countries of establishment (EU member states; jurisdiction pack).
2. Sector and sub-sector from **Annex I (sectors of high criticality)**: energy, transport, banking, financial market infrastructure, health, drinking water, waste water, digital infrastructure, ICT service management (B2B), public administration, space.
   and **Annex II (other critical sectors)**: postal and courier, waste management, chemicals, food, manufacturing (medical devices, electronics, machinery, vehicles, etc.), digital providers (marketplaces, search engines, social networks), research.
3. Specific entity type within the sector (e.g. DNS service provider, cloud provider, data centre, managed service provider, etc.).
4. Size: number of employees, annual turnover, annual balance sheet total, **with the EU SME Recommendation 2003/361 rules for partner/linked enterprises** (guide the user through it; do not just take raw numbers).
5. Size-independent criteria: sole provider in a member state, significant societal/public-safety impact, cross-border relevance, critical-entity status, public administration level, etc.

### 5.2 Outputs
- **Essential entity**, **Important entity**, or **Out of scope** (with the possibility "likely in scope, confirm with authority/lawyer" when ambiguous).
- The exact legal basis (article/annex lines) behind the decision.
- Consequence summary: supervision regime (ex-ante vs ex-post), fine ceilings (essential: up to EUR 10M or 2% of worldwide turnover; important: up to EUR 7M or 1.4%), management liability, registration duties and deadlines in the selected jurisdiction.
- Result is stored, versioned and can be re-run (company data changes). Changing the classification updates which documents are "required" and their priority.

---

## 6. MODULE B: DOCUMENTATION CENTER

### 6.1 Documentation page
A grid of **cards**, one per required document. Each card shows: title, short description, NIS2 reference (e.g. "Art. 21(2)(a)"), status (Not started / In progress / Complete / Needs review), **progress bar** (% of required fields completed, weighted by field importance), last edited date and author, current version number, and a **Download** button (DOCX / PDF choice). Filter by status and by requirement category; search; overall progress ring at the top.

### 6.2 Document catalogue (minimum; each must be a data-driven template)
Governance and registration
1. Entity registration data for the national authority (DNSC in Romania), contact points, and the list of services
2. Management body approval and accountability record (Art. 20) and **management training log**
3. Information Security Policy (top-level), scope, objectives, roles and responsibilities (RACI)

Art. 21(2) risk-management measures (one document per measure, at least):
4. Risk analysis methodology and **risk register** (assets, threats, likelihood, impact, treatment)
5. Asset inventory policy and register
6. Incident handling plan and procedures (detection, triage, classification, escalation, lessons learned)
7. **Incident reporting procedure** (Art. 23: early warning within 24h, incident notification within 72h, final report within 1 month, plus intermediate reports) with ready-to-use report templates and a contact tree
8. Business continuity, backup management, disaster recovery and crisis management plan (RTO/RPO per service)
9. Supply chain security policy and supplier register with risk rating (Art. 21(2)(d), Art. 22)
10. Secure acquisition, development and maintenance + vulnerability handling and disclosure policy
11. Policies and procedures to assess the **effectiveness** of cybersecurity measures (KPIs, audit schedule, review cycle)
12. Cyber hygiene and security awareness training programme and attendance log
13. Cryptography and encryption policy
14. Human resources security, access control and asset management policy (joiners/movers/leavers, least privilege, privileged access)
15. MFA / secure authentication and secured communications (voice, video, text, emergency comms) policy
16. Patch and change management policy
17. Network security and segmentation policy
18. Logging and monitoring policy
19. Statement of Applicability / measure-to-control mapping table (optional ISO 27001 Annex A and CIS Controls mapping)

You may propose additional documents. For each, store: id, title, legal reference, applicability condition (essential/important/both), owner role, review frequency.

### 6.3 Form engine (key architecture decision)
Do **not** hand-code 19 forms. Build a **template engine**:
- Each document is a JSON definition: sections, fields (text, rich text, select, multi-select, date, table/repeater rows, people picker, checklist, file attachment, yes/no with conditional follow-ups), validation, help text, example answers, field weight, and the mapping to the export layout.
- The form UI is rendered from the definition (stepper or accordion, autosave every few seconds, unsaved-changes guard, per-field validation, inline guidance "what auditors look for").
- **Smart defaults and reuse:** data entered once (company name, contacts, DPO/CISO, assets, suppliers) is a shared "company profile" and pre-fills all documents. Suppliers and assets entered in the audit module appear in the asset inventory and supplier register (single source of truth, no duplicate entry).
- Optional AI-assist button ("suggest text") that drafts a section from the company profile; clearly labeled as a draft; disabled by default and configurable per deployment; no customer data sent to third parties without explicit opt-in.

### 6.4 Editing, versioning and history
- Every save creates an immutable **revision** (who, when, changed fields, optional change note). Named **versions** (v1.0, v1.1) can be "published/approved" by the user; approved versions show an approval block (approver, date, signature field) in the export.
- History view: timeline, **side-by-side diff** of any two revisions, restore a previous revision (creates a new revision, never deletes history).
- Document lifecycle fields: owner, classification (Public/Internal/Confidential), **next review date** with reminders (email + in-app) and an "overdue review" status on the card.
- Optimistic concurrency / edit locking so two colleagues do not overwrite each other.

### 6.5 Professional export (DOCX and PDF)
Generated server-side from the template definition, queued as a job, downloadable when ready. Both formats must include: cover page (logo upload, company name, document title, version, date, classification, approval status), automatic table of contents, headers/footers with page numbers and document ID, colored section headings in the palette, **styled tables** (primary-600 header row, zebra rows, borders), highlighted callout boxes (info/warning/critical), RACI and risk matrices with color-coded cells (heat map), revision history table at the end, legal references column, and a signature/approval block. Also: "Export all documents" as a ZIP and a **compliance summary report** (classification result, per-document progress, outstanding items). The DOCX must open cleanly in Word and LibreOffice with real styles (Heading 1-3, table styles), not flattened text.

---

## 7. MODULE C: SECURITY AUDIT AND NETWORK MAPPER

### 7.1 Critical architecture decision (gap fix)
A web app running in Kubernetes or a cloud **cannot scan a customer's local network**, and a browser cannot do ARP/ICMP scanning either. Therefore implement a **Scanner Agent**:
- A small program/container the user runs **inside the target network** (Docker image with `--network host` and `NET_RAW`/`NET_ADMIN` capability, or a static binary for Windows/Linux/macOS).
- It is paired with an organization through a **one-time enrollment token** shown in the UI; communication is outbound HTTPS only (agent pushes results; no inbound ports opened on the customer side), with mTLS or signed tokens, and results uploaded as JSON.
- Discovery methods, in this order: ARP sweep on the local L2 segment (gives IP + MAC), ICMP/TCP ping for other subnets, reverse DNS, mDNS/NetBIOS/SNMP (v2c/v3 only if the user supplies credentials) for names, **MAC OUI lookup** for vendor, optional light port/service fingerprint (top 100 ports) and OS guess. Be explicit that **MAC addresses are only visible on the same L2 segment**; devices behind a router show the router's MAC or none.
- Scanning is **opt-in, rate-limited, non-intrusive by default**, with a consent checkbox: "I confirm I am authorized to scan this network." Log every scan in the audit log.
- **Fallbacks** so the feature works without the agent: import **Nmap XML**, CSV import (template provided), and manual add.
- The scanner must **never** run vulnerability exploitation. Discovery and inventory only.

### 7.2 Network canvas
- Built with React Flow: devices as nodes with type-specific icons (router, switch, firewall, server, workstation, laptop, printer, IP camera/NVR, NAS, access point, phone, IoT, cloud service, unknown), name, IP and MAC beneath.
- **Drag and drop** to reposition; draw **connections** between devices by dragging from handle to handle; edge properties (wired/wireless/VPN, speed, VLAN); delete/undo/redo; zoom, pan, minimap, snap-to-grid, auto-layout button, **grouping/zones** (LAN, DMZ, Guest, Server VLAN, Cloud) shown as colored containers.
- Add devices manually from a palette; merge duplicates after rescans; a rescan **diffs** against the existing map (new, missing, changed devices highlighted) instead of overwriting the user's layout and notes.
- Layout, connections and notes persist per audit; export the canvas as PNG/SVG (used in the audit report).

### 7.3 Device popup (details panel)
On click, a modal/side panel with tabs. Fields (all optional but weighted):
- **Identity:** name, type, vendor/model, serial, IP(s), MAC, location, owner/responsible person, criticality (Low-Critical), data classification handled, business service(s) supported.
- **Software:** OS and version, **end-of-support date**, last patch date, auto-update on/off.
- **Endpoint protection:** antivirus/EDR present (yes/no), product, **license expiry date** (with warning colors at 30/7/0 days), real-time protection on, last scan.
- **Access control:** **MFA enabled** (and type), admin accounts count, default credentials changed, local admin rights, remote access (RDP/SSH/VPN) exposure, password policy.
- **Backup and recovery:** backup exists, method, frequency, location (offsite/immutable), **last successful backup and last restore test date**, RTO/RPO.
- **Network security:** open ports/services (prefilled by scan), exposed to internet, firewall rules reviewed, segmentation/VLAN, encryption in transit.
- **Data protection:** disk encryption, personal data present (GDPR), encryption at rest.
- **Logging and monitoring:** logs enabled, forwarded to SIEM/central, retention.
- **Physical security** (for servers/network gear).
- **Free-text notes** and file attachments (photos, configs, screenshots).
- **"Information complete" checkbox**: when ticked, a **green check badge** appears on the corner of the device node. Gap fix: the checkbox is **disabled until the required fields for that device type are filled** (required fields differ by type, e.g. a printer does not need backup); otherwise show which fields are missing. Also show a per-device completeness percentage, and a different badge (amber warning) if the data is complete but contains a risk (e.g. AV expired).
- Link a device to findings (see 7.4) directly from the popup ("Add finding for this device").

### 7.4 Findings and remediation register
A form/table: ID, title, description, affected device(s) (multi-select from the map, or "organization-wide"), category (maps to the NIS2 Art. 21 measure), **severity** (Low/Medium/High/Critical, with an optional likelihood x impact calculator), evidence/attachments, proposed solution, effort (S/M/L), cost estimate, owner, due date, **status** (Open/In progress/Mitigated/Accepted risk/Closed), risk acceptance with justification and approver, and history of changes. **Auto-suggested findings** from rules over device data (e.g. "AV license expired", "no backup", "OS end of life", "MFA missing on remote access", "default credentials", "RDP exposed to internet", "backup never restore-tested"). The user confirms or dismisses suggestions. Findings feed the risk register (Module B) and the dashboard.

### 7.5 Audit lifecycle
Audits are **dated snapshots** (Audit 2026-Q4, etc.): create, scan, document, close and compare to a previous audit (trend: findings opened/closed, risk score evolution). Scope, methodology, auditor name and limitations are recorded.

### 7.6 Audit report export (DOCX and PDF)
Same professional design as Module B. Contents: cover page, executive summary (key numbers, overall security score, top 5 risks), scope and methodology, **network diagram image**, device inventory table, per-device sheets, **findings table sorted by severity with color coding**, remediation roadmap (quick wins / 30-60-90 days), mapping of findings to NIS2 Art. 21 measures, risk heat map, comparison with the previous audit, appendices, and signature block.

---

## 8. MODULE D: DASHBOARDS

### 8.1 User dashboard
Overall compliance %, classification badge, document progress overview, open findings by severity, upcoming deadlines (reviews, license expiries, training renewals, incident-report drills), "next best actions" list.

### 8.2 Admin dashboard
- Table of all users and organizations with search, filter, sort, pagination: status, classification, overall progress %, last activity, MFA enabled, plan.
- KPIs and graphs (Recharts): registrations over time, active organizations, **average completion by document**, distribution of Essential/Important/Out-of-scope, completion funnel, findings by severity across all organizations, most-incomplete documents, inactive accounts.
- Drill-down into any organization: read access to its documents (with history), audits, network maps and findings. **Every drill-down is written to the audit log** and visible to the organization. Admin can disable/enable accounts, force password reset/MFA reset (with logged reason), impersonate **read-only** only (no write impersonation), and export organization data.
- Admin cannot read passwords or MFA secrets; secrets are never retrievable.
- Export dashboards/lists to CSV and PDF.

---

## 9. NON-FUNCTIONAL REQUIREMENTS

- **Security of the app itself** (it stores sensitive network data, so it is a high-value target and must meet the standard it preaches): OWASP ASVS L2, input validation everywhere, parameterized queries, file upload scanning and type/size limits, encrypted attachments at rest, **field-level encryption (envelope encryption with KMS) for sensitive device data**, TLS 1.2+ only, secrets via Kubernetes Secrets/External Secrets or Vault, least-privilege DB users, SBOM, container image scanning (Trivy), dependency audit in CI.
- **GDPR:** data processing register for the platform itself, privacy policy and DPA templates, data residency in the EU, retention settings, backups with defined RPO/RTO, breach notification procedure for the platform.
- **Accessibility** WCAG 2.2 AA; **i18n** ro/en; date/number formatting per locale.
- **Performance:** pages under 2s on 4G, canvas smooth up to 500 nodes, exports under 30s for typical documents.
- **Observability:** structured JSON logs, correlation IDs, Prometheus metrics, health endpoints (`/healthz`, `/readyz`), OpenTelemetry tracing, Grafana dashboards, alerting rules.
- **Email:** transactional email (verification, reset, reminders, invites) via SMTP/provider-agnostic abstraction; templates in ro/en.

---

## 10. DEVOPS: DOCKER, KUBERNETES, GIT, DEPLOY-READY

### 10.1 Git
- Monorepo layout: `apps/web`, `apps/api`, `apps/scanner-agent`, `packages/shared` (types, Zod schemas, template definitions), `deploy/`, `docs/`.
- Trunk-based flow with short-lived feature branches and PRs, protected `main`, Conventional Commits, semantic versioning with automated changelog, `CODEOWNERS`, PR and issue templates, `.gitignore`, `.editorconfig`, **pre-commit secret scanning** (gitleaks).

### 10.2 Docker
- Multi-stage, minimal, **non-root** images for web (nginx-unprivileged serving static build), api and worker, agent; pinned base image digests; read-only root filesystem where possible; `HEALTHCHECK`; `.dockerignore`.
- `docker-compose.yml` for local development (web, api, worker, postgres, redis, minio, mailpit) with hot reload and seed data; `docker-compose.prod-like.yml` for smoke tests.
- Playwright/Chromium for PDF in a separate worker image with the required fonts embedded.

### 10.3 Kubernetes
- Manifests via **Helm chart** (or Kustomize with `base` + `overlays/dev|staging|prod`): Deployments (web, api, worker), Services, **Ingress** (NGINX) with **cert-manager** TLS, ConfigMaps, Secrets (External Secrets / Sealed Secrets), **HPA**, **PodDisruptionBudget**, liveness/readiness/startup probes, resource requests and limits, **NetworkPolicies** (default deny), PodSecurity "restricted" settings (runAsNonRoot, drop all capabilities, seccomp RuntimeDefault), ServiceAccounts with minimal RBAC, PostgreSQL either as managed service (recommended) or CloudNativePG operator with automated backups to S3, Redis, migration **Job/initContainer**, scheduled **CronJobs** (review reminders, retention cleanup, backups verification).
- Must run on a small single-node cluster (k3s / Proxmox VM) as well as managed K8s; document both.
- Zero-downtime rolling updates, rollback procedure, DB migration strategy that is backward compatible (expand/contract).

### 10.4 CI/CD (GitHub Actions or GitLab CI)
Pipeline: lint, typecheck, unit tests, build, integration tests with service containers, E2E on compose, SAST (CodeQL/Semgrep), dependency and image scan (Trivy), SBOM, build and push images tagged with git SHA and semver, **sign images (cosign)**, deploy to staging automatically, to prod on tag with manual approval, post-deploy smoke test. Optional GitOps with Argo CD.

### 10.5 Documentation deliverables
`README.md` (quick start in under 10 minutes), `docs/architecture.md`, `docs/deployment.md` (k3s and managed K8s), `docs/security.md`, `docs/runbook.md` (backup/restore, rotate secrets, incident), `docs/adding-a-document-template.md`, `docs/adding-a-jurisdiction.md`, `docs/scanner-agent.md`, `.env.example` with every variable explained, and an OpenAPI spec.

---

## 11. DATA MODEL (starting point; refine and deliver an ERD)

`organizations`, `users`, `memberships` (role in org), `sessions/refresh_tokens`, `mfa_factors`, `audit_log`, `company_profile`, `classification_runs`, `document_templates` (versioned JSON definitions), `documents` (instance per org), `document_revisions` (immutable), `document_versions` (approved snapshots), `approvals`, `attachments`, `audits`, `scan_jobs`, `agents` (enrollment, last seen), `devices`, `device_assessments`, `connections`, `zones`, `findings`, `finding_history`, `risk_register_entries`, `suppliers`, `training_records`, `notifications`, `export_jobs`, `jurisdiction_packs`.

---

## 12. TESTING AND ACCEPTANCE

- Unit tests for the classification rules engine with a **table of at least 40 real-world scenarios** (e.g. 60-employee managed service provider in Romania, 30-employee food manufacturer, DNS provider with 5 employees, hospital, municipality, etc.) and expected outcomes.
- Authorization tests proving a USER can **never** read or write another tenant's data (test every endpoint), and that role escalation is impossible.
- E2E: register, verify, MFA, classify, fill a document, edit, view diff, restore, export DOCX and PDF; scan import, build network map, complete a device, create a finding, export audit.
- Export tests: generated DOCX opens in LibreOffice headless without errors; PDF visual regression against golden files.
- Agent test: simulated network (docker network with several containers) discovered correctly.
- Definition of Done per feature: code, tests, docs, i18n strings in both languages, accessibility check, migration, security review checklist.

---

## 13. KNOWN GAPS AND LOGIC FIXES ALREADY INCORPORATED (review and extend)

1. **Local network scanning from a web app is impossible** as originally imagined, so solved with the outbound-only Scanner Agent plus Nmap XML/CSV import/manual fallback (7.1). MAC visibility limited to the local L2 segment, made explicit to the user.
2. **Tenancy was undefined** (users vs companies); solved with organizations, memberships and RLS (4.2).
3. **"Admin accesses all info"** conflicts with GDPR transparency; solved with mandatory logging of admin access, read-only impersonation, and visibility of that log to customers (4.3, 8.2).
4. **Classification must drive the documentation**: required documents and their priority depend on the entity type (5.2).
5. **Duplicate data entry** between audit and documents (assets, suppliers, risks) solved with single-source-of-truth shared entities (6.3, 7.4).
6. **Completion checkbox could be ticked on empty devices**; now gated by required fields per device type (7.3).
7. **Rescans would destroy user's manual map work**; now diff-based merge (7.2).
8. **Audits need to be comparable over time**; modelled as dated snapshots (7.5).
9. **Document review cycles and reminders** were missing; added review dates, notifications, CronJobs (6.4, 10.3).
10. **Concurrent editing conflicts** handled with locking/optimistic concurrency (6.4).
11. **The platform stores highly sensitive data**; added field-level encryption, ASVS L2, signed images, SBOM (9, 10.4).
12. **Legal accuracy risk**; rules in data files with legal references, jurisdiction packs, disclaimer, and a review workflow for content updates (0, 5).
13. **Incident reporting** (24h/72h/1 month) is a core NIS2 obligation but only documented, never operational. **Stretch module:** an Incident Register with a countdown timer from the moment of detection, prefilled early-warning/notification/final-report templates, and exportable reports.
14. **Out-of-scope users** (not covered by NIS2) still benefit: provide a "good practice mode" with the same documents flagged as voluntary.
15. **Pricing/plans/billing** are not specified; leave extension points (plan field on organization, feature flags) but do not implement billing now.
16. **Backup and DR of the platform itself** specified in 9 and 10.3.

Add anything else you discover under "Assumptions and Decisions".

---

## 14. DELIVERY PLAN (phased; stop for my review after each phase)

- **Phase 0:** architecture, ERD, OpenAPI skeleton, repo scaffold, docker-compose, CI skeleton, design tokens, i18n setup.
- **Phase 1:** auth, organizations, roles, MFA, audit log, RLS, basic layout and dashboards shell.
- **Phase 2:** classification wizard + rules engine + results page and PDF summary.
- **Phase 3:** document template engine, documentation page with cards and progress, form renderer, autosave, revisions, diff, restore, versions/approval.
- **Phase 4:** DOCX/PDF export pipeline and the professional design for all templates; compliance summary and ZIP export.
- **Phase 5:** network mapper: canvas, manual devices, device popup, completeness badge, imports (Nmap XML/CSV).
- **Phase 6:** Scanner Agent and enrollment; diff-based rescans.
- **Phase 7:** findings register, auto-suggestions, audit lifecycle, audit report export.
- **Phase 8:** admin dashboard, graphs, drill-down, reminders, notifications.
- **Phase 9:** Helm/Kustomize, hardened images, CI/CD to staging, observability, load and security testing, documentation, release v1.0.0.
- **Stretch:** incident register with reporting timers, AI-assist, WebAuthn, additional jurisdiction packs, ISO 27001 mapping.

Begin now with Phase 0: present the architecture decisions, the ERD, the repo structure, your list of assumptions, and any questions that genuinely block you (maximum 5). Do not start Phase 1 until I approve.
