# Deployment

> Phase 0 validates Docker Compose (dev + prod-like). Kubernetes/Helm is delivered in Phase 9 and is
> documented here as the target topology.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Environments

| Environment | Purpose                                      | Stack                                                 |
| ----------- | -------------------------------------------- | ----------------------------------------------------- |
| Local dev   | Feature development, hot reload              | `docker-compose.yml` or local Node + PostgreSQL/Redis |
| Prod-like   | Smoke tests of runtime images and migrations | `docker-compose.prod-like.yml`                        |
| Staging     | Pre-production validation                    | Kubernetes (Phase 9)                                  |
| Production  | Customer traffic                             | Kubernetes + managed PostgreSQL/Redis/S3 (Phase 9)    |

## 2. Local development

```bash
cp .env.example .env
docker compose up --build
```

Services: web `:5173`, API `:3000`, PostgreSQL `:5432`, Redis `:6379`, MinIO `:9000/:9001`, Mailpit
`:1025/:8025`.

Apply migrations and the demo seed:

```bash
docker compose exec api pnpm --filter @nis2/api prisma:migrate:deploy
docker compose exec api pnpm --filter @nis2/api prisma:seed
```

Without Docker for the app:

```bash
pnpm install
cp .env.example .env
# start PostgreSQL 16 and Redis 7 (Docker or native)
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm dev:worker   # separate terminal
```

### WSL note

The Docker Compose plugin may be missing inside a WSL distro even when the Docker CLI works. Enable
Docker Desktop → Settings → Resources → WSL integration, or install the Compose plugin. Builds and
installs are much faster when the repository lives on the Linux filesystem.

## 3. Production-like smoke stack

```bash
docker compose -f docker-compose.prod-like.yml up --build
```

- Builds the `runtime` targets (non-root API, nginx-unprivileged SPA).
- Runs a one-shot `migrate` service with `prisma migrate deploy`.
- API and worker start only after migrations complete.
- The SPA is served on `:8080` and proxies `/api/` to the API.
- Placeholder secrets/domains in this file exist only to satisfy production validation; **do not
  reuse them**.

Smoke checks:

```bash
curl -fsS http://localhost:8080/ | head
curl -fsS http://localhost:8080/api/v1/health  # Phase 1; health is on the API container today
curl -fsS http://localhost:3000/healthz
```

## 4. Environment variables

All variables are documented in [`.env.example`](../.env.example). Categories:

- Runtime: `NODE_ENV`, `API_PORT`, `LOG_LEVEL`, `PUBLIC_APP_URL`, `CORS_ORIGINS`, `ENABLE_QUEUES`.
- Database: `DATABASE_URL` (migrations/owner), `APP_DATABASE_URL` (runtime role, Phase 1).
- Redis: `REDIS_URL`.
- Auth (Phase 1): JWT secrets/TTLs, `COOKIE_SECRET`, `ADMIN_BOOTSTRAP_TOKEN`.
- Encryption: `ENCRYPTION_MASTER_KEY` (dev) / KMS key reference (prod).
- Object storage: `S3_*`.
- Email: `SMTP_*`, `MAIL_FROM`.
- Features: `FEATURE_AI_ASSIST`, `FEATURE_WEBAUTHN`.
- Observability: `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `METRICS_ENABLED`.

Production boot fails fast if secrets are missing, are development placeholders, or if
`DATABASE_URL`/origins point at localhost. This is intentional.

## 5. Migrations

- Migrations are committed under `apps/api/prisma/migrations`.
- Staging/production: run `prisma migrate deploy` as a dedicated job (Compose `migrate` service;
  Kubernetes Job in Phase 9) before rolling out API/worker.
- Use **expand/contract**:
  1. add nullable columns/tables and backfill;
  2. deploy code that writes both old and new shapes;
  3. switch reads;
  4. remove old columns in a later release.
- Never edit an applied migration. Restore from backup if a migration fails in production.
- RLS/trigger migrations are part of the same release as the tables they protect.
- Runtime role: the API must not connect as the schema owner or a superuser. Phase 1 adds
  `APP_DATABASE_URL` with a non-owner role and the Prisma tenant extension.

## 6. Kubernetes target (Phase 9)

- Helm chart with values per environment.
- Deployments: web, api, worker; separate PDF worker image with Chromium and fonts.
- NGINX ingress + cert-manager; HSTS at ingress.
- External Secrets or Sealed Secrets; no secrets in values files.
- HPA, PodDisruptionBudget, liveness/readiness/startup probes.
- NetworkPolicies default-deny; allow web→api, api→postgres/redis/S3/SMTP, worker→postgres/redis/S3.
- Pod Security "restricted": `runAsNonRoot`, drop all capabilities, `seccompProfile:
RuntimeDefault`, read-only root filesystem where possible.
- Managed PostgreSQL recommended; CloudNativePG with S3 backups as the self-hosted option.
- Migration Job; CronJobs for review reminders, retention cleanup and backup verification.
- Works on a single-node k3s VM (Proxmox) as well as managed Kubernetes; both documented with
  resource requests/limits.

## 7. Backup and disaster recovery (platform)

| Component  | Strategy                                        | Target                  |
| ---------- | ----------------------------------------------- | ----------------------- |
| PostgreSQL | Daily full + WAL/PITR; encrypted offsite        | RPO ≤ 15 min, RTO ≤ 4 h |
| Redis      | AOF + periodic snapshot; queues reconstructible | RPO ≤ 15 min            |
| S3/MinIO   | Versioning + replication or provider durability | RPO ≤ 1 h               |
| Secrets    | Vault/External Secrets backup procedure         | RPO = 0 after change    |
| Exports    | Regenerable from source data                    | No backup required      |

Backup restore is tested quarterly (Phase 9 automation).

## 8. Zero-downtime and rollback

- Rolling updates with readiness gates; `maxUnavailable: 0` for API/worker where capacity allows.
- Migrations are backward compatible; no deploy requires a simultaneous schema break.
- Rollback: redeploy the previous image tag; database rollback only via a forward-fix migration
  (or restore for catastrophic failure).
- Workers drain on SIGTERM (`worker.close()`), then exit.

## 9. Observability endpoints

- `GET /healthz` — process liveness only.
- `GET /readyz` — PostgreSQL + Redis; 503 when either is down.
- `GET /metrics` — Prometheus text format; scrape internally only.

## 10. Troubleshooting

| Symptom                                 | Check                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| API exits at boot                       | `docker compose logs api`; environment validation message names the variable |
| `/readyz` 503                           | PostgreSQL/Redis connectivity, migrations applied                            |
| Prisma “environment variable not found” | root `.env` present; `pnpm db:*` scripts load it                             |
| SPA cannot reach API                    | Vite proxy `VITE_API_PROXY`; CORS origins; nginx `/api/` proxy               |
| Slow builds on WSL                      | move repo to ext4; Docker Desktop file sharing                               |
| Port conflict                           | change published ports or `API_PORT`                                         |
