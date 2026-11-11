import { describe, expect, it } from 'vitest';
import { getClassificationPack } from '../data/classification';
import { classificationAnswersSchema } from '../schemas/classification';
import { classify, evaluateRuleCondition } from './engine';
import { calculateEnterpriseSize, categorizeSize } from './size';

const pack = getClassificationPack('RO');
if (!pack) throw new Error('RO pack missing');

function answers(overrides: Record<string, unknown> = {}) {
  return classificationAnswersSchema.parse({
    establishmentCountries: ['RO'],
    sectorCode: 'ict_service_management',
    subsectorCode: 'managed_services',
    entityTypeCode: 'managed_service_provider',
    size: { employees: 100, annualTurnoverEur: 20_000_000, balanceSheetTotalEur: 10_000_000 },
    ...overrides,
  });
}

describe('enterprise size calculation', () => {
  it('adds linked enterprises at 100 percent', () => {
    const size = calculateEnterpriseSize(
      {
        employees: 100,
        annualTurnoverEur: 10_000_000,
        balanceSheetTotalEur: 5_000_000,
        consolidation: 'PARTNER_LINKED',
        partners: [],
        linkedEnterprises: [
          {
            employees: 100,
            annualTurnoverEur: 10_000_000,
            balanceSheetTotalEur: 5_000_000,
            ownershipPercent: 100,
          },
        ],
      },
      pack.sizeRules,
    );

    expect(size.total.employees).toBe(200);
    expect(size.total.annualTurnoverEur).toBe(20_000_000);
    expect(size.category).toBe('MEDIUM');
  });

  it('adds partner enterprises proportionally to ownership', () => {
    const size = calculateEnterpriseSize(
      {
        employees: 10,
        annualTurnoverEur: 2_000_000,
        balanceSheetTotalEur: 1_000_000,
        consolidation: 'PARTNER_LINKED',
        linkedEnterprises: [],
        partners: [
          {
            employees: 200,
            annualTurnoverEur: 40_000_000,
            balanceSheetTotalEur: 20_000_000,
            ownershipPercent: 25,
          },
        ],
      },
      pack.sizeRules,
    );

    expect(size.partners.employees).toBe(50);
    expect(size.total.employees).toBe(60);
    expect(size.category).toBe('MEDIUM');
  });

  it('classifies micro, small, medium and large boundaries', () => {
    const rules = pack.sizeRules;
    expect(
      categorizeSize(
        { employees: 9, annualTurnoverEur: 2_000_000, balanceSheetTotalEur: 1_000_000 },
        rules,
      ),
    ).toBe('MICRO');
    expect(
      categorizeSize(
        { employees: 10, annualTurnoverEur: 2_000_000, balanceSheetTotalEur: 1_000_000 },
        rules,
      ),
    ).toBe('SMALL');
    expect(
      categorizeSize(
        { employees: 49, annualTurnoverEur: 10_000_000, balanceSheetTotalEur: 10_000_000 },
        rules,
      ),
    ).toBe('SMALL');
    expect(
      categorizeSize(
        { employees: 50, annualTurnoverEur: 10_000_000, balanceSheetTotalEur: 10_000_000 },
        rules,
      ),
    ).toBe('MEDIUM');
    expect(
      categorizeSize(
        { employees: 249, annualTurnoverEur: 50_000_000, balanceSheetTotalEur: 43_000_000 },
        rules,
      ),
    ).toBe('MEDIUM');
    expect(
      categorizeSize(
        { employees: 250, annualTurnoverEur: 50_000_000, balanceSheetTotalEur: 43_000_000 },
        rules,
      ),
    ).toBe('LARGE');
    expect(
      categorizeSize(
        { employees: 100, annualTurnoverEur: 50_100_000, balanceSheetTotalEur: 43_100_000 },
        rules,
      ),
    ).toBe('LARGE');
    expect(
      categorizeSize(
        { employees: 100, annualTurnoverEur: 50_100_000, balanceSheetTotalEur: 10_000_000 },
        rules,
      ),
    ).toBe('MEDIUM');
  });
});

describe('rule condition evaluation', () => {
  const context = {
    annex: 'I',
    sectorCode: 'ict_service_management',
    subsectorCode: 'managed_services',
    entityTypeCode: 'managed_service_provider',
    sizeCategory: 'MEDIUM',
    outcome: '',
    publicAdministrationLevel: 'NONE',
    qualifiedTrustServiceProvider: false,
    tldRegistry: false,
    dnsServiceProvider: false,
    publicElectronicCommunications: false,
    trustServiceProvider: false,
    domainNameRegistration: false,
    cerCriticalEntity: false,
    soleProvider: false,
    significantSocietalImpact: false,
    crossBorderSystemic: false,
    nationalImportance: false,
    identifiedEssentialByMemberState: false,
  } as const;

  it('supports all, any, not and membership operators', () => {
    expect(evaluateRuleCondition({ all: [] }, context)).toBe(true);
    expect(evaluateRuleCondition({ any: [] }, context)).toBe(false);
    expect(evaluateRuleCondition({ field: 'annex', op: 'eq', value: 'I' }, context)).toBe(true);
    expect(
      evaluateRuleCondition(
        { field: 'sizeCategory', op: 'in', value: ['MEDIUM', 'LARGE'] },
        context,
      ),
    ).toBe(true);
    expect(
      evaluateRuleCondition(
        { field: 'sizeCategory', op: 'notIn', value: ['MICRO', 'SMALL'] },
        context,
      ),
    ).toBe(true);
    expect(
      evaluateRuleCondition(
        { not: { field: 'cerCriticalEntity', op: 'eq', value: true } },
        context,
      ),
    ).toBe(true);
    expect(
      evaluateRuleCondition(
        {
          all: [
            { field: 'annex', op: 'eq', value: 'I' },
            { field: 'sizeCategory', op: 'eq', value: 'LARGE' },
          ],
        },
        context,
      ),
    ).toBe(false);
  });
});

describe('classification documents', () => {
  it('marks NIS2 documents as required for essential and important entities', () => {
    const essential = classify(
      pack,
      answers({
        size: { employees: 300, annualTurnoverEur: 60_000_000, balanceSheetTotalEur: 50_000_000 },
      }),
    );
    expect(essential.outcome).toBe('ESSENTIAL');
    expect(essential.documents.every((document) => document.required)).toBe(true);
    expect(
      essential.documents.some((document) => document.templateKey === 'governance_registration'),
    ).toBe(true);
  });

  it('marks documents voluntary out of scope', () => {
    const out = classify(
      pack,
      answers({
        size: { employees: 20, annualTurnoverEur: 3_000_000, balanceSheetTotalEur: 1_500_000 },
      }),
    );
    expect(out.outcome).toBe('OUT_OF_SCOPE');
    expect(out.documents.length).toBeGreaterThan(0);
    expect(out.documents.every((document) => !document.required)).toBe(true);
    expect(out.documents.every((document) => document.applicability === 'VOLUNTARY')).toBe(true);
  });

  it('adds secure-development guidance only to digital and ICT providers', () => {
    const digital = classify(
      pack,
      answers({
        sectorCode: 'digital_infrastructure',
        subsectorCode: 'cloud_and_data_centres',
        entityTypeCode: 'cloud_provider',
      }),
    );
    const food = classify(
      pack,
      answers({
        sectorCode: 'food',
        subsectorCode: 'food_production',
        entityTypeCode: 'food_industrial_producer',
      }),
    );

    expect(
      digital.documents.some((document) => document.templateKey === 'secure_development_policy'),
    ).toBe(true);
    expect(
      food.documents.some((document) => document.templateKey === 'secure_development_policy'),
    ).toBe(false);
  });
});
