import { z } from 'zod';
import {
  membershipRoleSchema,
  organizationStatusSchema,
  planSchema,
  scopeModeSchema,
} from '../enums';
import { emailSchema, paginationQuerySchema } from './common';
import { personNameSchema } from './auth';

export const organizationNameSchema = z.string().trim().min(2).max(160);

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/);

export const jurisdictionPackCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,8}$/);

export const createOrganizationSchema = z
  .object({
    name: organizationNameSchema,
    countryCode: countryCodeSchema.default('RO'),
    jurisdictionPackCode: jurisdictionPackCodeSchema.optional(),
  })
  .strict();
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: organizationNameSchema.optional(),
    countryCode: countryCodeSchema.optional(),
    jurisdictionPackCode: jurisdictionPackCodeSchema.optional(),
    scopeMode: scopeModeSchema.optional(),
  })
  .strict();
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const organizationDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  status: organizationStatusSchema,
  plan: planSchema,
  scopeMode: scopeModeSchema,
  countryCode: z.string(),
  jurisdictionPackCode: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  membershipRole: membershipRoleSchema.nullable(),
  memberCount: z.number().int().nonnegative(),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;

export const memberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  givenName: z.string(),
  familyName: z.string(),
  role: membershipRoleSchema,
  status: z.enum(['PENDING', 'ACTIVE', 'DISABLED']),
  joinedAt: z.string(),
});
export type OrganizationMember = z.infer<typeof memberSchema>;

export const inviteSchema = z
  .object({
    email: emailSchema,
    role: membershipRoleSchema.default('MEMBER'),
  })
  .strict();
export type InviteInput = z.infer<typeof inviteSchema>;

export const inviteSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  role: membershipRoleSchema,
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type InviteSummary = z.infer<typeof inviteSummarySchema>;

export const updateMemberRoleSchema = z.object({ role: membershipRoleSchema }).strict();
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const removeMemberParamsSchema = z.object({ userId: z.string().uuid() }).strict();

export const membersQuerySchema = paginationQuerySchema;
export type MembersQuery = z.infer<typeof membersQuerySchema>;

export const organizationParamsSchema = z.object({ organizationId: z.string().uuid() }).strict();

export const organizationLogoUploadSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/\.(png|jpe?g)$/i, 'Use a PNG or JPEG logo'),
    mimeType: z.enum(['image/png', 'image/jpeg']),
    dataBase64: z.string().min(1).max(3_500_000),
  })
  .strict();
export type OrganizationLogoUploadInput = z.infer<typeof organizationLogoUploadSchema>;

export const userListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const updateProfileSchema = z
  .object({
    givenName: personNameSchema.optional(),
    familyName: personNameSchema.optional(),
    locale: z.enum(['en', 'ro']).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
