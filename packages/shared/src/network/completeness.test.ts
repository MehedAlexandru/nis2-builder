import { describe, expect, it } from 'vitest';
import {
  evaluateDeviceCompleteness,
  licenseExpiryStatus,
  requiredFieldsForDevice,
} from './completeness';

const today = new Date('2026-11-12T12:00:00.000Z');

describe('evaluateDeviceCompleteness', () => {
  it('requires identity fields and type-specific fields', () => {
    const result = evaluateDeviceCompleteness(
      {
        type: 'SERVER',
        name: '',
        ipAddresses: [],
        criticality: null,
        assessment: {},
      },
      { today },
    );

    expect(result.percentage).toBe(0);
    expect(result.informationCompleteAllowed).toBe(false);
    expect(result.missingRequired).toEqual(
      expect.arrayContaining([
        'identity.name',
        'identity.identifier',
        'identity.criticality',
        'identity.ownerLabel',
        'os',
        'endOfSupportDate',
        'antivirusPresent',
        'backupExists',
        'lastBackupDate',
        'logsEnabled',
      ]),
    );
  });

  it('reaches 100% when all required fields are answered', () => {
    const result = evaluateDeviceCompleteness(
      {
        type: 'SERVER',
        name: 'ERP server',
        ipAddresses: ['192.0.2.10'],
        criticality: 'HIGH',
        ownerLabel: 'IT',
        assessment: {
          os: 'Ubuntu',
          endOfSupportDate: '2029-04-01',
          antivirusPresent: true,
          backupExists: true,
          lastBackupDate: '2026-11-11',
          logsEnabled: true,
        },
      },
      { today },
    );

    expect(result.percentage).toBe(100);
    expect(result.missingRequired).toEqual([]);
    expect(result.informationCompleteAllowed).toBe(true);
  });

  it('requires fewer fields for a printer than a server', () => {
    expect(requiredFieldsForDevice('PRINTER')).not.toContain('backupExists');
    expect(requiredFieldsForDevice('SERVER')).toContain('backupExists');
  });

  it('reports expired AV, EOL OS and untested backups as risks', () => {
    const result = evaluateDeviceCompleteness(
      {
        type: 'SERVER',
        name: 'ERP server',
        ipAddresses: ['192.0.2.10'],
        criticality: 'HIGH',
        ownerLabel: 'IT',
        assessment: {
          os: 'Windows Server 2012',
          endOfSupportDate: '2023-10-10',
          antivirusPresent: true,
          licenseExpiryDate: '2026-10-01',
          backupExists: true,
          lastBackupDate: '2026-11-11',
          logsEnabled: true,
        },
      },
      { today },
    );

    expect(result.riskCodes).toEqual(
      expect.arrayContaining(['AV_EXPIRED', 'OS_EOL', 'BACKUP_NOT_TESTED']),
    );
  });

  it('flags exposed remote access without MFA', () => {
    const result = evaluateDeviceCompleteness(
      {
        type: 'FIREWALL',
        name: 'Edge firewall',
        ipAddresses: ['192.0.2.1'],
        criticality: 'CRITICAL',
        ownerLabel: 'IT',
        assessment: {
          os: 'FortiOS',
          remoteAccess: ['VPN'],
          mfaEnabled: false,
          internetExposed: true,
          defaultCredentialsChanged: false,
        },
      },
      { today },
    );

    expect(result.riskCodes).toEqual(
      expect.arrayContaining(['MFA_MISSING_REMOTE', 'INTERNET_EXPOSED', 'DEFAULT_CREDENTIALS']),
    );
  });
});

describe('licenseExpiryStatus', () => {
  it('classifies expired and near-expiry licenses', () => {
    expect(licenseExpiryStatus('2026-11-01', today)).toBe('EXPIRED');
    expect(licenseExpiryStatus('2026-11-15', today)).toBe('DUE_7');
    expect(licenseExpiryStatus('2026-12-01', today)).toBe('DUE_30');
    expect(licenseExpiryStatus('2027-12-01', today)).toBe('OK');
  });
});
