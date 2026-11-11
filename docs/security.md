# Security architecture and controls

> NIS2 Compass stores sensitive network maps, device posture and findings. It must meet the standard
> it helps customers reach. Target: **OWASP ASVS Level 2**.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Security objectives

1. **Tenant isolation** — no user can read or write another organization's data.
2. **Account integrity** — strong authentication, MFA for admins, safe session lifecycle.
3. **Confidentiality at rest** — sensitive device secrets and attachments encrypted.
4. **Traceability** — append-only audit trail, including every admin cross-tenant access.
5. **Availability** — exports and scans are queued and retryable; health/readiness are explicit.
6. **Supply-chain integrity** — pinned dependencies, scanning, SBOM and signed images by v1.0.

## 2. Threat model (summary)

| Asset                         | Adversary                                     | Trust boundary                  |
| ----------------------------- | --------------------------------------------- | ------------------------------- |
| Tenant documents and findings | Another tenant, curious admin, stolen session | Browser ↔ API ↔ DB              |
| Device credentials/notes      | DB compromise, insider                        | API ↔ KMS ↔ encrypted columns   |
| Scan results and network maps | Network attacker, malicious agent             | Agent ↔ API                     |
| Admin capabilities            | Privilege escalation, CSRF                    | Admin session ↔ admin endpoints |
| Export artifacts              | Signed-URL leakage                            | Worker ↔ S3 ↔ browser           |
| Legal content                 | Content tampering                             | Authoring/review pipeline       |

Primary mitigations: authn/authz guards, tenant scoping, RLS, encryption, audit logging, strict CORS
and CSRF, rate limits, input validation, file scanning and least-privilege runtime roles.

## 3. Controls implemented in Phase 0

- Strict TypeScript, ESLint, Prettier and commit hooks.
- gitleaks pre-commit + CI secret scanning; `.gitleaks.toml` allowlists only known dev placeholders.
- Helmet: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP/CORP, HSTS in
  production, CSP in production (`default-src 'none'` for the API).
- Strict CORS allowlist from configuration; credentials enabled only for known origins.
- 10 MB JSON body limit; generic 5xx messages; correlation IDs in every error.
- Structured JSON logs with redaction of authorization headers, cookies, passwords, tokens and
  secrets.
- Environment validation: production refuses dev secrets, localhost DB, localhost origins and
  missing S3/SMTP/secrets configuration.
- PostgreSQL RLS policies on all tenant tables; `FORCE ROW LEVEL SECURITY`.
- Append-only audit log enforced by trigger.
- Non-root containers (API runtime user, nginx-unprivileged, distroless nonroot agent).
- Prisma parameterized queries by default; raw SQL only in migrations with static identifiers.
- OpenAPI contract generated and diff-checked in CI.

## 4. ASVS Level 2 matrix (target)

| ASVS chapter       | Controls                                                               | Phase 0 status                                | Owner phase |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------- | ----------- |
| V1 Architecture    | Threat model, secure defaults, trust boundaries                        | Documented here                               | 0           |
| V2 Authentication  | Argon2id, breach check, MFA, lockout, recovery                         | **Implemented**                               | 1           |
| V3 Session         | Rotating refresh tokens, reuse detection, revoke, idle/absolute expiry | **Implemented** (TTL-bounded access)          | 1           |
| V4 Access control  | Deny by default, tenant scoping, RLS, admin auditing                   | **Implemented** (guards + user RLS path)      | 1           |
| V5 Validation      | Zod everywhere, shared schemas, file type/size limits                  | Pipe + shared schemas in place                | 1–5         |
| V6 Cryptography    | TLS 1.2+, AES-256-GCM envelope encryption, KMS                         | Design + key config                           | 1/7         |
| V7 Error/logging   | Generic errors, correlation IDs, no secrets in logs                    | Implemented                                   | 0           |
| V8 Data protection | Classification, retention, encrypted attachments                       | Schema + map                                  | 3/7         |
| V9 Communication   | TLS, HSTS, strict CORS, secure cookies                                 | **Implemented** (`COOKIE_SECURE`)             | 1           |
| V10 Malicious code | Signed images, SBOM, dependency scanning                               | CI skeleton; signing Phase 9                  | 9           |
| V11 Business logic | Server-side authorization, state transitions                           | Module boundaries                             | 1–8         |
| V12 Files          | Upload scanning, content-type allowlist, size limits, private storage  | Design                                        | 3/5         |
| V13 API            | OpenAPI, schema validation, rate limits, pagination caps               | Contract + validation; auth throttles         | 1+          |
| V14 Config         | Secrets management, least privilege, hardened images                   | Env validation, runtime role script, non-root | 1/9         |

## 5. Authentication and session design (Phase 1)

- Argon2id with per-user salt; parameters tuned for interactive login.
- Minimum 12-character password, maximum 128; breached-password check via k-anonymity or offline
  list. No forced composition rules.
- Email verification tokens and password-reset tokens: random 256-bit, stored hashed, single use,
  short expiry.
- Access JWT: 15 minutes, `aud`/`iss`, `sub`, `role`, `org`, session ID; kept in memory.
- Refresh token: 256-bit random, hashed at rest, rotated on every refresh; reuse revokes the family.
- Cookie: `HttpOnly; Secure; SameSite=Strict; Path=/auth`.
- CSRF: double-submit token for state-changing requests, plus same-site cookie.
- MFA: TOTP (RFC 6238), ±1 step window, replay prevention, hashed recovery codes. Admin MFA is
  mandatory and enforced at login and on privileged endpoints.
- Progressive lockout per account and per IP, Redis-backed; generic responses prevent enumeration.
- Admin bootstrap via a one-time CLI using `ADMIN_BOOTSTRAP_TOKEN`; no UI path.

## 6. Authorization and tenancy

- Guards: authenticated → active → MFA satisfied (admin) → membership → role/permission.
- Every controller/service receives `organizationId` from the authenticated membership, never from
  the request body.
- Prisma tenant extension injects `organizationId`; RLS is the second layer.
- Admin cross-tenant read:
  1. write an `ADMIN_ACCESS` audit entry (actor, target org, resource, reason, correlation ID);
  2. set a short-lived, explicitly scoped context;
  3. return read-only data;
  4. never allow write impersonation.
- The customer sees these entries in their audit log.
- Runtime DB role separation is a Phase 1 requirement; the dev superuser bypasses RLS by design and
  is not acceptable in production.

## 7. Cryptography and secrets

- TLS 1.2+ everywhere; HSTS in production.
- Passwords: Argon2id. Tokens: SHA-256 hashes at rest (high entropy input).
- Field-level envelope encryption: per-org DEK (AES-256-GCM) wrapped by a KEK in KMS/Vault.
- Key identifiers stored with ciphertext; rotation re-wraps DEKs, not ciphertext.
- No secrets in the repository; `.env` ignored; production via Kubernetes Secrets/External
  Secrets/Vault.
- JWT/cookie/encryption keys are validated for length and rejected if they are dev placeholders in
  production.

## 8. Input, output and files

- Zod schemas shared by API and SPA; unknown keys rejected; pagination capped at 100.
- Output encoding is handled by React; no `dangerouslySetInnerHTML` for user content.
- Rich text (Phase 3) is sanitized server-side with an allowlist before storage/export.
- Uploads: allowlisted MIME + extension, size limit, magic-byte check, antivirus scan (ClamAV
  sidecar or provider), private S3 bucket, short-lived signed URLs, `Content-Disposition:
attachment`.
- Nmap XML/CSV imports are parsed with size/depth limits and never executed.

## 9. Logging, audit and monitoring

- JSON logs with service, env, request ID, method, path, status, latency.
- Redaction of credentials, cookies, tokens and secrets.
- Audit log: append-only, tenant-readable, admin-visible globally; recorded events include login
  success/failure, role changes, document edits/exports, admin access, scans, account changes.
- Prometheus metrics at `/metrics`; scrape only from the internal network.
- Alerts planned: auth failure spikes, 5xx rate, readiness failures, queue backlog, export failures.

## 10. GDPR

- Data processing register, privacy policy and DPA templates (Phase 8/9).
- Data export (Art. 15/20) and erasure (Art. 17) flows; audit entries retained as required by law.
- Data residency in the EU; S3 region pinned.
- Retention settings per data class; attachments and exports expire.
- Breach notification procedure for the platform itself (see runbook).
- Admin access transparency via the customer-visible audit log.

## 11. Supply chain and CI

- Lockfile committed; Dependabot weekly.
- CI: lint, typecheck, unit tests, build, OpenAPI drift, Go vet/test/build, gitleaks.
- Phase 9: CodeQL/Semgrep, Trivy image scanning, SBOM (CycloneDX), cosign signing, provenance,
  pinned base image digests, staging deploy and smoke tests.

## 12. Security review checklist (every PR)

- [ ] Authorization: new endpoint scoped to `organizationId`, guards applied.
- [ ] RLS: new table added to the policy migration.
- [ ] Validation: Zod schema, unknown keys rejected, limits enforced.
- [ ] Output: no secret/PII leakage in errors or logs.
- [ ] Crypto: no custom crypto, no secret in code, keys from config/KMS.
- [ ] Uploads: type/size/scanning considered.
- [ ] Audit: security-relevant action recorded.
- [ ] Tests: cross-tenant negative test and role-escalation test.
- [ ] i18n: both languages.

## 13. Known gaps after Phase 1 (tracked)

1. DB-backed authorization/RLS integration tests in CI (non-superuser role, cross-tenant matrix).
2. Instant access-token revocation: sessions kill refresh tokens immediately; access tokens expire
   within 15 minutes.
3. Password-reset/verification token cleanup job.
4. CSP for the SPA is set in nginx; the API disables CSP in development only to serve Swagger.
5. Base images are tag-pinned, not digest-pinned; signing/SBOM in Phase 9.
6. No automated axe/Playwright security tests yet (Phase 3/9).
7. The dev Compose stack uses the PostgreSQL superuser; production must use
   `prisma:setup-runtime-role` and `APP_DATABASE_URL`.
