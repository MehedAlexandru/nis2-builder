import {
  classificationAnswersSchema,
  classify,
  getClassificationPack,
  type ClassificationRun,
} from '@nis2/shared';
import { renderClassificationPdf } from './classification.pdf';

describe('classification PDF summary', () => {
  it('renders a valid PDF containing the outcome and disclaimer', async () => {
    const pack = getClassificationPack('RO');
    if (!pack) throw new Error('RO pack missing');

    const inputs = classificationAnswersSchema.parse({
      establishmentCountries: ['RO'],
      sectorCode: 'ict_service_management',
      subsectorCode: 'managed_services',
      entityTypeCode: 'managed_service_provider',
      size: {
        employees: 60,
        annualTurnoverEur: 12_000_000,
        balanceSheetTotalEur: 6_000_000,
      },
    });
    const computation = classify(pack, inputs);
    const run: ClassificationRun = {
      id: 'run-1',
      organizationId: 'org-1',
      version: 1,
      result: computation.outcome,
      confidence: computation.confidence,
      jurisdictionPackCode: pack.code,
      jurisdictionPackVersion: pack.version,
      createdAt: new Date('2026-11-11T10:00:00.000Z').toISOString(),
      summary: {
        sectorName: computation.selection.sectorName,
        subsectorName: computation.selection.subsectorName,
        entityTypeName: computation.selection.entityTypeName,
        establishmentCountries: inputs.establishmentCountries,
        sizeCategory: computation.size.category,
        employees: computation.size.total.employees,
        annualTurnoverEur: computation.size.total.annualTurnoverEur,
        balanceSheetTotalEur: computation.size.total.balanceSheetTotalEur,
      },
      createdById: 'user-1',
      inputs,
      legalBasis: computation.legalBasis,
      consequences: computation.consequences,
      applicability: computation.documents,
      selection: computation.selection,
      size: computation.size,
      ruleId: computation.ruleId,
      reasonKey: computation.reasonKey,
    };

    const buffer = await renderClassificationPdf(run, {
      organizationName: 'Test SRL',
      packStatus: pack.status,
      generatedAt: new Date('2026-11-11T10:00:00.000Z'),
    });

    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(2_000);
  });
});
