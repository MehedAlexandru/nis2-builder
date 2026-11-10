# Legal content policy

> **This tool supports compliance preparation and does not constitute legal advice.**

## 1. Principle

NIS2 Compass never invents legal content. Every legal assertion must cite a real article or annex of
Directive (EU) 2022/2555 (NIS2) or the applicable national transposition, and must carry a review
status. If a rule cannot be cited confidently, the product says so and asks the user to confirm with
the authority or a lawyer.

## 2. What counts as legal content

- Classification rules and their outcomes.
- Sector/sub-sector lists and entity-type definitions.
- Size thresholds and partner/linked enterprise rules.
- Supervision regimes, fine ceilings, registration duties and deadlines.
- Document legal references, scope statements and mandatory clauses.
- Incident reporting deadlines and templates.
- Jurisdiction-specific authority names, portals and filing instructions.

UI copy explaining a concept is not legal content, but it must not introduce new legal claims.

## 3. Citation format

| Content type       | Citation format                       | Example                                |
| ------------------ | ------------------------------------- | -------------------------------------- |
| NIS2 article       | `NIS2 Art. <n>(<paragraph>)(<point>)` | `NIS2 Art. 21(2)(a)`                   |
| NIS2 annex         | `NIS2 Annex <I/II>, <sector>`         | `NIS2 Annex I, digital infrastructure` |
| National law       | `<instrument> Art. <n>`               | `OUG 155/2024 Art. <n>`                |
| Authority guidance | `<authority> <document>, <section>`   | `DNSC guidance, section <n>`           |

The Romania pack follows the national transposition supplied in the brief: **OUG 155/2024**, authority
**DNSC**. Article-level national mapping is authored during Phase 2 and must be verified line by line.

## 4. Review status

Every jurisdiction pack and document template carries one of:

| Status                 | Meaning                                                   | Allowed in production UI    |
| ---------------------- | --------------------------------------------------------- | --------------------------- |
| `draft`                | Authoring in progress; may be incomplete                  | No                          |
| `pending-legal-review` | Authored from official sources; awaiting qualified review | Yes, with a visible warning |
| `verified`             | Reviewed and signed off by a qualified reviewer           | Yes                         |

The current Romania pack is `pending-legal-review` (version `0.1.0-draft`). The UI displays:
“Romanian jurisdiction content is pending legal review.”

## 5. Workflow

1. **Author** — collect the official text, map each rule to a citation, and record the source URL and
   retrieval date.
2. **Technical review** — verify the rules engine consumes the data correctly and the scenarios
   produce the expected outcome.
3. **Legal review** — a qualified reviewer checks every citation and outcome, and records name,
   date and scope of review.
4. **Publish** — increment the pack version, set `verified`, activate it, and keep the previous
   version for reproducibility.
5. **Monitor** — subscribe to NIS2 implementing acts, national amendments and authority guidance;
   open a content change request when something changes.

No status change to `verified` may happen through the normal user UI; it is a controlled release
action.

## 6. Versioning and reproducibility

- Packs are versioned (`jurisdiction_packs.code + version`) and immutable once used.
- A `classification_runs` row pins `jurisdictionPackCode` and `jurisdictionPackVersion`, so a result
  can be replayed even after the pack is superseded.
- Document templates carry a version; revisions store the template version they were authored
  against.
- Changing a pack never rewrites historical results; it produces a new run.

## 7. References to implement (subject to legal review)

The following references come from the product brief and are the backbone of Phases 2–4. They are
listed here for implementation tracking, not as legal conclusions:

- **Art. 20** — management body approval, accountability and training.
- **Art. 21(2)(a)–(j)** — risk-management measures (risk analysis, incident handling, continuity,
  supply chain, acquisition/development, effectiveness assessment, hygiene/training, cryptography,
  HR/access control, MFA/secure communications).
- **Art. 22** — supply chain security.
- **Art. 23** — reporting: early warning within 24 hours, notification within 72 hours, final report
  within one month.
- **Annex I** — sectors of high criticality (energy, transport, banking, financial market
  infrastructure, health, drinking water, waste water, digital infrastructure, ICT service
  management, public administration, space).
- **Annex II** — other critical sectors (postal/courier, waste management, chemicals, food,
  manufacturing, digital providers, research).
- **Fine ceilings** — essential: up to EUR 10M or 2% of worldwide turnover; important: up to EUR 7M
  or 1.4% (as stated in the brief).

## 8. Quality gates

- Zod schema validation for every pack and template.
- A test asserts every rule/outcome has a non-empty citation.
- A test asserts no `draft` pack is active in production.
- The classification test table (40+ scenarios, Phase 2) must pass before a pack is published.
- A changelog entry is required for every version.

## 9. Disclaimer placement

The disclaimer is shown:

- in the app footer on every page,
- on the classification result and PDF summary,
- in exported DOCX/PDF documents,
- in the OpenAPI description,
- in the README and legal content documentation.

English wording is fixed: “This tool supports compliance preparation and does not constitute legal
advice.” Romanian: “Acest instrument sprijină pregătirea conformității și nu constituie consultanță
juridică.”
