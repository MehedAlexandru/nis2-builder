import sharp from 'sharp';
import { mapBoundsSchema, mapPositionSchema } from '@nis2/shared';
import type { Connection, Device, Zone } from '@prisma/client';
import type { AuditDiagram } from './audit-report-model';

export async function renderAuditDiagram(audit: {
  name: string;
  zones: Zone[];
  devices: Array<
    Pick<
      Device,
      'id' | 'name' | 'type' | 'ipAddresses' | 'position' | 'zoneId' | 'informationComplete'
    >
  >;
  connections: Pick<Connection, 'sourceDeviceId' | 'targetDeviceId'>[];
}): Promise<AuditDiagram> {
  const zones = audit.zones
    .map((zone) => ({ zone, bounds: mapBoundsSchema.safeParse(zone.bounds).data }))
    .filter((entry): entry is { zone: Zone; bounds: NonNullable<typeof entry.bounds> } =>
      Boolean(entry.bounds),
    );
  const placed = new Map<string, { x: number; y: number }>();
  audit.devices.forEach((device, index) => {
    const parsed = mapPositionSchema.safeParse(device.position);
    placed.set(
      device.id,
      parsed.success
        ? parsed.data
        : {
            x: 80 + (index % 5) * 190,
            y: 110 + Math.floor(index / 5) * 90,
          },
    );
  });

  const xs = [
    ...zones.flatMap((entry) => [entry.bounds.x, entry.bounds.x + entry.bounds.width]),
    ...[...placed.values()].map((position) => position.x),
    ...[...placed.values()].map((position) => position.x + NODE_WIDTH),
  ];
  const ys = [
    ...zones.flatMap((entry) => [entry.bounds.y, entry.bounds.y + entry.bounds.height]),
    ...[...placed.values()].map((position) => position.y),
    ...[...placed.values()].map((position) => position.y + NODE_HEIGHT),
  ];
  const minX = Math.min(...xs, 0) - 40;
  const minY = Math.min(...ys, 0) - 40;
  const maxX = Math.max(...xs, 1000) + 40;
  const maxY = Math.max(...ys, 500) + 40;
  const contentWidth = Math.max(600, maxX - minX);
  const contentHeight = Math.max(360, maxY - minY);
  const pngWidth = 1400;
  const pngHeight = Math.max(
    500,
    Math.min(1400, Math.round((contentHeight / contentWidth) * pngWidth)),
  );

  const zoneSvg = zones
    .map(({ zone, bounds }) => {
      const color = validColor(zone.color) ?? '#2563EB';
      return `<g>
  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="18" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="2"/>
  <text x="${bounds.x + 14}" y="${bounds.y + 24}" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="${color}">${escapeXml(zone.name)}</text>
</g>`;
    })
    .join('\n');

  const connectionSvg = audit.connections
    .map((connection) => {
      const source = placed.get(connection.sourceDeviceId);
      const target = placed.get(connection.targetDeviceId);
      if (!source || !target) return '';
      return `<line x1="${source.x + NODE_WIDTH / 2}" y1="${source.y + NODE_HEIGHT / 2}" x2="${target.x + NODE_WIDTH / 2}" y2="${target.y + NODE_HEIGHT / 2}" stroke="#94A3B8" stroke-width="2" stroke-opacity="0.75"/>`;
    })
    .join('\n');

  const deviceSvg = audit.devices
    .map((device) => {
      const position = placed.get(device.id);
      if (!position) return '';
      const risky = device.informationComplete === false;
      const fill = risky ? '#FEF3C7' : '#E6F0FA';
      const stroke = risky ? '#D97706' : device.informationComplete ? '#059669' : '#2563EB';
      const name = truncate(device.name ?? 'Unnamed device', 22);
      const ip = truncate(device.ipAddresses[0] ?? device.type, 24);
      return `<g>
  <rect x="${position.x}" y="${position.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <text x="${position.x + 10}" y="${position.y + 19}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">${escapeXml(name)}</text>
  <text x="${position.x + 10}" y="${position.y + 36}" font-family="Arial, sans-serif" font-size="11" fill="#4B5563">${escapeXml(ip)}</text>
</g>`;
    })
    .join('\n');

  const empty =
    audit.devices.length === 0
      ? `<text x="${minX + contentWidth / 2}" y="${minY + contentHeight / 2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#4B5563">No devices are documented for this audit.</text>`
      : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pngWidth}" height="${pngHeight}" viewBox="${minX} ${minY} ${contentWidth} ${contentHeight}">
  <rect x="${minX}" y="${minY}" width="${contentWidth}" height="${contentHeight}" fill="#F8FAFC"/>
  ${zoneSvg}
  ${connectionSvg}
  ${deviceSvg}
  ${empty}
  <g transform="translate(${minX + 20}, ${minY + contentHeight - 32})">
    <rect x="0" y="-14" width="370" height="26" fill="#FFFFFF" fill-opacity="0.9" rx="6"/>
    <rect x="8" y="-7" width="12" height="12" fill="#E6F0FA" stroke="#2563EB"/>
    <text x="26" y="4" font-family="Arial, sans-serif" font-size="11" fill="#4B5563">Documented</text>
    <rect x="110" y="-7" width="12" height="12" fill="#E6F0FA" stroke="#059669"/>
    <text x="128" y="4" font-family="Arial, sans-serif" font-size="11" fill="#4B5563">Complete</text>
    <rect x="204" y="-7" width="12" height="12" fill="#FEF3C7" stroke="#D97706"/>
    <text x="222" y="4" font-family="Arial, sans-serif" font-size="11" fill="#4B5563">Incomplete or at risk</text>
  </g>
</svg>`;

  const data = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { data, width: pngWidth, height: pngHeight };
}

const NODE_WIDTH = 156;
const NODE_HEIGHT = 48;

function validColor(value: string | null): string | null {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
