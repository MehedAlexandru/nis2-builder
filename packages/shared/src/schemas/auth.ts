import { z } from 'zod';
import { LIMITS } from '../constants';
import { membershipRoleSchema } from '../enums';
import { emailSchema, localeSchema, passwordSchema } from './common';

/**
 * Authentication contracts shared by the API and the SPA.
 *
 * Passwords are only validated for length here. The breach check and the
 * Argon2id hashing happen server-side; composition rules are intentionally not
 * imposed (NIST SP 800-63B).
 */

export const personNameSchema = z.string().trim().min(1).max(120);

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    organizationName: z.string().trim().min(2).max(160),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .default('RO'),
    locale: localeSchema.default('en'),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(LIMITS.passwordMaxLength),
    organizationId: z.string().uuid().optional(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(16).max(256) }).strict();
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailSchema }).strict();
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ token: z.string().min(16).max(256), password: passwordSchema })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** A 6-digit TOTP code or a one-time recovery code. */
export const mfaCodeSchema = z
  .string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/);
export type MfaCode = z.infer<typeof mfaCodeSchema>;

export const mfaTokenSchema = z.object({ token: z.string().min(16).max(2048) }).strict();

export const mfaChallengeSchema = mfaTokenSchema.extend({ code: mfaCodeSchema }).strict();
export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>;

export const mfaActivateSchema = mfaChallengeSchema;
export type MfaActivateInput = z.infer<typeof mfaActivateSchema>;

export const mfaDisableSchema = z
  .object({ password: z.string().min(1).max(LIMITS.passwordMaxLength), code: mfaCodeSchema })
  .strict();
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;

export const selectOrganizationSchema = z.object({ organizationId: z.string().uuid() }).strict();
export type SelectOrganizationInput = z.infer<typeof selectOrganizationSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(16).max(256),
    password: passwordSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    locale: localeSchema.default('en'),
  })
  .strict();
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const organizationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  role: membershipRoleSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  countryCode: z.string(),
  jurisdictionPackCode: z.string(),
  scopeMode: z.enum(['MANDATORY', 'VOLUNTARY']),
  plan: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
});
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  givenName: z.string(),
  familyName: z.string(),
  globalRole: z.enum(['USER', 'ADMIN']),
  status: z.enum(['PENDING', 'ACTIVE', 'DISABLED']),
  locale: z.string(),
  timezone: z.string(),
  emailVerifiedAt: z.string().nullable(),
  mfaEnabled: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const httpOnlyCookieRefreshSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshTokenPayload = z.infer<typeof httpOnlyCookieRefreshSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: authUserSchema,
  organizations: z.array(organizationSummarySchema),
  activeOrganizationId: z.string().nullable(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const mfaRequiredResponseSchema = z.object({
  mfaRequired: z.literal(true),
  challengeToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type MfaRequiredResponse = z.infer<typeof mfaRequiredResponseSchema>;

export const mfaSetupRequiredResponseSchema = z.object({
  mfaSetupRequired: z.literal(true),
  setupToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type MfaSetupRequiredResponse = z.infer<typeof mfaSetupRequiredResponseSchema>;

export const mfaSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
  recoveryCodes: z.array(z.string()),
  expiresAt: z.string(),
});
export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

export const loginResponseSchema = z.union([
  authResponseSchema,
  mfaRequiredResponseSchema,
  mfaSetupRequiredResponseSchema,
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;
