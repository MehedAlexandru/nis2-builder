import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  classificationAnswersSchema,
  classify,
  getClassificationPack,
  type ClassificationRun,
} from '@nis2/shared';
import i18n from '@/lib/i18n';
import { ClassificationResultView } from './ClassificationResultView';

function buildRun(): ClassificationRun {
  const pack = getClassificationPack('RO');
  if (!pack) throw new Error('RO pack missing');
  const inputs = classificationAnswersSchema.parse({
    establishmentCountries: ['RO'],
    sectorCode: 'ict_service_management',
    subsectorCode: 'managed_services',
    entityTypeCode: 'managed_service_provider',
    size: { employees: 60, annualTurnoverEur: 12_000_000, balanceSheetTotalEur: 6_000_000 },
  });
  const computation = classify(pack, inputs);
  return {
    id: 'run-1',
    organizationId: 'org-1',
    version: 2,
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
}

describe('classification result view', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the outcome, consolidated size and required documents', () => {
    render(
      <MemoryRouter>
        <ClassificationResultView run={buildRun()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Important entity')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
    expect(screen.getAllByText('60').length).toBeGreaterThan(0);
    expect(screen.getByText('Document checklist')).toBeInTheDocument();
    expect(screen.getByText('Download PDF summary')).toBeInTheDocument();
    expect(screen.getByText(/does not constitute legal advice/i)).toBeInTheDocument();
  });
});
