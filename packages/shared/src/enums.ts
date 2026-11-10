import { z } from 'zod';

/**
 * Canonical enums shared by API, web and export renderers. They intentionally
 * mirror the Prisma enums in `apps/api/prisma/schema.prisma`.
 */

export const globalRoleSchema = z.enum(['USER', 'ADMIN']);
export type GlobalRole = z.infer<typeof globalRoleSchema>;

export const membershipRoleSchema = z.enum(['OWNER', 'MEMBER']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const userStatusSchema = z.enum(['PENDING', 'ACTIVE', 'DISABLED']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const organizationStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;

export const planSchema = z.enum(['FREE', 'PRO', 'ENTERPRISE']);
export type Plan = z.infer<typeof planSchema>;

export const scopeModeSchema = z.enum(['MANDATORY', 'VOLUNTARY']);
export type ScopeMode = z.infer<typeof scopeModeSchema>;

/**
 * `LIKELY_IN_SCOPE` is a first-class outcome for ambiguous cases: the wizard
 * tells the user to confirm with the authority or a lawyer instead of guessing.
 */
export const classificationResultSchema = z.enum([
  'ESSENTIAL',
  'IMPORTANT',
  'LIKELY_IN_SCOPE',
  'OUT_OF_SCOPE',
]);
export type ClassificationResult = z.infer<typeof classificationResultSchema>;

export const documentStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETE',
  'NEEDS_REVIEW',
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentClassificationSchema = z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']);
export type DocumentClassification = z.infer<typeof documentClassificationSchema>;

export const applicabilitySchema = z.enum(['ESSENTIAL', 'IMPORTANT', 'BOTH', 'VOLUNTARY']);
export type Applicability = z.infer<typeof applicabilitySchema>;

export const versionStatusSchema = z.enum(['DRAFT', 'APPROVED', 'SUPERSEDED']);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

export const auditStatusSchema = z.enum(['DRAFT', 'IN_PROGRESS', 'CLOSED']);
export type AuditStatus = z.infer<typeof auditStatusSchema>;

export const deviceTypeSchema = z.enum([
  'ROUTER',
  'SWITCH',
  'FIREWALL',
  'SERVER',
  'WORKSTATION',
  'LAPTOP',
  'PRINTER',
  'IP_CAMERA',
  'NVR',
  'NAS',
  'ACCESS_POINT',
  'PHONE',
  'IOT',
  'CLOUD_SERVICE',
  'UNKNOWN',
]);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

export const deviceSourceSchema = z.enum(['SCAN', 'NMAP_IMPORT', 'CSV_IMPORT', 'MANUAL']);
export type DeviceSource = z.infer<typeof deviceSourceSchema>;

export const connectionTypeSchema = z.enum(['WIRED', 'WIRELESS', 'VPN']);
export type ConnectionType = z.infer<typeof connectionTypeSchema>;

export const severitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type Severity = z.infer<typeof severitySchema>;

export const findingStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'MITIGATED',
  'ACCEPTED_RISK',
  'CLOSED',
]);
export type FindingStatus = z.infer<typeof findingStatusSchema>;

export const effortSchema = z.enum(['S', 'M', 'L']);
export type Effort = z.infer<typeof effortSchema>;

export const exportTypeSchema = z.enum([
  'DOCX',
  'PDF',
  'ZIP',
  'COMPLIANCE_SUMMARY',
  'AUDIT_REPORT',
]);
export type ExportType = z.infer<typeof exportTypeSchema>;

export const exportStatusSchema = z.enum(['QUEUED', 'PROCESSING', 'READY', 'FAILED']);
export type ExportStatus = z.infer<typeof exportStatusSchema>;

export const notificationTypeSchema = z.enum([
  'REVIEW_DUE',
  'LICENSE_EXPIRY',
  'FINDING_DUE',
  'INCIDENT',
  'TRAINING_RENEWAL',
  'SYSTEM',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;
