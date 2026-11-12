import { XMLParser } from 'fast-xml-parser';
import { deviceTypeSchema, macAddressSchema, severitySchema, type DeviceType } from '@nis2/shared';
import { z } from 'zod';

export interface ImportedDevice {
  name: string;
  type: DeviceType;
  vendor?: string;
  model?: string;
  serial?: string;
  ipAddresses: string[];
  macAddress?: string;
  location?: string;
  ownerLabel?: string;
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  notes?: string;
  openPorts?: string[];
  os?: string;
}

export interface ParsedDeviceImport {
  devices: ImportedDevice[];
  warnings: string[];
}

interface XmlValue {
  '@_state'?: string;
  '@_addr'?: string;
  '@_addrtype'?: string;
  '@_vendor'?: string;
  '@_name'?: string;
  '@_protocol'?: string;
  '@_portid'?: string;
  '@_product'?: string;
  '@_version'?: string;
  '@_osgen'?: string;
  '@_osfamily'?: string;
  hostname?: XmlValue | XmlValue[];
  state?: XmlValue | XmlValue[];
  address?: XmlValue | XmlValue[];
  port?: XmlValue | XmlValue[];
  service?: XmlValue | XmlValue[];
  osmatch?: XmlValue | XmlValue[];
  osclass?: XmlValue | XmlValue[];
  hostnames?: { hostname?: XmlValue | XmlValue[] };
  ports?: { port?: XmlValue | XmlValue[] };
}

interface NmapHost {
  status?: XmlValue;
  address?: XmlValue | XmlValue[];
  hostnames?: { hostname?: XmlValue | XmlValue[] };
  ports?: { port?: XmlValue | XmlValue[] };
  os?: { osmatch?: XmlValue | XmlValue[]; osclass?: XmlValue | XmlValue[] };
}

export function parseDeviceImport(format: 'NMAP_XML' | 'CSV', content: string): ParsedDeviceImport {
  return format === 'NMAP_XML' ? parseNmapXml(content) : parseDeviceCsv(content);
}

export function parseNmapXml(content: string): ParsedDeviceImport {
  const warnings: string[] = [];
  let parsed: { nmaprun?: { host?: NmapHost | NmapHost[] } };
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseTagValue: false,
      isArray: (name) =>
        ['host', 'address', 'hostname', 'port', 'osmatch', 'osclass'].includes(name),
    }).parse(content) as typeof parsed;
  } catch {
    throw new Error('The file is not valid Nmap XML');
  }

  const hosts = asArray(parsed.nmaprun?.host);
  if (hosts.length === 0) {
    throw new Error('No hosts were found in the Nmap XML');
  }

  const devices: ImportedDevice[] = [];
  for (const host of hosts) {
    if (host.status && host.status['@_state'] && host.status['@_state'] !== 'up') continue;
    const addresses = asArray(host.address);
    const ipAddresses = addresses
      .filter((address) => address['@_addrtype'] === 'ipv4' || address['@_addrtype'] === 'ipv6')
      .map((address) => address['@_addr'])
      .filter((address): address is string => Boolean(address));
    const macAddress = normalizeMac(
      addresses.find((address) => address['@_addrtype'] === 'mac')?.['@_addr'],
    );
    const vendor = addresses.find((address) => address['@_addrtype'] === 'mac')?.['@_vendor'];
    if (ipAddresses.length === 0 && !macAddress) {
      warnings.push('Skipped a host without an IP or MAC address');
      continue;
    }

    const hostname = asArray(host.hostnames?.hostname)[0]?.['@_name'];
    const ports = asArray(host.ports?.port)
      .filter((port) => asArray(port.state)[0]?.['@_state'] === 'open')
      .map((port) => {
        const service = asArray(port.service)[0];
        const suffix = service?.['@_name'] ? ` (${service['@_name']})` : '';
        return `${port['@_portid'] ?? '?'}/${port['@_protocol'] ?? 'tcp'}${suffix}`;
      });
    const osMatch = asArray(host.os?.osmatch)[0]?.['@_name'];
    const osClass = asArray(host.os?.osclass)[0];
    const os = osMatch ?? osClass?.['@_osfamily'];
    const type = inferNmapType(ports, vendor);

    devices.push({
      name: hostname ?? `Nmap ${ipAddresses[0] ?? macAddress}`,
      type,
      vendor: clean(vendor),
      ipAddresses,
      macAddress,
      criticality: 'MEDIUM',
      notes: 'Imported from Nmap XML. Review the inferred device type and complete the assessment.',
      ...(os ? { os } : {}),
      ...(ports.length > 0 ? { openPorts: ports } : {}),
    });
  }

  if (devices.length === 0) {
    throw new Error('No reachable hosts were found in the Nmap XML');
  }
  return { devices, warnings };
}

export function parseDeviceCsv(content: string): ParsedDeviceImport {
  const warnings: string[] = [];
  const rows = parseCsv(content.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The CSV must contain a header and at least one device');

  const headerRow = rows[0];
  if (!headerRow) throw new Error('The CSV must contain a header row');
  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const required = ['name', 'type'];
  for (const header of required) {
    if (!headers.includes(header)) {
      throw new Error(`The CSV is missing the required "${header}" column`);
    }
  }

  const devices: ImportedDevice[] = [];
  rows.slice(1).forEach((row, index) => {
    if (row.every((cell) => cell.trim() === '')) return;
    const record = Object.fromEntries(headers.map((header, i) => [header, row[i]?.trim() ?? '']));
    const line = index + 2;
    const ipAddresses = splitList(record.ipaddresses ?? record.ip ?? record.ips ?? '').filter(
      (value) => z.string().ip().safeParse(value).success,
    );
    const macAddress = normalizeMac(record.macaddress ?? record.mac);
    const type = normalizeDeviceType(record.type ?? '');
    if (!type) {
      warnings.push(`Line ${line}: unknown device type "${record.type}" - using UNKNOWN`);
    }
    const name = record.name || ipAddresses[0] || macAddress;
    if (!name) {
      warnings.push(`Line ${line}: skipped a row without a name, IP or MAC address`);
      return;
    }
    if (ipAddresses.length === 0 && !macAddress) {
      warnings.push(`Line ${line}: no valid IP or MAC address`);
    }
    const criticality = severitySchema.safeParse((record.criticality ?? '').toUpperCase()).data;

    devices.push({
      name,
      type: type ?? 'UNKNOWN',
      vendor: clean(record.vendor),
      model: clean(record.model),
      serial: clean(record.serial),
      ipAddresses,
      macAddress,
      location: clean(record.location),
      ownerLabel: clean(record.ownerlabel ?? record.owner),
      criticality: criticality ?? 'MEDIUM',
      notes: clean(record.notes),
      ...(record.os ? { os: record.os } : {}),
      ...(record.openports ? { openPorts: splitList(record.openports) } : {}),
    });
  });

  if (devices.length === 0) throw new Error('The CSV did not contain any importable devices');
  return { devices, warnings };
}

export function csvTemplate(): string {
  return [
    'name,type,ipAddresses,macAddress,vendor,model,serial,location,ownerLabel,criticality,os,openPorts,notes',
    'Edge firewall,FIREWALL,192.0.2.1,AA:BB:CC:DD:EE:01,Example Corp,FW-100,SN-001,Server room,IT,CRITICAL,FortiOS,443/tcp;22/tcp,Primary internet edge',
    'File server,SERVER,192.0.2.10,AA:BB:CC:DD:EE:02,Example Corp,R740,SN-002,Server room,IT,HIGH,Ubuntu 24.04,22/tcp;445/tcp,Stores finance data',
  ].join('\n');
}

function inferNmapType(ports: string[], vendor?: string): DeviceType {
  const portNumbers = new Set(
    ports.map((port) => Number(port.split('/')[0])).filter((port) => Number.isInteger(port)),
  );
  const vendorText = (vendor ?? '').toLowerCase();
  if (portNumbers.has(9100) || portNumbers.has(631) || vendorText.includes('printer')) {
    return 'PRINTER';
  }
  if (portNumbers.has(554) || portNumbers.has(8554) || portNumbers.has(37777)) {
    return 'IP_CAMERA';
  }
  if (vendorText.includes('router') || portNumbers.has(53) || portNumbers.has(67)) {
    return 'ROUTER';
  }
  if (vendorText.includes('switch')) return 'SWITCH';
  if (vendorText.includes('firewall') || vendorText.includes('fortinet')) return 'FIREWALL';
  if (portNumbers.has(445) || portNumbers.has(3389) || portNumbers.has(22) || portNumbers.has(80)) {
    return 'SERVER';
  }
  return 'UNKNOWN';
}

function normalizeDeviceType(value: string): DeviceType | null {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const aliases: Record<string, DeviceType> = {
    AP: 'ACCESS_POINT',
    CAMERA: 'IP_CAMERA',
    CLOUD: 'CLOUD_SERVICE',
    SERVER: 'SERVER',
    DESKTOP: 'WORKSTATION',
    PC: 'WORKSTATION',
  };
  if (aliases[normalized]) return aliases[normalized];
  const parsed = deviceTypeSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function normalizeMac(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = macAddressSchema.safeParse(value);
  if (!parsed.success || !parsed.data) return undefined;
  const compact = parsed.data.replace(/:/g, '');
  if (!/^[0-9A-F]{12}$/.test(compact)) return undefined;
  return compact.match(/.{2}/g)?.join(':');
}

function splitList(value: string): string[] {
  return value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
