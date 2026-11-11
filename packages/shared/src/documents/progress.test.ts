import { describe, expect, it } from 'vitest';
import { documentTemplateSchema, type DocumentTemplate } from '../schemas/documents';
import { getDocumentTemplate, getDocumentTemplates } from '../data/document-templates';
import {
  applyDocumentPrefill,
  calculateDocumentProgress,
  diffDocumentPayloads,
  documentStatusFromProgress,
  isFieldComplete,
  validateDocumentPayload,
  visibleTemplateFields,
} from './progress';

describe('document template catalogue', () => {
  it('contains the required governance, Art. 21 and supporting documents', () => {
    const templates = getDocumentTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(19);
    expect(new Set(templates.map((template) => template.key)).size).toBe(templates.length);
    for (const key of [
      'governance_registration',
      'management_approval_training',
      'information_security_policy',
      'risk_management_policy',
      'asset_inventory',
      'incident_response_plan',
      'incident_reporting_procedure',
      'business_continuity_plan',
      'supply_chain_security',
      'secure_development_policy',
      'audit_testing',
      'security_awareness_training',
      'cryptography_policy',
      'hr_security',
      'mfa_secure_communications',
      'patch_change_management',
      'network_security_segmentation',
      'logging_monitoring',
      'statement_of_applicability',
    ]) {
      expect(getDocumentTemplate(key), key).toBeDefined();
    }
  });

  it('validates every seeded template and uses bilingual labels', () => {
    for (const template of getDocumentTemplates()) {
      expect(documentTemplateSchema.safeParse(template).success).toBe(true);
      expect(template.title.en.length).toBeGreaterThan(0);
      expect(template.title.ro.length).toBeGreaterThan(0);
      for (const field of template.sections.flatMap((section) => section.fields)) {
        expect(field.label.en.length).toBeGreaterThan(0);
        expect(field.label.ro.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('weighted document progress', () => {
  const risk = requiredTemplate('risk_management_policy');

  it('starts at zero and counts required fields', () => {
    const progress = calculateDocumentProgress(risk, {});
    expect(progress.percentage).toBe(0);
    expect(progress.requiredRemaining).toBeGreaterThan(0);
    expect(progress.issues.length).toBeGreaterThan(0);
  });

  it('increases only when fields are complete and valid', () => {
    const payload = {
      methodology: 'ISO 27005 aligned',
      riskCriteria: 'Medium residual risk accepted by the CISO',
      reviewCycle: 'Annual',
    };
    const partial = calculateDocumentProgress(risk, payload);
    expect(partial.percentage).toBeGreaterThan(0);
    expect(partial.percentage).toBeLessThan(100);
    expect(partial.completedWeight).toBeGreaterThan(0);
  });

  it('completes a table only when required columns are filled', () => {
    const table = risk.sections[1]?.fields[0];
    if (!table) throw new Error('risk register table missing');
    expect(isFieldComplete(table, [])).toBe(false);
    expect(
      isFieldComplete(table, [
        { asset: 'ERP', threat: 'Outage' },
        { asset: 'Email', threat: 'Phishing' },
        { asset: 'DNS', threat: 'Spoofing' },
      ]),
    ).toBe(true);
    expect(isFieldComplete(table, [{ asset: 'ERP' }, { threat: 'Phishing' }])).toBe(false);
  });

  it('requires every required checklist item', () => {
    const checklistField = requiredTemplate('hr_security').sections[0]?.fields.find(
      (field) => field.type === 'checklist',
    );
    if (!checklistField || !checklistField.items) throw new Error('checklist missing');
    const complete = Object.fromEntries(checklistField.items.map((item) => [item.key, true]));
    expect(isFieldComplete(checklistField, complete)).toBe(true);
    expect(isFieldComplete(checklistField, { ...complete, access: false })).toBe(false);
  });

  it('reports validation issues for required fields and malformed tables', () => {
    const issues = validateDocumentPayload(risk, { methodology: '' });
    expect(issues.some((issue) => issue.fieldKey === 'methodology')).toBe(true);
    expect(issues.some((issue) => issue.fieldKey === 'riskRegister')).toBe(true);
  });

  it('derives lifecycle status from progress and review state', () => {
    expect(documentStatusFromProgress(0)).toBe('NOT_STARTED');
    expect(documentStatusFromProgress(40)).toBe('IN_PROGRESS');
    expect(documentStatusFromProgress(100)).toBe('COMPLETE');
    expect(documentStatusFromProgress(100, { overdue: true })).toBe('NEEDS_REVIEW');
    expect(documentStatusFromProgress(70, { templateChanged: true })).toBe('NEEDS_REVIEW');
  });
});

describe('conditional fields, diff and prefill', () => {
  const template = documentTemplateSchema.parse({
    key: 'conditional-test',
    version: 1,
    category: 'test',
    applicability: 'BOTH',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)',
    title: { en: 'Test', ro: 'Test' },
    shortDescription: { en: 'Test', ro: 'Test' },
    sortOrder: 1,
    sections: [
      {
        key: 'main',
        title: { en: 'Main', ro: 'Principal' },
        fields: [
          {
            key: 'hasPolicy',
            type: 'yesNo',
            label: { en: 'Has policy', ro: 'Are politica' },
            required: true,
            weight: 2,
            followUpKeys: ['policyReference'],
          },
          {
            key: 'policyReference',
            type: 'text',
            label: { en: 'Reference', ro: 'Referinta' },
            required: true,
            weight: 3,
            conditional: { field: 'hasPolicy', equals: true },
            prefillKey: 'company.reference',
          },
        ],
      },
    ],
  });

  it('excludes hidden conditional fields from progress', () => {
    expect(visibleTemplateFields(template, { hasPolicy: false })).toHaveLength(1);
    expect(visibleTemplateFields(template, { hasPolicy: true })).toHaveLength(2);
    expect(calculateDocumentProgress(template, { hasPolicy: false }).percentage).toBe(100);
    expect(calculateDocumentProgress(template, { hasPolicy: true }).percentage).toBe(40);
  });

  it('diffs visible field values', () => {
    expect(diffDocumentPayloads(template, { hasPolicy: false }, { hasPolicy: true })).toEqual([
      'hasPolicy',
    ]);
  });

  it('prefills only empty fields from the company profile', () => {
    const prefilled = applyDocumentPrefill(
      template,
      { hasPolicy: true },
      { company: { reference: 'POL-01' } },
    );
    expect(prefilled).toEqual({ hasPolicy: true, policyReference: 'POL-01' });
  });
});

function requiredTemplate(key: string): DocumentTemplate {
  const template = getDocumentTemplate(key);
  if (!template) throw new Error(`Missing template ${key}`);
  return template;
}
