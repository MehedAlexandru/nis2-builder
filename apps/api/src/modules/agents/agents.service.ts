import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Agent } from '@prisma/client';
import {
  agentScanParamsSchema,
  deviceAssessmentDataSchema,
  evaluateDeviceCompleteness,
  scanDiffSummarySchema,
  type AgentDownloadPlatform,
  type AgentEnrollmentResponse,
  type AgentHeartbeatInput,
  type AgentHeartbeatResponse,
  type AgentScanResult,
  type AgentScanSummary,
  type AgentSummary,
  type CreateAgentEnrollmentInput,
  type CreateAgentScanInput,
  type DeviceAssessmentData,
  type DeviceType,
  type ScanDiffSummary,
  type ScannedDevice,
} from '@nis2/shared';
import { AuditService } from '../../common/audit/audit.service';
import { TokenService } from '../../common/crypto/token.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import type { AppEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeMac, planScanDiff, type ExistingScanDevice } from './scan-diff';

export interface AgentActor {
  userId: string;
  globalRole: 'USER' | 'ADMIN';
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface AgentDownloadFile {
  path: string;
  filename: string;
  size: number;
}

const AGENT_FILES: Record<AgentDownloadPlatform, string> = {
  'linux-amd64': 'nis2-scanner-agent-linux-amd64',
  'linux-arm64': 'nis2-scanner-agent-linux-arm64',
  'windows-amd64': 'nis2-scanner-agent-windows-amd64.exe',
  'darwin-amd64': 'nis2-scanner-agent-darwin-amd64',
  'darwin-arm64': 'nis2-scanner-agent-darwin-arm64',
};

type ScanJobWithRelations = Prisma.ScanJobGetPayload<{
  include: { agent: { select: { name: true } }; audit: { select: { name: true } } };
}>;

const STALE_JOB_MINUTES = 30;

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditLog: AuditService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async download(platform: AgentDownloadPlatform): Promise<AgentDownloadFile> {
    const filename = AGENT_FILES[platform];
    const path = join(this.config.get('AGENT_BINARY_DIR', { infer: true }), filename);
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      return { path, filename, size: info.size };
    } catch {
      throw new ServiceUnavailableException({
        code: 'AGENT_BINARY_UNAVAILABLE',
        message:
          'This deployment does not include the agent binary. Build it with `make build` in apps/scanner-agent or use a release artifact.',
      });
    }
  }

  async list(actor: AgentActor, organizationId: string): Promise<AgentSummary[]> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const [agents, queued, completed] = await Promise.all([
        tx.agent.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
        }),
        tx.scanJob.groupBy({
          by: ['agentId'],
          where: { organizationId, status: 'QUEUED' },
          _count: { _all: true },
        }),
        tx.scanJob.groupBy({
          by: ['agentId'],
          where: { organizationId, status: 'COMPLETED', agentId: { not: null } },
          _max: { finishedAt: true },
        }),
      ]);
      const queuedByAgent = new Map(
        queued.filter((row) => row.agentId).map((row) => [row.agentId as string, row._count._all]),
      );
      const lastScanByAgent = new Map(
        completed
          .filter((row) => row.agentId)
          .map((row) => [row.agentId as string, row._max.finishedAt]),
      );
      return agents.map((agent) =>
        this.toAgentSummary(
          agent,
          queuedByAgent.get(agent.id) ?? 0,
          lastScanByAgent.get(agent.id) ?? null,
        ),
      );
    });
  }

  async createEnrollment(
    actor: AgentActor,
    organizationId: string,
    input: CreateAgentEnrollmentInput,
  ): Promise<AgentEnrollmentResponse> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const generated = this.tokens.generate(32);
      const token = `nis2_agent_${generated.token}`;
      const tokenHash = this.tokens.hash(token);
      const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
      const agent = await tx.agent.create({
        data: {
          organizationId,
          name: input.name,
          tokenHash,
          status: 'PENDING',
          enrollmentExpiresAt: expiresAt,
          createdById: actor.userId,
        },
      });
      await this.auditLog.recordWith(tx, {
        action: 'AGENT_ENROLLMENT_CREATED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'agent',
        resourceId: agent.id,
        metadata: { name: agent.name, expiresAt: expiresAt.toISOString() },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return {
        agent: this.toAgentSummary(agent, 0, null),
        token,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async revoke(actor: AgentActor, organizationId: string, agentId: string): Promise<void> {
    await this.requireMember(actor, organizationId);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId, organizationId } });
      if (!agent) throw this.notFound('Agent not found');
      if (agent.status !== 'REVOKED') {
        await tx.agent.update({
          where: { id: agentId },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
        await tx.scanJob.updateMany({
          where: { organizationId, agentId, status: { in: ['QUEUED', 'RUNNING'] } },
          data: {
            status: 'FAILED',
            errorMessage: 'Agent was revoked before the scan completed',
            finishedAt: new Date(),
          },
        });
        await this.auditLog.recordWith(tx, {
          action: 'AGENT_REVOKED',
          actorUserId: actor.userId,
          actorRole: actor.globalRole,
          organizationId,
          resourceType: 'agent',
          resourceId: agentId,
          metadata: { name: agent.name },
          ip: actor.ip,
          userAgent: actor.userAgent,
          correlationId: actor.correlationId,
        });
      }
    });
  }

  async createScan(
    actor: AgentActor,
    organizationId: string,
    agentId: string,
    input: CreateAgentScanInput,
  ): Promise<AgentScanSummary> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId, organizationId } });
      if (!agent) throw this.notFound('Agent not found');
      if (agent.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'AGENT_NOT_ACTIVE',
          message: 'The agent must send a heartbeat before it can run scans',
        });
      }
      const audit = await tx.audit.findFirst({
        where: { id: input.auditId, organizationId },
      });
      if (!audit) throw this.notFound('Audit not found');
      const active = await tx.scanJob.findFirst({
        where: {
          organizationId,
          agentId,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });
      if (active) {
        throw new ConflictException({
          code: 'SCAN_ALREADY_ACTIVE',
          message: 'This agent already has a queued or running scan',
        });
      }
      const params = agentScanParamsSchema.parse({
        authorized: input.authorized,
        cidrs: input.cidrs,
        topPorts: input.topPorts,
        enableMdns: input.enableMdns,
        enableNetbios: input.enableNetbios,
        rateLimitPerSecond: input.rateLimitPerSecond,
      });
      const job = await tx.scanJob.create({
        data: {
          organizationId,
          auditId: audit.id,
          agentId,
          method: 'AGENT_SCAN',
          params: params as Prisma.InputJsonValue,
          status: 'QUEUED',
          createdById: actor.userId,
        },
        include: { agent: { select: { name: true } }, audit: { select: { name: true } } },
      });
      await this.auditLog.recordWith(tx, {
        action: 'SCAN_REQUESTED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'scan_job',
        resourceId: job.id,
        metadata: {
          agentId,
          auditId: audit.id,
          cidrs: params.cidrs,
          topPorts: params.topPorts,
          authorized: true,
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
      return this.toScanSummary(job);
    });
  }

  async scans(actor: AgentActor, organizationId: string): Promise<AgentScanSummary[]> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const jobs = await tx.scanJob.findMany({
        where: { organizationId },
        include: { agent: { select: { name: true } }, audit: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return jobs.map((job) => this.toScanSummary(job));
    });
  }

  async scan(actor: AgentActor, organizationId: string, jobId: string): Promise<AgentScanSummary> {
    await this.requireMember(actor, organizationId);
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const job = await tx.scanJob.findFirst({
        where: { id: jobId, organizationId },
        include: { agent: { select: { name: true } }, audit: { select: { name: true } } },
      });
      if (!job) throw this.notFound('Scan job not found');
      return this.toScanSummary(job);
    });
  }

  async heartbeat(token: string, input: AgentHeartbeatInput): Promise<AgentHeartbeatResponse> {
    return this.withAgentToken(token, async (tx, agent) => {
      const now = new Date();
      if (agent.status === 'REVOKED') {
        throw new UnauthorizedException({
          code: 'AGENT_REVOKED',
          message: 'This agent has been revoked',
        });
      }
      if (
        agent.status === 'PENDING' &&
        agent.enrollmentExpiresAt &&
        agent.enrollmentExpiresAt < now
      ) {
        throw new UnauthorizedException({
          code: 'AGENT_ENROLLMENT_EXPIRED',
          message: 'The enrollment token has expired; create a new one in the UI',
        });
      }

      const firstEnrollment = agent.status === 'PENDING';
      const updated = await tx.agent.update({
        where: { id: agent.id },
        data: {
          status: 'ACTIVE',
          enrolledAt: agent.enrolledAt ?? now,
          lastSeenAt: now,
          version: input.version ?? agent.version,
          platform: input.platform ?? agent.platform,
        },
      });
      await tx.scanJob.updateMany({
        where: {
          organizationId: agent.organizationId,
          agentId: agent.id,
          status: 'RUNNING',
          startedAt: { lt: new Date(now.getTime() - STALE_JOB_MINUTES * 60_000) },
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Agent did not report results before the job timeout',
          finishedAt: now,
        },
      });
      if (firstEnrollment) {
        await this.auditLog.recordWith(tx, {
          action: 'AGENT_ENROLLED',
          organizationId: agent.organizationId,
          resourceType: 'agent',
          resourceId: agent.id,
          metadata: { name: agent.name, platform: input.platform, version: input.version },
        });
      }

      const queued = await tx.scanJob.findFirst({
        where: {
          organizationId: agent.organizationId,
          agentId: agent.id,
          status: 'QUEUED',
        },
        orderBy: { createdAt: 'asc' },
      });
      let job = null;
      if (queued && queued.auditId) {
        const claimed = await tx.scanJob.updateMany({
          where: { id: queued.id, status: 'QUEUED' },
          data: { status: 'RUNNING', startedAt: now },
        });
        if (claimed.count === 1) {
          job = {
            id: queued.id,
            auditId: queued.auditId,
            method: queued.method,
            params: agentScanParamsSchema.parse(queued.params),
          };
        }
      }
      return {
        agent: { id: updated.id, name: updated.name, status: updated.status },
        job,
      };
    });
  }

  async ingestResults(
    token: string,
    jobId: string,
    input: AgentScanResult,
  ): Promise<ScanDiffSummary> {
    return this.withAgentToken(token, async (tx, agent) => {
      const job = await tx.scanJob.findFirst({
        where: {
          id: jobId,
          organizationId: agent.organizationId,
          agentId: agent.id,
        },
      });
      if (!job) throw this.notFound('Scan job not found');
      if (job.status !== 'RUNNING') {
        throw new ConflictException({
          code: 'SCAN_NOT_RUNNING',
          message: 'This scan job is not running',
        });
      }
      if (!job.auditId) throw this.notFound('The scan job has no target audit');

      const audit = await tx.audit.findFirst({
        where: { id: job.auditId, organizationId: agent.organizationId },
      });
      if (!audit) throw this.notFound('Audit not found');

      const devices = await tx.device.findMany({
        where: { organizationId: agent.organizationId, auditId: audit.id },
        include: { assessment: true },
      });
      const existing: ExistingScanDevice[] = devices.map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type as DeviceType,
        vendor: device.vendor,
        macAddress: device.macAddress,
        ipAddresses: device.ipAddresses,
        assessment: this.assessmentOf(device),
      }));
      const fullById = new Map(devices.map((device) => [device.id, device]));
      const plan = planScanDiff(existing, input.devices);
      const now = new Date();
      const createdDevices: Array<{ id: string; name: string; ipAddresses: string[] }> = [];
      const changedDevices: Array<{
        id: string;
        name: string;
        ipAddresses: string[];
        changes: string[];
      }> = [];
      let unchanged = 0;

      for (const update of plan.updates) {
        const current = fullById.get(update.deviceId);
        if (!current) continue;
        const computed = evaluateDeviceCompleteness({
          type: update.type,
          name: update.name,
          ipAddresses: update.ipAddresses,
          macAddress: update.macAddress,
          criticality: current.criticality,
          ownerLabel: current.ownerLabel,
          assessment: update.assessment,
        });
        await tx.device.update({
          where: { id: update.deviceId },
          data: {
            name: update.name,
            type: update.type,
            vendor: update.vendor,
            macAddress: update.macAddress,
            ipAddresses: update.ipAddresses,
            lastSeenAt: now,
            scanState: update.changedFields.length > 0 ? 'CHANGED' : 'UNCHANGED',
            completeness: computed.percentage,
            informationComplete: current.informationComplete && computed.informationCompleteAllowed,
            assessment: {
              upsert: {
                update: {
                  data: update.assessment as Prisma.InputJsonValue,
                  completeness: computed.percentage,
                },
                create: {
                  organizationId: agent.organizationId,
                  data: update.assessment as Prisma.InputJsonValue,
                  completeness: computed.percentage,
                  informationComplete: false,
                },
              },
            },
          },
        });
        if (update.changedFields.length > 0) {
          changedDevices.push({
            id: update.deviceId,
            name: update.name,
            ipAddresses: update.ipAddresses,
            changes: update.changedFields,
          });
        } else {
          unchanged += 1;
        }
      }

      for (const [index, incoming] of plan.creates.entries()) {
        const type = incoming.deviceType ?? inferType(incoming);
        const name = incoming.hostname ?? `Scanned ${incoming.ipAddresses[0]}`;
        const assessment: DeviceAssessmentData = {
          ...(incoming.os ? { os: incoming.os } : {}),
          ...(incoming.openPorts ? { openPorts: incoming.openPorts } : {}),
        };
        const computed = evaluateDeviceCompleteness({
          type,
          name,
          ipAddresses: incoming.ipAddresses,
          macAddress: normalizeMac(incoming.macAddress),
          criticality: 'MEDIUM',
          ownerLabel: null,
          assessment,
        });
        const position = {
          x: 80 + ((devices.length + index) % 4) * 240,
          y: 80 + Math.floor((devices.length + index) / 4) * 180,
        };
        const created = await tx.device.create({
          data: {
            organizationId: agent.organizationId,
            auditId: audit.id,
            name,
            type,
            vendor: incoming.vendor ?? null,
            ipAddresses: incoming.ipAddresses,
            macAddress: normalizeMac(incoming.macAddress),
            criticality: 'MEDIUM',
            source: 'SCAN',
            scanState: 'NEW',
            position: position as Prisma.InputJsonValue,
            lastSeenAt: now,
            completeness: computed.percentage,
            assessment: {
              create: {
                organizationId: agent.organizationId,
                data: assessment as Prisma.InputJsonValue,
                completeness: computed.percentage,
                informationComplete: false,
              },
            },
          },
        });
        createdDevices.push({
          id: created.id,
          name: created.name ?? name,
          ipAddresses: created.ipAddresses,
        });
      }

      if (plan.missingIds.length > 0) {
        await tx.device.updateMany({
          where: {
            organizationId: agent.organizationId,
            auditId: audit.id,
            id: { in: plan.missingIds },
          },
          data: { scanState: 'MISSING' },
        });
      }

      const missingDevices = plan.missingIds
        .map((id) => fullById.get(id))
        .filter((device): device is NonNullable<typeof device> => Boolean(device))
        .map((device) => ({
          id: device.id,
          name: device.name ?? 'Unnamed device',
          ipAddresses: device.ipAddresses,
        }));
      const summary: ScanDiffSummary = {
        received: input.devices.length,
        created: createdDevices.length,
        changed: changedDevices.length,
        unchanged,
        missing: missingDevices.length,
        newDevices: createdDevices,
        missingDevices,
        changedDevices,
      };
      await tx.scanJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          finishedAt: now,
          resultSummary: summary as unknown as Prisma.InputJsonValue,
          errorMessage: null,
        },
      });
      await this.auditLog.recordWith(tx, {
        action: 'SCAN_COMPLETED',
        organizationId: agent.organizationId,
        resourceType: 'scan_job',
        resourceId: job.id,
        metadata: {
          agentId: agent.id,
          auditId: audit.id,
          received: summary.received,
          created: summary.created,
          changed: summary.changed,
          missing: summary.missing,
        },
      });
      return summary;
    });
  }

  async failJob(token: string, jobId: string, error: string): Promise<void> {
    await this.withAgentToken(token, async (tx, agent) => {
      const job = await tx.scanJob.findFirst({
        where: {
          id: jobId,
          organizationId: agent.organizationId,
          agentId: agent.id,
        },
      });
      if (!job) throw this.notFound('Scan job not found');
      if (job.status === 'COMPLETED') return;
      await tx.scanJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error.slice(0, 1000),
          finishedAt: new Date(),
        },
      });
      await this.auditLog.recordWith(tx, {
        action: 'SCAN_FAILED',
        organizationId: agent.organizationId,
        resourceType: 'scan_job',
        resourceId: job.id,
        metadata: { agentId: agent.id, error: error.slice(0, 1000) },
      });
    });
  }

  private async withAgentToken<T>(
    token: string,
    callback: (tx: Prisma.TransactionClient, agent: Agent) => Promise<T>,
  ): Promise<T> {
    const tokenHash = this.tokens.hash(token);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.agent_token_hash', ${tokenHash}, true)`;
      const agent = await tx.agent.findUnique({ where: { tokenHash } });
      if (!agent) {
        throw new UnauthorizedException({
          code: 'AGENT_UNAUTHORIZED',
          message: 'Invalid agent token',
        });
      }
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${agent.organizationId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
      return callback(tx, agent);
    });
  }

  private async requireMember(actor: AgentActor, organizationId: string): Promise<void> {
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

  private assessmentOf(device: {
    assessment: { data: Prisma.JsonValue } | null;
  }): DeviceAssessmentData {
    if (!device.assessment) return {};
    const parsed = deviceAssessmentDataSchema.safeParse(device.assessment.data);
    return parsed.success ? parsed.data : {};
  }

  private toAgentSummary(agent: Agent, queuedScans: number, lastScanAt: Date | null): AgentSummary {
    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      version: agent.version,
      platform: agent.platform,
      lastSeenAt: agent.lastSeenAt?.toISOString() ?? null,
      enrolledAt: agent.enrolledAt?.toISOString() ?? null,
      enrollmentExpiresAt: agent.enrollmentExpiresAt?.toISOString() ?? null,
      revokedAt: agent.revokedAt?.toISOString() ?? null,
      createdAt: agent.createdAt.toISOString(),
      queuedScans,
      lastScanAt: lastScanAt?.toISOString() ?? null,
    };
  }

  private toScanSummary(job: ScanJobWithRelations): AgentScanSummary {
    const params = agentScanParamsSchema.partial().safeParse(job.params).data ?? null;
    const result = scanDiffSummarySchema.safeParse(job.resultSummary).data ?? null;
    return {
      id: job.id,
      agentId: job.agentId,
      agentName: job.agent?.name ?? null,
      auditId: job.auditId,
      auditName: job.audit?.name ?? null,
      method: job.method,
      status: job.status,
      params,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage,
      resultSummary: result,
    };
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message });
  }
}

function inferType(device: ScannedDevice): DeviceType {
  const ports = new Set(
    (device.openPorts ?? [])
      .map((port) => Number(port.split('/')[0]))
      .filter((port) => Number.isInteger(port)),
  );
  const vendor = (device.vendor ?? '').toLowerCase();
  if (ports.has(9100) || ports.has(631) || vendor.includes('printer')) return 'PRINTER';
  if (ports.has(554) || ports.has(8554) || ports.has(37777)) return 'IP_CAMERA';
  if (vendor.includes('router') || ports.has(53) || ports.has(67)) return 'ROUTER';
  if (vendor.includes('switch')) return 'SWITCH';
  if (vendor.includes('firewall') || vendor.includes('fortinet')) return 'FIREWALL';
  if (ports.has(445) || ports.has(3389) || ports.has(22) || ports.has(80)) return 'SERVER';
  return 'UNKNOWN';
}
