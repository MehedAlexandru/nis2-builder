# Contributing

## Branching and commits

- Trunk-based development. `main` is protected.
- Short-lived branches: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`.
- [Conventional Commits](https://www.conventionalcommits.org/) are enforced by commitlint.
- Commits are scoped to the workspace (`web`, `api`, `shared`, `agent`, `docs`, `deploy`, …).

```text
feat(classification): add size-independent criteria rules
fix(api): scope findings query to tenant
docs(security): document RLS runtime roles
```

## Definition of Done

Every change must include:

1. Code and tests (unit; integration where relevant).
2. i18n strings in **both** English and Romanian.
3. Accessibility check (keyboard navigation, focus states, labels).
4. A database migration if the schema changes, backward compatible (expand/contract).
5. Documentation updates.
6. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.
7. A security review pass for anything touching auth, authorization, tenancy, uploads or encryption.

## Local setup

See the quick start in `README.md`.

## Legal content

Legal references must cite a real article/annex of NIS2 (Directive (EU) 2022/2555) or the applicable
national law. Never invent legal content. New jurisdiction content is flagged `pending legal review`
until a qualified reviewer signs it off. See `docs/legal-content-policy.md`.
