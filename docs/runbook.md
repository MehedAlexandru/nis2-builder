# Operations runbook

> Phase 0 baseline. Kubernetes procedures are completed in Phase 9.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Services

| Service  | Port                          | Health                            | Notes                                                    |
| -------- | ----------------------------- | --------------------------------- | -------------------------------------------------------- |
| web      | 5173 (dev) / 8080 (container) | `/`                               | Static SPA; nginx proxies `/api/` in the prod-like stack |
| api      | 3000                          | `/healthz`, `/readyz`, `/metrics` | NestJS on Fastify                                        |
| worker   | —                             | logs + queue metrics              | BullMQ consumer; same image as API                       |
| postgres | 5432                          | `pg_isready`                      | RLS enabled; superuser only for migrations/dev           |
| redis    | 6379                          | `PING`                            | Queues, future rate limits/cache                         |
| minio    | 9000/9001                     | MinIO health endpoint             | Exports/attachments                                      |

## 2. Start, stop, logs

```bash
docker compose up -d
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose down            # keep volumes
docker compose down -v         # DESTROYS local data
```

## 3. Database operations

```bash
# apply migrations (staging/prod pattern)
pnpm db:migrate:deploy

# local reset + seed (destroys data)
pnpm db:reset

# manual backup
docker exec nis2-pg pg_dump -U nis2 -d nis2_compass -Fc > backup.dump

# restore into an empty database
docker exec -i nis2-pg pg_restore -U nis2 -d nis2_compass --clean --if-exists < backup.dump
```

Verify RLS after a restore with a non-superuser role (see the Phase 0 report). Never run the API as
the schema owner in production.

## 4. Secret rotation

| Secret                  | Impact                                                | Procedure                                                  |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `JWT_ACCESS_SECRET`     | Access tokens invalid immediately                     | Rotate, deploy, users silently refresh                     |
| `JWT_REFRESH_SECRET`    | Refresh tokens invalid; all users re-login            | Rotate during a maintenance window                         |
| `COOKIE_SECRET`         | Existing signed cookies invalid                       | Rotate with the refresh secret                             |
| `ENCRYPTION_MASTER_KEY` | Cannot decrypt field-level ciphertext without re-wrap | Use KMS key versioning; re-wrap DEKs, never rotate blindly |
| DB password             | Connection outage                                     | Update secret, rolling restart API/worker                  |
| S3 keys                 | Export/attachment outage                              | Rotate IAM keys, update secret, restart worker             |

Never commit rotated secrets. Record the rotation in the audit log/change management.

## 5. Queue and Redis

- Redis loss: queued export jobs are lost; users can retry. Database records remain the source of
  truth for documents/audits.
- Inspect queue depth with BullMQ board/CLI in Phase 4; Phase 0 worker logs job IDs.
- A stuck worker: restart it; jobs are retried with backoff.

## 6. Incident response (platform)

1. **Detect** — alert on readiness failures, 5xx spikes, auth failures, queue backlog.
2. **Contain** — revoke sessions (rotate refresh secret), disable affected accounts, isolate the
   component, preserve logs.
3. **Assess** — scope: which tenants/data, what was accessed, was the audit log tampered?
4. **Notify** — follow GDPR Art. 33 (72h) and contractual/DPA obligations; involve legal.
5. **Eradicate/recover** — patch, restore from clean backup if needed, rotate secrets.
6. **Learn** — post-incident review, update controls and tests, publish internal report.

Preserve the audit log; it is append-only by trigger. Export a copy for the investigation.

## 7. Common failures

| Symptom                                                 | Likely cause                          | Action                                   |
| ------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| API boot fails with `Invalid environment configuration` | Missing/placeholder production secret | Fix the secret; do not weaken validation |
| `/readyz` 503, database down                            | Postgres down/migrations missing      | Check container, run `migrate deploy`    |
| `/readyz` 503, Redis down                               | Redis down                            | Restart Redis; exports/reminders pause   |
| 401/403 after deploy                                    | JWT secret rotation                   | Expected; users refresh/re-login         |
| Export stuck                                            | Worker down/queue backlog             | Restart worker, inspect queue            |
| SPA blank after deploy                                  | nginx SPA fallback/CSP                | Check `nginx.conf`, console, CSP report  |

## 8. Phase 0 limitations

- No auth yet, so account/session actions are not operational.
- No export pipeline yet; worker is a logged placeholder.
- No Kubernetes manifests yet; use Compose.
- No automated backup verification yet.
