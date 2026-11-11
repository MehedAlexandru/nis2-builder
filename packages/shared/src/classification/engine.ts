import type {
  ClassificationAnswers,
  ClassificationConfidence,
  SizeIndependentCriteria,
  ClassificationConsequence,
  ClassificationDocumentRule,
  ClassificationPack,
  ClassificationRule,
  ClassificationRuleCondition,
  ClassificationRuleField,
  ClassificationSelection,
  DocumentApplicability,
  EnterpriseSizeBreakdown,
  SizeCategory,
} from '../schemas/classification';
import type { ClassificationResult } from '../enums';
import { calculateEnterpriseSize } from './size';

export class ClassificationInputError extends Error {
  readonly code = 'CLASSIFICATION_INPUT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ClassificationInputError';
  }
}

export type RuleFact = string | number | boolean | Array<string | number> | null;

export type RuleContext = Record<ClassificationRuleField, RuleFact>;

export interface ClassificationComputation {
  outcome: ClassificationResult;
  confidence: ClassificationConfidence;
  ruleId: string;
  reasonKey: string;
  legalBasis: ClassificationRule['legalBasis'];
  consequences: ClassificationConsequence;
  size: EnterpriseSizeBreakdown;
  selection: ClassificationSelection;
  documents: DocumentApplicability[];
}

export function evaluateRuleCondition(
  condition: ClassificationRuleCondition,
  context: RuleContext,
): boolean {
  if ('all' in condition) {
    return condition.all.every((entry) => evaluateRuleCondition(entry, context));
  }
  if ('any' in condition) {
    return condition.any.some((entry) => evaluateRuleCondition(entry, context));
  }
  if ('not' in condition) {
    return !evaluateRuleCondition(condition.not, context);
  }

  const actual = context[condition.field];
  const expected = condition.value;

  switch (condition.op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as string | number);
    case 'notIn':
      return Array.isArray(expected) && !expected.includes(actual as string | number);
    case 'includesAny': {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
      return expected.some((entry) => actual.includes(entry));
    }
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    default:
      return false;
  }
}

export const NOT_LISTED_SECTOR_CODE = 'not_listed';

const NOT_LISTED_SELECTION: ClassificationSelection = {
  annex: null,
  sectorCode: NOT_LISTED_SECTOR_CODE,
  sectorName: {
    en: 'Not listed in Annex I or Annex II',
    ro: 'Neenumerat în anexa I sau anexa II',
  },
  subsectorCode: NOT_LISTED_SECTOR_CODE,
  subsectorName: {
    en: 'Sector outside the NIS2 annexes',
    ro: 'Sector în afara anexelor NIS2',
  },
  entityTypeCode: NOT_LISTED_SECTOR_CODE,
  entityTypeName: {
    en: 'Other organisation',
    ro: 'Altă organizație',
  },
};

export function resolveSelection(
  pack: ClassificationPack,
  answers: ClassificationAnswers,
): ClassificationSelection {
  if (answers.sectorCode === NOT_LISTED_SECTOR_CODE) {
    return NOT_LISTED_SELECTION;
  }

  const sector = pack.sectors.find((entry) => entry.code === answers.sectorCode);
  if (!sector) {
    throw new ClassificationInputError(`Unknown sector code: ${answers.sectorCode}`);
  }
  const subsector = sector.subsectors.find((entry) => entry.code === answers.subsectorCode);
  if (!subsector) {
    throw new ClassificationInputError(`Unknown subsector code: ${answers.subsectorCode}`);
  }
  const entityType = subsector.entityTypes.find((entry) => entry.code === answers.entityTypeCode);
  if (!entityType) {
    throw new ClassificationInputError(`Unknown entity type code: ${answers.entityTypeCode}`);
  }

  return {
    annex: sector.annex,
    sectorCode: sector.code,
    sectorName: sector.name,
    subsectorCode: subsector.code,
    subsectorName: subsector.name,
    entityTypeCode: entityType.code,
    entityTypeName: entityType.name,
  };
}

/**
 * Entity types imply some size-independent criteria. Normalising here keeps
 * the rule data authoritative and prevents a user from missing a mandatory
 * fact in the wizard.
 */
export function normalizeSizeIndependentCriteria(
  criteria: SizeIndependentCriteria,
  selection: ClassificationSelection,
): SizeIndependentCriteria {
  const inferredAdministrationLevel =
    criteria.publicAdministrationLevel !== 'NONE'
      ? criteria.publicAdministrationLevel
      : selection.entityTypeCode === 'central_public_administration'
        ? 'CENTRAL'
        : selection.entityTypeCode === 'regional_public_administration'
          ? 'REGIONAL'
          : selection.entityTypeCode === 'local_public_administration'
            ? 'LOCAL'
            : 'NONE';

  return {
    ...criteria,
    publicAdministrationLevel: inferredAdministrationLevel,
    qualifiedTrustServiceProvider: criteria.qualifiedTrustServiceProvider,
    tldRegistry: criteria.tldRegistry || selection.entityTypeCode === 'tld_registry',
    dnsServiceProvider:
      criteria.dnsServiceProvider || selection.entityTypeCode === 'dns_service_provider',
    publicElectronicCommunications:
      criteria.publicElectronicCommunications ||
      selection.entityTypeCode === 'public_electronic_communications',
    trustServiceProvider:
      criteria.trustServiceProvider || selection.entityTypeCode === 'trust_service_provider',
    domainNameRegistration:
      criteria.domainNameRegistration || selection.entityTypeCode === 'domain_name_registration',
  };
}

export function hasSizeIndependentCriteria(criteria: SizeIndependentCriteria): boolean {
  return (
    criteria.publicAdministrationLevel !== 'NONE' ||
    criteria.qualifiedTrustServiceProvider ||
    criteria.tldRegistry ||
    criteria.dnsServiceProvider ||
    criteria.publicElectronicCommunications ||
    criteria.trustServiceProvider ||
    criteria.domainNameRegistration ||
    criteria.cerCriticalEntity ||
    criteria.soleProvider ||
    criteria.significantSocietalImpact ||
    criteria.crossBorderSystemic ||
    criteria.nationalImportance ||
    criteria.identifiedEssentialByMemberState
  );
}

function buildContext(
  answers: ClassificationAnswers,
  selection: ClassificationSelection,
  category: SizeCategory,
  outcome: ClassificationResult | '',
): RuleContext {
  return {
    annex: selection.annex,
    sectorCode: selection.sectorCode,
    subsectorCode: selection.subsectorCode,
    entityTypeCode: selection.entityTypeCode,
    sizeCategory: category,
    outcome,
    publicAdministrationLevel: answers.sizeIndependent.publicAdministrationLevel,
    qualifiedTrustServiceProvider: answers.sizeIndependent.qualifiedTrustServiceProvider,
    tldRegistry: answers.sizeIndependent.tldRegistry,
    dnsServiceProvider: answers.sizeIndependent.dnsServiceProvider,
    publicElectronicCommunications: answers.sizeIndependent.publicElectronicCommunications,
    trustServiceProvider: answers.sizeIndependent.trustServiceProvider,
    domainNameRegistration: answers.sizeIndependent.domainNameRegistration,
    cerCriticalEntity: answers.sizeIndependent.cerCriticalEntity,
    soleProvider: answers.sizeIndependent.soleProvider,
    significantSocietalImpact: answers.sizeIndependent.significantSocietalImpact,
    crossBorderSystemic: answers.sizeIndependent.crossBorderSystemic,
    nationalImportance: answers.sizeIndependent.nationalImportance,
    identifiedEssentialByMemberState: answers.sizeIndependent.identifiedEssentialByMemberState,
  };
}

function sortRules(rules: ClassificationRule[]): ClassificationRule[] {
  return [...rules].sort(
    (left, right) => right.priority - left.priority || left.id.localeCompare(right.id),
  );
}

function sortDocumentRules(rules: ClassificationDocumentRule[]): ClassificationDocumentRule[] {
  return [...rules].sort(
    (left, right) =>
      left.priority - right.priority || left.templateKey.localeCompare(right.templateKey),
  );
}

function evaluateDocuments(
  pack: ClassificationPack,
  context: RuleContext,
  outcome: ClassificationResult,
): DocumentApplicability[] {
  const voluntary = outcome === 'OUT_OF_SCOPE' || outcome === 'LIKELY_IN_SCOPE';
  const documents = new Map<string, DocumentApplicability>();

  for (const rule of sortDocumentRules(pack.documentRules)) {
    if (!evaluateRuleCondition(rule.when, context)) continue;
    if (documents.has(rule.templateKey)) continue;

    const required =
      !voluntary &&
      (rule.applicability === 'BOTH' ||
        (rule.applicability === 'ESSENTIAL' && outcome === 'ESSENTIAL') ||
        (rule.applicability === 'IMPORTANT' && outcome === 'IMPORTANT'));

    documents.set(rule.templateKey, {
      templateKey: rule.templateKey,
      title: rule.title,
      category: rule.category,
      applicability: voluntary ? 'VOLUNTARY' : rule.applicability,
      required,
      priority: rule.priority,
      reasonKey: rule.reasonKey,
    });
  }

  return [...documents.values()].sort(
    (left, right) =>
      left.priority - right.priority || left.templateKey.localeCompare(right.templateKey),
  );
}

/**
 * Pure, deterministic classification. The pack supplies the sector catalog,
 * thresholds, ordered rules, citations, consequences and document priority.
 */
export function classify(
  pack: ClassificationPack,
  answers: ClassificationAnswers,
): ClassificationComputation {
  const selection = resolveSelection(pack, answers);
  const normalized = {
    ...answers,
    sizeIndependent: normalizeSizeIndependentCriteria(answers.sizeIndependent, selection),
  };
  const size = calculateEnterpriseSize(normalized.size, pack.sizeRules);
  size.sizeIndependent = hasSizeIndependentCriteria(normalized.sizeIndependent);

  const context = buildContext(normalized, selection, size.category, '');
  const rule = sortRules(pack.rules).find((entry) => evaluateRuleCondition(entry.when, context));
  if (!rule) {
    throw new Error(`Classification pack ${pack.code}@${pack.version} has no matching rule`);
  }

  const consequences = pack.consequences[rule.outcome];
  if (!consequences) {
    throw new Error(`Classification pack ${pack.code}@${pack.version} lacks consequences`);
  }

  const documents = evaluateDocuments(
    pack,
    buildContext(normalized, selection, size.category, rule.outcome),
    rule.outcome,
  );

  return {
    outcome: rule.outcome,
    confidence: rule.confidence,
    ruleId: rule.id,
    reasonKey: rule.reasonKey,
    legalBasis: rule.legalBasis,
    consequences,
    size,
    selection,
    documents,
  };
}
