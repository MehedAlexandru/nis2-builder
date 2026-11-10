# Security Policy

NIS2 Compass stores sensitive security data (network maps, device posture, findings), so we hold
ourselves to the standard we help customers reach. The platform targets **OWASP ASVS Level 2**.

## Reporting a vulnerability

**Do not open a public issue.** Report privately via GitHub Security Advisories
("Security" → "Report a vulnerability") or email the maintainer.

Please include:

- affected component and version/commit,
- reproduction steps or a proof of concept,
- impact assessment,
- any suggested remediation.

We aim to acknowledge within **2 business days**, provide a triage decision within **5 business days**,
and coordinate disclosure after a fix is available.

## Supported versions

| Version | Supported                  |
| ------- | -------------------------- |
| 0.x     | Yes (pre-1.0, best effort) |

## Security baseline (enforced from Phase 0)

- Strict TypeScript, lint and dependency scanning in CI.
- gitleaks pre-commit and CI secret scanning.
- Argon2id password hashing; no plaintext secrets in the repository.
- Tenant isolation at the query layer **and** PostgreSQL Row Level Security (Phase 1).
- Audit log is append-only and records administrative cross-tenant access.
- Security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors 'none').
- Images built non-root, minimal, with pinned digests from Phase 9.

See `docs/security.md` for the full control matrix and roadmap.
