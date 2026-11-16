import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FINDING_SUGGESTION_RULES,
  buildFindingSuggestions,
  computeRiskScore,
  createFindingSchema,
  deviceAssessmentDataSchema,
  evaluateDeviceCompleteness,
  findingListQuerySchema,
  findingRiskAcceptanceSchema,
  findingSuggestionActionSchema,
  mapPositionSchema,
  updateFindingSchema,
  type CreateFindingInput,
  type DeviceAssessmentData,
  type DeviceRiskCode,
  type DeviceType,
  type FindingCounts,
  type FindingDetail,
  type FindingHistoryChange,
  type FindingList,
  type FindingListQuery,
  type FindingRiskAcceptance,
  type FindingSuggestionAction,
  type FindingSuggestionList,
  type FindingSummary,
  type NetworkDevice,
  type Severity,
  type UpdateFindingInput,
} from '@nis2/shared';
import { AuditService } from '../../common/audit/audit.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';

export interface FindingActor {
  userId: string;
  globalRole: 'USER' | 'ADMIN';
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

type FindingWithRelations = Prisma.FindingGetPayload<{
  include: {
    audit: true;
    owner: true;
    devices: { include: { device: true } };
    history: true;
  };
}>;

type FindingSummaryRow = Omit<FindingWithRelations, 'history'> & {
  history?: FindingWithRelations['history'];
};

const STATUS_FOR_RISK: Record<string, string> = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  MITIGATED: 'MITIGATED',
  ACCEPTED_RISK: 'ACCEPTED_RISK',
  CLOSED: 'CLOSED',
};

@Injectable()
export class FindingsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditLog: AuditService,
  ) {}

  async list(
    actor: FindingActor,
    organizationId: string,
    query: FindingListQuery,
  ): Promise<FindingList> {
    await this.requireMember(actor, organizationId);
    const parsed = findingListQuerySchema.parse(query);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const base: Prisma.FindingWhereInput = {
        organizationId,
        ...(parsed.auditId ? { auditId: parsed.auditId } : {}),
        ...(parsed.deviceId
          ? { devices: { some: { organizationId, deviceId: parsed.deviceId } } }
          : {}),
        ...(parsed.q
          ? {
              OR: [
                { title: { contains: parsed.q, mode: 'insensitive' } },
                { description: { contains: parsed.q, mode: 'insensitive' } },
                { code: { contains: parsed.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, countRows] = await Promise.all([
        tx.finding.findMany({
          where: {
            ...base,
            ...(parsed.status ? { status: parsed.status } : {}),
            ...(parsed.severity ? { severity: parsed.severity } : {}),
          },
          include: {
            audit: true,
            owner: true,
            devices: { include: { device: true } },
            history: false,
          },
          orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
        }),
        tx.finding.findMany({
          where: base,
          select: { status: true, severity: true, dueDate: true },
        }),
      ]);
      return { items: rows.map((row) => this.toSummary(row)), counts: countsOf(countRows) };
    });
  }

  async get(
    actor: FindingActor,
    organizationId: string,
    findingId: string,
  ): Promise<FindingDetail> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const finding = await this.findingOrThrow(tx, organizationId, findingId);
      return this.toDetail(tx, organizationId, finding);
    });
  }

  async create(
    actor: FindingActor,
    organizationId: string,
    input: CreateFindingInput,
  ): Promise<FindingDetail> {
    await this.requireMember(actor, organizationId);
    const parsed = createFindingSchema.parse(input);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const finding = await this.createTx(tx, actor, organizationId, parsed);
      await this.auditLog.recordWith(tx, {
        action: 'FINDING_CREATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'finding',
        resourceId: finding.id,
        metadata: { code: finding.code, severity: finding.severity, source: finding.source },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toDetail(tx, organizationId, finding);
    });
  }

  async update(
    actor: FindingActor,
    organizationId: string,
    findingId: string,
    input: UpdateFindingInput,
  ): Promise<FindingDetail> {
    await this.requireMember(actor, organizationId);
    const parsed = updateFindingSchema.parse(input);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const existing = await this.findingOrThrow(tx, organizationId, findingId);
      const changes: FindingHistoryChange[] = [];
      const currentDeviceIds = existing.devices.map((entry) => entry.deviceId).sort();
      const nextDeviceIds = parsed.deviceIds
        ? [...new Set(parsed.deviceIds)].sort()
        : currentDeviceIds;
      const organizationWide =
        parsed.organizationWide ??
        (parsed.deviceIds ? parsed.deviceIds.length === 0 : existing.organizationWide);

      if (parsed.auditId !== undefined && parsed.auditId !== existing.auditId) {
        if (parsed.auditId) await this.auditOrThrow(tx, organizationId, parsed.auditId);
        changes.push(change('auditId', existing.auditId, parsed.auditId));
      }
      if (organizationWide && nextDeviceIds.length > 0) {
        throw new BadRequestException({
          code: 'FINDING_SCOPE_INVALID',
          message: 'An organization-wide finding cannot also target specific devices',
        });
      }
      const effectiveAuditId = parsed.auditId !== undefined ? parsed.auditId : existing.auditId;
      if (
        !organizationWide &&
        (parsed.deviceIds || parsed.auditId !== undefined) &&
        nextDeviceIds.length > 0
      ) {
        await this.requireDevices(tx, organizationId, effectiveAuditId, nextDeviceIds);
      }
      if (parsed.deviceIds && !organizationWide) {
        if (currentDeviceIds.join(',') !== nextDeviceIds.join(',')) {
          changes.push(change('devices', currentDeviceIds.join(', '), nextDeviceIds.join(', ')));
        }
      }
      if (parsed.status !== undefined && parsed.status !== existing.status) {
        changes.push(change('status', existing.status, parsed.status));
      }
      if (parsed.severity !== undefined)
        changes.push(change('severity', existing.severity, parsed.severity));
      if (parsed.title !== undefined) changes.push(change('title', existing.title, parsed.title));
      if (parsed.description !== undefined) {
        changes.push(change('description', existing.description, parsed.description));
      }
      if (parsed.category !== undefined)
        changes.push(change('category', existing.category, parsed.category));
      if (parsed.likelihood !== undefined) {
        changes.push(
          change('likelihood', String(existing.likelihood ?? ''), String(parsed.likelihood ?? '')),
        );
      }
      if (parsed.impact !== undefined) {
        changes.push(change('impact', String(existing.impact ?? ''), String(parsed.impact ?? '')));
      }
      if (parsed.proposedSolution !== undefined) {
        changes.push(
          change('proposedSolution', existing.proposedSolution, parsed.proposedSolution),
        );
      }
      if (parsed.ownerUserId !== undefined) {
        changes.push(change('ownerUserId', existing.ownerUserId, parsed.ownerUserId));
      }
      if (parsed.dueDate !== undefined) {
        changes.push(change('dueDate', dateText(existing.dueDate), parsed.dueDate));
      }
      if (parsed.effort !== undefined)
        changes.push(change('effort', existing.effort, parsed.effort));

      if (parsed.status === 'ACCEPTED_RISK' && !parsed.riskAcceptance) {
        throw new BadRequestException({
          code: 'RISK_ACCEPTANCE_REQUIRED',
          message: 'Accepting a risk requires a justification and an approver',
        });
      }

      const riskAcceptance = parsed.riskAcceptance
        ? {
            ...parsed.riskAcceptance,
            acceptedAt: new Date().toISOString(),
            approvedByUserId: parsed.riskAcceptance.approvedByUserId ?? actor.userId,
          }
        : parsed.status === 'ACCEPTED_RISK'
          ? parseRiskAcceptance(existing.riskAcceptance)
          : null;
      if (parsed.status === 'ACCEPTED_RISK' && !riskAcceptance) {
        throw new BadRequestException({
          code: 'RISK_ACCEPTANCE_REQUIRED',
          message: 'Accepting a risk requires a justification and an approver',
        });
      }
      const severity = (parsed.severity ?? existing.severity) as Severity;
      const likelihood = parsed.likelihood ?? existing.likelihood;
      const impact = parsed.impact ?? existing.impact;
      const riskScore = computeRiskScore(severity, likelihood, impact);
      const status = parsed.status ?? existing.status;

      await tx.finding.update({
        where: { id: existing.id },
        data: {
          ...(parsed.auditId !== undefined ? { auditId: parsed.auditId } : {}),
          ...(parsed.title !== undefined ? { title: parsed.title } : {}),
          ...(parsed.description !== undefined ? { description: parsed.description } : {}),
          ...(parsed.category !== undefined ? { category: parsed.category } : {}),
          ...(parsed.severity !== undefined ? { severity } : {}),
          ...(parsed.likelihood !== undefined ? { likelihood: parsed.likelihood } : {}),
          ...(parsed.impact !== undefined ? { impact: parsed.impact } : {}),
          ...(parsed.organizationWide !== undefined ? { organizationWide } : {}),
          ...(parsed.evidence !== undefined
            ? { evidence: parsed.evidence ? { notes: parsed.evidence } : Prisma.JsonNull }
            : {}),
          ...(parsed.proposedSolution !== undefined
            ? { proposedSolution: parsed.proposedSolution }
            : {}),
          ...(parsed.effort !== undefined ? { effort: parsed.effort } : {}),
          ...(parsed.costEstimateEur !== undefined
            ? { costEstimateEur: parsed.costEstimateEur }
            : {}),
          ...(parsed.ownerUserId !== undefined ? { ownerUserId: parsed.ownerUserId } : {}),
          ...(parsed.dueDate !== undefined
            ? { dueDate: parsed.dueDate ? dateValue(parsed.dueDate) : null }
            : {}),
          status,
          riskScore,
          ...(riskAcceptance
            ? { riskAcceptance: riskAcceptance as unknown as Prisma.InputJsonValue }
            : {}),
          ...(status !== 'ACCEPTED_RISK' ? { riskAcceptance: Prisma.JsonNull } : {}),
        },
      });
      if (parsed.deviceIds || organizationWide) {
        await tx.findingDevice.deleteMany({ where: { organizationId, findingId: existing.id } });
        if (!organizationWide && nextDeviceIds.length > 0) {
          await tx.findingDevice.createMany({
            data: nextDeviceIds.map((deviceId) => ({
              organizationId,
              findingId: existing.id,
              deviceId,
            })),
          });
        }
      }
      if (changes.length > 0 || parsed.note) {
        await tx.findingHistory.create({
          data: {
            organizationId,
            findingId: existing.id,
            changedById: actor.userId,
            fieldChanges: changes as unknown as Prisma.InputJsonValue,
            note: parsed.note ?? null,
          },
        });
      }
      const updated = await this.findingOrThrow(tx, organizationId, existing.id);
      await this.syncRiskEntry(tx, organizationId, updated, actor.userId);
      await this.auditLog.recordWith(tx, {
        action: 'FINDING_UPDATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'finding',
        resourceId: existing.id,
        metadata: { fields: Object.keys(parsed), status },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toDetail(tx, organizationId, updated);
    });
  }

  async remove(actor: FindingActor, organizationId: string, findingId: string): Promise<void> {
    await this.requireMember(actor, organizationId);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const finding = await this.findingOrThrow(tx, organizationId, findingId);
      await tx.riskRegisterEntry.deleteMany({
        where: { organizationId, sourceFindingId: finding.id },
      });
      await tx.finding.delete({ where: { id: finding.id } });
      await this.auditLog.recordWith(tx, {
        action: 'FINDING_DELETED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'finding',
        resourceId: finding.id,
        metadata: { code: finding.code, title: finding.title },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });
  }

  async suggestions(
    actor: FindingActor,
    organizationId: string,
    auditId: string,
  ): Promise<FindingSuggestionList> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const audit = await this.auditOrThrow(tx, organizationId, auditId);
      const devices = await this.networkDevices(tx, organizationId, audit.id);
      const [dismissed, existing] = await Promise.all([
        tx.findingSuggestionDecision.findMany({
          where: { organizationId, auditId: audit.id },
          select: { deviceId: true, riskCode: true },
        }),
        tx.finding.findMany({
          where: { organizationId, auditId: audit.id, source: { startsWith: 'AUTO:' } },
          select: { source: true, devices: { select: { deviceId: true } } },
        }),
      ]);
      const excluded = new Set(dismissed.map((item) => `${item.deviceId}:${item.riskCode}`));
      for (const finding of existing) {
        const riskCode = finding.source?.slice(5);
        for (const device of finding.devices) {
          if (riskCode) excluded.add(`${device.deviceId}:${riskCode}`);
        }
      }
      return { items: buildFindingSuggestions(devices, excluded), dismissed: dismissed.length };
    });
  }

  async confirmSuggestion(
    actor: FindingActor,
    organizationId: string,
    input: FindingSuggestionAction,
  ): Promise<FindingDetail> {
    await this.requireMember(actor, organizationId);
    const parsed = findingSuggestionActionSchema.parse(input);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const device = await tx.device.findFirst({
        where: { id: parsed.deviceId, organizationId },
        include: { assessment: true, audit: true },
      });
      if (!device) throw this.notFound('Device not found');
      const networkDevice = this.toNetworkDevice(device);
      if (!networkDevice.riskCodes.includes(parsed.riskCode as DeviceRiskCode)) {
        throw new BadRequestException({
          code: 'SUGGESTION_STALE',
          message: 'This risk is no longer present on the device',
        });
      }
      const rule = FINDING_SUGGESTION_RULES[parsed.riskCode as DeviceRiskCode];
      if (!rule) throw this.notFound('Suggestion not found');
      const existing = await tx.finding.findFirst({
        where: {
          organizationId,
          auditId: device.auditId,
          source: `AUTO:${parsed.riskCode}`,
          devices: { some: { deviceId: device.id } },
        },
        include: {
          audit: true,
          owner: true,
          devices: { include: { device: true } },
          history: true,
        },
      });
      if (existing) return this.toDetail(tx, organizationId, existing);
      const finding = await this.createTx(tx, actor, organizationId, {
        auditId: device.auditId,
        title: rule.title,
        description: `${rule.description}\n\nDevice: ${networkDevice.name}`,
        category: rule.category,
        severity: rule.severity,
        likelihood: null,
        impact: null,
        organizationWide: false,
        evidence: `Detected from device assessment: ${parsed.riskCode}`,
        proposedSolution: rule.proposedSolution,
        effort: rule.effort,
        costEstimateEur: null,
        ownerUserId: null,
        dueDate: null,
        deviceIds: [device.id],
        status: 'OPEN',
        source: `AUTO:${parsed.riskCode}`,
      });
      await this.auditLog.recordWith(tx, {
        action: 'FINDING_CREATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'finding',
        resourceId: finding.id,
        metadata: { source: finding.source, deviceId: device.id, riskCode: parsed.riskCode },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toDetail(tx, organizationId, finding);
    });
  }

  async dismissSuggestion(
    actor: FindingActor,
    organizationId: string,
    input: FindingSuggestionAction,
  ): Promise<void> {
    await this.requireMember(actor, organizationId);
    const parsed = findingSuggestionActionSchema.parse(input);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const device = await tx.device.findFirst({
        where: { id: parsed.deviceId, organizationId },
        include: { assessment: true, audit: true },
      });
      if (!device) throw this.notFound('Device not found');
      await tx.findingSuggestionDecision.upsert({
        where: {
          auditId_deviceId_riskCode: {
            auditId: device.auditId,
            deviceId: device.id,
            riskCode: parsed.riskCode,
          },
        },
        create: {
          organizationId,
          auditId: device.auditId,
          deviceId: device.id,
          riskCode: parsed.riskCode,
          decidedById: actor.userId,
        },
        update: {},
      });
      await this.auditLog.recordWith(tx, {
        action: 'FINDING_SUGGESTION_DISMISSED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'finding_suggestion',
        resourceId: `${device.id}:${parsed.riskCode}`,
        metadata: { deviceId: device.id, riskCode: parsed.riskCode },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });
  }

  private async createTx(
    tx: Prisma.TransactionClient,
    actor: FindingActor,
    organizationId: string,
    input: CreateFindingInput,
  ): Promise<FindingWithRelations> {
    if (input.organizationWide && input.deviceIds.length > 0) {
      throw new BadRequestException({
        code: 'FINDING_SCOPE_INVALID',
        message: 'An organization-wide finding cannot also target specific devices',
      });
    }
    if (input.auditId) await this.auditOrThrow(tx, organizationId, input.auditId);
    const deviceIds = [...new Set(input.deviceIds)];
    await this.requireDevices(tx, organizationId, input.auditId ?? null, deviceIds);
    const code = await this.nextCode(tx, organizationId);
    const severity = input.severity as Severity;
    const riskScore = computeRiskScore(severity, input.likelihood, input.impact);
    const riskAcceptance =
      input.status === 'ACCEPTED_RISK'
        ? {
            ...input.riskAcceptance!,
            acceptedAt: new Date().toISOString(),
            approvedByUserId: input.riskAcceptance?.approvedByUserId ?? actor.userId,
          }
        : null;
    if (input.status === 'ACCEPTED_RISK' && !input.riskAcceptance) {
      throw new BadRequestException({
        code: 'RISK_ACCEPTANCE_REQUIRED',
        message: 'Accepting a risk requires a justification and an approver',
      });
    }
    const finding = await tx.finding.create({
      data: {
        organizationId,
        auditId: input.auditId ?? null,
        code,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        severity,
        likelihood: input.likelihood ?? null,
        impact: input.impact ?? null,
        riskScore,
        organizationWide: input.organizationWide,
        evidence: input.evidence ? { notes: input.evidence } : Prisma.JsonNull,
        proposedSolution: input.proposedSolution ?? null,
        effort: input.effort ?? null,
        costEstimateEur: input.costEstimateEur ?? null,
        ownerUserId: input.ownerUserId ?? null,
        dueDate: input.dueDate ? dateValue(input.dueDate) : null,
        status: input.status,
        riskAcceptance: riskAcceptance as unknown as Prisma.InputJsonValue,
        source: input.source ?? 'MANUAL',
        devices:
          deviceIds.length > 0
            ? {
                create: deviceIds.map((deviceId) => ({
                  organizationId,
                  deviceId,
                })),
              }
            : undefined,
      },
      include: { audit: true, owner: true, devices: { include: { device: true } }, history: true },
    });
    await tx.findingHistory.create({
      data: {
        organizationId,
        findingId: finding.id,
        changedById: actor.userId,
        fieldChanges: [
          { field: 'status', from: null, to: input.status },
          { field: 'severity', from: null, to: input.severity },
        ] as unknown as Prisma.InputJsonValue,
        note: input.source?.startsWith('AUTO:')
          ? 'Created from an automatic device-data suggestion'
          : 'Finding created',
      },
    });
    const withHistory = await this.findingOrThrow(tx, organizationId, finding.id);
    await this.syncRiskEntry(tx, organizationId, withHistory, actor.userId);
    return withHistory;
  }

  private async syncRiskEntry(
    tx: Prisma.TransactionClient,
    organizationId: string,
    finding: FindingWithRelations,
    ownerUserId: string,
  ): Promise<void> {
    const likelihood = finding.likelihood ?? defaultLikelihood(finding.severity as Severity);
    const impact = finding.impact ?? defaultImpact(finding.severity as Severity);
    const asset = finding.organizationWide
      ? 'Organization-wide'
      : finding.devices
          .map((entry) => entry.device.name ?? 'Unnamed device')
          .join(', ')
          .slice(0, 250) || 'Unassigned';
    const data = {
      asset,
      threat: finding.title,
      vulnerability: finding.description,
      likelihood,
      impact,
      score: finding.riskScore ?? likelihood * impact,
      treatment: finding.proposedSolution,
      ownerUserId: finding.ownerUserId ?? ownerUserId,
      status: STATUS_FOR_RISK[finding.status] ?? 'OPEN',
    };
    const existing = await tx.riskRegisterEntry.findFirst({
      where: { organizationId, sourceFindingId: finding.id },
      select: { id: true },
    });
    if (existing) {
      await tx.riskRegisterEntry.update({ where: { id: existing.id }, data });
    } else {
      await tx.riskRegisterEntry.create({
        data: { organizationId, sourceFindingId: finding.id, ...data },
      });
    }
  }

  private async networkDevices(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string,
  ): Promise<NetworkDevice[]> {
    const devices = await tx.device.findMany({
      where: { organizationId, auditId },
      include: { assessment: true },
      orderBy: { name: 'asc' },
    });
    return devices.map((device) => this.toNetworkDevice(device));
  }

  private toNetworkDevice(device: {
    id: string;
    name: string | null;
    type: string;
    vendor: string | null;
    model: string | null;
    serial: string | null;
    ipAddresses: string[];
    macAddress: string | null;
    location: string | null;
    ownerLabel: string | null;
    criticality: string | null;
    dataClassification: string | null;
    businessServices: string[];
    source: string;
    fingerprint: string | null;
    scanState: string;
    position: Prisma.JsonValue | null;
    zoneId: string | null;
    notes: string | null;
    informationComplete: boolean;
    completeness: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    updatedAt: Date;
    assessment: { data: Prisma.JsonValue } | null;
  }): NetworkDevice {
    const assessment = assessmentOf(device.assessment);
    const type = device.type as DeviceType;
    const computed = evaluateDeviceCompleteness({
      type,
      name: device.name,
      ipAddresses: device.ipAddresses,
      macAddress: device.macAddress,
      criticality: device.criticality,
      ownerLabel: device.ownerLabel,
      assessment,
    });
    return {
      id: device.id,
      name: device.name ?? 'Unnamed device',
      type,
      vendor: device.vendor,
      model: device.model,
      serial: device.serial,
      ipAddresses: device.ipAddresses,
      macAddress: device.macAddress,
      location: device.location,
      ownerLabel: device.ownerLabel,
      criticality: device.criticality as Severity | null,
      dataClassification: device.dataClassification,
      businessServices: device.businessServices,
      source: device.source as NetworkDevice['source'],
      fingerprint: device.fingerprint,
      scanState: device.scanState as NetworkDevice['scanState'],
      position: mapPositionSchema.safeParse(device.position).data ?? null,
      zoneId: device.zoneId,
      notes: device.notes,
      informationComplete: device.informationComplete,
      completeness: device.completeness || computed.percentage,
      missingRequired: computed.missingRequired,
      riskCodes: computed.riskCodes,
      assessment,
      firstSeenAt: device.firstSeenAt.toISOString(),
      lastSeenAt: device.lastSeenAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
  }

  private async findingOrThrow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    findingId: string,
  ): Promise<FindingWithRelations> {
    const finding = await tx.finding.findFirst({
      where: { id: findingId, organizationId },
      include: { audit: true, owner: true, devices: { include: { device: true } }, history: true },
    });
    if (!finding) throw this.notFound('Finding not found');
    return finding;
  }

  private async requireDevices(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string | null,
    deviceIds: string[],
  ): Promise<void> {
    if (deviceIds.length === 0) return;
    const count = await tx.device.count({
      where: {
        organizationId,
        id: { in: deviceIds },
        ...(auditId ? { auditId } : {}),
      },
    });
    if (count !== deviceIds.length) {
      throw new BadRequestException({
        code: 'FINDING_DEVICE_INVALID',
        message: 'One or more devices do not belong to this audit',
      });
    }
  }

  private async auditOrThrow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    auditId: string,
  ) {
    const audit = await tx.audit.findFirst({ where: { id: auditId, organizationId } });
    if (!audit) throw this.notFound('Audit not found');
    return audit;
  }

  private async nextCode(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
    const last = await tx.finding.findFirst({
      where: { organizationId, code: { not: null } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const value = Number(last?.code?.match(/(\d+)$/)?.[1] ?? 0);
    return `F-${String(value + 1).padStart(4, '0')}`;
  }

  private async toDetail(
    tx: Prisma.TransactionClient,
    organizationId: string,
    finding: FindingWithRelations,
  ): Promise<FindingDetail> {
    const userIds = [...new Set(finding.history.map((entry) => entry.changedById))];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, givenName: true, familyName: true },
        })
      : [];
    const names = new Map(users.map((user) => [user.id, `${user.givenName} ${user.familyName}`]));
    return {
      ...this.toSummary(finding),
      description: finding.description,
      evidence: evidenceText(finding.evidence),
      proposedSolution: finding.proposedSolution,
      costEstimateEur: finding.costEstimateEur ? Number(finding.costEstimateEur) : null,
      riskAcceptance: parseRiskAcceptance(finding.riskAcceptance),
      devices: finding.devices.map((entry) => ({
        id: entry.device.id,
        name: entry.device.name ?? 'Unnamed device',
        type: entry.device.type,
        ipAddresses: entry.device.ipAddresses,
      })),
      history: finding.history
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((entry) => ({
          id: entry.id,
          changedById: entry.changedById,
          changedByName: names.get(entry.changedById) ?? null,
          note: entry.note,
          changes: Array.isArray(entry.fieldChanges)
            ? (entry.fieldChanges as unknown as FindingHistoryChange[])
            : [],
          createdAt: entry.createdAt.toISOString(),
        })),
    };
  }

  private toSummary(finding: FindingSummaryRow): FindingSummary {
    return {
      id: finding.id,
      code: finding.code,
      auditId: finding.auditId,
      auditName: finding.audit?.name ?? null,
      title: finding.title,
      category: (finding.category ?? 'OTHER') as FindingSummary['category'],
      severity: finding.severity as Severity,
      likelihood: finding.likelihood,
      impact: finding.impact,
      riskScore: finding.riskScore,
      organizationWide: finding.organizationWide,
      status: finding.status,
      effort: finding.effort,
      dueDate: finding.dueDate?.toISOString() ?? null,
      ownerUserId: finding.ownerUserId,
      ownerName: finding.owner ? `${finding.owner.givenName} ${finding.owner.familyName}` : null,
      deviceCount: finding.devices.length,
      source: finding.source,
      createdAt: finding.createdAt.toISOString(),
      updatedAt: finding.updatedAt.toISOString(),
    };
  }

  private async requireMember(actor: FindingActor, organizationId: string): Promise<void> {
    const member = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.findFirst({ where: { organizationId, userId: actor.userId } }),
    );
    if (!member) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this organization',
      });
    }
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message });
  }
}

function countsOf(
  rows: Array<{ status: string; severity: string; dueDate: Date | null }>,
): FindingCounts {
  const total = rows.length;
  const now = Date.now();
  const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const byStatus = {
    OPEN: 0,
    IN_PROGRESS: 0,
    MITIGATED: 0,
    ACCEPTED_RISK: 0,
    CLOSED: 0,
  };
  let open = 0;
  let overdue = 0;
  for (const row of rows) {
    bySeverity[row.severity as Severity] += 1;
    byStatus[row.status as keyof typeof byStatus] += 1;
    if (row.status !== 'CLOSED') open += 1;
    if (row.dueDate && row.dueDate.getTime() < now && row.status !== 'CLOSED') overdue += 1;
  }
  return { total, open, overdue, bySeverity, byStatus };
}

function assessmentOf(assessment: { data: Prisma.JsonValue } | null): DeviceAssessmentData {
  if (!assessment) return {};
  const parsed = deviceAssessmentDataSchema.safeParse(assessment.data);
  return parsed.success ? parsed.data : {};
}

function parseRiskAcceptance(value: Prisma.JsonValue | null): FindingRiskAcceptance | null {
  const parsed = findingRiskAcceptanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function evidenceText(value: Prisma.JsonValue | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const notes = (value as { notes?: unknown }).notes;
    if (typeof notes === 'string') return notes;
  }
  return JSON.stringify(value);
}

function change(field: string, from: unknown, to: unknown): FindingHistoryChange {
  return { field, from: text(from), to: text(to) };
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateText(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function defaultLikelihood(severity: Severity): number {
  return { LOW: 2, MEDIUM: 3, HIGH: 4, CRITICAL: 5 }[severity];
}

function defaultImpact(severity: Severity): number {
  return { LOW: 2, MEDIUM: 3, HIGH: 4, CRITICAL: 5 }[severity];
}
