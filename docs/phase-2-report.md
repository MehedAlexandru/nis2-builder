# Phase 2 report

> Status: **complete, awaiting review before Phase 3**.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Delivered

| Area              | Deliverable                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules data        | Versioned Romanian pack `RO@0.2.0-draft` with 18 Annex I/II sectors, subsectors, entity types and citations. Data lives in `packages/shared/src/data/classification`.                                                                                          |
| Rules engine      | Pure, deterministic evaluator over ordered declarative conditions (`all`/`any`/`not`, field operators). First matching rule wins; every rule and consequence has at least one legal citation.                                                                  |
| Size calculation  | Recommendation 2003/361/EC consolidation: own data + linked at 100% + partners pro rata to ownership; micro/small/medium/large boundaries and the “exceed medium ceilings” test.                                                                               |
| Outcomes          | `ESSENTIAL`, `IMPORTANT`, `LIKELY_IN_SCOPE`, `OUT_OF_SCOPE`, with confidence and stored reason key. Annex I medium is important; Annex I large is essential; Annex II medium/large is important; qualified trust/TLD/DNS/CER are essential regardless of size. |
| Consequences      | Supervision regime, fine ceilings, management liability, registration and incident-reporting duties with NIS2 citations (Art. 20, 23(4), 27, 32, 33, 34(4)/(5)).                                                                                               |
| Document priority | A snapshot of 17 provisional document requirements per run (`required`/`voluntary` and priority) for Phase 3 to consume.                                                                                                                                       |
| Persistence       | Migration `0004_classification_applicability` adds `applicability`, `ruleId` and `reasonKey` to `classification_runs`. Runs pin the jurisdiction pack version and are tenant-scoped by the existing RLS policy.                                                |
| API               | `GET /api/classification/catalog`, `GET /api/classification/current`, `GET /api/classification/runs`, `POST /api/classification/runs`, `GET /api/classification/runs/:id`, `GET /api/classification/runs/:id/summary.pdf`. Classification creation is audited. |
| Web               | Four-step wizard (entity, size, size-independent criteria, review), result page, history, PDF download, dashboard/nav links, full English/Romanian strings.                                                                                                    |
| PDF               | Server-rendered summary with outcome, entity/size breakdown, consequences, document checklist, legal basis and disclaimer.                                                                                                                                     |
| Tests             | 64-scenario table + engine/PDF/wizard tests; 85 shared, 24 API and 8 web tests.                                                                                                                                                                                |

### Endpoints

| Method | Path                                          | Auth         |
| ------ | --------------------------------------------- | ------------ |
| GET    | `/api/classification/catalog`                 | access token |
| GET    | `/api/classification/current`                 | access token |
| GET    | `/api/classification/runs`                    | access token |
| POST   | `/api/classification/runs`                    | access token |
| GET    | `/api/classification/runs/:runId`             | access token |
| GET    | `/api/classification/runs/:runId/summary.pdf` | access token |

The organization is taken from the access-token claim (selected organization); a run can only be
created or read by a member of that organization.

## 2. Legal mapping implemented

| Rule                                            | Outcome   | Citation                   |
| ----------------------------------------------- | --------- | -------------------------- |
| CER critical entity                             | Essential | Art. 2(3), 3(1)(f)         |
| Domain name registration service                | Important | Art. 2(4), 3(2)            |
| Qualified trust service provider                | Essential | Art. 2(2)(a)(ii), 3(1)(b)  |
| TLD registry / DNS service provider             | Essential | Art. 2(2)(a)(iii), 3(1)(b) |
| Central government public administration        | Essential | Art. 2(2)(f)(i), 3(1)(d)   |
| Public electronic communications, medium/large  | Essential | Art. 2(2)(a)(i), 3(1)(c)   |
| Identified as essential by the Member State     | Essential | Art. 3(1)(e)               |
| Annex I, large                                  | Essential | Art. 3(1)(a)               |
| Annex I, medium                                 | Important | Art. 3(2)                  |
| Annex II, medium/large                          | Important | Art. 3(2)                  |
| Public electronic communications, small/micro   | Important | Art. 2(2)(a)(i), 3(2)      |
| Trust service provider without qualified status | Important | Art. 2(2)(a)(ii), 3(2)     |
| Regional / local public administration          | Likely    | Art. 2(2)(f)(ii), 2(5)(a)  |
| Sole provider / impact / systemic / national    | Likely    | Art. 2(2)(b)–(e), 3(2)     |
| Listed sector, micro/small, no other criterion  | Out       | Art. 2(1), Annexes I/II    |
| Sector not listed                               | Out       | Art. 2(1), Annexes I/II    |

Fine ceilings: essential up to EUR 10M or 2% (Art. 34(4)); important up to EUR 7M or 1.4%
(Art. 34(5)). The Romanian pack remains `pending-legal-review`; national registration deadlines and
the OUG 155/2024 article mapping must be confirmed with DNSC/legal review.

## 3. Verification evidence

Environment: Windows dev shell + Docker Compose (WSL2), Node 20.19, pnpm 10.34.9, TypeScript 5.9.3.

| Check                   | Result                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `pnpm lint`             | 3/3 packages successful                                                     |
| `pnpm typecheck`        | 4/4 tasks successful                                                        |
| `pnpm test`             | Shared 85, API 24, web 8 = **117 tests passing**                            |
| `pnpm build`            | 3/3 packages successful                                                     |
| `pnpm openapi:generate` | Contract regenerated with the classification routes                         |
| `prisma validate`       | Schema valid                                                                |
| `pnpm format:check`     | Passes                                                                      |
| Migration               | `0004_classification_applicability` applied in Docker                       |
| Seed                    | Pack `RO@0.2.0-draft` active; demo classification v1 (`IMPORTANT`)          |
| PDF smoke               | `%PDF` header, 6,233 bytes, outcome and citations rendered                  |
| Invalid input           | Unknown sector rejected with `400 CLASSIFICATION_INPUT_INVALID`             |
| RLS                     | Existing tenant policies cover `classification_runs` and `company_profiles` |

HTTP smoke flow: login (`owner@demo.local`) → catalog (18 sectors, pack `pending-legal-review`) →
current seeded run (`IMPORTANT`, rule `ro-annex-i-medium`, 17 documents) → create a 500-employee cloud
provider run (`ESSENTIAL`, rule `ro-annex-i-large`) → detail → current advanced → PDF download. The
demo data was reset afterwards so the seeded run remains the visible result.

## 4. Deviations and decisions added

- Rules are **ordered data with first-match semantics**; tests assert the exact winning rule ID.
- Regional/local public administration and the Art. 2(2)(b)–(e) criteria return `LIKELY_IN_SCOPE`
  because the final designation is made by the Member State.
- The PDF summary uses PDFKit with a standard font during Phase 2. Phase 4 replaces it with the
  canonical DOCX/PDF renderer and embedded brand fonts.
- The 17 document keys are provisional; Phase 3 owns the real template catalogue but consumes the
  stored applicability snapshot.
- National registration deadlines are intentionally not invented; the pack states that they must be
  confirmed with DNSC.

## 5. Known gaps entering Phase 3

- Legal review of the Romanian pack and the OUG 155/2024 article-level mapping.
- Playwright end-to-end coverage and DB-backed API integration tests in CI.
- Phase 4 unified PDF/DOCX template and embedded fonts; Phase 2 PDF is not pixel-identical to the app.
- Document templates and the documentation centre (Phase 3); the classification snapshot is ready.
- Admin cross-tenant classification browsing (Phase 8); current access is membership-scoped.
- Education and other unlisted sectors are handled by the explicit “not listed” path; national
  optional scope for education/local administration still needs authority confirmation.

## 6. Phase 3 proposal (next, for approval)

1. Data-driven document template catalogue seeded from versioned JSON, with sections, fields, weights, validation and export mapping.
2. Documentation cards with search/filter, weighted progress ring and classification-driven priority.
3. Form renderer with autosave, optimistic concurrency, immutable revisions, diff and restore.
4. Named versions/approvals and the review-date workflow.
5. Tenant-scoped document API, audit events and integration tests.
