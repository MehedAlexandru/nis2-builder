import type { DeviceAssessmentData, DeviceType, ScannedDevice } from '@nis2/shared';

export interface ExistingScanDevice {
  id: string;
  name: string | null;
  type: DeviceType;
  vendor: string | null;
  macAddress: string | null;
  ipAddresses: string[];
  assessment: DeviceAssessmentData;
}

export interface ScanUpdatePlan {
  deviceId: string;
  incoming: ScannedDevice;
  changedFields: string[];
  name: string;
  type: DeviceType;
  vendor: string | null;
  macAddress: string | null;
  ipAddresses: string[];
  assessment: DeviceAssessmentData;
}

export interface ScanPlan {
  creates: ScannedDevice[];
  updates: ScanUpdatePlan[];
  missingIds: string[];
}

export function planScanDiff(
  existingDevices: ExistingScanDevice[],
  incomingDevices: ScannedDevice[],
): ScanPlan {
  const byMac = new Map<string, ExistingScanDevice>();
  const byIp = new Map<string, ExistingScanDevice>();
  for (const device of existingDevices) {
    const mac = normalizeMac(device.macAddress);
    if (mac) byMac.set(mac, device);
    for (const ip of device.ipAddresses) byIp.set(ip, device);
  }

  const seenExisting = new Set<string>();
  const creates: ScannedDevice[] = [];
  const updates: ScanUpdatePlan[] = [];

  for (const incoming of incomingDevices) {
    const mac = normalizeMac(incoming.macAddress);
    const match =
      (mac ? byMac.get(mac) : undefined) ??
      incoming.ipAddresses.map((ip) => byIp.get(ip)).find(Boolean);
    if (!match) {
      creates.push(incoming);
      continue;
    }
    if (seenExisting.has(match.id)) continue;
    seenExisting.add(match.id);

    const ipAddresses = [...new Set([...match.ipAddresses, ...incoming.ipAddresses])];
    const changes: string[] = [];
    if (incoming.ipAddresses.some((ip) => !match.ipAddresses.includes(ip))) {
      changes.push('ipAddresses');
    }
    const incomingMac = normalizeMac(incoming.macAddress);
    const macAddress = incomingMac ?? normalizeMac(match.macAddress);
    if (incomingMac && normalizeMac(match.macAddress) !== incomingMac) {
      changes.push('macAddress');
    }
    const vendor = match.vendor ?? incoming.vendor ?? null;
    if (!match.vendor && incoming.vendor) changes.push('vendor');
    let type = match.type;
    if (match.type === 'UNKNOWN' && incoming.deviceType && incoming.deviceType !== 'UNKNOWN') {
      type = incoming.deviceType;
      changes.push('type');
    }
    const assessment: DeviceAssessmentData = { ...match.assessment };
    if (incoming.os && incoming.os !== assessment.os) {
      assessment.os = incoming.os;
      changes.push('os');
    }
    if (incoming.openPorts && !sameStringSet(incoming.openPorts, assessment.openPorts ?? [])) {
      assessment.openPorts = incoming.openPorts;
      changes.push('openPorts');
    }
    const name = inferredName(match.name, incoming);
    if (name !== (match.name ?? '')) changes.push('name');

    updates.push({
      deviceId: match.id,
      incoming,
      changedFields: changes,
      name,
      type,
      vendor,
      macAddress,
      ipAddresses,
      assessment,
    });
  }

  const missingIds = existingDevices
    .filter((device) => !seenExisting.has(device.id))
    .map((device) => device.id);

  return { creates, updates, missingIds };
}

export function normalizeMac(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/[-:]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) return null;
  return compact.match(/.{2}/g)?.join(':') ?? null;
}

function inferredName(current: string | null, incoming: ScannedDevice): string {
  const auto = !current || /^(Scanned|Nmap|New)\b/i.test(current);
  if (auto && incoming.hostname) return incoming.hostname;
  return current ?? incoming.hostname ?? `Scanned ${incoming.ipAddresses[0]}`;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}
