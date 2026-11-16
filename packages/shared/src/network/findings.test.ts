import { describe, expect, it } from 'vitest';
import {
  buildFindingSuggestions,
  compareFindings,
  computeRiskScore,
  suggestionKey,
  type NetworkDevice,
} from '../index';

function device(overrides: Partial<NetworkDevice> = {}): NetworkDevice {
  return {
    id: '01a1cb40-c91b-71c2-99a3-ad0e551ccf4b',
    name: 'Core firewall',
    type: 'FIREWALL',
    vendor: null,
    model: null,
    serial: null,
    ipAddresses: ['192.168.1.1'],
    macAddress: null,
    location: null,
    ownerLabel: null,
    criticality: 'HIGH',
    dataClassification: null,
    businessServices: [],
    source: 'MANUAL',
    fingerprint: null,
    scanState: 'UNCHANGED',
    position: null,
    zoneId: null,
    notes: null,
    informationComplete: true,
    completeness: 100,
    missingRequired: [],
    riskCodes: ['DEFAULT_CREDENTIALS', 'PATCH_STALE'],
    assessment: {},
    firstSeenAt: '2026-11-16T10:00:00.000Z',
    lastSeenAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('finding suggestions', () => {
  it('maps device risk codes to findings and sorts by severity', () => {
    const suggestions = buildFindingSuggestions([device()]);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]?.riskCode).toBe('DEFAULT_CREDENTIALS');
    expect(suggestions[0]?.severity).toBe('CRITICAL');
    expect(suggestions[0]?.legalReference).toBe('NIS2 Art. 21(2)(i)');
  });

  it('excludes dismissed or already confirmed suggestions by key', () => {
    const key = suggestionKey(device().id, 'DEFAULT_CREDENTIALS');
    const suggestions = buildFindingSuggestions([device()], new Set([key]));
    expect(suggestions.map((entry) => entry.riskCode)).toEqual(['PATCH_STALE']);
  });
});

describe('audit comparison', () => {
  it('counts opened, closed, carried and still-open findings by stable code', () => {
    const result = compareFindings(
      [
        {
          id: '1',
          code: 'F-0001',
          title: 'Carried',
          severity: 'HIGH',
          status: 'OPEN',
          riskScore: 16,
        },
        {
          id: '2',
          code: 'F-0002',
          title: 'New',
          severity: 'CRITICAL',
          status: 'OPEN',
          riskScore: 25,
        },
        {
          id: '3',
          code: 'F-0003',
          title: 'Closed now',
          severity: 'MEDIUM',
          status: 'CLOSED',
          riskScore: 9,
        },
      ],
      [
        {
          id: 'a',
          code: 'F-0001',
          title: 'Carried',
          severity: 'HIGH',
          status: 'OPEN',
          riskScore: 16,
        },
        {
          id: 'b',
          code: 'F-0003',
          title: 'Closed now',
          severity: 'MEDIUM',
          status: 'OPEN',
          riskScore: 9,
        },
        {
          id: 'c',
          code: 'F-0004',
          title: 'Still open',
          severity: 'LOW',
          status: 'OPEN',
          riskScore: 4,
        },
      ],
    );
    expect(result.opened).toBe(1);
    expect(result.closed).toBe(1);
    expect(result.carried).toBe(2);
    expect(result.stillOpen).toBe(1);
    expect(result.newFindings).toEqual(['New']);
    expect(result.closedFindings).toEqual(['Closed now']);
  });

  it('uses likelihood x impact when both are supplied', () => {
    expect(computeRiskScore('LOW', 3, 4)).toBe(12);
    expect(computeRiskScore('CRITICAL')).toBe(25);
  });
});
