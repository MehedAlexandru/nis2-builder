import { z } from 'zod';
import { effortSchema, findingStatusSchema, severitySchema } from '../enums';
import type { DeviceRiskCode, NetworkDevice } from './network';
import { isoTimestampSchema, localeSchema } from './common';

export const findingCategorySchema = z.enum([
  'RISK_MANAGEMENT',
  'INCIDENT_HANDLING',
  'BUSINESS_CONTINUITY',
  'SUPPLY_CHAIN',
  'SECURE_DEVELOPMENT',
  'EFFECTIVENESS',
  'CYBER_HYGIENE',
  'CRYPTOGRAPHY',
  'ACCESS_CONTROL',
  'NETWORK_SECURITY',
  'LOGGING',
  'OTHER',
]);
export type FindingCategory = z.infer<typeof findingCategorySchema>;

export const FINDING_CATEGORY_LABEL: Record<FindingCategory, string> = {
  RISK_MANAGEMENT: 'Risk management',
  INCIDENT_HANDLING: 'Incident handling',
  BUSINESS_CONTINUITY: 'Business continuity and backup',
  SUPPLY_CHAIN: 'Supply chain security',
  SECURE_DEVELOPMENT: 'Secure development and maintenance',
  EFFECTIVENESS: 'Effectiveness assessment',
  CYBER_HYGIENE: 'Cyber hygiene and training',
  CRYPTOGRAPHY: 'Cryptography and encryption',
  ACCESS_CONTROL: 'Access control and asset management',
  NETWORK_SECURITY: 'Network security',
  LOGGING: 'Logging and monitoring',
  OTHER: 'Other',
};

export const FINDING_CATEGORY_LEGAL_REFERENCE: Record<FindingCategory, string> = {
  RISK_MANAGEMENT: 'NIS2 Art. 21(2)(a)',
  INCIDENT_HANDLING: 'NIS2 Art. 21(2)(b)',
  BUSINESS_CONTINUITY: 'NIS2 Art. 21(2)(c)',
  SUPPLY_CHAIN: 'NIS2 Art. 21(2)(d)',
  SECURE_DEVELOPMENT: 'NIS2 Art. 21(2)(e)',
  EFFECTIVENESS: 'NIS2 Art. 21(2)(f)',
  CYBER_HYGIENE: 'NIS2 Art. 21(2)(g)',
  CRYPTOGRAPHY: 'NIS2 Art. 21(2)(h)',
  ACCESS_CONTROL: 'NIS2 Art. 21(2)(i)',
  NETWORK_SECURITY: 'NIS2 Art. 21(2)(a)',
  LOGGING: 'NIS2 Art. 21(2)(f)',
  OTHER: 'NIS2 Art. 21(2)',
};

export const findingRiskAcceptanceSchema = z
  .object({
    justification: z.string().trim().min(10).max(2000),
    approverName: z.string().trim().min(2).max(160),
    acceptedAt: isoTimestampSchema.optional(),
    approvedByUserId: z.string().uuid().optional(),
  })
  .strict();
export type FindingRiskAcceptance = z.infer<typeof findingRiskAcceptanceSchema>;

const findingBaseFields = {
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(8000).nullable().optional(),
  category: findingCategorySchema.default('OTHER'),
  severity: severitySchema.default('MEDIUM'),
  likelihood: z.number().int().min(1).max(5).nullable().optional(),
  impact: z.number().int().min(1).max(5).nullable().optional(),
  organizationWide: z.boolean().default(false),
  evidence: z.string().trim().max(4000).nullable().optional(),
  proposedSolution: z.string().trim().max(4000).nullable().optional(),
  effort: effortSchema.nullable().optional(),
  costEstimateEur: z.number().min(0).max(1_000_000_000).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
};

function validateFinding(value: {
  organizationWide?: boolean;
  deviceIds?: string[];
  status?: string;
  riskAcceptance?: unknown;
}): boolean {
  if (value.organizationWide && value.deviceIds && value.deviceIds.length > 0) {
    return false;
  }
  if (value.status === 'ACCEPTED_RISK' && !value.riskAcceptance) {
    return false;
  }
  return true;
}

export const createFindingSchema = z
  .object({
    ...findingBaseFields,
    auditId: z.string().uuid().nullable().optional(),
    deviceIds: z.array(z.string().uuid()).max(250).default([]),
    status: findingStatusSchema.default('OPEN'),
    riskAcceptance: findingRiskAcceptanceSchema.optional(),
    source: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .refine((value) => validateFinding(value), {
    message:
      'Choose either an organization-wide finding or specific devices; risk acceptance needs a justification and approver',
    path: ['deviceIds'],
  });
export type CreateFindingInput = z.infer<typeof createFindingSchema>;

export const updateFindingSchema = z
  .object({
    title: findingBaseFields.title.optional(),
    description: findingBaseFields.description,
    category: findingCategorySchema.optional(),
    severity: severitySchema.optional(),
    likelihood: findingBaseFields.likelihood,
    impact: findingBaseFields.impact,
    organizationWide: z.boolean().optional(),
    evidence: findingBaseFields.evidence,
    proposedSolution: findingBaseFields.proposedSolution,
    effort: findingBaseFields.effort,
    costEstimateEur: findingBaseFields.costEstimateEur,
    ownerUserId: findingBaseFields.ownerUserId,
    dueDate: findingBaseFields.dueDate,
    auditId: z.string().uuid().nullable().optional(),
    deviceIds: z.array(z.string().uuid()).max(250).optional(),
    status: findingStatusSchema.optional(),
    riskAcceptance: findingRiskAcceptanceSchema.nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((value) => validateFinding(value), {
    message:
      'Choose either an organization-wide finding or specific devices; risk acceptance needs a justification and approver',
    path: ['deviceIds'],
  });
export type UpdateFindingInput = z.infer<typeof updateFindingSchema>;

export const findingListQuerySchema = z
  .object({
    auditId: z.string().uuid().optional(),
    status: findingStatusSchema.optional(),
    severity: severitySchema.optional(),
    deviceId: z.string().uuid().optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict();
export type FindingListQuery = z.infer<typeof findingListQuerySchema>;

export const findingDeviceRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  ipAddresses: z.array(z.string()),
});
export type FindingDeviceRef = z.infer<typeof findingDeviceRefSchema>;

export const findingHistoryChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type FindingHistoryChange = z.infer<typeof findingHistoryChangeSchema>;

export const findingHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  changedById: z.string().uuid(),
  changedByName: z.string().nullable(),
  note: z.string().nullable(),
  changes: z.array(findingHistoryChangeSchema),
  createdAt: isoTimestampSchema,
});
export type FindingHistoryEntry = z.infer<typeof findingHistoryEntrySchema>;

export const findingSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string().nullable(),
  auditId: z.string().uuid().nullable(),
  auditName: z.string().nullable(),
  title: z.string(),
  category: findingCategorySchema,
  severity: severitySchema,
  likelihood: z.number().int().nullable(),
  impact: z.number().int().nullable(),
  riskScore: z.number().int().nullable(),
  organizationWide: z.boolean(),
  status: findingStatusSchema,
  effort: effortSchema.nullable(),
  dueDate: isoTimestampSchema.nullable(),
  ownerUserId: z.string().uuid().nullable(),
  ownerName: z.string().nullable(),
  deviceCount: z.number().int().nonnegative(),
  source: z.string().nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type FindingSummary = z.infer<typeof findingSummarySchema>;

export const findingDetailSchema = findingSummarySchema.extend({
  description: z.string().nullable(),
  evidence: z.string().nullable(),
  proposedSolution: z.string().nullable(),
  costEstimateEur: z.number().nullable(),
  riskAcceptance: findingRiskAcceptanceSchema.nullable(),
  devices: z.array(findingDeviceRefSchema),
  history: z.array(findingHistoryEntrySchema),
});
export type FindingDetail = z.infer<typeof findingDetailSchema>;

export const findingCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  bySeverity: z.record(severitySchema, z.number().int().nonnegative()),
  byStatus: z.record(findingStatusSchema, z.number().int().nonnegative()),
});
export type FindingCounts = z.infer<typeof findingCountsSchema>;

export const findingListSchema = z.object({
  items: z.array(findingSummarySchema),
  counts: findingCountsSchema,
});
export type FindingList = z.infer<typeof findingListSchema>;

export interface FindingSuggestionRule {
  title: string;
  description: string;
  category: FindingCategory;
  severity: z.infer<typeof severitySchema>;
  effort: z.infer<typeof effortSchema>;
  proposedSolution: string;
}

export const FINDING_SUGGESTION_RULES: Record<DeviceRiskCode, FindingSuggestionRule> = {
  AV_MISSING: {
    title: 'Endpoint protection is missing',
    description:
      'The device has no antivirus or EDR protection reported. Malware can run without detection and spread laterally.',
    category: 'CYBER_HYGIENE',
    severity: 'HIGH',
    effort: 'S',
    proposedSolution:
      'Deploy a centrally managed endpoint protection agent, enable real-time protection and verify updates.',
  },
  AV_EXPIRED: {
    title: 'Endpoint protection licence has expired',
    description:
      'The antivirus or EDR licence is expired, so signature and product updates may no longer be available.',
    category: 'CYBER_HYGIENE',
    severity: 'HIGH',
    effort: 'S',
    proposedSolution:
      'Renew the licence, update the product and confirm that all endpoints report to the management console.',
  },
  LICENSE_EXPIRING: {
    title: 'Security licence expires within 30 days',
    description:
      'A protection or support licence is close to expiry. A lapse removes vendor updates and support.',
    category: 'CYBER_HYGIENE',
    severity: 'MEDIUM',
    effort: 'S',
    proposedSolution: 'Renew or replace the licence before the expiry date and record the owner.',
  },
  OS_EOL: {
    title: 'Operating system is end of life',
    description:
      'The operating system no longer receives security updates, leaving known vulnerabilities unpatched.',
    category: 'CYBER_HYGIENE',
    severity: 'HIGH',
    effort: 'L',
    proposedSolution:
      'Plan an upgrade or replacement, isolate the device until migration and document compensating controls.',
  },
  PATCH_STALE: {
    title: 'Security patches are overdue',
    description:
      'The last patch date is more than 90 days old. Known vulnerabilities may be exploitable on this device.',
    category: 'CYBER_HYGIENE',
    severity: 'MEDIUM',
    effort: 'M',
    proposedSolution:
      'Apply outstanding updates, enable automatic patching where possible and track a monthly patch cycle.',
  },
  NO_BACKUP: {
    title: 'No backup is configured',
    description:
      'The device has no backup. Data loss or ransomware could interrupt the supported business service.',
    category: 'BUSINESS_CONTINUITY',
    severity: 'HIGH',
    effort: 'M',
    proposedSolution:
      'Define a backup schedule, keep an offsite or immutable copy and assign an owner for restore tests.',
  },
  BACKUP_NOT_TESTED: {
    title: 'Backups have never been restore-tested',
    description:
      'A backup exists but there is no evidence of a successful restore test, so recoverability is unproven.',
    category: 'BUSINESS_CONTINUITY',
    severity: 'MEDIUM',
    effort: 'M',
    proposedSolution:
      'Perform a restore test, record the result and schedule regular recovery exercises with RTO/RPO targets.',
  },
  MFA_MISSING_REMOTE: {
    title: 'Remote access is not protected by MFA',
    description:
      'The device exposes remote access without multi-factor authentication, making credential theft sufficient for entry.',
    category: 'ACCESS_CONTROL',
    severity: 'HIGH',
    effort: 'S',
    proposedSolution:
      'Enforce MFA for remote access, remove unused remote services and restrict source networks.',
  },
  DEFAULT_CREDENTIALS: {
    title: 'Default credentials may still be in use',
    description:
      'The assessment says default credentials were not changed, a common entry point for network devices.',
    category: 'ACCESS_CONTROL',
    severity: 'CRITICAL',
    effort: 'S',
    proposedSolution:
      'Change default credentials immediately, use a password manager and restrict management interfaces.',
  },
  INTERNET_EXPOSED: {
    title: 'Device is exposed to the internet',
    description:
      'The device is reachable from the internet, increasing the attack surface and the impact of a compromise.',
    category: 'NETWORK_SECURITY',
    severity: 'HIGH',
    effort: 'M',
    proposedSolution:
      'Remove unnecessary exposure, place the service behind a VPN or reverse proxy and review firewall rules.',
  },
  LOGGING_DISABLED: {
    title: 'Security logging is disabled',
    description:
      'The device does not keep security logs, so intrusions and operational faults may go unnoticed.',
    category: 'LOGGING',
    severity: 'MEDIUM',
    effort: 'M',
    proposedSolution:
      'Enable local security logging, protect log access and define retention for investigation needs.',
  },
  CENTRAL_LOGGING_MISSING: {
    title: 'Logs are not forwarded to central monitoring',
    description:
      'Local logs exist but are not centralised, so alerts and correlation across devices are limited.',
    category: 'LOGGING',
    severity: 'MEDIUM',
    effort: 'M',
    proposedSolution:
      'Forward security logs to a SIEM or central collector and configure alerts for critical events.',
  },
  DISK_ENCRYPTION_MISSING: {
    title: 'Disk encryption is missing',
    description:
      'Data at rest is not encrypted. A lost or stolen device could expose business or personal data.',
    category: 'CRYPTOGRAPHY',
    severity: 'HIGH',
    effort: 'M',
    proposedSolution:
      'Enable full-disk encryption, escrow recovery keys securely and document the rollout.',
  },
};

export const findingSuggestionSchema = z.object({
  key: z.string(),
  deviceId: z.string().uuid(),
  deviceName: z.string(),
  riskCode: z.string(),
  title: z.string(),
  description: z.string(),
  category: findingCategorySchema,
  severity: severitySchema,
  effort: effortSchema,
  proposedSolution: z.string(),
  legalReference: z.string(),
});
export type FindingSuggestion = z.infer<typeof findingSuggestionSchema>;

export const findingSuggestionListSchema = z.object({
  items: z.array(findingSuggestionSchema),
  dismissed: z.number().int().nonnegative(),
});
export type FindingSuggestionList = z.infer<typeof findingSuggestionListSchema>;

export const findingSuggestionActionSchema = z
  .object({
    deviceId: z.string().uuid(),
    riskCode: z.string().trim().min(1).max(80),
  })
  .strict();
export type FindingSuggestionAction = z.infer<typeof findingSuggestionActionSchema>;

export function buildFindingSuggestions(
  devices: NetworkDevice[],
  dismissedKeys: ReadonlySet<string> = new Set(),
): FindingSuggestion[] {
  const suggestions: FindingSuggestion[] = [];
  for (const device of devices) {
    for (const riskCode of device.riskCodes) {
      const key = suggestionKey(device.id, riskCode);
      if (dismissedKeys.has(key)) continue;
      const rule = FINDING_SUGGESTION_RULES[riskCode];
      if (!rule) continue;
      suggestions.push({
        key,
        deviceId: device.id,
        deviceName: device.name,
        riskCode,
        title: rule.title,
        description: rule.description,
        category: rule.category,
        severity: rule.severity,
        effort: rule.effort,
        proposedSolution: rule.proposedSolution,
        legalReference: FINDING_CATEGORY_LEGAL_REFERENCE[rule.category],
      });
    }
  }
  return suggestions.sort(
    (left, right) =>
      severityRank(right.severity) - severityRank(left.severity) ||
      left.deviceName.localeCompare(right.deviceName) ||
      left.riskCode.localeCompare(right.riskCode),
  );
}

export function suggestionKey(deviceId: string, riskCode: string): string {
  return `${deviceId}:${riskCode}`;
}

export function severityRank(value: z.infer<typeof severitySchema>): number {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[value];
}

export function computeRiskScore(
  severity: z.infer<typeof severitySchema>,
  likelihood?: number | null,
  impact?: number | null,
): number {
  if (likelihood && impact) return Math.min(25, Math.max(1, likelihood * impact));
  return { LOW: 4, MEDIUM: 9, HIGH: 16, CRITICAL: 25 }[severity];
}

export interface AuditComparisonFinding {
  id: string;
  code: string | null;
  title: string;
  severity: z.infer<typeof severitySchema>;
  status: z.infer<typeof findingStatusSchema>;
  riskScore: number | null;
}

export const auditFindingTrendSchema = z.object({
  currentTotal: z.number().int().nonnegative(),
  previousTotal: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  carried: z.number().int().nonnegative(),
  stillOpen: z.number().int().nonnegative(),
  bySeverityCurrent: z.record(severitySchema, z.number().int().nonnegative()),
  bySeverityPrevious: z.record(severitySchema, z.number().int().nonnegative()),
  riskScoreCurrent: z.number().int().nonnegative(),
  riskScorePrevious: z.number().int().nonnegative(),
  newFindings: z.array(z.string()),
  closedFindings: z.array(z.string()),
});
export type AuditFindingTrend = z.infer<typeof auditFindingTrendSchema>;

export const auditComparisonSchema = z.object({
  currentAuditId: z.string().uuid(),
  previousAuditId: z.string().uuid().nullable(),
  currentName: z.string(),
  previousName: z.string().nullable(),
  deviceDelta: z.number().int(),
  completenessDelta: z.number().int(),
  riskDeviceDelta: z.number().int(),
  findings: auditFindingTrendSchema,
});
export type AuditComparison = z.infer<typeof auditComparisonSchema>;

export function compareFindings(
  current: AuditComparisonFinding[],
  previous: AuditComparisonFinding[],
): AuditFindingTrend {
  const previousByKey = new Map(previous.map((finding) => [findingKey(finding), finding]));
  const currentKeys = new Set(current.map(findingKey));
  let opened = 0;
  let closed = 0;
  let carried = 0;
  const newFindings: string[] = [];
  const closedFindings: string[] = [];

  for (const finding of current) {
    const before = previousByKey.get(findingKey(finding));
    if (!before) {
      opened += 1;
      newFindings.push(finding.title);
    } else {
      carried += 1;
      if (before.status !== 'CLOSED' && finding.status === 'CLOSED') {
        closed += 1;
        closedFindings.push(finding.title);
      }
    }
  }

  let stillOpen = 0;
  for (const finding of previous) {
    if (currentKeys.has(findingKey(finding))) continue;
    if (finding.status === 'CLOSED') {
      closed += 1;
      closedFindings.push(finding.title);
    } else {
      stillOpen += 1;
    }
  }

  return {
    currentTotal: current.length,
    previousTotal: previous.length,
    opened,
    closed,
    carried,
    stillOpen,
    bySeverityCurrent: countSeverity(current),
    bySeverityPrevious: countSeverity(previous),
    riskScoreCurrent: current
      .filter((finding) => finding.status !== 'CLOSED')
      .reduce((sum, finding) => sum + (finding.riskScore ?? severityRank(finding.severity) * 4), 0),
    riskScorePrevious: previous
      .filter((finding) => finding.status !== 'CLOSED')
      .reduce((sum, finding) => sum + (finding.riskScore ?? severityRank(finding.severity) * 4), 0),
    newFindings,
    closedFindings,
  };
}

function findingKey(finding: AuditComparisonFinding): string {
  return finding.code?.trim() || finding.title.trim().toLowerCase();
}

function countSeverity(
  findings: AuditComparisonFinding[],
): Record<z.infer<typeof severitySchema>, number> {
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

export const createAuditReportSchema = z
  .object({
    format: z.enum(['DOCX', 'PDF']).default('PDF'),
    locale: localeSchema.default('en'),
    previousAuditId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type CreateAuditReportInput = z.infer<typeof createAuditReportSchema>;
