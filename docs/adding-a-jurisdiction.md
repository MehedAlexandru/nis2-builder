# Adding a jurisdiction pack

> Jurisdictions are **data, not code**. Adding a member state must not require application changes.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Pack model

A pack is versioned JSON stored in `jurisdiction_packs` and seeded from `packages/shared`:

```json
{
  "code": "RO",
  "version": "0.2.0-draft",
  "name": "Romania",
  "authority": "DNSC",
  "authorityUrl": "https://www.dnsc.ro",
  "legalInstrument": "OUG 155/2024",
  "status": "pending-legal-review",
  "language": "ro",
  "sections": {
    "registration": {},
    "classification": {},
    "supervision": {},
    "fines": {},
    "reporting": {},
    "documentOverrides": [],
    "contacts": []
  }
}
```

Phase 0 ships only metadata for Romania. The article-level mapping is authored in Phase 2.

## 2. Content sections

| Section             | Contents                                                                               |
| ------------------- | -------------------------------------------------------------------------------------- |
| `registration`      | Authority portal, required data, deadlines, updates                                    |
| `classification`    | National sector lists, size thresholds, entity-type mapping, size-independent criteria |
| `supervision`       | Ex-ante/ex-post regime, authority powers, audits                                       |
| `fines`             | Statutory ceilings and management liability (cited)                                    |
| `reporting`         | Incident deadlines, channels, templates, contact tree                                  |
| `documentOverrides` | National additions to the common document catalogue                                    |
| `contacts`          | Authority/CSIRT contacts and escalation path                                           |

## 3. Review status and versioning

- `draft` → not shown in production.
- `pending-legal-review` → shown with a visible warning.
- `verified` → reviewed and signed off.
- Every change creates a new version; historical classification runs pin the version they used.
- Activation is an explicit controlled action; do not overwrite a version in use.

## 4. Romania (current)

- Authority: **DNSC**.
- Instrument: **OUG 155/2024** (as supplied in the brief).
- Status: `pending-legal-review`, version `0.2.0-draft`. Phase 2 adds the sector catalog and ordered rules.
- The UI displays “Romanian jurisdiction content is pending legal review.”

## 5. Adding a new member state

1. Create the JSON pack with the metadata and empty/partial sections.
2. Cite every legal claim to the national law and/or NIS2 article; record source URLs and retrieval
   dates.
3. Run the legal review workflow (`docs/legal-content-policy.md`).
4. Add the pack to `jurisdictionPacks` metadata in `packages/shared/src/data/jurisdictions.ts`.
5. Add schema validation and a smoke test that loads the pack.
6. Seed it; activate only when `verified` (or show the pending warning).
7. Add the country to the establishment selector; no code changes elsewhere.

## 6. Rules engine contract

- Classification rules read the pack by `code + version`; they never hardcode country names.
- Rule outputs include `legalBasis` entries with citations and pack version.
- If a pack lacks a rule, the engine returns `LIKELY_IN_SCOPE` with an explicit “confirm with the
  authority” message rather than guessing.
- The 40+ scenario table (Phase 2) includes multi-country cases where applicable.

## 7. Tests

- Schema validation for every pack.
- No `draft` pack active in production.
- Every rule has at least one citation.
- Country selector lists only active packs.
- A pack change produces a new classification run, never mutates an old one.
