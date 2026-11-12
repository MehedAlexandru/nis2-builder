import type { DeviceType } from '../enums';
import type { DeviceAssessmentData, DeviceRiskCode } from '../schemas/network';

export type AssessmentGroupKey =
  'software' | 'protection' | 'access' | 'backup' | 'network' | 'data' | 'logging' | 'physical';

export type DeviceAssessmentFieldKey = keyof DeviceAssessmentData;

export const DEVICE_ASSESSMENT_GROUPS: ReadonlyArray<{
  key: AssessmentGroupKey;
  fields: ReadonlyArray<DeviceAssessmentFieldKey>;
}> = [
  {
    key: 'software',
    fields: ['os', 'osVersion', 'endOfSupportDate', 'lastPatchDate', 'autoUpdate'],
  },
  {
    key: 'protection',
    fields: [
      'antivirusPresent',
      'antivirusProduct',
      'licenseExpiryDate',
      'realTimeProtection',
      'lastScanDate',
    ],
  },
  {
    key: 'access',
    fields: [
      'mfaEnabled',
      'mfaType',
      'adminAccountCount',
      'defaultCredentialsChanged',
      'localAdminRights',
      'remoteAccess',
      'passwordPolicy',
    ],
  },
  {
    key: 'backup',
    fields: [
      'backupExists',
      'backupMethod',
      'backupFrequency',
      'backupLocations',
      'lastBackupDate',
      'lastRestoreTestDate',
      'rtoHours',
      'rpoHours',
    ],
  },
  {
    key: 'network',
    fields: [
      'openPorts',
      'internetExposed',
      'firewallReviewed',
      'segmentation',
      'encryptionInTransit',
    ],
  },
  {
    key: 'data',
    fields: ['diskEncryption', 'personalData', 'encryptionAtRest'],
  },
  {
    key: 'logging',
    fields: ['logsEnabled', 'centralLogging', 'logRetentionDays'],
  },
  {
    key: 'physical',
    fields: ['physicalAccessControlled', 'physicalLocation'],
  },
];

export const DEVICE_ASSESSMENT_FIELDS: ReadonlyArray<DeviceAssessmentFieldKey> =
  DEVICE_ASSESSMENT_GROUPS.flatMap((group) => [...group.fields]);

const ENDPOINT_TYPES: DeviceType[] = ['SERVER', 'WORKSTATION', 'LAPTOP', 'NAS'];
const NETWORK_TYPES: DeviceType[] = ['ROUTER', 'SWITCH', 'FIREWALL', 'ACCESS_POINT'];
const BACKUP_TYPES: DeviceType[] = ['SERVER', 'WORKSTATION', 'LAPTOP', 'NAS', 'CLOUD_SERVICE'];
const LOGGING_TYPES: DeviceType[] = [
  'SERVER',
  'ROUTER',
  'SWITCH',
  'FIREWALL',
  'NAS',
  'CLOUD_SERVICE',
  'ACCESS_POINT',
];
const ENCRYPTION_TYPES: DeviceType[] = ['SERVER', 'WORKSTATION', 'LAPTOP', 'NAS'];
const OWNER_REQUIRED_TYPES: DeviceType[] = [
  'SERVER',
  'ROUTER',
  'SWITCH',
  'FIREWALL',
  'NAS',
  'CLOUD_SERVICE',
];

const REQUIRED_BY_TYPE: Record<DeviceType, DeviceAssessmentFieldKey[]> = {
  ROUTER: [
    'os',
    'defaultCredentialsChanged',
    'adminAccountCount',
    'firewallReviewed',
    'logsEnabled',
  ],
  SWITCH: ['os', 'defaultCredentialsChanged', 'adminAccountCount', 'logsEnabled'],
  FIREWALL: [
    'os',
    'defaultCredentialsChanged',
    'adminAccountCount',
    'firewallReviewed',
    'logsEnabled',
  ],
  SERVER: [
    'os',
    'endOfSupportDate',
    'antivirusPresent',
    'backupExists',
    'lastBackupDate',
    'logsEnabled',
  ],
  WORKSTATION: ['os', 'autoUpdate', 'antivirusPresent', 'backupExists', 'diskEncryption'],
  LAPTOP: ['os', 'autoUpdate', 'antivirusPresent', 'backupExists', 'diskEncryption'],
  PRINTER: ['defaultCredentialsChanged', 'internetExposed'],
  IP_CAMERA: ['defaultCredentialsChanged', 'internetExposed', 'autoUpdate'],
  NVR: ['defaultCredentialsChanged', 'internetExposed', 'autoUpdate'],
  NAS: ['os', 'defaultCredentialsChanged', 'backupExists', 'logsEnabled'],
  ACCESS_POINT: ['os', 'defaultCredentialsChanged', 'adminAccountCount'],
  PHONE: ['os', 'autoUpdate'],
  IOT: ['defaultCredentialsChanged', 'autoUpdate', 'internetExposed'],
  CLOUD_SERVICE: ['mfaEnabled', 'encryptionAtRest', 'logsEnabled', 'backupExists'],
  UNKNOWN: [],
};

export const DEVICE_ASSESSMENT_GROUPS_BY_TYPE: Record<DeviceType, AssessmentGroupKey[]> = {
  ROUTER: ['software', 'access', 'network', 'logging', 'physical'],
  SWITCH: ['software', 'access', 'network', 'logging', 'physical'],
  FIREWALL: ['software', 'access', 'network', 'logging', 'physical'],
  SERVER: ['software', 'protection', 'access', 'backup', 'network', 'data', 'logging', 'physical'],
  WORKSTATION: ['software', 'protection', 'access', 'backup', 'network', 'data', 'logging'],
  LAPTOP: ['software', 'protection', 'access', 'backup', 'network', 'data', 'logging'],
  PRINTER: ['software', 'access', 'network', 'physical'],
  IP_CAMERA: ['software', 'access', 'network', 'data', 'physical'],
  NVR: ['software', 'access', 'network', 'data', 'logging', 'physical'],
  NAS: ['software', 'protection', 'access', 'backup', 'network', 'data', 'logging', 'physical'],
  ACCESS_POINT: ['software', 'access', 'network', 'logging', 'physical'],
  PHONE: ['software', 'protection', 'access', 'data'],
  IOT: ['software', 'access', 'network'],
  CLOUD_SERVICE: ['software', 'access', 'backup', 'network', 'data', 'logging'],
  UNKNOWN: ['software', 'access', 'network', 'data', 'logging'],
};

export interface DeviceCompletenessInput {
  type: DeviceType;
  name?: string | null;
  ipAddresses?: string[];
  macAddress?: string | null;
  criticality?: string | null;
  ownerLabel?: string | null;
  assessment: DeviceAssessmentData;
}

export interface DeviceCompletenessResult {
  percentage: number;
  missingRequired: string[];
  riskCodes: DeviceRiskCode[];
  informationCompleteAllowed: boolean;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function requiredFieldsForDevice(type: DeviceType): string[] {
  const fields: string[] = ['identity.name', 'identity.identifier', 'identity.criticality'];
  if (OWNER_REQUIRED_TYPES.includes(type)) fields.push('identity.ownerLabel');
  fields.push(...REQUIRED_BY_TYPE[type]);
  return fields;
}

export function evaluateDeviceCompleteness(
  input: DeviceCompletenessInput,
  options: { today?: Date } = {},
): DeviceCompletenessResult {
  const today = options.today ?? new Date();
  const required = requiredFieldsForDevice(input.type);
  const missingRequired = required.filter((key) => {
    if (key === 'identity.name') return !hasValue(input.name);
    if (key === 'identity.identifier') {
      return !hasValue(input.ipAddresses) && !hasValue(input.macAddress);
    }
    if (key === 'identity.criticality') return !hasValue(input.criticality);
    if (key === 'identity.ownerLabel') return !hasValue(input.ownerLabel);
    return !hasValue(input.assessment[key as DeviceAssessmentFieldKey]);
  });

  const filledRequired = required.length - missingRequired.length;
  const percentage =
    required.length === 0 ? 100 : Math.round((filledRequired / required.length) * 100);

  const riskCodes = new Set<DeviceRiskCode>();
  const { assessment } = input;
  const avRequired = [...ENDPOINT_TYPES, 'CLOUD_SERVICE'].includes(input.type);
  const backupRequired = BACKUP_TYPES.includes(input.type);

  if (avRequired && assessment.antivirusPresent === false) riskCodes.add('AV_MISSING');
  if (assessment.antivirusPresent && assessment.licenseExpiryDate) {
    const expiry = licenseExpiryStatus(assessment.licenseExpiryDate, today);
    if (expiry === 'EXPIRED') riskCodes.add('AV_EXPIRED');
    if (expiry === 'DUE_7' || expiry === 'DUE_30') riskCodes.add('LICENSE_EXPIRING');
  }
  if (assessment.endOfSupportDate && parseDate(assessment.endOfSupportDate) < startOfDay(today)) {
    riskCodes.add('OS_EOL');
  }
  if (
    assessment.lastPatchDate &&
    ['SERVER', 'WORKSTATION', 'LAPTOP', 'NAS'].includes(input.type) &&
    daysBetween(parseDate(assessment.lastPatchDate), today) > 90
  ) {
    riskCodes.add('PATCH_STALE');
  }
  if (backupRequired && assessment.backupExists === false) riskCodes.add('NO_BACKUP');
  if (
    backupRequired &&
    assessment.backupExists === true &&
    !hasValue(assessment.lastRestoreTestDate)
  ) {
    riskCodes.add('BACKUP_NOT_TESTED');
  }
  if (hasValue(assessment.remoteAccess) && assessment.mfaEnabled !== true) {
    riskCodes.add('MFA_MISSING_REMOTE');
  }
  if (
    [...NETWORK_TYPES, 'PRINTER', 'IP_CAMERA', 'NVR', 'IOT', 'NAS'].includes(input.type) &&
    assessment.defaultCredentialsChanged === false
  ) {
    riskCodes.add('DEFAULT_CREDENTIALS');
  }
  if (assessment.internetExposed === true) riskCodes.add('INTERNET_EXPOSED');
  if (LOGGING_TYPES.includes(input.type) && assessment.logsEnabled === false) {
    riskCodes.add('LOGGING_DISABLED');
  }
  if (
    LOGGING_TYPES.includes(input.type) &&
    assessment.logsEnabled === true &&
    assessment.centralLogging === false
  ) {
    riskCodes.add('CENTRAL_LOGGING_MISSING');
  }
  if (ENCRYPTION_TYPES.includes(input.type) && assessment.diskEncryption === false) {
    riskCodes.add('DISK_ENCRYPTION_MISSING');
  }

  return {
    percentage,
    missingRequired,
    riskCodes: [...riskCodes],
    informationCompleteAllowed: missingRequired.length === 0,
  };
}

export type LicenseExpiryStatus = 'EXPIRED' | 'DUE_7' | 'DUE_30' | 'OK';

export function licenseExpiryStatus(value: string, today: Date = new Date()): LicenseExpiryStatus {
  const days = daysBetween(startOfDay(today), parseDate(value));
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'DUE_7';
  if (days <= 30) return 'DUE_30';
  return 'OK';
}

function parseDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? new Date(8640000000000000) : parsed;
}

function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
