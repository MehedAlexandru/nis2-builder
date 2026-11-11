import { z } from 'zod';
import {
  applicabilitySchema,
  documentClassificationSchema,
  documentStatusSchema,
  versionStatusSchema,
} from '../enums';
import { localizedTextSchema } from './classification';

export type { LocalizedText } from './classification';

/**
 * Data-driven document templates. A template is stored as JSON and rendered by
 * the same form engine in the API, the web app and the export pipeline.
 */

export const documentFieldTypeSchema = z.enum([
  'text',
  'richText',
  'select',
  'multiSelect',
  'date',
  'datetime',
  'table',
  'peoplePicker',
  'checklist',
  'attachment',
  'yesNo',
  'riskMatrix',
  'signature',
]);
export type DocumentFieldType = z.infer<typeof documentFieldTypeSchema>;

export const documentExportKindSchema = z.enum([
  'paragraph',
  'definition_row',
  'table',
  'callout',
  'risk_matrix',
  'signature',
  'toc',
  'page_break',
]);
export type DocumentExportKind = z.infer<typeof documentExportKindSchema>;

export const documentFieldOptionSchema = z
  .object({
    value: z.string().trim().min(1),
    label: localizedTextSchema,
  })
  .strict();
export type DocumentFieldOption = z.infer<typeof documentFieldOptionSchema>;

export const documentFieldValidationSchema = z
  .object({
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
    minRows: z.number().int().nonnegative().optional(),
    maxRows: z.number().int().positive().optional(),
    minSelections: z.number().int().nonnegative().optional(),
    maxSelections: z.number().int().positive().optional(),
  })
  .strict();
export type DocumentFieldValidation = z.infer<typeof documentFieldValidationSchema>;

export const documentFieldConditionSchema = z
  .object({
    field: z.string().trim().min(1),
    equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
    notEquals: z.union([z.string(), z.number(), z.boolean()]).optional(),
    in: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();
export type DocumentFieldCondition = z.infer<typeof documentFieldConditionSchema>;

export const documentTableColumnSchema = z
  .object({
    key: z.string().trim().min(1),
    label: localizedTextSchema,
    type: z.enum(['text', 'number', 'date', 'select', 'yesNo']).default('text'),
    required: z.boolean().default(false),
    options: z.array(documentFieldOptionSchema).optional(),
  })
  .strict();
export type DocumentTableColumn = z.infer<typeof documentTableColumnSchema>;

export const documentChecklistItemSchema = z
  .object({
    key: z.string().trim().min(1),
    label: localizedTextSchema,
    required: z.boolean().default(true),
  })
  .strict();
export type DocumentChecklistItem = z.infer<typeof documentChecklistItemSchema>;

export const documentExportSchema = z
  .object({
    kind: documentExportKindSchema.default('paragraph'),
    label: localizedTextSchema.optional(),
  })
  .strict();
export type DocumentExport = z.infer<typeof documentExportSchema>;

export const documentFieldSchema = z
  .object({
    key: z.string().trim().min(1),
    type: documentFieldTypeSchema,
    label: localizedTextSchema,
    help: localizedTextSchema.optional(),
    example: localizedTextSchema.optional(),
    required: z.boolean().default(false),
    weight: z.number().int().min(1).max(5).default(2),
    options: z.array(documentFieldOptionSchema).optional(),
    columns: z.array(documentTableColumnSchema).optional(),
    items: z.array(documentChecklistItemSchema).optional(),
    validation: documentFieldValidationSchema.optional(),
    conditional: documentFieldConditionSchema.optional(),
    followUpKeys: z.array(z.string()).optional(),
    prefillKey: z.string().optional(),
    export: documentExportSchema.optional(),
  })
  .strict();
export type DocumentField = z.infer<typeof documentFieldSchema>;

export const documentSectionSchema = z
  .object({
    key: z.string().trim().min(1),
    title: localizedTextSchema,
    description: localizedTextSchema.optional(),
    fields: z.array(documentFieldSchema).min(1),
  })
  .strict();
export type DocumentSection = z.infer<typeof documentSectionSchema>;

export const documentTemplateSchema = z
  .object({
    key: z.string().trim().min(1),
    version: z.number().int().positive(),
    category: z.string().trim().min(1),
    applicability: applicabilitySchema,
    ownerRole: z.string().trim().min(1),
    reviewFrequencyMonths: z.number().int().positive(),
    legalReference: z.string().trim().min(1),
    title: localizedTextSchema,
    shortDescription: localizedTextSchema,
    description: localizedTextSchema.optional(),
    sortOrder: z.number().int().nonnegative(),
    sections: z.array(documentSectionSchema).min(1),
  })
  .strict();
export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;

export const documentTemplateCatalogSchema = z
  .object({
    code: z.string().trim().min(1),
    version: z.number().int().positive(),
    templates: z.array(documentTemplateSchema).min(1),
  })
  .strict();
export type DocumentTemplateCatalog = z.infer<typeof documentTemplateCatalogSchema>;

export const documentPayloadSchema = z.record(z.unknown());
export type DocumentPayload = z.infer<typeof documentPayloadSchema>;

export const documentValidationIssueSchema = z
  .object({
    fieldKey: z.string(),
    message: z.string(),
    severity: z.enum(['error', 'warning']),
  })
  .strict();
export type DocumentValidationIssue = z.infer<typeof documentValidationIssueSchema>;

export const documentSectionProgressSchema = z
  .object({
    key: z.string(),
    title: localizedTextSchema,
    percentage: z.number().min(0).max(100),
    completedWeight: z.number(),
    totalWeight: z.number(),
  })
  .strict();
export type DocumentSectionProgress = z.infer<typeof documentSectionProgressSchema>;

export const documentProgressSchema = z
  .object({
    percentage: z.number().min(0).max(100),
    completedWeight: z.number(),
    totalWeight: z.number(),
    requiredRemaining: z.number().int(),
    sections: z.array(documentSectionProgressSchema),
    issues: z.array(documentValidationIssueSchema),
  })
  .strict();
export type DocumentProgress = z.infer<typeof documentProgressSchema>;

export const documentLockSchema = z
  .object({
    ownedByMe: z.boolean(),
    ownerName: z.string().nullable(),
    expiresAt: z.string().nullable(),
  })
  .strict();
export type DocumentLock = z.infer<typeof documentLockSchema>;

export const documentRevisionSummarySchema = z
  .object({
    id: z.string(),
    revisionNo: z.number().int(),
    templateVersion: z.number().int(),
    changeNote: z.string().nullable(),
    changedFields: z.array(z.string()),
    createdById: z.string(),
    createdByName: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type DocumentRevisionSummary = z.infer<typeof documentRevisionSummarySchema>;

export const documentRevisionDetailSchema = documentRevisionSummarySchema
  .extend({
    payload: documentPayloadSchema,
  })
  .strict();
export type DocumentRevisionDetail = z.infer<typeof documentRevisionDetailSchema>;

export const documentApprovalSchema = z
  .object({
    id: z.string(),
    approverUserId: z.string(),
    approverName: z.string().nullable(),
    role: z.string().nullable(),
    comment: z.string().nullable(),
    signature: z.unknown().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type DocumentApproval = z.infer<typeof documentApprovalSchema>;

export const documentVersionSchema = z
  .object({
    id: z.string(),
    versionLabel: z.string(),
    revisionNo: z.number().int(),
    status: versionStatusSchema,
    approvedAt: z.string().nullable(),
    createdAt: z.string(),
    createdByName: z.string().nullable(),
    approvals: z.array(documentApprovalSchema),
  })
  .strict();
export type DocumentVersion = z.infer<typeof documentVersionSchema>;

export const companyProfileSummarySchema = z
  .object({
    legalName: z.string(),
    registrationNumber: z.string().nullable(),
    vatNumber: z.string().nullable(),
    city: z.string().nullable(),
    countryCode: z.string(),
    website: z.string().nullable(),
    dpoName: z.string().nullable(),
    cisoName: z.string().nullable(),
    contactEmail: z.string().nullable(),
  })
  .strict();
export type CompanyProfileSummary = z.infer<typeof companyProfileSummarySchema>;

export const documentCardSchema = z
  .object({
    documentId: z.string().nullable(),
    templateKey: z.string(),
    templateVersion: z.number().int(),
    category: z.string(),
    title: localizedTextSchema,
    shortDescription: localizedTextSchema,
    legalReference: z.string(),
    applicability: applicabilitySchema,
    ownerRole: z.string(),
    reviewFrequencyMonths: z.number().int(),
    required: z.boolean(),
    priority: z.number().int().nullable(),
    status: documentStatusSchema,
    progress: z.number().min(0).max(100),
    requiredRemaining: z.number().int(),
    classification: documentClassificationSchema.nullable(),
    currentVersionLabel: z.string().nullable(),
    lastEditedAt: z.string().nullable(),
    lastEditedByName: z.string().nullable(),
    nextReviewDate: z.string().nullable(),
    isOverdue: z.boolean(),
    lockedByOther: z.boolean(),
  })
  .strict();
export type DocumentCard = z.infer<typeof documentCardSchema>;

export const documentCatalogSchema = z
  .object({
    templates: z.array(documentCardSchema),
    overallProgress: z.number().min(0).max(100),
    requiredCount: z.number().int(),
    completedCount: z.number().int(),
    classificationResult: z.string().nullable(),
    generatedAt: z.string(),
    profile: companyProfileSummarySchema.nullable(),
  })
  .strict();
export type DocumentCatalog = z.infer<typeof documentCatalogSchema>;

export const documentDetailSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    templateKey: z.string(),
    templateVersion: z.number().int(),
    status: documentStatusSchema,
    classification: documentClassificationSchema,
    payload: documentPayloadSchema,
    progress: documentProgressSchema,
    currentRevisionNo: z.number().int(),
    currentVersionLabel: z.string().nullable(),
    nextReviewDate: z.string().nullable(),
    ownerUserId: z.string().nullable(),
    ownerName: z.string().nullable(),
    lastEditedAt: z.string().nullable(),
    lastEditedByName: z.string().nullable(),
    createdAt: z.string(),
    template: documentTemplateSchema,
    lock: documentLockSchema,
    revisions: z.array(documentRevisionSummarySchema),
    versions: z.array(documentVersionSchema),
    profile: companyProfileSummarySchema.nullable(),
  })
  .strict();
export type DocumentDetail = z.infer<typeof documentDetailSchema>;

export const documentSaveInputSchema = z
  .object({
    payload: documentPayloadSchema,
    expectedRevisionNo: z.number().int().nonnegative(),
    changeNote: z.string().trim().max(500).optional(),
    classification: documentClassificationSchema.optional(),
    nextReviewDate: z.string().datetime().nullable().optional(),
    ownerUserId: z.string().nullable().optional(),
  })
  .strict();
export type DocumentSaveInput = z.infer<typeof documentSaveInputSchema>;

export const documentRestoreInputSchema = z
  .object({
    revisionNo: z.number().int().positive(),
    changeNote: z.string().trim().max(500).optional(),
  })
  .strict();
export type DocumentRestoreInput = z.infer<typeof documentRestoreInputSchema>;

export const documentVersionInputSchema = z
  .object({
    versionLabel: z
      .string()
      .trim()
      .regex(/^\d+\.\d+$/, 'Use a version label such as 1.0 or 1.1'),
    changeNote: z.string().trim().max(500).optional(),
  })
  .strict();
export type DocumentVersionInput = z.infer<typeof documentVersionInputSchema>;

export const documentApprovalInputSchema = z
  .object({
    role: z.string().trim().max(120).optional(),
    comment: z.string().trim().max(1000).optional(),
    signature: z.record(z.unknown()).optional(),
  })
  .strict();
export type DocumentApprovalInput = z.infer<typeof documentApprovalInputSchema>;

export const documentCreateInputSchema = z
  .object({
    templateKey: z.string().trim().min(1),
  })
  .strict();
export type DocumentCreateInput = z.infer<typeof documentCreateInputSchema>;

export const documentChangedFieldsSchema = z
  .object({
    fields: z.array(z.string()),
  })
  .strict();
export type DocumentChangedFields = z.infer<typeof documentChangedFieldsSchema>;
