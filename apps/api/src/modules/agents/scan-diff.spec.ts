import { planScanDiff, type ExistingScanDevice } from './scan-diff';

const existing: ExistingScanDevice[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Reception printer',
    type: 'PRINTER',
    vendor: 'HP',
    macAddress: 'AA:BB:CC:DD:EE:01',
    ipAddresses: ['192.0.2.10'],
    assessment: { os: 'PrinterOS', openPorts: ['443/tcp'] },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Scanned 192.0.2.20',
    type: 'UNKNOWN',
    vendor: null,
    macAddress: null,
    ipAddresses: ['192.0.2.20'],
    assessment: {},
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Old server',
    type: 'SERVER',
    vendor: 'Dell',
    macAddress: 'AA:BB:CC:DD:EE:03',
    ipAddresses: ['192.0.2.30'],
    assessment: {},
  },
];

describe('planScanDiff', () => {
  it('plans new, changed, unchanged and missing devices', () => {
    const plan = planScanDiff(existing, [
      {
        ipAddresses: ['192.0.2.10'],
        macAddress: 'AA:BB:CC:DD:EE:01',
        hostname: 'Reception printer',
        vendor: 'HP',
        deviceType: 'PRINTER',
        os: 'PrinterOS',
        openPorts: ['443/tcp'],
      },
      {
        ipAddresses: ['192.0.2.20', '192.0.2.21'],
        hostname: 'scanned-host',
        deviceType: 'SERVER',
        os: 'Ubuntu 24.04',
        openPorts: ['22/tcp'],
      },
      {
        ipAddresses: ['192.0.2.40'],
        macAddress: 'AA:BB:CC:DD:EE:04',
        hostname: 'New camera',
        deviceType: 'IP_CAMERA',
      },
    ]);

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]?.hostname).toBe('New camera');
    expect(plan.updates).toHaveLength(2);
    expect(
      plan.updates.find((update) => update.deviceId === existing[0]?.id)?.changedFields,
    ).toEqual([]);
    const changed = plan.updates.find((update) => update.deviceId === existing[1]?.id);
    expect(changed?.changedFields).toEqual(
      expect.arrayContaining(['name', 'type', 'ipAddresses', 'os', 'openPorts']),
    );
    expect(changed?.name).toBe('scanned-host');
    expect(changed?.type).toBe('SERVER');
    expect(plan.missingIds).toEqual([existing[2]?.id]);
  });

  it('matches by normalized MAC even when formatting differs', () => {
    const plan = planScanDiff(existing, [
      {
        ipAddresses: ['192.0.2.10'],
        macAddress: 'aa-bb-cc-dd-ee-01',
      },
    ]);
    expect(plan.updates[0]?.deviceId).toBe(existing[0]?.id);
    expect(plan.creates).toHaveLength(0);
  });
});
