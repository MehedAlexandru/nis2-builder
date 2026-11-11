import type {
  EnterpriseSizeBreakdown,
  EnterpriseSizeInput,
  SizeCategory,
  SizeRules,
} from '../schemas/classification';

interface Totals {
  employees: number;
  annualTurnoverEur: number;
  balanceSheetTotalEur: number;
}

function zero(): Totals {
  return { employees: 0, annualTurnoverEur: 0, balanceSheetTotalEur: 0 };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function add(target: Totals, source: Totals, share = 1): void {
  target.employees += Math.round(source.employees * share);
  target.annualTurnoverEur += source.annualTurnoverEur * share;
  target.balanceSheetTotalEur += source.balanceSheetTotalEur * share;
}

export function categorizeSize(totals: Totals, rules: SizeRules): SizeCategory {
  const { employeeBands, financialThresholdsEur } = rules;

  if (
    totals.employees < employeeBands.micro &&
    (totals.annualTurnoverEur <= financialThresholdsEur.micro ||
      totals.balanceSheetTotalEur <= financialThresholdsEur.micro)
  ) {
    return 'MICRO';
  }

  if (
    totals.employees < employeeBands.small &&
    (totals.annualTurnoverEur <= financialThresholdsEur.small ||
      totals.balanceSheetTotalEur <= financialThresholdsEur.small)
  ) {
    return 'SMALL';
  }

  if (
    totals.employees < employeeBands.medium &&
    (totals.annualTurnoverEur <= financialThresholdsEur.mediumTurnover ||
      totals.balanceSheetTotalEur <= financialThresholdsEur.mediumBalanceSheet)
  ) {
    return 'MEDIUM';
  }

  return 'LARGE';
}

/**
 * Consolidated size per Recommendation 2003/361/EC:
 * - linked enterprises are added at 100%;
 * - partner enterprises are added in proportion to the ownership share;
 * - own data is always included.
 */
export function calculateEnterpriseSize(
  input: EnterpriseSizeInput,
  rules: SizeRules,
): EnterpriseSizeBreakdown {
  const own = {
    employees: input.employees,
    annualTurnoverEur: input.annualTurnoverEur,
    balanceSheetTotalEur: input.balanceSheetTotalEur,
  };
  const linked = zero();
  const partners = zero();

  for (const company of input.linkedEnterprises) {
    add(linked, company, 1);
  }
  for (const company of input.partners) {
    const share = Math.max(0, Math.min(100, company.ownershipPercent)) / 100;
    add(partners, company, share);
  }

  const total = zero();
  add(total, own, 1);
  add(total, linked, 1);
  add(total, partners, 1);

  const category = categorizeSize(total, rules);

  return {
    own,
    linked: {
      ...linked,
      annualTurnoverEur: roundMoney(linked.annualTurnoverEur),
      balanceSheetTotalEur: roundMoney(linked.balanceSheetTotalEur),
    },
    partners: {
      ...partners,
      annualTurnoverEur: roundMoney(partners.annualTurnoverEur),
      balanceSheetTotalEur: roundMoney(partners.balanceSheetTotalEur),
    },
    total: {
      ...total,
      annualTurnoverEur: roundMoney(total.annualTurnoverEur),
      balanceSheetTotalEur: roundMoney(total.balanceSheetTotalEur),
    },
    category,
    consolidation: input.consolidation,
    sizeIndependent: false,
  };
}

export function isInScopeBySize(category: SizeCategory): boolean {
  return category === 'MEDIUM' || category === 'LARGE';
}
