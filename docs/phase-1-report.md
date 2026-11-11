# Phase 1 report

> Status: **complete, awaiting review before Phase 2**.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Delivered

| Area           | Deliverable                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | Registration + email verification, login, password reset, breached-password check, progressive lockout (DB + Redis), generic anti-enumeration responses.                                                    |
| Sessions       | Rotating refresh tokens in an `HttpOnly; SameSite=Strict` cookie, reuse detection that revokes the whole family, session listing/revocation, per-session organization.                                      |
| MFA            | TOTP (RFC 6238) with ±1 step window and replay prevention, hashed one-time recovery codes, mandatory for administrators, setup/challenge tokens.                                                            |
| Authorization  | Global JWT guard, role guard, CSRF double-submit guard, `@Public`/`@Roles`/`@CurrentAuth` decorators.                                                                                                       |
| Tenancy        | Organizations, memberships, owner-only invites and member management, organization switch, user-scoped RLS discovery path, Prisma tenant transactions.                                                      |
| Users          | Self-service profile, GDPR data export (JSON), account deletion with last-owner protection.                                                                                                                 |
| Audit log      | Append-only security trail for register, verify, login success/failure, lockout, refresh rejection, logout, password reset, MFA setup/challenge/disable, organization changes and admin cross-tenant reads. |
| Web            | Login, register, verify email, forgot/reset password, accept invite, MFA challenge/setup, protected dashboard shell, organizations and sessions pages, `en` + `ro`.                                         |
| Data           | Migration `0003_auth_rls` (session organization, MFA replay step, user-scoped policies, invite token lookup), runtime-role bootstrap script, demo owner seed.                                               |
| Operations     | One-time admin bootstrap CLI, runtime DB role setup script, Compose/`COOKIE_SECURE` wiring, OpenAPI regenerated.                                                                                            |

### Endpoints

| Method | Path                                          | Auth             |
| ------ | --------------------------------------------- | ---------------- |
| POST   | `/api/auth/register`                          | public           |
| POST   | `/api/auth/verify-email`                      | public           |
| POST   | `/api/auth/resend-verification`               | public           |
| POST   | `/api/auth/login`                             | public           |
| POST   | `/api/auth/refresh`                           | refresh cookie   |
| POST   | `/api/auth/logout`                            | refresh cookie   |
| POST   | `/api/auth/forgot-password`                   | public           |
| POST   | `/api/auth/reset-password`                    | public           |
| POST   | `/api/auth/accept-invite`                     | public           |
| POST   | `/api/auth/mfa/challenge`                     | public (token)   |
| POST   | `/api/auth/mfa/setup`                         | public (token)   |
| POST   | `/api/auth/mfa/enroll`                        | access token     |
| POST   | `/api/auth/mfa/activate`                      | public (token)   |
| POST   | `/api/auth/mfa/disable`                       | access token     |
| POST   | `/api/auth/select-organization`               | access token     |
| GET    | `/api/auth/sessions`                          | access token     |
| DELETE | `/api/auth/sessions/:id`                      | access token     |
| GET    | `/api/organizations`                          | access token     |
| POST   | `/api/organizations`                          | access token     |
| GET    | `/api/organizations/:id`                      | membership/admin |
| PATCH  | `/api/organizations/:id`                      | owner            |
| GET    | `/api/organizations/:id/members`              | membership/admin |
| POST   | `/api/organizations/:id/invites`              | owner            |
| GET    | `/api/organizations/:id/invites`              | owner            |
| DELETE | `/api/organizations/:id/invites/:inviteId`    | owner            |
| PATCH  | `/api/organizations/:id/members/:userId/role` | owner            |
| DELETE | `/api/organizations/:id/members/:userId`      | owner            |
| GET    | `/api/users/me`                               | access token     |
| PATCH  | `/api/users/me`                               | access token     |
| GET    | `/api/users/me/export`                        | access token     |
| DELETE | `/api/users/me`                               | access token     |

## 2. Security controls

- **Passwords:** Argon2id (`@node-rs/argon2`), 12–128 characters, no composition rules, HIBP k-anonymity range check (fail-open with a warning if the upstream is unavailable; disableable).
- **Access token:** JWT HS256, 15 minutes, `iss`/`aud`, `sub`, `sid`, global role, organization, MFA-satisfied flag; kept only in SPA memory.
- **Refresh token:** 256-bit opaque value, SHA-256 at rest, rotated on every use, family revocation on reuse, `HttpOnly; Secure (configurable); SameSite=Strict; Path=/api/auth`.
- **CSRF:** double-submit cookie + `X-CSRF-Token` header on state-changing authenticated requests; account-establishing flows are exempt because no token exists yet.
- **Lockout:** durable per-account lockout with exponential backoff plus Redis IP/account throttles.
- **MFA:** admins cannot obtain an access token before enrolment; TOTP secrets encrypted with AES-256-GCM; recovery codes stored only as SHA-256 hashes; replayed steps rejected.
- **Tenancy:** Prisma transactions set `app.organization_id`/`app.user_id`; RLS policies use both; admin cross-tenant reads are audit-logged and read-only.
- **Enumeration:** register, resend, forgot-password and unknown-account logins return generic responses; unknown accounts perform a dummy Argon2 verification.
- **Audit:** append-only trigger already enforced in Phase 0; Phase 1 adds the writers.

## 3. Verification evidence

Environment: Windows dev shell, Node 20.19, pnpm 10.34.9, TypeScript 5.9.3.

| Check                   | Result                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm lint`             | 3/3 packages successful                                      |
| `pnpm typecheck`        | 4/4 tasks successful (shared build + API + web)              |
| `pnpm test`             | Shared 10, web 7, API 23 = **40 tests passing**              |
| `pnpm build`            | 3/3 packages successful                                      |
| `pnpm openapi:generate` | Contract regenerated with the Phase 1 routes                 |
| `prisma validate`       | Schema valid                                                 |
| `pnpm format:check`     | Passes (local planning files excluded via `.prettierignore`) |

Unit coverage added for Argon2id hashing, AES-256-GCM, TOTP/HOTP RFC vectors, base32, and opaque token hashing.

Runtime verification in Docker Compose (PostgreSQL 16, Redis 7, Mailpit) with migrations `0001`–`0003`, the demo seed and the least-privilege `nis2_app` role:

| Check                                                         | Result                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Register → Mailpit verification link → verify-email           | Verification email delivered and token accepted                                                                          |
| Login → `users/me` → `organizations` → `members` → `sessions` | Correct user, OWNER membership and session list                                                                          |
| Refresh rotation, CSRF double-submit, select-organization     | Rotated tokens accepted; missing CSRF rejected with 403                                                                  |
| Pending account login                                         | Rejected with 403 `EMAIL_NOT_VERIFIED`                                                                                   |
| Logout → refresh                                              | Logout clears the refresh cookie; the follow-up refresh is rejected (CSRF guard 403)                                     |
| Admin bootstrap → MFA setup → activate                        | Wrong TOTP rejected with 401; activation issues a session                                                                |
| Admin cross-tenant read                                       | Demo organization readable and audit-logged                                                                              |
| Subsequent admin login → MFA challenge → replay               | Challenge accepted; replayed TOTP rejected with 401                                                                      |
| RLS as `nis2_app` (NOBYPASSRLS)                               | No context = 0 organizations; user context = own org; org context = that tenant only; other actors' audit rows invisible |
| Append-only audit                                             | Runtime role blocked by RLS (0 rows); owner update/delete rejected by trigger                                            |

`docker compose up --build`, `prisma:migrate:deploy`, `prisma:seed`, the runtime-role script, the API/worker/web processes and the Vite `/api` proxy were all exercised. The dev stack sets `COOKIE_SECURE=false`; without recreating the API container after changing that value, cookies are issued with `Secure` and browsers will not store them over HTTP.

## 4. Deviations and decisions added

1. **Refresh cookie path is `/api/auth`** so it is not sent to business endpoints.
2. **`COOKIE_SECURE` defaults to true**; dev and prod-like Compose set it to `false` because they run on plain HTTP.
3. **CSRF exemptions** are limited to account-establishing/recovery flows; refresh/logout require the double-submit token.
4. **Breach check fails open** when HIBP is unreachable (logged); this keeps login/registration available. `BREACH_CHECK_ENABLED=false` supports air-gapped installs.
5. **Refresh/access revocation window:** revoking a session invalidates refresh tokens immediately; an already-issued access token can remain valid for up to its 15-minute TTL.
6. **User-initiated MFA enrolment** returns a short-lived setup token from `/api/auth/mfa/enroll`; the settings UI lands with the profile work.
7. **Admin bootstrap is CLI-only** (`ADMIN_BOOTSTRAP_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`); no UI path exists.
8. **Runtime DB role is opt-in via script** for the dev Compose stack; production must run `prisma:setup-runtime-role` and point `APP_DATABASE_URL` at it.
9. **Email delivery** uses nodemailer/SMTP; when `SMTP_HOST` is unset the message is logged (links still discoverable in dev).
10. **Dev Compose uses the maintained MinIO fork `pgsty/silo`** because the upstream images were removed from Docker Hub/Quay in 2026.
11. **`audit_log` has no foreign keys** to `users`/`organizations`: the `ON DELETE SET NULL`
    referential action would update the append-only trail and hit its trigger. Actor and organization
    identifiers remain as immutable references, so history survives account/organization deletion.
12. **Dev Compose builds `@nis2/shared` only in the API container.** Worker and web wait for the API
    healthcheck before starting, avoiding concurrent `tsup --clean` runs over the shared bind mount
    (which caused `ENOENT ... unlink dist/index.js` when all three started together).

## 5. Known gaps entering Phase 2

- E2E tests (Playwright) and DB-backed integration tests in CI (service container + migrations + RLS non-superuser role).
- User settings page for MFA enrolment and profile editing (API exists).
- Admin dashboard cross-tenant listing (Phase 8; admin read authorization exists).
- Notification/reminder delivery and cron jobs (Phase 8).
- Access-token denylist for instant session revocation (currently TTL-bounded).
- Password-reset/verification token cleanup job.
- Rate limits on non-auth endpoints and broader OpenAPI response schemas.

## 6. Phase 2 proposal (next, for approval)

1. Classification questionnaire UI driven by a versioned JSON definition (sectors Annex I/II, entity types, size rules).
2. Rules engine with EU SME partner/linked-enterprise handling and a 40+ scenario test table.
3. Versioned `classification_runs`, legal basis and consequence output, result summary page.
4. Classification PDF summary using the canonical content model (shared with Phase 4 exports).
5. Classification-driven document applicability/priority data for Phase 3.
