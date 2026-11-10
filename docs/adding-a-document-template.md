# Adding a document template

> Phase 3 implements the form engine and export mapping. This document is the contract template
> authors will follow. Never hand-code a form for a document.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. What a template contains

A document template is versioned JSON stored in `document_templates.schema`, validated by Zod, and
seeded from `packages/shared`. It defines:

- identity: `key`, bilingual `title`, bilingual `description`, `category`;
- legal basis: `legalReference` (real article/annex), `applicability`
  (`ESSENTIAL`/`IMPORTANT`/`BOTH`/`VOLUNTARY`);
- ownership: `ownerRole`, `reviewFrequencyMonths`;
- structure: sections and fields (type, validation, help, example, weight, export mapping);
- export: headings, tables, callouts, matrices, signature block and revision history.

## 2. Structure

```json
{
  "key": "awareness-training",
  "version": 1,
  "category": "people",
  "applicability": "BOTH",
  "ownerRole": "CISO",
  "reviewFrequencyMonths": 12,
  "legalReference": "NIS2 Art. 21(2)(g)",
  "title": {
    "en": "Cyber hygiene and security awareness training",
    "ro": "Igienă cibernetică și conștientizare în securitate"
  },
  "description": {
    "en": "Programme, content, frequency and attendance evidence.",
    "ro": "Program, conținut, frecvență și dovezi de participare."
  },
  "sections": [
    {
      "key": "programme",
      "title": { "en": "Training programme", "ro": "Programul de instruire" },
      "fields": [
        {
          "key": "frequency",
          "type": "select",
          "label": { "en": "Frequency", "ro": "Frecvență" },
          "help": {
            "en": "How often employees receive awareness training.",
            "ro": "Cât de des primesc angajații instruire."
          },
          "required": true,
          "weight": 2,
          "options": [
            { "value": "quarterly", "label": { "en": "Quarterly", "ro": "Trimestrial" } },
            { "value": "annual", "label": { "en": "Annual", "ro": "Anual" } }
          ],
          "export": { "kind": "definition_row" }
        }
      ]
    }
  ]
}
```

## 3. Field types

| Type                | Purpose                            | Notes                                                   |
| ------------------- | ---------------------------------- | ------------------------------------------------------- |
| `text`              | Short answer                       | min/max length, pattern                                 |
| `richText`          | Policy prose                       | sanitized allowlist, no raw HTML from users             |
| `select`            | Single choice                      | bilingual options                                       |
| `multiSelect`       | Multiple choices                   | max selections                                          |
| `date` / `datetime` | Dates                              | timezone-aware                                          |
| `table`             | Repeater rows                      | column definitions, min/max rows, per-column validation |
| `peoplePicker`      | Internal owner/approver            | references organization members                         |
| `checklist`         | Evidence/controls                  | item state + optional evidence                          |
| `attachment`        | Files                              | MIME/size limits, virus scan                            |
| `yesNo`             | Binary with conditional follow-ups | `followUps` shown when true/false                       |
| `riskMatrix`        | Likelihood × impact                | color-coded heat map in exports                         |
| `signature`         | Approval block                     | approver, role, date, optional signature image          |

Common attributes: `key`, `type`, `label`, `help`, `example`, `required`, `weight`, `validation`,
`conditional` (show when another field has a value), `export`.

## 4. Progress weighting

- Each field has a `weight` (1–5). Required fields default to weight 2; optional evidence fields to 1.
- Document progress = completed weight / total applicable weight, rounded to the nearest integer.
- A field is complete when it has a valid non-empty value; table rows count per row.
- Conditional fields that are not applicable are excluded from the denominator.
- The card shows the weighted percentage; the export includes the same calculation.

## 5. Versioning

- Changing fields/titles/validation creates a new template `version`.
- Existing revisions pin the template version they were authored against; they are never
  reinterpreted.
- Adding an optional field can remain backward compatible; making a field required requires a
  migration plan and a “needs review” status for existing documents.
- `key` is stable; never reuse a retired key.

## 6. Applicability and classification

- `applicability` determines whether the document is required for Essential, Important, both, or
  voluntary (out-of-scope/good-practice mode).
- The classification result (Phase 2) drives the documentation page order and priority.
- A document can be marked “recommended/voluntary” with the same template; no duplicate templates.

## 7. Legal review

- `legalReference` must cite a real NIS2 article/annex or national provision.
- Template text is reviewed under `docs/legal-content-policy.md`.
- Legal content is `pending-legal-review` until signed off; the UI shows a warning.
- Never invent a requirement; if uncertain, phrase it as guidance and ask the user to confirm.

## 8. Export mapping

- `export.kind`: `paragraph`, `definition_row`, `table`, `callout`, `risk_matrix`, `signature`,
  `toc`, `page_break`.
- Tables use primary-600 headers and primary-50 zebra rows in both DOCX and PDF.
- Callouts map to info/warning/critical tints.
- The same canonical content model feeds both renderers (see `docs/architecture.md`).

## 9. Seeding and tests

1. Add the JSON under `packages/shared/src/data/document-templates/`.
2. Validate it with the template Zod schema at build time.
3. Add unit tests for schema validity, weighted progress and conditional fields.
4. Add export golden tests in Phase 4 (DOCX opens in LibreOffice; PDF visual regression).
5. Seed via an idempotent upsert keyed by `key + version`.

## 10. Checklist

- [ ] Real legal reference and reviewed wording
- [ ] Bilingual label/help/options for every field
- [ ] Required fields and weights defined
- [ ] Conditional logic tested
- [ ] Export mapping complete
- [ ] Version incremented; old documents unaffected
- [ ] Accessibility: labels, help association, keyboard order
- [ ] No customer data in examples
