# Definition of Done

Every feature and every phase must satisfy this checklist before review.

## 1. Code

- [ ] Implements the agreed scope; no silent scope creep.
- [ ] Strict TypeScript; no `any` without a documented reason.
- [ ] Shared contracts (Zod/types) live in `packages/shared` when used by API and web.
- [ ] Parameterized queries; no string-built SQL with user input.
- [ ] Errors use the standard envelope and do not leak internals.
- [ ] Logs are structured and redact secrets/PII.

## 2. Tenancy and security

- [ ] Every new endpoint is scoped to the authenticated `organizationId`.
- [ ] New tenant tables carry `organizationId` and are covered by an RLS policy.
- [ ] Authorization tests prove another tenant cannot read or write the data.
- [ ] Role escalation is impossible (user cannot become admin, member cannot become owner without
      an explicit transfer flow).
- [ ] Admin cross-tenant access is audit-logged and read-only.
- [ ] File uploads validate type, size, magic bytes and are scanned.
- [ ] Security-relevant actions are written to the audit log.
- [ ] The security review checklist in `docs/security.md` is completed.

## 3. Tests

- [ ] Unit tests for business rules and edge cases.
- [ ] Integration/API tests for the endpoint (happy path + authorization failures).
- [ ] E2E coverage for user-facing flows (Phase 3+).
- [ ] Export tests: DOCX opens in LibreOffice headless; PDF visual regression (Phase 4+).
- [ ] Classification rules table has 40+ scenarios (Phase 2).
- [ ] Agent discovery test on a simulated Docker network (Phase 6).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` is green.

## 4. Data

- [ ] Prisma migration included; never edit an applied migration.
- [ ] Migration is expand/contract and backward compatible.
- [ ] Backfill plan for existing data, if needed.
- [ ] Indexes support the primary access path.
- [ ] Retention and encryption requirements documented.

## 5. i18n and accessibility

- [ ] Strings added to both `en` and `ro`.
- [ ] Dates/numbers/currency use locale formatting.
- [ ] Keyboard navigation works; focus is visible and managed.
- [ ] Labels, help text and errors are programmatically associated.
- [ ] Colour is not the only signal; contrast meets AA.
- [ ] Reduced motion respected; no focus traps.
- [ ] Screen-reader basics verified for new flows.

## 6. Documentation

- [ ] README or relevant `docs/` page updated.
- [ ] OpenAPI regenerated and committed if the API changed.
- [ ] `.env.example` updated for new variables.
- [ ] Migration/rollback notes in the PR.
- [ ] Screenshots for UI changes.

## 7. Delivery

- [ ] Conventional Commit with a valid scope.
- [ ] PR description links the issue and states tenant/security impact.
- [ ] CI green (lint, typecheck, tests, build, OpenAPI drift, Go, gitleaks).
- [ ] Phase report written and reviewed before the next phase starts.

## 8. Phase gate

A phase is complete only when:

1. The full phase scope is implemented (or explicitly deferred with approval).
2. The phase demo works from a clean checkout.
3. Tests and CI are green.
4. Documentation and the phase report are updated.
5. The user has reviewed and approved moving to the next phase.
