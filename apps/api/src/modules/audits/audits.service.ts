import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Audit } from '@prisma/client';
import {
  deviceAssessmentDataSchema,
  deviceRiskCodeSchema,
  evaluateDeviceCompleteness,
  mapBoundsSchema,
  mapPositionSchema,
  type CreateConnectionInput,
  type CreateDeviceInput,
  type CreateNetworkAuditInput,
  type CreateZoneInput,
  type DeviceAssessmentData,
  type DeviceType,
  type DuplicateDeviceGroup,
  type ImportDevicesInput,
  type MergeDevicesInput,
  type NetworkAuditSummary,
  type NetworkConnection,
  type NetworkDevice,
  type NetworkMap,
  type NetworkZone,
  type SaveDeviceAssessmentInput,
  type SaveMapLayoutInput,
  type UpdateConnectionInput,
  type UpdateDeviceInput,
  type UpdateNetworkAuditInput,
  type UpdateZoneInput,
} from '@nis2/shared';
import { AuditService } from '../../common/audit/audit.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDeviceImport, type ImportedDevice } from './imports';

export interface NetworkActor {
  userId: string;
  globalRole: 'USER' | 'ADMIN';
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

type DeviceWithAssessment = Prisma.DeviceGetPayload<{ include: { assessment: true } }>;
type AuditWithDevices = Prisma.AuditGetPayload<{
  include: { devices: { include: { assessment: true } } };
}>;
type ConnectionRecord = Prisma.ConnectionGetPayload<Record<string, never>>;

const DEFAULT_ZONES = [
  { name: 'LAN', color: '#2563EB', bounds: { x: 0, y: 0, width: 620, height: 440 } },
  { name: 'DMZ', color: '#D97706', bounds: { x: 660, y: 0, width: 620, height: 440 } },
  { name: 'Guest', color: '#059669', bounds: { x: 0, y: 480, width: 620, height: 440 } },
  {
    name: 'Server VLAN',
    color: '#7C3AED',
    bounds: { x: 660, y: 480, width: 620, height: 440 },
  },
  { name: 'Cloud', color: '#0891B2', bounds: { x: 1320, y: 0, width: 620, height: 920 } },
];

@Injectable()
export class AuditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditLog: AuditService,
  ) {}

  async list(actor: NetworkActor, organizationId: string): Promise<NetworkAuditSummary[]> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const audits = await tx.audit.findMany({
        where: { organizationId },
        include: { devices: { include: { assessment: true } } },
        orderBy: { startedAt: 'desc' },
      });
      return audits.map((audit) => this.auditSummary(audit));
    });
  }

  async create(
    actor: NetworkActor,
    organizationId: string,
    input: CreateNetworkAuditInput,
  ): Promise<NetworkAuditSummary> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const audit = await tx.audit.create({
        data: {
          organizationId,
          name: input.name,
          period: input.period,
          scope: input.scope ?? null,
          methodology: input.methodology ?? null,
          auditorName: input.auditorName ?? null,
          limitations: input.limitations ?? null,
          createdById: actor.userId,
        },
        include: { devices: { include: { assessment: true } } },
      });
      await tx.zone.createMany({
        data: DEFAULT_ZONES.map((zone) => ({
          organizationId,
          auditId: audit.id,
          name: zone.name,
          color: zone.color,
          bounds: zone.bounds as Prisma.InputJsonValue,
        })),
      });
      await this.auditLog.recordWith(tx, {
        action: 'NETWORK_AUDIT_CREATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'audit',
        resourceId: audit.id,
        metadata: { period: audit.period },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.auditSummary(audit);
    });
  }

  async update(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    input: UpdateNetworkAuditInput,
  ): Promise<NetworkAuditSummary> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.auditOrThrow(tx, organizationId, auditId);
      const audit = await tx.audit.update({
        where: { id: auditId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.period !== undefined ? { period: input.period } : {}),
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
          ...(input.methodology !== undefined ? { methodology: input.methodology } : {}),
          ...(input.auditorName !== undefined ? { auditorName: input.auditorName } : {}),
          ...(input.limitations !== undefined ? { limitations: input.limitations } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: { devices: { include: { assessment: true } } },
      });
      await this.auditLog.recordWith(tx, {
        action: 'NETWORK_AUDIT_UPDATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'audit',
        resourceId: auditId,
        metadata: { fields: Object.keys(input) },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.auditSummary(audit);
    });
  }

  async map(actor: NetworkActor, organizationId: string, auditId: string): Promise<NetworkMap> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const audit = await tx.audit.findFirst({
        where: { id: auditId, organizationId },
        include: {
          devices: {
            include: { assessment: true },
            orderBy: { name: 'asc' },
          },
          zones: { orderBy: { createdAt: 'asc' } },
          connections: true,
        },
      });
      if (!audit) throw this.notFound('Audit not found');
      return {
        audit: this.auditSummary(audit),
        devices: audit.devices.map((device) => this.toDevice(device)),
        zones: audit.zones.map((zone) => this.toZone(zone)),
        connections: audit.connections.map((connection) => this.toConnection(connection)),
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async createDevice(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    input: CreateDeviceInput,
  ): Promise<NetworkDevice> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.auditOrThrow(tx, organizationId, auditId);
      const zone = await this.zoneOrNull(tx, organizationId, auditId, input.zoneId);
      const existingCount = await tx.device.count({ where: { organizationId, auditId } });
      const type = input.type ?? 'UNKNOWN';
      const name = input.name?.trim() || `New ${labelForType(type)} ${existingCount + 1}`;
      const position = input.position ?? this.defaultPosition(existingCount);
      const assessment: DeviceAssessmentData = {};
      const computed = evaluateDeviceCompleteness({
        type,
        name,
        ipAddresses: input.ipAddresses ?? [],
        macAddress: input.macAddress ?? null,
        criticality: input.criticality ?? 'MEDIUM',
        ownerLabel: input.ownerLabel ?? null,
        assessment,
      });
      const device = await tx.device.create({
        data: {
          organizationId,
          auditId,
          zoneId: zone?.id ?? null,
          name,
          type,
          vendor: input.vendor?.trim() || null,
          model: input.model?.trim() || null,
          serial: input.serial?.trim() || null,
          ipAddresses: input.ipAddresses ?? [],
          macAddress: normalizeMac(input.macAddress),
          location: input.location?.trim() || null,
          ownerLabel: input.ownerLabel?.trim() || null,
          criticality: input.criticality ?? 'MEDIUM',
          dataClassification: input.dataClassification?.trim() || null,
          businessServices: input.businessServices ?? [],
          source: 'MANUAL',
          position: position as Prisma.InputJsonValue,
          notes: input.notes?.trim() || null,
          informationComplete: false,
          completeness: computed.percentage,
          assessment: {
            create: {
              organizationId,
              data: {} as Prisma.InputJsonValue,
              completeness: computed.percentage,
              informationComplete: false,
              assessedById: actor.userId,
            },
          },
        },
        include: { assessment: true },
      });
      await this.auditLog.recordWith(tx, {
        action: 'DEVICE_CREATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'device',
        resourceId: device.id,
        metadata: { auditId, type },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toDevice(device);
    });
  }

  async updateDevice(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    deviceId: string,
    input: UpdateDeviceInput,
  ): Promise<NetworkDevice> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const existing = await this.deviceOrThrow(tx, organizationId, auditId, deviceId);
      const zone = await this.zoneOrNull(tx, organizationId, auditId, input.zoneId);
      const type = input.type ?? (existing.type as DeviceType);
      const assessment = this.assessmentOf(existing);
      const name = input.name !== undefined ? input.name?.trim() || null : existing.name;
      const ipAddresses = input.ipAddresses ?? existing.ipAddresses;
      const macAddress =
        input.macAddress !== undefined ? normalizeMac(input.macAddress) : existing.macAddress;
      const criticality =
        input.criticality !== undefined ? input.criticality : existing.criticality;
      const ownerLabel =
        input.ownerLabel !== undefined ? input.ownerLabel?.trim() || null : existing.ownerLabel;
      const computed = evaluateDeviceCompleteness({
        type,
        name,
        ipAddresses,
        macAddress,
        criticality,
        ownerLabel,
        assessment,
      });
      const device = await tx.device.update({
        where: { id: deviceId },
        data: {
          ...(input.name !== undefined ? { name } : {}),
          ...(input.type !== undefined ? { type } : {}),
          ...(input.vendor !== undefined ? { vendor: input.vendor?.trim() || null } : {}),
          ...(input.model !== undefined ? { model: input.model?.trim() || null } : {}),
          ...(input.serial !== undefined ? { serial: input.serial?.trim() || null } : {}),
          ...(input.ipAddresses !== undefined ? { ipAddresses } : {}),
          ...(input.macAddress !== undefined ? { macAddress } : {}),
          ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
          ...(input.ownerLabel !== undefined ? { ownerLabel } : {}),
          ...(input.criticality !== undefined ? { criticality } : {}),
          ...(input.dataClassification !== undefined
            ? { dataClassification: input.dataClassification?.trim() || null }
            : {}),
          ...(input.businessServices !== undefined
            ? { businessServices: input.businessServices }
            : {}),
          ...(input.zoneId !== undefined ? { zoneId: zone?.id ?? null } : {}),
          ...(input.position !== undefined
            ? {
                position:
                  input.position === null
                    ? Prisma.DbNull
                    : (input.position as Prisma.InputJsonValue),
              }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          completeness: computed.percentage,
          informationComplete: existing.informationComplete && computed.informationCompleteAllowed,
        },
        include: { assessment: true },
      });
      await this.auditLog.recordWith(tx, {
        action: 'DEVICE_UPDATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'device',
        resourceId: deviceId,
        metadata: { auditId, fields: Object.keys(input) },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toDevice(device);
    });
  }

  async deleteDevice(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    deviceId: string,
  ): Promise<void> {
    await this.requireMember(actor, organizationId);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.deviceOrThrow(tx, organizationId, auditId, deviceId);
      await tx.device.delete({ where: { id: deviceId } });
      await this.auditLog.recordWith(tx, {
        action: 'DEVICE_DELETED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'device',
        resourceId: deviceId,
        metadata: { auditId },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });
  }

  async saveAssessment(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    deviceId: string,
    input: SaveDeviceAssessmentInput,
  ): Promise<NetworkDevice> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const existing = await this.deviceOrThrow(tx, organizationId, auditId, deviceId);
      const data = deviceAssessmentDataSchema.parse(input.data) as DeviceAssessmentData;
      const computed = evaluateDeviceCompleteness({
        type: existing.type as DeviceType,
        name: existing.name,
        ipAddresses: existing.ipAddresses,
        macAddress: existing.macAddress,
        criticality: existing.criticality,
        ownerLabel: existing.ownerLabel,
        assessment: data,
      });
      if (input.informationComplete && !computed.informationCompleteAllowed) {
        throw new BadRequestException({
          code: 'DEVICE_ASSESSMENT_INCOMPLETE',
          message: 'Complete the required fields before marking this device as complete',
          details: { missingRequired: computed.missingRequired },
        });
      }
      const informationComplete = input.informationComplete;
      await tx.device.update({
        where: { id: deviceId },
        data: { completeness: computed.percentage, informationComplete },
      });
      await tx.deviceAssessment.upsert({
        where: { deviceId },
        update: {
          data: data as Prisma.InputJsonValue,
          completeness: computed.percentage,
          informationComplete,
          assessedById: actor.userId,
        },
        create: {
          organizationId,
          deviceId,
          data: data as Prisma.InputJsonValue,
          completeness: computed.percentage,
          informationComplete,
          assessedById: actor.userId,
        },
      });
      const updated = await tx.device.findFirstOrThrow({
        where: { id: deviceId, organizationId },
        include: { assessment: true },
      });
      await this.auditLog.recordWith(tx, {
        action: 'DEVICE_ASSESSMENT_SAVED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'device',
        resourceId: deviceId,
        metadata: {
          auditId,
          completeness: computed.percentage,
          informationComplete,
          riskCount: computed.riskCodes.length,
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toDevice(updated);
    });
  }

  async importDevices(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    input: ImportDevicesInput,
  ) {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const audit = await this.auditOrThrow(tx, organizationId, auditId);
      let parsed;
      try {
        parsed = parseDeviceImport(input.format, input.content);
      } catch (error) {
        throw new BadRequestException({
          code: 'NETWORK_IMPORT_INVALID',
          message: error instanceof Error ? error.message : 'The import file is invalid',
        });
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const startingCount = await tx.device.count({ where: { organizationId, auditId } });

      for (const imported of parsed.devices) {
        if (imported.ipAddresses.length === 0 && !imported.macAddress) {
          skipped += 1;
          continue;
        }
        const existing = await this.findDeviceByImportKey(tx, organizationId, auditId, imported);
        if (existing) {
          const assessment = { ...this.assessmentOf(existing) };
          if (!assessment.os && imported.os) assessment.os = imported.os;
          if (!assessment.openPorts && imported.openPorts)
            assessment.openPorts = imported.openPorts;
          const ipAddresses = [...new Set([...existing.ipAddresses, ...imported.ipAddresses])];
          const computed = evaluateDeviceCompleteness({
            type: existing.type as DeviceType,
            name: existing.name,
            ipAddresses,
            macAddress: existing.macAddress ?? imported.macAddress ?? null,
            criticality: existing.criticality,
            ownerLabel: existing.ownerLabel,
            assessment,
          });
          await tx.device.update({
            where: { id: existing.id },
            data: {
              ipAddresses,
              macAddress: existing.macAddress ?? imported.macAddress ?? null,
              vendor: existing.vendor ?? imported.vendor ?? null,
              model: existing.model ?? imported.model ?? null,
              serial: existing.serial ?? imported.serial ?? null,
              location: existing.location ?? imported.location ?? null,
              ownerLabel: existing.ownerLabel ?? imported.ownerLabel ?? null,
              criticality: existing.criticality ?? imported.criticality ?? null,
              notes: existing.notes ?? imported.notes ?? null,
              lastSeenAt: new Date(),
              completeness: computed.percentage,
              informationComplete:
                existing.informationComplete && computed.informationCompleteAllowed,
              assessment: {
                upsert: {
                  update: {
                    data: assessment as Prisma.InputJsonValue,
                    completeness: computed.percentage,
                    assessedById: actor.userId,
                  },
                  create: {
                    organizationId,
                    data: assessment as Prisma.InputJsonValue,
                    completeness: computed.percentage,
                    informationComplete: false,
                    assessedById: actor.userId,
                  },
                },
              },
            },
          });
          updated += 1;
        } else {
          const position = this.defaultPosition(startingCount + created + updated);
          const assessment: DeviceAssessmentData = {
            ...(imported.os ? { os: imported.os } : {}),
            ...(imported.openPorts ? { openPorts: imported.openPorts } : {}),
          };
          const computed = evaluateDeviceCompleteness({
            type: imported.type,
            name: imported.name,
            ipAddresses: imported.ipAddresses,
            macAddress: imported.macAddress ?? null,
            criticality: imported.criticality ?? 'MEDIUM',
            ownerLabel: imported.ownerLabel ?? null,
            assessment,
          });
          await tx.device.create({
            data: {
              organizationId,
              auditId,
              name: imported.name,
              type: imported.type,
              vendor: imported.vendor ?? null,
              model: imported.model ?? null,
              serial: imported.serial ?? null,
              ipAddresses: imported.ipAddresses,
              macAddress: imported.macAddress ?? null,
              location: imported.location ?? null,
              ownerLabel: imported.ownerLabel ?? null,
              criticality: imported.criticality ?? 'MEDIUM',
              source: input.format === 'NMAP_XML' ? 'NMAP_IMPORT' : 'CSV_IMPORT',
              position: position as Prisma.InputJsonValue,
              notes: imported.notes ?? null,
              completeness: computed.percentage,
              assessment: {
                create: {
                  organizationId,
                  data: assessment as Prisma.InputJsonValue,
                  completeness: computed.percentage,
                  informationComplete: false,
                  assessedById: actor.userId,
                },
              },
            },
          });
          created += 1;
        }
      }

      await this.auditLog.recordWith(tx, {
        action: 'NETWORK_IMPORT_COMPLETED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'audit',
        resourceId: audit.id,
        metadata: { auditId, format: input.format, created, updated, skipped },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return {
        format: input.format,
        created,
        updated,
        skipped,
        warnings: parsed.warnings,
      };
    });
  }

  async duplicates(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
  ): Promise<DuplicateDeviceGroup[]> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.auditOrThrow(tx, organizationId, auditId);
      const devices = await tx.device.findMany({ where: { organizationId, auditId } });
      const groups = new Map<string, DuplicateDeviceGroup>();
      for (const device of devices) {
        const identity = {
          id: device.id,
          name: device.name ?? 'Unnamed device',
          type: device.type as DeviceType,
          ipAddresses: device.ipAddresses,
          macAddress: device.macAddress,
        };
        if (device.macAddress) {
          const key = `MAC:${device.macAddress}`;
          const group = groups.get(key);
          if (group) group.devices.push(identity);
          else groups.set(key, { reason: 'MAC', key: device.macAddress, devices: [identity] });
        }
        for (const ip of device.ipAddresses) {
          const key = `IP:${ip}`;
          const group = groups.get(key);
          if (group) group.devices.push(identity);
          else groups.set(key, { reason: 'IP', key: ip, devices: [identity] });
        }
      }
      return [...groups.values()].filter((group) => group.devices.length > 1);
    });
  }

  async merge(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    input: MergeDevicesInput,
  ): Promise<NetworkDevice> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const source = await this.deviceOrThrow(tx, organizationId, auditId, input.sourceDeviceId);
      const target = await this.deviceOrThrow(tx, organizationId, auditId, input.targetDeviceId);

      const sourceAssessment = this.assessmentOf(source);
      const targetAssessment = { ...this.assessmentOf(target) };
      for (const [key, value] of Object.entries(sourceAssessment)) {
        if (
          targetAssessment[key as keyof DeviceAssessmentData] === undefined &&
          value !== undefined
        ) {
          (targetAssessment as Record<string, unknown>)[key] = value;
        }
      }
      const ipAddresses = [...new Set([...target.ipAddresses, ...source.ipAddresses])];
      const businessServices = [
        ...new Set([...target.businessServices, ...source.businessServices]),
      ];
      const computed = evaluateDeviceCompleteness({
        type: target.type as DeviceType,
        name: target.name,
        ipAddresses,
        macAddress: target.macAddress ?? source.macAddress,
        criticality: target.criticality ?? source.criticality,
        ownerLabel: target.ownerLabel ?? source.ownerLabel,
        assessment: targetAssessment,
      });

      const sourceConnections = await tx.connection.findMany({
        where: {
          organizationId,
          auditId,
          OR: [{ sourceDeviceId: source.id }, { targetDeviceId: source.id }],
        },
      });
      for (const connection of sourceConnections) {
        const sourceDeviceId =
          connection.sourceDeviceId === source.id ? target.id : connection.sourceDeviceId;
        const targetDeviceId =
          connection.targetDeviceId === source.id ? target.id : connection.targetDeviceId;
        if (sourceDeviceId === targetDeviceId) {
          await tx.connection.delete({ where: { id: connection.id } });
          continue;
        }
        const duplicate = await tx.connection.findFirst({
          where: {
            organizationId,
            auditId,
            id: { not: connection.id },
            OR: [
              { sourceDeviceId, targetDeviceId },
              { sourceDeviceId: targetDeviceId, targetDeviceId: sourceDeviceId },
            ],
          },
        });
        if (duplicate) await tx.connection.delete({ where: { id: connection.id } });
        else
          await tx.connection.update({
            where: { id: connection.id },
            data: { sourceDeviceId, targetDeviceId },
          });
      }

      const findingLinks = await tx.findingDevice.findMany({
        where: { organizationId, deviceId: source.id },
      });
      if (findingLinks.length > 0) {
        await tx.findingDevice.createMany({
          data: findingLinks.map((link) => ({
            organizationId,
            findingId: link.findingId,
            deviceId: target.id,
          })),
          skipDuplicates: true,
        });
      }

      await tx.device.update({
        where: { id: target.id },
        data: {
          name: target.name ?? source.name,
          vendor: target.vendor ?? source.vendor,
          model: target.model ?? source.model,
          serial: target.serial ?? source.serial,
          ipAddresses,
          macAddress: target.macAddress ?? source.macAddress,
          location: target.location ?? source.location,
          ownerLabel: target.ownerLabel ?? source.ownerLabel,
          criticality: target.criticality ?? source.criticality,
          dataClassification: target.dataClassification ?? source.dataClassification,
          businessServices,
          zoneId: target.zoneId ?? source.zoneId,
          position:
            target.position === null
              ? source.position === null
                ? Prisma.DbNull
                : (source.position as Prisma.InputJsonValue)
              : (target.position as Prisma.InputJsonValue),
          notes: [target.notes, source.notes].filter(Boolean).join('\n\n') || null,
          completeness: computed.percentage,
          assessment: {
            upsert: {
              update: {
                data: targetAssessment as Prisma.InputJsonValue,
                completeness: computed.percentage,
                assessedById: actor.userId,
              },
              create: {
                organizationId,
                data: targetAssessment as Prisma.InputJsonValue,
                completeness: computed.percentage,
                informationComplete: false,
                assessedById: actor.userId,
              },
            },
          },
        },
        include: { assessment: true },
      });
      await tx.device.delete({ where: { id: source.id } });
      await this.auditLog.recordWith(tx, {
        action: 'DEVICES_MERGED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'device',
        resourceId: target.id,
        metadata: { auditId, sourceDeviceId: source.id, targetDeviceId: target.id },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toDevice(await this.deviceOrThrow(tx, organizationId, auditId, target.id));
    });
  }

  async saveLayout(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    input: SaveMapLayoutInput,
  ): Promise<void> {
    await this.requireMember(actor, organizationId);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.auditOrThrow(tx, organizationId, auditId);
      const deviceIds = [...new Set(input.devices.map((device) => device.id))];
      if (deviceIds.length > 0) {
        const known = await tx.device.count({
          where: { organizationId, auditId, id: { in: deviceIds } },
        });
        if (known !== deviceIds.length) {
          throw new BadRequestException({
            code: 'LAYOUT_DEVICE_INVALID',
            message: 'The layout includes a device outside this audit',
          });
        }
      }
      const zoneIds = [
        ...new Set(
          input.devices
            .map((device) => device.zoneId)
            .filter((zoneId): zoneId is string => Boolean(zoneId)),
        ),
      ];
      if (zoneIds.length > 0) {
        const known = await tx.zone.count({
          where: { organizationId, auditId, id: { in: zoneIds } },
        });
        if (known !== zoneIds.length) {
          throw new BadRequestException({
            code: 'LAYOUT_ZONE_INVALID',
            message: 'The layout includes a zone outside this audit',
          });
        }
      }
      for (const device of input.devices) {
        await tx.device.updateMany({
          where: { id: device.id, organizationId, auditId },
          data: {
            position:
              device.position === null ? Prisma.DbNull : (device.position as Prisma.InputJsonValue),
            ...(device.zoneId !== undefined ? { zoneId: device.zoneId } : {}),
          },
        });
      }
      for (const zone of input.zones) {
        await tx.zone.updateMany({
          where: { id: zone.id, organizationId, auditId },
          data: {
            bounds: zone.bounds === null ? Prisma.DbNull : (zone.bounds as Prisma.InputJsonValue),
          },
        });
      }
      await this.auditLog.recordWith(tx, {
        action: 'NETWORK_LAYOUT_SAVED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'audit',
        resourceId: auditId,
        metadata: { devices: input.devices.length, zones: input.zones.length },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });
  }

  async createZone(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    input: CreateZoneInput,
  ): Promise<NetworkZone> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.auditOrThrow(tx, organizationId, auditId);
      const zone = await tx.zone.create({
        data: {
          organizationId,
          auditId,
          name: input.name,
          color: input.color ?? '#2563EB',
          description: input.description ?? null,
          bounds: (input.bounds ?? {
            x: 40,
            y: 40,
            width: 480,
            height: 320,
          }) as Prisma.InputJsonValue,
        },
      });
      await this.auditLog.recordWith(tx, {
        action: 'ZONE_CREATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'zone',
        resourceId: zone.id,
        metadata: { auditId, name: zone.name },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toZone(zone);
    });
  }

  async updateZone(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    zoneId: string,
    input: UpdateZoneInput,
  ): Promise<NetworkZone> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const existing = await this.zoneOrThrow(tx, organizationId, auditId, zoneId);
      const zone = await tx.zone.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.bounds !== undefined
            ? {
                bounds:
                  input.bounds === null
                    ? Prisma.DbNull
                    : (mapBoundsSchema.parse(input.bounds) as Prisma.InputJsonValue),
              }
            : {}),
        },
      });
      await this.auditLog.recordWith(tx, {
        action: 'ZONE_UPDATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'zone',
        resourceId: zoneId,
        metadata: { auditId, fields: Object.keys(input) },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toZone(zone);
    });
  }

  async deleteZone(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    zoneId: string,
  ): Promise<void> {
    await this.requireMember(actor, organizationId);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.zoneOrThrow(tx, organizationId, auditId, zoneId);
      await tx.zone.delete({ where: { id: zoneId } });
      await this.auditLog.recordWith(tx, {
        action: 'ZONE_DELETED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'zone',
        resourceId: zoneId,
        metadata: { auditId },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });
  }

  async createConnection(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    input: CreateConnectionInput,
  ): Promise<NetworkConnection> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await this.auditOrThrow(tx, organizationId, auditId);
      await this.deviceOrThrow(tx, organizationId, auditId, input.sourceDeviceId);
      await this.deviceOrThrow(tx, organizationId, auditId, input.targetDeviceId);
      const duplicate = await tx.connection.findFirst({
        where: {
          organizationId,
          auditId,
          OR: [
            {
              sourceDeviceId: input.sourceDeviceId,
              targetDeviceId: input.targetDeviceId,
            },
            {
              sourceDeviceId: input.targetDeviceId,
              targetDeviceId: input.sourceDeviceId,
            },
          ],
        },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'CONNECTION_EXISTS',
          message: 'These devices are already connected',
        });
      }
      const connection = await tx.connection.create({
        data: {
          organizationId,
          auditId,
          sourceDeviceId: input.sourceDeviceId,
          targetDeviceId: input.targetDeviceId,
          type: input.type,
          speedMbps: input.speedMbps ?? null,
          vlan: input.vlan ?? null,
        },
      });
      await this.auditLog.recordWith(tx, {
        action: 'CONNECTION_CREATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'connection',
        resourceId: connection.id,
        metadata: { auditId, type: connection.type },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toConnection(connection);
    });
  }

  async updateConnection(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    connectionId: string,
    input: UpdateConnectionInput,
  ): Promise<NetworkConnection> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const existing = await tx.connection.findFirst({
        where: { id: connectionId, organizationId, auditId },
      });
      if (!existing) throw this.notFound('Connection not found');
      const connection = await tx.connection.update({
        where: { id: connectionId },
        data: {
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.speedMbps !== undefined ? { speedMbps: input.speedMbps } : {}),
          ...(input.vlan !== undefined ? { vlan: input.vlan } : {}),
        },
      });
      await this.auditLog.recordWith(tx, {
        action: 'CONNECTION_UPDATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'connection',
        resourceId: connectionId,
        metadata: { auditId, fields: Object.keys(input) },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toConnection(connection);
    });
  }

  async deleteConnection(
    actor: NetworkActor,
    organizationId: string,
    auditId: string,
    connectionId: string,
  ): Promise<void> {
    await this.requireMember(actor, organizationId);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const existing = await tx.connection.findFirst({
        where: { id: connectionId, organizationId, auditId },
      });
      if (!existing) throw this.notFound('Connection not found');
      await tx.connection.delete({ where: { id: connectionId } });
      await this.auditLog.recordWith(tx, {
        action: 'CONNECTION_DELETED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'connection',
        resourceId: connectionId,
        metadata: { auditId },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });
  }

  private async requireMember(actor: NetworkActor, organizationId: string): Promise<void> {
    const result = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const organization = await tx.organization.findUnique({ where: { id: organizationId } });
      const membership = await tx.membership.findFirst({
        where: { organizationId, userId: actor.userId },
      });
      return { organization, membership };
    });
    if (!result.organization) throw this.notFound('Organization not found');
    if (!result.membership) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this organization',
      });
    }
  }

  private async auditOrThrow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string,
  ): Promise<Audit> {
    const audit = await tx.audit.findFirst({ where: { id: auditId, organizationId } });
    if (!audit) throw this.notFound('Audit not found');
    return audit;
  }

  private async deviceOrThrow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string,
    deviceId: string,
  ): Promise<DeviceWithAssessment> {
    const device = await tx.device.findFirst({
      where: { id: deviceId, organizationId, auditId },
      include: { assessment: true },
    });
    if (!device) throw this.notFound('Device not found');
    return device;
  }

  private async zoneOrThrow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string,
    zoneId: string,
  ) {
    const zone = await tx.zone.findFirst({
      where: { id: zoneId, organizationId, auditId },
    });
    if (!zone) throw this.notFound('Zone not found');
    return zone;
  }

  private async zoneOrNull(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string,
    zoneId: string | null | undefined,
  ) {
    if (!zoneId) return null;
    return this.zoneOrThrow(tx, organizationId, auditId, zoneId);
  }

  private async findDeviceByImportKey(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string,
    imported: ImportedDevice,
  ) {
    const conditions: Prisma.DeviceWhereInput[] = [];
    if (imported.macAddress) conditions.push({ macAddress: imported.macAddress });
    if (imported.ipAddresses.length > 0) {
      conditions.push({ ipAddresses: { hasSome: imported.ipAddresses } });
    }
    if (conditions.length === 0) return null;
    return tx.device.findFirst({
      where: { organizationId, auditId, OR: conditions },
      include: { assessment: true },
    });
  }

  private auditSummary(audit: AuditWithDevices): NetworkAuditSummary {
    const devices = audit.devices.map((device) => this.toDevice(device));
    const complete = devices.filter((device) => device.informationComplete).length;
    const risk = devices.filter((device) => device.riskCodes.length > 0).length;
    const average =
      devices.length === 0
        ? 0
        : Math.round(
            devices.reduce((sum, device) => sum + device.completeness, 0) / devices.length,
          );
    return {
      id: audit.id,
      name: audit.name,
      period: audit.period,
      status: audit.status,
      scope: audit.scope,
      methodology: audit.methodology,
      auditorName: audit.auditorName,
      limitations: audit.limitations,
      deviceCount: devices.length,
      completeCount: complete,
      riskCount: risk,
      averageCompleteness: average,
      createdAt: audit.createdAt.toISOString(),
      updatedAt: audit.updatedAt.toISOString(),
    };
  }

  private toDevice(device: DeviceWithAssessment): NetworkDevice {
    const assessment = this.assessmentOf(device);
    const computed = evaluateDeviceCompleteness({
      type: device.type as DeviceType,
      name: device.name,
      ipAddresses: device.ipAddresses,
      macAddress: device.macAddress,
      criticality: device.criticality,
      ownerLabel: device.ownerLabel,
      assessment,
    });
    const position = mapPositionSchema.safeParse(device.position).data ?? null;
    return {
      id: device.id,
      name: device.name ?? 'Unnamed device',
      type: device.type as DeviceType,
      vendor: device.vendor,
      model: device.model,
      serial: device.serial,
      ipAddresses: device.ipAddresses,
      macAddress: device.macAddress,
      location: device.location,
      ownerLabel: device.ownerLabel,
      criticality: device.criticality as NetworkDevice['criticality'],
      dataClassification: device.dataClassification,
      businessServices: device.businessServices,
      source: device.source,
      fingerprint: device.fingerprint,
      position,
      zoneId: device.zoneId,
      notes: device.notes,
      informationComplete: device.informationComplete && computed.informationCompleteAllowed,
      completeness: computed.percentage,
      missingRequired: computed.missingRequired,
      riskCodes: computed.riskCodes.filter((code) => deviceRiskCodeSchema.safeParse(code).success),
      assessment,
      firstSeenAt: device.firstSeenAt.toISOString(),
      lastSeenAt: device.lastSeenAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
  }

  private assessmentOf(device: DeviceWithAssessment): DeviceAssessmentData {
    if (!device.assessment) return {};
    const parsed = deviceAssessmentDataSchema.safeParse(device.assessment.data);
    return parsed.success ? parsed.data : {};
  }

  private toZone(zone: {
    id: string;
    name: string;
    color: string | null;
    description: string | null;
    bounds: Prisma.JsonValue;
  }): NetworkZone {
    return {
      id: zone.id,
      name: zone.name,
      color: zone.color,
      description: zone.description,
      bounds: mapBoundsSchema.safeParse(zone.bounds).data ?? null,
    };
  }

  private toConnection(connection: ConnectionRecord): NetworkConnection {
    return {
      id: connection.id,
      sourceDeviceId: connection.sourceDeviceId,
      targetDeviceId: connection.targetDeviceId,
      type: connection.type,
      speedMbps: connection.speedMbps,
      vlan: connection.vlan,
    };
  }

  private defaultPosition(index: number): { x: number; y: number } {
    return { x: 80 + (index % 4) * 240, y: 80 + Math.floor(index / 4) * 180 };
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message });
  }
}

function normalizeMac(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/[-:]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) return null;
  return compact.match(/.{2}/g)?.join(':') ?? null;
}

function labelForType(type: DeviceType): string {
  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
