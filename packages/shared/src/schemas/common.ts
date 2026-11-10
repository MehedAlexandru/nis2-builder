import { z } from 'zod';
import { LIMITS, SUPPORTED_LOCALES } from '../constants';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(LIMITS.emailMaxLength)
  .email();

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMinLength)
  .max(LIMITS.passwordMaxLength);

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
  checks: z.record(z.enum(['up', 'down', 'skipped'])).optional(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

/** ISO-8601 UTC timestamp string. */
export const isoTimestampSchema = z.string().datetime({ offset: false });
