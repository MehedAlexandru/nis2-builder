import { z } from 'zod';
import { exportStatusSchema, exportTypeSchema } from '../enums';

export const exportFormatSchema = z.enum(['DOCX', 'PDF']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportLocaleSchema = z.enum(['en', 'ro']);
export type ExportLocale = z.infer<typeof exportLocaleSchema>;

export const createDocumentExportSchema = z
  .object({
    format: exportFormatSchema,
    locale: exportLocaleSchema.default('en'),
  })
  .strict();
export type CreateDocumentExportInput = z.infer<typeof createDocumentExportSchema>;

export const createSummaryExportSchema = z
  .object({
    format: exportFormatSchema.default('PDF'),
    locale: exportLocaleSchema.default('en'),
  })
  .strict();
export type CreateSummaryExportInput = z.infer<typeof createSummaryExportSchema>;

export const createBundleExportSchema = z
  .object({
    locale: exportLocaleSchema.default('en'),
  })
  .strict();
export type CreateBundleExportInput = z.infer<typeof createBundleExportSchema>;

export const exportJobSchema = z
  .object({
    id: z.string(),
    type: exportTypeSchema,
    status: exportStatusSchema,
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    filename: z.string().nullable(),
    errorMessage: z.string().nullable(),
    downloadAvailable: z.boolean(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .strict();
export type ExportJobSummary = z.infer<typeof exportJobSchema>;
