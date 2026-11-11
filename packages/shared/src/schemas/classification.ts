import { z } from 'zod';
import { EU_MEMBER_STATES } from '../data/jurisdictions';
import { applicabilitySchema, classificationResultSchema } from '../enums';

/**
 * Classification contracts shared by the API, the wizard and the export/PDF
 * renderers. Legal rules are data (`ClassificationPack`), never code.
 */

export const euMemberStateSchema = z.enum(EU_MEMBER_STATES);

export const sizeCategorySchema = z.enum(['MICRO', 'SMALL', 'MEDIUM', 'LARGE']);
export type SizeCategory = z.infer<typeof sizeCategorySchema>;

export const enterpriseConsolidationSchema = z.enum(['AUTONOMOUS', 'PARTNER_LINKED', 'UNKNOWN']);
export type EnterpriseConsolidation = z.infer<typeof enterpriseConsolidationSchema>;

export const publicAdministrationLevelSchema = z.enum(['NONE', 'CENTRAL', 'REGIONAL', 'LOCAL']);
export type PublicAdministrationLevel = z.infer<typeof publicAdministrationLevelSchema>;

export const classificationConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type ClassificationConfidence = z.infer<typeof classificationConfidenceSchema>;

export const localizedTextSchema = z
  .object({
    en: z.string().trim().min(1),
    ro: z.string().trim().min(1),
  })
  .strict();
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const legalCitationSchema = z
  .object({
    citation: z.string().trim().min(1),
    note: z.string().trim().optional(),
  })
  .strict();
export type LegalCitation = z.infer<typeof legalCitationSchema>;

/** One partner or linked enterprise used for the Recommendation 2003/361 size test. */
export const enterpriseUnitSchema = z
  .object({
    name: z.string().trim().max(160).optional(),
    employees: z.number().int().min(0).max(10_000_000),
    annualTurnoverEur: z.number().min(0).max(1_000_000_000_000),
    balanceSheetTotalEur: z.number().min(0).max(1_000_000_000_000),
    /** Share of capital/voting rights for partner enterprises (25–100). */
    ownershipPercent: z.number().min(0).max(100).default(100),
  })
  .strict();
export type EnterpriseUnit = z.infer<typeof enterpriseUnitSchema>;

export const enterpriseSizeSchema = z
  .object({
    employees: z.number().int().min(0).max(10_000_000),
    annualTurnoverEur: z.number().min(0).max(1_000_000_000_000),
    balanceSheetTotalEur: z.number().min(0).max(1_000_000_000_000),
    consolidation: enterpriseConsolidationSchema.default('AUTONOMOUS'),
    partners: z.array(enterpriseUnitSchema).max(50).default([]),
    linkedEnterprises: z.array(enterpriseUnitSchema).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.consolidation !== 'AUTONOMOUS' &&
      value.partners.length === 0 &&
      value.linkedEnterprises.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consolidation'],
        message:
          'Add at least one partner or linked enterprise, or choose the autonomous company structure.',
      });
    }
  });
export type EnterpriseSizeInput = z.infer<typeof enterpriseSizeSchema>;

export const sizeIndependentCriteriaSchema = z
  .object({
    publicAdministrationLevel: publicAdministrationLevelSchema.default('NONE'),
    qualifiedTrustServiceProvider: z.boolean().default(false),
    tldRegistry: z.boolean().default(false),
    dnsServiceProvider: z.boolean().default(false),
    publicElectronicCommunications: z.boolean().default(false),
    trustServiceProvider: z.boolean().default(false),
    domainNameRegistration: z.boolean().default(false),
    cerCriticalEntity: z.boolean().default(false),
    soleProvider: z.boolean().default(false),
    significantSocietalImpact: z.boolean().default(false),
    crossBorderSystemic: z.boolean().default(false),
    nationalImportance: z.boolean().default(false),
    identifiedEssentialByMemberState: z.boolean().default(false),
  })
  .strict();
export type SizeIndependentCriteria = z.infer<typeof sizeIndependentCriteriaSchema>;

export const classificationAnswersSchema = z
  .object({
    establishmentCountries: z.array(euMemberStateSchema).min(1).max(EU_MEMBER_STATES.length),
    sectorCode: z.string().trim().min(1).max(80),
    subsectorCode: z.string().trim().min(1).max(80),
    entityTypeCode: z.string().trim().min(1).max(120),
    size: enterpriseSizeSchema,
    sizeIndependent: sizeIndependentCriteriaSchema.default({}),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type ClassificationAnswers = z.infer<typeof classificationAnswersSchema>;

export const classificationRuleFieldSchema = z.enum([
  'annex',
  'sectorCode',
  'subsectorCode',
  'entityTypeCode',
  'sizeCategory',
  'outcome',
  'publicAdministrationLevel',
  'qualifiedTrustServiceProvider',
  'tldRegistry',
  'dnsServiceProvider',
  'publicElectronicCommunications',
  'trustServiceProvider',
  'domainNameRegistration',
  'cerCriticalEntity',
  'soleProvider',
  'significantSocietalImpact',
  'crossBorderSystemic',
  'nationalImportance',
  'identifiedEssentialByMemberState',
]);
export type ClassificationRuleField = z.infer<typeof classificationRuleFieldSchema>;

export const classificationRuleOperatorSchema = z.enum([
  'eq',
  'neq',
  'in',
  'notIn',
  'includesAny',
  'gt',
  'gte',
  'lt',
  'lte',
]);
export type ClassificationRuleOperator = z.infer<typeof classificationRuleOperatorSchema>;

export type ClassificationRuleCondition =
  | { all: ClassificationRuleCondition[] }
  | { any: ClassificationRuleCondition[] }
  | { not: ClassificationRuleCondition }
  | {
      field: ClassificationRuleField;
      op: ClassificationRuleOperator;
      value: string | number | boolean | Array<string | number>;
    };

export const classificationRuleConditionSchema: z.ZodType<ClassificationRuleCondition> = z.lazy(
  () =>
    z.union([
      z.object({ all: z.array(classificationRuleConditionSchema) }).strict(),
      z.object({ any: z.array(classificationRuleConditionSchema) }).strict(),
      z.object({ not: classificationRuleConditionSchema }).strict(),
      z
        .object({
          field: classificationRuleFieldSchema,
          op: classificationRuleOperatorSchema,
          value: z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.union([z.string(), z.number()])),
          ]),
        })
        .strict(),
    ]),
);

export const classificationRuleSchema = z
  .object({
    id: z.string().trim().min(1),
    /** Higher priority wins; the first matching rule is the result. */
    priority: z.number().int(),
    outcome: classificationResultSchema,
    confidence: classificationConfidenceSchema.default('high'),
    reasonKey: z.string().trim().min(1),
    legalBasis: z.array(legalCitationSchema).min(1),
    when: classificationRuleConditionSchema,
  })
  .strict();
export type ClassificationRule = z.infer<typeof classificationRuleSchema>;

export const classificationEntityTypeSchema = z
  .object({
    code: z.string().trim().min(1),
    name: localizedTextSchema,
    annexRef: legalCitationSchema,
  })
  .strict();
export type ClassificationEntityType = z.infer<typeof classificationEntityTypeSchema>;

export const classificationSubsectorSchema = z
  .object({
    code: z.string().trim().min(1),
    name: localizedTextSchema,
    entityTypes: z.array(classificationEntityTypeSchema).min(1),
  })
  .strict();
export type ClassificationSubsector = z.infer<typeof classificationSubsectorSchema>;

export const classificationSectorSchema = z
  .object({
    code: z.string().trim().min(1),
    annex: z.enum(['I', 'II']),
    name: localizedTextSchema,
    subsectors: z.array(classificationSubsectorSchema).min(1),
  })
  .strict();
export type ClassificationSector = z.infer<typeof classificationSectorSchema>;

export const sizeRulesSchema = z
  .object({
    employeeBands: z
      .object({
        micro: z.number().int().positive(),
        small: z.number().int().positive(),
        medium: z.number().int().positive(),
      })
      .strict(),
    financialThresholdsEur: z
      .object({
        micro: z.number().positive(),
        small: z.number().positive(),
        mediumTurnover: z.number().positive(),
        mediumBalanceSheet: z.number().positive(),
      })
      .strict(),
    citations: z.array(legalCitationSchema).min(1),
  })
  .strict();
export type SizeRules = z.infer<typeof sizeRulesSchema>;

export const classificationConsequenceSchema = z
  .object({
    heading: localizedTextSchema,
    supervision: localizedTextSchema,
    supervisionCitation: z.string().trim().min(1),
    fines: z
      .object({
        maxEur: z.number().nonnegative(),
        maxTurnoverPercent: z.number().nonnegative(),
        description: localizedTextSchema,
        citation: z.string().trim().min(1),
      })
      .strict(),
    managementLiability: localizedTextSchema,
    registration: localizedTextSchema,
    reporting: localizedTextSchema,
    citations: z.array(legalCitationSchema).min(1),
  })
  .strict();
export type ClassificationConsequence = z.infer<typeof classificationConsequenceSchema>;

export const classificationDocumentRuleSchema = z
  .object({
    templateKey: z.string().trim().min(1),
    title: localizedTextSchema,
    category: z.string().trim().min(1),
    applicability: applicabilitySchema,
    priority: z.number().int().positive(),
    reasonKey: z.string().trim().min(1),
    when: classificationRuleConditionSchema,
  })
  .strict();
export type ClassificationDocumentRule = z.infer<typeof classificationDocumentRuleSchema>;

export const jurisdictionContactSchema = z
  .object({
    name: z.string().trim().min(1),
    role: z.string().trim().min(1),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    url: z.string().trim().url().optional(),
  })
  .strict();

export const classificationPackSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z]{2,8}$/),
    version: z.string().trim().min(1),
    name: z.string().trim().min(1),
    authority: z.string().trim().min(1),
    authorityUrl: z.string().trim().url(),
    legalInstrument: z.string().trim().min(1),
    status: z.enum(['draft', 'pending-legal-review', 'verified']),
    language: z.enum(['en', 'ro']),
    updatedAt: z.string().trim().min(1),
    sources: z
      .array(
        z
          .object({
            label: z.string().trim().min(1),
            url: z.string().trim().url(),
            retrievedAt: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
    sectors: z.array(classificationSectorSchema).min(1),
    sizeRules: sizeRulesSchema,
    rules: z.array(classificationRuleSchema).min(1),
    consequences: z.record(classificationResultSchema, classificationConsequenceSchema),
    documentRules: z.array(classificationDocumentRuleSchema).min(1),
    contacts: z.array(jurisdictionContactSchema).default([]),
  })
  .strict();
export type ClassificationPack = z.infer<typeof classificationPackSchema>;

export const classificationPackMetadataSchema = z
  .object({
    code: z.string(),
    version: z.string(),
    name: z.string(),
    authority: z.string(),
    authorityUrl: z.string(),
    legalInstrument: z.string(),
    status: z.enum(['draft', 'pending-legal-review', 'verified']),
    updatedAt: z.string(),
  })
  .strict();
export type ClassificationPackMetadata = z.infer<typeof classificationPackMetadataSchema>;

export const classificationCatalogSchema = z
  .object({
    pack: classificationPackMetadataSchema,
    sectors: z.array(classificationSectorSchema),
    sizeRules: sizeRulesSchema,
  })
  .strict();
export type ClassificationCatalog = z.infer<typeof classificationCatalogSchema>;

export const documentApplicabilitySchema = z
  .object({
    templateKey: z.string(),
    title: localizedTextSchema,
    category: z.string(),
    applicability: applicabilitySchema,
    required: z.boolean(),
    priority: z.number().int(),
    reasonKey: z.string(),
  })
  .strict();
export type DocumentApplicability = z.infer<typeof documentApplicabilitySchema>;

export const enterpriseSizeBreakdownSchema = z
  .object({
    own: z
      .object({
        employees: z.number().int(),
        annualTurnoverEur: z.number(),
        balanceSheetTotalEur: z.number(),
      })
      .strict(),
    linked: z
      .object({
        employees: z.number().int(),
        annualTurnoverEur: z.number(),
        balanceSheetTotalEur: z.number(),
      })
      .strict(),
    partners: z
      .object({
        employees: z.number(),
        annualTurnoverEur: z.number(),
        balanceSheetTotalEur: z.number(),
      })
      .strict(),
    total: z
      .object({
        employees: z.number(),
        annualTurnoverEur: z.number(),
        balanceSheetTotalEur: z.number(),
      })
      .strict(),
    category: sizeCategorySchema,
    consolidation: enterpriseConsolidationSchema,
    sizeIndependent: z.boolean(),
  })
  .strict();
export type EnterpriseSizeBreakdown = z.infer<typeof enterpriseSizeBreakdownSchema>;

export const classificationSelectionSchema = z
  .object({
    annex: z.enum(['I', 'II']).nullable(),
    sectorCode: z.string(),
    sectorName: localizedTextSchema,
    subsectorCode: z.string(),
    subsectorName: localizedTextSchema,
    entityTypeCode: z.string(),
    entityTypeName: localizedTextSchema,
  })
  .strict();
export type ClassificationSelection = z.infer<typeof classificationSelectionSchema>;

export const classificationSummarySchema = z
  .object({
    sectorName: localizedTextSchema,
    subsectorName: localizedTextSchema,
    entityTypeName: localizedTextSchema,
    establishmentCountries: z.array(z.string()),
    sizeCategory: sizeCategorySchema,
    employees: z.number(),
    annualTurnoverEur: z.number(),
    balanceSheetTotalEur: z.number(),
  })
  .strict();
export type ClassificationSummary = z.infer<typeof classificationSummarySchema>;

export const classificationRunSummarySchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    version: z.number().int(),
    result: classificationResultSchema,
    confidence: classificationConfidenceSchema,
    jurisdictionPackCode: z.string(),
    jurisdictionPackVersion: z.string(),
    createdAt: z.string(),
    summary: classificationSummarySchema,
  })
  .strict();
export type ClassificationRunSummary = z.infer<typeof classificationRunSummarySchema>;

export const classificationRunSchema = classificationRunSummarySchema
  .extend({
    createdById: z.string(),
    inputs: classificationAnswersSchema,
    legalBasis: z.array(legalCitationSchema),
    consequences: classificationConsequenceSchema,
    applicability: z.array(documentApplicabilitySchema),
    selection: classificationSelectionSchema,
    size: enterpriseSizeBreakdownSchema,
    ruleId: z.string(),
    reasonKey: z.string(),
  })
  .strict();
export type ClassificationRun = z.infer<typeof classificationRunSchema>;
