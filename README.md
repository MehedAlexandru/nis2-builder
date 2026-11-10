# NIS2 Compass

Guided NIS2 compliance preparation for EU SMEs: classify your entity, build the mandatory
documentation, audit your IT environment and track progress — in English and Romanian.

> **Legal notice:** This tool supports compliance preparation and does not constitute legal advice.

**Status: Phase 0 complete.** Authentication, classification and the document engine follow in the
next phases. The scanner agent is a verified skeleton; active discovery lands in Phase 6.

---

## What Phase 0 delivers

- pnpm + Turborepo monorepo (`web`, `api`, `scanner-agent`, `shared`), Conventional Commits,
  commitlint, Husky, lint-staged and gitleaks pre-commit.
- React 18 + Vite + TypeScript shell with the full hue-206 design system, dark mode and a
  `/design` page that demonstrates every token and component.
- i18n from day one (`en`, `ro`), locale-aware dates/numbers/currency, and the legal disclaimer in
  both languages.
- NestJS 11 on the Fastify adapter, Prisma 6 + PostgreSQL 16, Redis + BullMQ, MinIO/S3, structured
  JSON logs with correlation IDs, Prometheus metrics, `/healthz` and `/readyz`.
- Full Phase 0 data model (28 entities) with a generated baseline migration and a second migration
  that enables **Row Level Security** and an append-only `audit_log`.
- OpenAPI contract generated from the module graph and committed at `docs/openapi/openapi.json`.
- Go scanner-agent skeleton (config, heartbeat client, OUI vendor lookup) with tests.
- Docker Compose dev stack and a production-like smoke stack; GitHub Actions CI with lint,
  typecheck, tests, build, OpenAPI drift check, Go build/test and gitleaks.

## Quick start (Docker Compose, under 10 minutes on a warm cache)

Prerequisites: Docker with Compose v2, Node.js 20.19+ and pnpm 10 (only needed if you also run
commands outside Docker).

```bash
git clone git@github.com:MehedAlexandru/nis2-builder.git
cd nis2-builder
cp .env.example .env
docker compose up --build
```

| Service       | URL                        |
| ------------- | -------------------------- |
| Web app       | http://localhost:5173      |
| API           | http://localhost:3000      |
| Swagger UI    | http://localhost:3000/docs |
| Mailpit       | http://localhost:8025      |
| MinIO console | http://localhost:9001      |

The first build downloads images and installs dependencies; it can take several minutes. On WSL,
keep the repository on the Linux filesystem (for example `~/projects`) for much faster builds.

Run migrations and the demo seed once the stack is healthy:

```bash
docker compose exec api pnpm --filter @nis2/api prisma:migrate:deploy
docker compose exec api pnpm --filter @nis2/api prisma:seed
```

## Local development without Docker for the app

Prerequisites: Node.js 20.19+, pnpm 10, PostgreSQL 16, Redis 7. `docker run` is enough for the
dependencies:

```bash
pnpm install
cp .env.example .env

docker run -d --name nis2-pg \
  -e POSTGRES_USER=nis2 -e POSTGRES_PASSWORD=nis2_dev_password -e POSTGRES_DB=nis2_compass \
  -p 5432:5432 postgres:16-alpine
docker run -d --name nis2-redis -p 6379:6379 redis:7-alpine

pnpm db:migrate
pnpm db:seed
pnpm dev            # shared watch + API + web
pnpm dev:worker     # optional, in a second terminal
```

- Web: http://localhost:5173
- API health: http://localhost:3000/healthz
- Readiness (DB + Redis): http://localhost:3000/readyz

## Commands

| Command                  | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `pnpm dev`               | Run shared watch, API and web                          |
| `pnpm dev:worker`        | Run the BullMQ worker                                  |
| `pnpm build`             | Build all packages (Turbo, dependency-aware)           |
| `pnpm lint`              | ESLint across web, API and shared                      |
| `pnpm typecheck`         | Strict TypeScript for all packages                     |
| `pnpm test`              | Vitest (web/shared) + Jest (API)                       |
| `pnpm test:go`           | Go tests for the scanner agent                         |
| `pnpm format`            | Prettier write                                         |
| `pnpm openapi:generate`  | Regenerate and commit the OpenAPI contract             |
| `pnpm db:migrate`        | `prisma migrate dev` with the root `.env`              |
| `pnpm db:migrate:deploy` | Apply migrations in CI/staging/production              |
| `pnpm db:seed`           | Seed the Romania pack metadata and a demo organization |
| `pnpm db:reset`          | Drop, recreate, migrate and re-seed the local database |
| `pnpm secrets:check`     | gitleaks staged-file scan (CI enforces)                |

## Repository layout

```text
apps/
  web/                 React 18 + Vite SPA, Tailwind tokens, i18n, design system
  api/                 NestJS 11 (Fastify), Prisma schema/migrations, worker, OpenAPI generator
  scanner-agent/       Go agent: config, heartbeat, OUI lookup (discovery in Phase 6)
packages/
  shared/              Enums, Zod schemas, brand tokens, jurisdiction metadata
deploy/
  docker/              Multi-stage Dockerfiles and nginx config
docs/                  Architecture, data model, security, deployment, runbook, guides
docker-compose.yml     Local dev stack
docker-compose.prod-like.yml
```

## Architecture at a glance

- **Modular monolith** API with a shared worker; the Scanner Agent is the only separate
  deployable.
- **Tenant isolation twice**: application-layer `organizationId` scoping (Phase 1) _and_
  PostgreSQL RLS policies (already applied). Admin cross-tenant access is logged and read-only.
- **One canonical content model** powers both DOCX and PDF exports (Phase 4), so the look and legal
  references stay identical.
- **Data-driven compliance content**: classification rules, document templates and jurisdiction
  packs are versioned JSON, never hardcoded logic.
- **Outbound-only scanning**: the agent pushes inventory over HTTPS; no inbound ports on the
  customer network, no exploitation.

See [`docs/architecture.md`](docs/architecture.md) and [`docs/data-model.md`](docs/data-model.md).

## Security baseline

- Strict TypeScript, ESLint, dependency and secret scanning in CI.
- Helmet security headers, strict CORS allowlist, 10 MB body limit, generic 5xx responses.
- Structured JSON logs with request IDs and redaction of authorization/cookies/secrets.
- Production environment validation rejects development secrets, local databases and localhost
  origins at boot.
- RLS policies and an append-only audit log are part of the first migration set.
- Containers run as non-root (API runtime and nginx-unprivileged; distroless agent).

See [`docs/security.md`](docs/security.md) and [`SECURITY.md`](SECURITY.md).

## Delivery roadmap

| Phase | Scope                                                               | Status   |
| ----- | ------------------------------------------------------------------- | -------- |
| 0     | Architecture, scaffold, tokens, i18n, API shell, data model, RLS    | **Done** |
| 1     | Auth, organizations, roles, MFA, audit log, runtime RLS, dashboards | Next     |
| 2     | Classification wizard, rules engine, result PDF                     | Planned  |
| 3     | Document template engine, revisions, diff/restore, approvals        | Planned  |
| 4     | DOCX/PDF pipeline, ZIP and compliance summary                       | Planned  |
| 5     | Network canvas, devices, assessments, Nmap/CSV import               | Planned  |
| 6     | Scanner Agent, enrollment, diff-based rescans                       | Planned  |
| 7     | Findings register, auto-suggestions, audit lifecycle/report         | Planned  |
| 8     | Admin dashboard, drill-down, reminders, notifications               | Planned  |
| 9     | Helm, hardened images, CI/CD, observability, load/security testing  | Planned  |
| —     | Stretch: incident register, AI assist, WebAuthn, more jurisdictions | Stretch  |

## Troubleshooting

- **`docker compose` not found in WSL:** enable Docker Desktop → Settings → Resources → WSL
  integration, or install the Compose plugin in the distro.
- **Prisma cannot find `DATABASE_URL`:** copy `.env.example` to `.env` at the repository root. The
  root `db:*` scripts load it with `dotenv-cli`.
- **Port already in use:** change `API_PORT`, or the published ports in the Compose files.
- **Slow installs/builds on `/mnt/c`:** move the checkout to the Linux filesystem (WSL).
- **Go not installed:** install Go 1.27+; CI builds the agent automatically.

## License

MIT — see [`LICENSE`](LICENSE).
