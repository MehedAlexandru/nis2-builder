import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ExportJob, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  createBundleExportSchema,
  createDocumentExportSchema,
  createSummaryExportSchema,
  type CreateBundleExportInput,
  type CreateDocumentExportInput,
  type CreateSummaryExportInput,
  type ExportJobSummary,
} from '@nis2/shared';
import { AuditService } from '../../common/audit/audit.service';
import { StorageService, type StoredObject } from '../../common/storage/storage.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { EXPORT_QUEUE } from '../../queue/queue.constants';

export interface ExportActor {
  userId: string;
  globalRole: 'USER' | 'ADMIN';
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class ExportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @Optional() @Inject(EXPORT_QUEUE) private readonly queue: Queue | null,
  ) {}

  async createDocumentExport(
    actor: ExportActor,
    organizationId: string,
    documentId: string,
    input: CreateDocumentExportInput,
  ): Promise<ExportJobSummary> {
    await this.requireMember(actor, organizationId);
    const parsed = createDocumentExportSchema.parse(input);
    const document = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.document.findFirst({
        where: { id: documentId, organizationId },
        select: { id: true, template: { select: { key: true } } },
      }),
    );
    if (!document) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
    }
    return this.createJob(actor, organizationId, parsed.format, 'document', documentId, {
      locale: parsed.locale,
      format: parsed.format,
      templateKey: document.template.key,
    });
  }

  async createSummary(
    actor: ExportActor,
    organizationId: string,
    input: CreateSummaryExportInput,
  ): Promise<ExportJobSummary> {
    await this.requireMember(actor, organizationId);
    const parsed = createSummaryExportSchema.parse(input);
    return this.createJob(actor, organizationId, 'COMPLIANCE_SUMMARY', 'organization', null, {
      locale: parsed.locale,
      format: parsed.format,
    });
  }

  async createBundle(
    actor: ExportActor,
    organizationId: string,
    input: CreateBundleExportInput,
  ): Promise<ExportJobSummary> {
    await this.requireMember(actor, organizationId);
    const parsed = createBundleExportSchema.parse(input);
    return this.createJob(actor, organizationId, 'ZIP', 'bundle', null, {
      locale: parsed.locale,
    });
  }

  async list(actor: ExportActor, organizationId: string): Promise<ExportJobSummary[]> {
    await this.requireMember(actor, organizationId);
    const rows = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.exportJob.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    );
    return rows.map((row) => this.toSummary(row));
  }

  async get(actor: ExportActor, organizationId: string, jobId: string): Promise<ExportJobSummary> {
    await this.requireMember(actor, organizationId);
    return this.toSummary(await this.findJob(actor, organizationId, jobId));
  }

  async download(
    actor: ExportActor,
    organizationId: string,
    jobId: string,
  ): Promise<{ object: StoredObject; filename: string; contentType: string }> {
    await this.requireMember(actor, organizationId);
    const job = await this.findJob(actor, organizationId, jobId);
    if (job.status !== 'READY' || !job.storageKey) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_READY',
        message: 'The export is not ready for download',
      });
    }
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Object storage is not configured',
      });
    }
    const filename = job.storageKey.split('/').pop() ?? `export-${job.id}`;
    return {
      object: await this.storage.getObject(job.storageKey),
      filename,
      contentType:
        job.type === 'ZIP'
          ? 'application/zip'
          : job.type === 'DOCX' || filename.endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf',
    };
  }

  private async createJob(
    actor: ExportActor,
    organizationId: string,
    type: 'DOCX' | 'PDF' | 'ZIP' | 'COMPLIANCE_SUMMARY',
    entityType: string,
    entityId: string | null,
    metadata: Prisma.InputJsonValue,
  ): Promise<ExportJobSummary> {
    if (!this.queue) {
      throw new ServiceUnavailableException({
        code: 'QUEUE_UNAVAILABLE',
        message: 'Export queue is not enabled',
      });
    }

    const job = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.exportJob.create({
        data: {
          organizationId,
          type,
          entityType,
          entityId,
          entityIds: metadata,
          status: 'QUEUED',
          requestedById: actor.userId,
        },
      }),
    );

    try {
      await this.queue.add(
        'export',
        { exportJobId: job.id, organizationId },
        {
          jobId: job.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
        tx.exportJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Could not queue export',
          },
        }),
      );
      throw new ServiceUnavailableException({
        code: 'QUEUE_UNAVAILABLE',
        message: 'The export could not be queued',
      });
    }

    await this.audit.record({
      action: 'EXPORT_REQUESTED',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'export_job',
      resourceId: job.id,
      metadata: { type, entityType, entityId },
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
    return this.toSummary(job);
  }

  private async findJob(
    actor: ExportActor,
    organizationId: string,
    jobId: string,
  ): Promise<ExportJob> {
    const job = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.exportJob.findFirst({
        where: { id: jobId, organizationId },
      }),
    );
    if (!job) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Export job not found' });
    }
    return job;
  }

  private toSummary(job: ExportJob): ExportJobSummary {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      entityType: job.entityType,
      entityId: job.entityId,
      filename: job.storageKey ? (job.storageKey.split('/').pop() ?? null) : null,
      errorMessage: job.errorMessage,
      downloadAvailable: job.status === 'READY' && Boolean(job.storageKey),
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }

  private async requireMember(actor: ExportActor, organizationId: string): Promise<void> {
    const membership = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.findFirst({ where: { organizationId, userId: actor.userId } }),
    );
    if (!membership) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this organization',
      });
    }
  }
}
