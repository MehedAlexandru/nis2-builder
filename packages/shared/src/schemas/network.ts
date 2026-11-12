import { z } from 'zod';
import {
  auditStatusSchema,
  connectionTypeSchema,
  deviceSourceSchema,
  deviceTypeSchema,
  severitySchema,
} from '../enums';

export const networkAuditNameSchema = z.string().trim().min(2).max(160);
export const networkAuditPeriodSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9 ._/-]+$/, 'Use a short audit period');

export const createNetworkAuditSchema = z
  .object({
    name: networkAuditNameSchema,
    period: networkAuditPeriodSchema,
    scope: z.string().trim().max(2000).optional(),
    methodology: z.string().trim().max(4000).optional(),
    auditorName: z.string().trim().max(160).optional(),
    limitations: z.string().trim().max(2000).optional(),
  })
  .strict();
export type CreateNetworkAuditInput = z.infer<typeof createNetworkAuditSchema>;

export const updateNetworkAuditSchema = z
  .object({
    name: networkAuditNameSchema.optional(),
    period: networkAuditPeriodSchema.optional(),
    scope: z.string().trim().max(2000).nullable().optional(),
    methodology: z.string().trim().max(4000).nullable().optional(),
    auditorName: z.string().trim().max(160).nullable().optional(),
    limitations: z.string().trim().max(2000).nullable().optional(),
    status: auditStatusSchema.optional(),
  })
  .strict();
export type UpdateNetworkAuditInput = z.infer<typeof updateNetworkAuditSchema>;

export const networkAuditSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  period: z.string(),
  status: auditStatusSchema,
  scope: z.string().nullable(),
  methodology: z.string().nullable(),
  auditorName: z.string().nullable(),
  limitations: z.string().nullable(),
  deviceCount: z.number().int().nonnegative(),
  completeCount: z.number().int().nonnegative(),
  riskCount: z.number().int().nonnegative(),
  averageCompleteness: z.number().int().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NetworkAuditSummary = z.infer<typeof networkAuditSummarySchema>;

export const mapPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();
export type MapPosition = z.infer<typeof mapPositionSchema>;

export const mapBoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().min(120),
    height: z.number().finite().min(100),
  })
  .strict();
export type MapBounds = z.infer<typeof mapBoundsSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const macAddressSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/-/g, ':').toUpperCase())
  .refine(
    (value) =>
      value === '' || /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value) || /^[0-9A-F]{12}$/.test(value),
    'Use a MAC address such as AA:BB:CC:DD:EE:FF',
  );

const ipListSchema = z.array(z.string().trim().ip()).max(64);

export const deviceIdentityInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160).nullable().optional(),
    type: deviceTypeSchema.optional(),
    vendor: optionalText(160),
    model: optionalText(160),
    serial: optionalText(160),
    ipAddresses: ipListSchema.optional(),
    macAddress: macAddressSchema.nullable().optional(),
    location: optionalText(160),
    ownerLabel: optionalText(160),
    criticality: severitySchema.nullable().optional(),
    dataClassification: optionalText(80),
    businessServices: z.array(z.string().trim().min(1).max(160)).max(32).optional(),
    zoneId: z.string().uuid().nullable().optional(),
    position: mapPositionSchema.nullable().optional(),
    notes: optionalText(4000),
  })
  .strict();
export type DeviceIdentityInput = z.infer<typeof deviceIdentityInputSchema>;

export const createDeviceInputSchema = deviceIdentityInputSchema;
export type CreateDeviceInput = z.infer<typeof createDeviceInputSchema>;

export const updateDeviceInputSchema = deviceIdentityInputSchema;
export type UpdateDeviceInput = z.infer<typeof updateDeviceInputSchema>;

export const remoteAccessSchema = z.enum(['RDP', 'SSH', 'VPN', 'TEAMVIEWER', 'OTHER']);
export type RemoteAccess = z.infer<typeof remoteAccessSchema>;

export const backupLocationSchema = z.enum(['LOCAL', 'OFFSITE', 'IMMUTABLE', 'CLOUD']);
export type BackupLocation = z.infer<typeof backupLocationSchema>;

export const deviceAssessmentDataSchema = z
  .object({
    os: z.string().trim().max(160).optional(),
    osVersion: z.string().trim().max(80).optional(),
    endOfSupportDate: z.string().date().optional(),
    lastPatchDate: z.string().date().optional(),
    autoUpdate: z.boolean().optional(),

    antivirusPresent: z.boolean().optional(),
    antivirusProduct: z.string().trim().max(160).optional(),
    licenseExpiryDate: z.string().date().optional(),
    realTimeProtection: z.boolean().optional(),
    lastScanDate: z.string().date().optional(),

    mfaEnabled: z.boolean().optional(),
    mfaType: z.string().trim().max(80).optional(),
    adminAccountCount: z.number().int().min(0).max(10000).optional(),
    defaultCredentialsChanged: z.boolean().optional(),
    localAdminRights: z.boolean().optional(),
    remoteAccess: z.array(remoteAccessSchema).max(8).optional(),
    passwordPolicy: z.string().trim().max(500).optional(),

    backupExists: z.boolean().optional(),
    backupMethod: z.string().trim().max(160).optional(),
    backupFrequency: z.string().trim().max(160).optional(),
    backupLocations: z.array(backupLocationSchema).max(8).optional(),
    lastBackupDate: z.string().date().optional(),
    lastRestoreTestDate: z.string().date().optional(),
    rtoHours: z.number().int().min(0).max(8760).optional(),
    rpoHours: z.number().int().min(0).max(8760).optional(),

    openPorts: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
    internetExposed: z.boolean().optional(),
    firewallReviewed: z.boolean().optional(),
    segmentation: z.string().trim().max(500).optional(),
    encryptionInTransit: z.boolean().optional(),

    diskEncryption: z.boolean().optional(),
    personalData: z.boolean().optional(),
    encryptionAtRest: z.boolean().optional(),

    logsEnabled: z.boolean().optional(),
    centralLogging: z.boolean().optional(),
    logRetentionDays: z.number().int().min(0).max(3650).optional(),

    physicalAccessControlled: z.boolean().optional(),
    physicalLocation: z.string().trim().max(300).optional(),
  })
  .strict();
export type DeviceAssessmentData = z.infer<typeof deviceAssessmentDataSchema>;

export const saveDeviceAssessmentSchema = z
  .object({
    data: deviceAssessmentDataSchema,
    informationComplete: z.boolean().default(false),
  })
  .strict();
export type SaveDeviceAssessmentInput = z.infer<typeof saveDeviceAssessmentSchema>;

export const deviceRiskCodeSchema = z.enum([
  'AV_EXPIRED',
  'AV_MISSING',
  'OS_EOL',
  'PATCH_STALE',
  'NO_BACKUP',
  'BACKUP_NOT_TESTED',
  'MFA_MISSING_REMOTE',
  'DEFAULT_CREDENTIALS',
  'INTERNET_EXPOSED',
  'LOGGING_DISABLED',
  'CENTRAL_LOGGING_MISSING',
  'DISK_ENCRYPTION_MISSING',
  'LICENSE_EXPIRING',
]);
export type DeviceRiskCode = z.infer<typeof deviceRiskCodeSchema>;

export const networkDeviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: deviceTypeSchema,
  vendor: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  ipAddresses: z.array(z.string()),
  macAddress: z.string().nullable(),
  location: z.string().nullable(),
  ownerLabel: z.string().nullable(),
  criticality: severitySchema.nullable(),
  dataClassification: z.string().nullable(),
  businessServices: z.array(z.string()),
  source: deviceSourceSchema,
  fingerprint: z.string().nullable(),
  position: mapPositionSchema.nullable(),
  zoneId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  informationComplete: z.boolean(),
  completeness: z.number().int().min(0).max(100),
  missingRequired: z.array(z.string()),
  riskCodes: z.array(deviceRiskCodeSchema),
  assessment: deviceAssessmentDataSchema,
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  updatedAt: z.string(),
});
export type NetworkDevice = z.infer<typeof networkDeviceSchema>;

export const networkZoneSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  bounds: mapBoundsSchema.nullable(),
});
export type NetworkZone = z.infer<typeof networkZoneSchema>;

export const networkConnectionSchema = z.object({
  id: z.string().uuid(),
  sourceDeviceId: z.string().uuid(),
  targetDeviceId: z.string().uuid(),
  type: connectionTypeSchema,
  speedMbps: z.number().int().positive().nullable(),
  vlan: z.number().int().min(0).max(4094).nullable(),
});
export type NetworkConnection = z.infer<typeof networkConnectionSchema>;

export const networkMapSchema = z.object({
  audit: networkAuditSummarySchema,
  zones: z.array(networkZoneSchema),
  devices: z.array(networkDeviceSchema),
  connections: z.array(networkConnectionSchema),
  generatedAt: z.string(),
});
export type NetworkMap = z.infer<typeof networkMapSchema>;

export const createZoneInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    description: z.string().trim().max(500).optional(),
    bounds: mapBoundsSchema.optional(),
  })
  .strict();
export type CreateZoneInput = z.infer<typeof createZoneInputSchema>;

export const updateZoneInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    description: z.string().trim().max(500).nullable().optional(),
    bounds: mapBoundsSchema.nullable().optional(),
  })
  .strict();
export type UpdateZoneInput = z.infer<typeof updateZoneInputSchema>;

export const createConnectionInputSchema = z
  .object({
    sourceDeviceId: z.string().uuid(),
    targetDeviceId: z.string().uuid(),
    type: connectionTypeSchema.default('WIRED'),
    speedMbps: z.number().int().positive().max(1_000_000).optional(),
    vlan: z.number().int().min(0).max(4094).optional(),
  })
  .strict()
  .refine((value) => value.sourceDeviceId !== value.targetDeviceId, {
    message: 'A device cannot connect to itself',
  });
export type CreateConnectionInput = z.infer<typeof createConnectionInputSchema>;

export const updateConnectionInputSchema = z
  .object({
    type: connectionTypeSchema.optional(),
    speedMbps: z.number().int().positive().max(1_000_000).nullable().optional(),
    vlan: z.number().int().min(0).max(4094).nullable().optional(),
  })
  .strict();
export type UpdateConnectionInput = z.infer<typeof updateConnectionInputSchema>;

export const saveMapLayoutSchema = z
  .object({
    devices: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            position: mapPositionSchema.nullable(),
            zoneId: z.string().uuid().nullable().optional(),
          })
          .strict(),
      )
      .max(1000),
    zones: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            bounds: mapBoundsSchema.nullable(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type SaveMapLayoutInput = z.infer<typeof saveMapLayoutSchema>;

export const deviceImportFormatSchema = z.enum(['NMAP_XML', 'CSV']);
export type DeviceImportFormat = z.infer<typeof deviceImportFormatSchema>;

export const importDevicesInputSchema = z
  .object({
    format: deviceImportFormatSchema,
    content: z.string().min(1).max(2_500_000),
  })
  .strict();
export type ImportDevicesInput = z.infer<typeof importDevicesInputSchema>;

export const deviceImportResultSchema = z.object({
  format: deviceImportFormatSchema,
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type DeviceImportResult = z.infer<typeof deviceImportResultSchema>;

export const mergeDevicesInputSchema = z
  .object({
    sourceDeviceId: z.string().uuid(),
    targetDeviceId: z.string().uuid(),
  })
  .strict()
  .refine((value) => value.sourceDeviceId !== value.targetDeviceId, {
    message: 'Choose two different devices',
  });
export type MergeDevicesInput = z.infer<typeof mergeDevicesInputSchema>;

export const duplicateDeviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: deviceTypeSchema,
  ipAddresses: z.array(z.string()),
  macAddress: z.string().nullable(),
});
export const duplicateDeviceGroupSchema = z.object({
  reason: z.enum(['MAC', 'IP']),
  key: z.string(),
  devices: z.array(duplicateDeviceSchema).min(2),
});
export const duplicateDeviceGroupsSchema = z.array(duplicateDeviceGroupSchema);
export type DuplicateDeviceGroup = z.infer<typeof duplicateDeviceGroupSchema>;

export const deviceTypeListSchema = z.array(deviceTypeSchema);
