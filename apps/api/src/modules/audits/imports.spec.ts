import { parseDeviceCsv, parseNmapXml } from './imports';

const NMAP_XML = `<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="192.0.2.10" addrtype="ipv4"/>
    <address addr="AA:BB:CC:DD:EE:02" addrtype="mac" vendor="Dell Inc."/>
    <hostnames><hostname name="erp.demo.local"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22"><state state="open"/><service name="ssh"/></port>
      <port protocol="tcp" portid="443"><state state="open"/><service name="https"/></port>
    </ports>
    <os><osmatch name="Linux 5.15" accuracy="98"/></os>
  </host>
  <host>
    <status state="down"/>
    <address addr="192.0.2.99" addrtype="ipv4"/>
  </host>
</nmaprun>`;

describe('network imports', () => {
  it('parses Nmap XML hosts, addresses, ports and OS', () => {
    const result = parseNmapXml(NMAP_XML);

    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]).toMatchObject({
      name: 'erp.demo.local',
      type: 'SERVER',
      vendor: 'Dell Inc.',
      ipAddresses: ['192.0.2.10'],
      macAddress: 'AA:BB:CC:DD:EE:02',
      os: 'Linux 5.15',
    });
    expect(result.devices[0]?.openPorts).toEqual(['22/tcp (ssh)', '443/tcp (https)']);
    expect(result.warnings).toEqual([]);
  });

  it('parses CSV with quoted fields, lists and aliases', () => {
    const result = parseDeviceCsv(
      [
        'name,type,ipAddresses,mac,ownerLabel,criticality',
        '"Reception printer",printer,"192.0.2.30;192.0.2.31",aa-bb-cc-dd-ee-03,"Front office",low',
      ].join('\n'),
    );

    expect(result.devices[0]).toMatchObject({
      name: 'Reception printer',
      type: 'PRINTER',
      ipAddresses: ['192.0.2.30', '192.0.2.31'],
      macAddress: 'AA:BB:CC:DD:EE:03',
      ownerLabel: 'Front office',
      criticality: 'LOW',
    });
    expect(result.warnings).toEqual([]);
  });

  it('reports unknown CSV device types without dropping the row', () => {
    const result = parseDeviceCsv('name,type,ipAddresses\nMystery,toaster,192.0.2.40\n');
    expect(result.devices[0]?.type).toBe('UNKNOWN');
    expect(result.warnings[0]).toContain('unknown device type');
  });
});
