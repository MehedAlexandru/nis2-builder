# Assumptions and decisions

> Every assumption below is deliberate. If a later phase contradicts one, update this document and
> the architecture together.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Decisions approved before Phase 0

| #   | Question                      | Decision                                                                                                                                            |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Legal content authorship      | Author the Romania pack from official public sources, version it, and flag every legal assertion **pending legal review**. No fabricated citations. |
| D2  | Multi-organization membership | Many-to-many. A user can belong to several organizations; membership carries `OWNER`/`MEMBER`.                                                      |
| D3  | Scanner Agent language        | Go, static binary, distroless image.                                                                                                                |
| D4  | Validation environment        | Docker Compose (dev + prod-like) now; Kubernetes manifests authored in Phase 9 and cluster-tested when an environment exists.                       |
| D5  | End state                     | Full production-grade v1.0.0, including ASVS L2, SBOM, cosign and load/security testing.                                                            |

## 2. Technical decisions

| #   | Decision                                                              | Rationale                                                           |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A1  | Modular monolith + shared worker, not microservices                   | One tenant database, SME scale, simpler transactions and RLS.       |
| A2  | NestJS 11 on Fastify                                                  | Nest structure/DI plus Fastify performance; Fastify-native plugins. |
| A3  | Prisma 6 + raw SQL for RLS/triggers                                   | Type-safe data access; database guarantees are migration-level.     |
| A4  | Go agent                                                              | Static binary, tiny image, cross-compile, concurrency.              |
| A5  | Playwright/Chromium PDF                                               | Reuses Chromium already needed for E2E.                             |
| A6  | One canonical content model → DOCX + PDF renderers                    | Identical structure, styling and legal references in both formats.  |
| A7  | Classification rules, templates, jurisdiction packs as versioned JSON | Legal content is reviewable and pluggable without code changes.     |
| A8  | pnpm workspaces + Turborepo                                           | Fast, dependency-aware monorepo builds.                             |
| A9  | Helm for K8s                                                          | Many objects, values per environment.                               |
| A10 | Access token in memory, refresh in HttpOnly cookie                    | XSS cannot steal the refresh token; no token in localStorage.       |
| A11 | Tenant isolation at query layer + RLS                                 | Defense in depth.                                                   |
| A12 | AES-256-GCM envelope encryption for sensitive fields                  | Protect device secrets/notes against DB compromise.                 |
| A13 | BullMQ on Redis                                                       | Retries, backoff, visibility; simple operations.                    |
| A14 | UUID v7 IDs                                                           | Time-ordered, non-guessable.                                        |
| A15 | Four classification outcomes including `LIKELY_IN_SCOPE`              | Avoids false certainty in ambiguous cases.                          |
| A16 | AI assist deferred, provider interface designed                       | No customer data leaves the tenant without explicit opt-in.         |

## 3. Gaps from the specification and how they are addressed

| Spec gap                                               | Resolution                                                                       | Status                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Local scanning from a browser is impossible            | Outbound-only agent + Nmap XML/CSV/manual fallbacks; MAC/L2 limitation explained | Agent skeleton in Phase 0; active discovery Phase 6 |
| Tenancy undefined                                      | Organizations + memberships + RLS                                                | Schema and RLS done; runtime guards Phase 1         |
| Admin access vs GDPR                                   | Mandatory audit entries, read-only impersonation, customer-visible log           | Audit schema/trigger done; admin UI Phase 8         |
| Classification must drive documentation                | `classification_runs` versioned; required documents computed from result         | Phase 2/3                                           |
| Duplicate data entry                                   | Shared `suppliers`, `devices`, `risk_register_entries`                           | Schema done                                         |
| Completion checkbox on empty devices                   | Required-field rules per device type + completeness                              | Phase 5                                             |
| Rescans destroying manual layout                       | Diff/merge model with new/missing/changed proposals                              | Phase 6                                             |
| Audits comparable over time                            | Dated `audits` snapshots                                                         | Schema done                                         |
| Review cycles and reminders                            | `nextReviewDate`, notifications, cron jobs                                       | Schema done; Phase 8                                |
| Concurrent editing                                     | Lock owner/expiry + optimistic concurrency                                       | Schema done; Phase 3                                |
| Platform is high-value target                          | ASVS L2, RLS, encryption, signed images, SBOM                                    | Baseline in Phase 0; full by Phase 9                |
| Legal accuracy risk                                    | Versioned data packs, review status, disclaimer                                  | Policy + metadata in Phase 0                        |
| Incident reporting is operational, not just documented | Stretch incident register with 24h/72h/1-month timers                            | Stretch; data model compatible                      |
| Out-of-scope users still benefit                       | `scopeMode = VOLUNTARY`; documents flagged voluntary                             | Schema done                                         |
| Pricing/billing unspecified                            | `plan` + feature flags only; no billing                                          | Done                                                |
| Platform backup/DR                                     | Documented RPO/RTO and CronJobs                                                  | Phase 9                                             |

## 4. Additional decisions and gaps found

1. **Prisma stores UUID v7 values as `text`.** The RLS function returns `text` so policies use
   indexes without casts. A future migration to native `uuid` is possible; API contracts use
   strings either way.
2. **Compose files live at the repository root**, not under `deploy/`. Docker Compose only auto-loads
   `.env` from the compose file's directory; root placement makes the quick start work. Dockerfiles
   remain in `deploy/docker/`.
3. **Node 20 is the target; the local machine had Node 24.** `engines` requires `>=20.19.0`, CI pins
   Node 20. The code avoids Node-24-only APIs.
4. **Version pins are conservative majors:** React 18.3, TypeScript 5.9, Tailwind 3.4, Vite 6,
   Vitest 3, Nest 11, Prisma 6. Newer majors exist (React 19, TS 7, Tailwind 4, Vite 8, Nest 12,
   Prisma 8 RC) but were not adopted in Phase 0 to avoid mixing unverified breaking changes.
5. **Fastify-native logging instead of `nestjs-pino`.** Nest middleware with Fastify can require
   `@fastify/middie`; using Fastify's `loggerInstance` + a small Nest `LoggerService` adapter keeps
   structured logs without extra middleware plumbing.
6. **Queue module is conditional at import time.** `ENABLE_QUEUES=false` must be set in the process
   environment (not only `.env`) because the module graph is built before `ConfigModule` loads files.
   The OpenAPI generator sets it before importing `AppModule`.
7. **Swagger UI is disabled in production.** The OpenAPI JSON is generated at build time and
   committed; CI fails if it drifts.
8. **Worker uses the API runtime image with a different command** (`node apps/api/dist/worker.js`).
   This is operationally equivalent to a separate image and avoids duplicated dependency layers.
9. **The prod-like Compose stack uses placeholder domain/password values that pass production
   validation.** It is a smoke-test stack, not a production deployment; secrets must be replaced.
10. **Dev Compose uses the PostgreSQL superuser.** RLS is bypassed for superusers. The Phase 0
    isolation test used a dedicated non-superuser role; Phase 1 introduces the runtime role split.
11. **Organization discovery needs a user-scoped RLS path.** At login the user must list their
    organizations before an organization is selected. Phase 1 adds `app.user_id` policies for
    `memberships`/`organizations`.
12. **`audit_log` rows with `organizationId IS NULL` are system-level.** Tenant reads exclude them;
    administrators read them through the guarded bypass. Inserts of system rows are allowed.
13. **Legal content in Phase 0 is metadata only.** No article-level claims were authored beyond
    naming the instrument (OUG 155/2024) and authority (DNSC), both supplied in the brief.
14. **Prisma `package.json#prisma` seed config is deprecated** and will be removed in Prisma 7. We
    pin Prisma 6.19 and will migrate to `prisma.config.ts` before any Prisma 7 upgrade.
15. **Telemetry build scripts are blocked.** `@scarf/scarf` (telemetry) and optional
    `msgpackr-extract` are intentionally not built. This is a privacy/security choice.
16. **The Go agent has no external modules**, so there is no `go.sum`; CI does not cache Go modules.
17. **PDF rendering is a separate worker** with Chromium and embedded fonts (Phase 4), because the
    API image should not carry a browser.
18. **CSRF uses double-submit plus `SameSite=Strict`; signed cookies** via `@fastify/cookie` in
    Phase 1.
19. **Access tokens are never persisted.** On page reload the SPA silently refreshes; if the refresh
    cookie is gone, the user logs in again.
20. **Admin MFA is enforced at both login and privileged endpoints**, not only by UI.
21. **Rate limiting uses Redis** with separate IP and account buckets; the in-memory limiter is not
    used because the platform runs multiple replicas.
22. **Email is provider-agnostic** (SMTP interface + Mailpit in dev); templates live in both
    locales.
23. **Timezone defaults to `Europe/Bucharest` for Romanian organizations**, overridable per user.
24. **`LIKELY_IN_SCOPE` requires an explicit confirmation step** in the wizard and is stored as-is,
    not coerced to Essential/Important.
25. **Feature flags for AI/WebAuthn are off by default** and configurable per deployment.
26. **The demo seed is idempotent and limited to metadata/demo data.** It must never contain real
    customer data.
27. **RLS policies do not cover user-scoped tables** (`users`, sessions, tokens) yet; these are
    user-scoped and protected by application authorization, with additional policies planned in
    Phase 1 if needed.
28. **Exports are authorized at download time**, not just at job creation; signed URLs are short
    lived and tenant-checked.
29. **The scanner never performs vulnerability exploitation.** Discovery/inventory only; this is a
    product and legal constraint, not a temporary limitation.
30. **Out-of-scope mode uses the same document templates** marked voluntary, so SMEs can adopt good
    practice without pretending NIS2 applies.
31. **Argon2id is provided by `@node-rs/argon2`** (prebuilt binaries, no compiler in the runtime
    image). Memory/time/parallelism are environment-configurable.
32. **Access tokens are HS256 JWTs; refresh tokens are opaque 256-bit values** stored as SHA-256
    hashes. The refresh cookie is `HttpOnly; SameSite=Strict; Path=/api/auth`.
33. **CSRF uses double-submit** (readable cookie + `X-CSRF-Token`). Registration, verification,
    login, recovery and MFA setup/challenge are exempt because no session token exists yet.
34. **Breach-check failure policy is fail-open with a warning**; `BREACH_CHECK_ENABLED=false` covers
    air-gapped deployments. A detected breach always rejects the password.
35. **Revoking a session invalidates refresh tokens immediately**, but an already-issued access token
    can remain valid for its 15-minute TTL. A denylist is a later hardening option.
36. **`sessions.organizationId` stores the selected organization.** Multi-organization users receive
    a token with no active organization until they call `/auth/select-organization`.
37. **Administrators cannot receive an access token before MFA enrolment.** The bootstrap admin
    enrols at first login; an admin cannot disable MFA.
38. **User-scoped RLS path:** `app.user_id` allows organization/membership discovery before an
    organization is selected; `app.invite_token_hash` allows invite lookup before an account exists.
39. **Runtime DB role separation is an explicit script**, not an automatic migration, because the
    role name/password come from deployment secrets. Dev Compose keeps the superuser connection.
40. **Dev object storage uses the maintained `pgsty/silo` fork** because MinIO removed its community
    images from Docker Hub and Quay in 2026. The S3 API and on-disk format are compatible.
41. **Email is provider-agnostic via nodemailer.** Without `SMTP_HOST`, messages are logged (dev) so
    verification links remain usable.
42. **Password-reset and email-verification tokens are single-use, hashed and time-limited** (60
    minutes and 24 hours respectively).
43. **Account deletion is blocked while the user is the sole owner** of any organization; ownership
    must be transferred or the organization removed first.
44. **Audit history survives account deletion** because `audit_log` has no foreign keys and keeps
    actor/organization identifiers as immutable references. GDPR erasure removes the profile, not the
    security trail.
45. **Classification rules are ordered data, not code.** The rules engine evaluates declarative
    conditions (`all`/`any`/`not` + field operators) and the first matching rule wins. This keeps
    legal content reviewable and makes the 40+ scenario table the release gate.
46. **Annex I medium-sized entities are important, not essential.** Essential status under
    NIS2 Art. 3(1)(a) requires exceeding the medium-sized ceilings; Art. 3(2) defaults the
    remaining listed entities to important. Regional/local public administration and the
    Art. 2(2)(b)–(e) criteria return `LIKELY_IN_SCOPE` because the Member State makes the final
    designation.
47. **Partner and linked enterprises are consolidated in the wizard** using the Recommendation
    2003/361/EC approach: linked at 100%, partners pro rata to ownership. Users can still choose
    autonomous when no consolidation is required.
48. **Classification runs store a document applicability snapshot** (`applicability` JSON) and the
    matching `ruleId`/`reasonKey`. Phase 3 will consume the snapshot; historical runs are never
    recomputed against a newer pack.
49. **The Phase 2 PDF summary is server-rendered with PDFKit** and an ASCII-safe standard font.
    Phase 4 replaces it with the canonical DOCX/PDF renderer and embedded brand fonts; the content
    model is already the shared classification result.
50. **A failed or ambiguous classification never coerces certainty.** Missing data or Member-State
    designation criteria produce `LIKELY_IN_SCOPE` with a confirmation message and no invented fine
    ceiling.

## 5. Open decisions for later phases (not blocking)

- WebAuthn/passkeys: include in Phase 9 or after v1.0?
- AI provider: self-hosted model vs external API behind per-organization opt-in.
- Additional jurisdiction packs: RO first, then which member states and in what order?
- Content reviewer role: separate from ADMIN, or ADMIN with a review queue?
- Managed PostgreSQL provider and KMS for the first production deployment.
- Native `uuid` migration vs keeping `text` IDs.

## 6. Change log

| Date       | Change                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------- |
| 2026-11-10 | Phase 0 decisions recorded; five blocking questions resolved.                             |
| 2026-11-11 | Phase 1 decisions recorded (auth, sessions, MFA, RLS path, runtime role, dev MinIO fork). |
