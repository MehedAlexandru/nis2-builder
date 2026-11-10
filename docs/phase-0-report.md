# Phase 0 report

> Status: **complete, awaiting review before Phase 1**.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Delivered

| Area       | Deliverable                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo   | pnpm workspaces + Turborepo; `apps/web`, `apps/api`, `apps/scanner-agent`, `packages/shared`                                                        |
| Tooling    | Strict TypeScript, ESLint 9 flat config, Prettier, Husky, lint-staged, commitlint, gitleaks pre-commit                                              |
| CI         | GitHub Actions: format, lint, typecheck, tests, build, OpenAPI drift, Go vet/test/build, gitleaks; Dependabot                                       |
| Web        | React 18 + Vite, React Router, TanStack Query, Tailwind, Radix Slot, CVA; landing + design-system pages                                             |
| Design     | Full hue-206 palette, semantic/severity/neutral scales, dark mode, WCAG-aware focus, progress gradient                                              |
| i18n       | react-i18next, `en` + `ro`, locale-aware dates/numbers/percent/currency, `<html lang>` sync                                                         |
| API        | NestJS 11 on Fastify, config validation, pino structured logs + request IDs, error envelope, CORS/helmet/cookies, health/readiness/metrics, Swagger |
| Data       | 28-entity Prisma schema, UUID v7 IDs, baseline migration, RLS migration, append-only audit log                                                      |
| Queue      | Redis + BullMQ `exports` queue and worker entrypoint                                                                                                |
| Storage    | MinIO/S3 configuration for exports and attachments                                                                                                  |
| Agent      | Go CLI skeleton: config validation, HTTPS heartbeat, OUI lookup, distroless image, tests                                                            |
| Containers | Multi-stage API/worker and web images, nginx SPA config, dev and prod-like Compose stacks                                                           |
| Docs       | README, architecture, data model, design system, security, deployment, runbook, legal policy, template/jurisdiction/agent guides, DoD               |

## 2. Verification evidence

Environment: Fedora 44 WSL2, Node 24.18.0 (project targets Node 20; CI pins 20), pnpm 10.34.9,
PostgreSQL 16 and Redis 7 containers, Go 1.27.3.

### 2.1 Build and tests

| Check                                           | Result                                         |
| ----------------------------------------------- | ---------------------------------------------- |
| `pnpm install`                                  | Success (lockfile committed)                   |
| `pnpm format:check`                             | All files formatted                            |
| `pnpm lint`                                     | 3/3 packages successful                        |
| `pnpm typecheck`                                | All packages successful                        |
| `pnpm test`                                     | Shared 10, web 5, API 8 = **23 tests passing** |
| `pnpm build`                                    | 3/3 packages successful                        |
| `pnpm openapi:generate` (twice)                 | Stable, no diff                                |
| `go vet ./...`                                  | Clean                                          |
| `go test ./...`                                 | config, discovery, upload packages pass        |
| `go build ./cmd/agent`                          | Binary runs `--version`                        |
| YAML parse (compose, CI, Dependabot, workspace) | All valid                                      |

### 2.2 Database and RLS

- `prisma migrate deploy` applied `0001_init` and `0002_rls` successfully.
- Seed created the Romania pack metadata and `Demo SME SRL`.
- Isolation test with a dedicated `NOSUPERUSER NOBYPASSRLS` role:

| Tenant context | `organizations` visible | `company_profiles` visible |
| -------------- | ----------------------- | -------------------------- |
| Demo org       | 1                       | 1                          |
| Random org     | 0                       | 0                          |

- `UPDATE audit_log ...` was rejected: `ERROR: audit_log is append-only`.
- RLS uses `app.current_organization_id()` (text, matching Prisma's UUID-as-text columns) and
  `FORCE ROW LEVEL SECURITY` on every tenant table.

### 2.3 Runtime smoke test

| Request                                   | Result                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `GET /healthz`                            | `200 {"status":"ok","uptimeSeconds":86,"version":"0.1.0"}`             |
| `GET /readyz`                             | `200 {"status":"ok",...,"checks":{"database":"up","redis":"up"}}`      |
| `GET /docs-json`                          | `200`; title/version correct; disclaimer present                       |
| `GET /does-not-exist` with `x-request-id` | `404` envelope with matching `correlationId`; header echoed            |
| `OPTIONS /healthz` (allowed origin)       | `204` with correct CORS headers                                        |
| `GET /metrics`                            | Prometheus text with `nis2_api_*` metrics                              |
| Production env guard                      | Rejects missing JWT/cookie secrets, localhost DB and localhost origins |

Security headers observed: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, COOP/CORP, `x-request-id`.

## 3. Deviations from the original wording

1. **Compose files are at the repository root**, because Compose loads `.env` from the compose
   file's directory. Dockerfiles live in `deploy/docker/`.
2. **Worker shares the API runtime image** with a different command. Operationally equivalent,
   avoids duplicate dependency layers; Phase 9 can split if needed.
3. **Fastify-native pino logging** instead of `nestjs-pino`, avoiding Fastify middleware plumbing.
4. **UUIDs are stored as `text`** (Prisma default). RLS compares text; a native `uuid` migration is a
   documented future option.
5. **Conservative version pins** (React 18, TS 5.9, Tailwind 3.4, Vite 6, Vitest 3, Nest 11,
   Prisma 6) rather than the newest majors, to keep the scaffold reproducible and verified.
6. **Dev Compose uses the PostgreSQL superuser**; RLS isolation was verified separately with a
   non-superuser role. Phase 1 introduces runtime role separation.

All deviations are recorded in `docs/assumptions-and-decisions.md`.

## 4. Known gaps entering Phase 1

- Authentication, sessions, MFA, CSRF, rate limiting and authorization guards.
- Prisma tenant-context extension and the non-owner runtime DB role.
- User-scoped RLS path for organization discovery at login.
- Audit event writers and the customer-visible admin access log UI.
- No Kubernetes manifests yet (Phase 9); Compose is the validation target.

## 5. Phase 1 proposal (next, for approval)

1. Auth module: register, verify email, login, refresh rotation with reuse detection, logout.
2. Argon2id, breach check, password reset, progressive lockout, generic errors.
3. TOTP MFA with recovery codes; mandatory for ADMIN; admin bootstrap CLI.
4. Organizations, memberships, owner invites; tenant context + Prisma extension.
5. Runtime DB role + RLS integration tests; audit log writers.
6. Sessions page, security headers/CSRF, protected app shell and dashboards shell.
7. Tests: authorization matrix per endpoint, role escalation, refresh reuse, lockout, tenant
   isolation. README/docs update and a Phase 1 report.
