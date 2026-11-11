import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  Approval,
  CompanyProfile,
  Document,
  DocumentTemplate,
  Prisma,
  User,
} from '@prisma/client';
import {
  applyDocumentPrefill,
  calculateDocumentProgress,
  classificationResultSchema,
  diffDocumentPayloads,
  documentApplicabilitySchema,
  documentApprovalInputSchema,
  documentDetailSchema,
  documentProgressSchema,
  documentSaveInputSchema,
  documentStatusFromProgress,
  documentTemplateSchema,
  documentVersionInputSchema,
  type CompanyProfileSummary,
  type DocumentApproval,
  type DocumentCard,
  type DocumentCatalog,
  type DocumentDetail,
  type DocumentPayload,
  type DocumentProgress,
  type DocumentRevisionDetail,
  type DocumentRevisionSummary,
  type DocumentTemplate as SharedDocumentTemplate,
  type DocumentVersion as SharedDocumentVersion,
} from '@nis2/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DocumentActor {
  userId: string;
  globalRole: 'USER' | 'ADMIN';
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

interface MemberContext {
  organization: { id: string; name: string; jurisdictionPackCode: string };
  membership: { role: 'OWNER' | 'MEMBER' };
}

type DocumentWithTemplate = Prisma.DocumentGetPayload<{ include: { template: true } }>;
type RevisionWithAuthor = Prisma.DocumentRevisionGetPayload<{ include: { createdBy: true } }>;
type VersionWithRelations = Prisma.DocumentVersionGetPayload<{
  include: { approvals: { include: { approver: true } }; createdBy: true };
}>;

const LOCK_MINUTES = 10;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async catalog(actor: DocumentActor, organizationId: string): Promise<DocumentCatalog> {
    await this.requireMember(actor, organizationId);

    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const [templates, documents, latestRun, profile] = await Promise.all([
        tx.documentTemplate.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        }),
        tx.document.findMany({
          where: { organizationId },
          include: { template: true },
          orderBy: { updatedAt: 'desc' },
        }),
        tx.classificationRun.findFirst({
          where: { organizationId },
          orderBy: { version: 'desc' },
        }),
        tx.companyProfile.findUnique({ where: { organizationId } }),
      ]);

      if (templates.length === 0) {
        throw new ServiceUnavailableException({
          code: 'DOCUMENT_CATALOG_UNAVAILABLE',
          message: 'No document templates are seeded. Run the seed or contact an administrator.',
        });
      }

      const applicability =
        z.array(documentApplicabilitySchema).safeParse(latestRun?.applicability ?? []).data ?? [];
      const applicabilityByKey = new Map(applicability.map((item) => [item.templateKey, item]));
      const documentByKey = new Map<string, DocumentWithTemplate>();
      for (const document of documents) {
        if (!documentByKey.has(document.template.key))
          documentByKey.set(document.template.key, document);
      }

      const userIds = [
        ...new Set(
          documents.flatMap((document) =>
            [document.lastEditedById, document.lockOwnerId].filter((id): id is string =>
              Boolean(id),
            ),
          ),
        ),
      ];
      const users =
        userIds.length === 0
          ? []
          : await tx.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, givenName: true, familyName: true, email: true },
            });
      const userNames = new Map(users.map((user) => [user.id, displayName(user)]));

      const cards: DocumentCard[] = templates.map((templateRecord) => {
        const template = this.parseTemplate(templateRecord);
        const document = documentByKey.get(template.key);
        const rule = applicabilityByKey.get(template.key);
        const now = new Date();
        const overdue = Boolean(document?.nextReviewDate && document.nextReviewDate < now);
        const templateChanged = Boolean(document && document.templateVersion !== template.version);
        const progress = document ? document.progress : 0;
        const status = document
          ? documentStatusFromProgress(progress, { overdue, templateChanged })
          : 'NOT_STARTED';

        return {
          documentId: document?.id ?? null,
          templateKey: template.key,
          templateVersion: template.version,
          category: template.category,
          title: template.title,
          shortDescription: template.shortDescription,
          legalReference: template.legalReference,
          applicability: template.applicability,
          ownerRole: template.ownerRole,
          reviewFrequencyMonths: template.reviewFrequencyMonths,
          required: rule?.required ?? false,
          priority: rule?.priority ?? null,
          status,
          progress,
          requiredRemaining: document ? this.requiredRemaining(document) : 0,
          classification: document?.classification ?? null,
          currentVersionLabel: document?.currentVersionLabel ?? null,
          lastEditedAt: document?.updatedAt.toISOString() ?? null,
          lastEditedByName: document?.lastEditedById
            ? (userNames.get(document.lastEditedById) ?? null)
            : null,
          nextReviewDate: document?.nextReviewDate?.toISOString() ?? null,
          isOverdue: overdue,
          lockedByOther: Boolean(
            document?.lockOwnerId &&
            document.lockOwnerId !== actor.userId &&
            document.lockExpiresAt &&
            document.lockExpiresAt > now,
          ),
        };
      });

      const required = cards.filter((card) => card.required);
      const basis =
        required.length > 0 ? required : cards.filter((card) => card.applicability !== 'VOLUNTARY');
      const overallProgress =
        basis.length === 0
          ? 0
          : Math.round(basis.reduce((sum, card) => sum + card.progress, 0) / basis.length);

      return {
        templates: cards,
        overallProgress,
        requiredCount: required.length,
        completedCount: required.filter((card) => card.progress >= 100).length,
        classificationResult: latestRun ? classificationResultSchema.parse(latestRun.result) : null,
        generatedAt: new Date().toISOString(),
        profile: profile ? this.profileSummary(profile) : null,
      };
    });
  }

  async ensureDocument(
    actor: DocumentActor,
    organizationId: string,
    templateKey: string,
  ): Promise<DocumentDetail> {
    const { organization } = await this.requireMember(actor, organizationId);
    const templateRecord = await this.prisma.documentTemplate.findFirst({
      where: { key: templateKey, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!templateRecord) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Document template not found',
      });
    }
    const template = this.parseTemplate(templateRecord);

    const existing = await this.findDocumentByKey(actor, organizationId, templateKey);
    if (existing) {
      return this.buildDetail(
        actor,
        organizationId,
        existing,
        this.parseTemplate(existing.template),
      );
    }

    const profile = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.companyProfile.findUnique({ where: { organizationId } }),
    );
    const prefillProfile = this.prefillProfile(organization.name, profile);
    const payload = applyDocumentPrefill(template, {}, prefillProfile);
    const progress = calculateDocumentProgress(template, payload);
    const reviewDate = new Date();
    reviewDate.setMonth(reviewDate.getMonth() + template.reviewFrequencyMonths);

    const document = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:${template.key}`}))`;
        const raced = await tx.document.findFirst({
          where: { organizationId, template: { key: template.key } },
          include: { template: true },
        });
        if (raced) return raced;

        const created = await tx.document.create({
          data: {
            organizationId,
            templateId: templateRecord.id,
            templateVersion: template.version,
            status: 'NOT_STARTED',
            payload: payload as Prisma.InputJsonValue,
            progress: progress.percentage,
            currentRevisionNo: 1,
            nextReviewDate: reviewDate,
            ownerUserId: actor.userId,
            lastEditedById: actor.userId,
          },
          include: { template: true },
        });

        await tx.documentRevision.create({
          data: {
            organizationId,
            documentId: created.id,
            revisionNo: 1,
            templateVersion: template.version,
            payload: payload as Prisma.InputJsonValue,
            changedFields: { fields: Object.keys(payload) } as Prisma.InputJsonValue,
            changeNote: 'Document created',
            createdById: actor.userId,
          },
        });

        await this.audit.recordWith(tx, {
          action: 'DOCUMENT_CREATED',
          actorUserId: actor.userId,
          actorRole: actor.globalRole,
          organizationId,
          resourceType: 'document',
          resourceId: created.id,
          metadata: {
            templateKey: template.key,
            templateVersion: template.version,
          },
          ip: actor.ip,
          userAgent: actor.userAgent,
          correlationId: actor.correlationId,
        });
        return created;
      },
    );

    return this.buildDetail(actor, organizationId, document, template);
  }

  async detail(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetail> {
    await this.requireMember(actor, organizationId);
    const document = await this.findDocument(actor, organizationId, documentId);
    return this.buildDetail(actor, organizationId, document, this.parseTemplate(document.template));
  }

  async save(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
    input: unknown,
  ): Promise<DocumentDetail> {
    await this.requireMember(actor, organizationId);
    const parsed = documentSaveInputSchema.parse(input);
    const current = await this.findDocument(actor, organizationId, documentId);
    const template = this.parseTemplate(current.template);
    this.assertWritable(current, actor);

    if (parsed.expectedRevisionNo !== current.currentRevisionNo) {
      throw new ConflictException({
        code: 'DOCUMENT_CONFLICT',
        message: 'This document was changed by someone else. Reload before saving.',
        details: { currentRevisionNo: current.currentRevisionNo },
      });
    }

    const ownerUserId = parsed.ownerUserId;
    if (ownerUserId) {
      const ownerMembership = await this.tenantPrisma.runInTenant(
        organizationId,
        actor.userId,
        async (tx) =>
          tx.membership.findFirst({
            where: { organizationId, userId: ownerUserId },
          }),
      );
      if (!ownerMembership) {
        throw new BadRequestException({
          code: 'DOCUMENT_OWNER_INVALID',
          message: 'The selected owner is not a member of this organization',
        });
      }
    }

    const payload = parsed.payload as DocumentPayload;
    const allowedFields = new Set(
      template.sections.flatMap((section) => section.fields.map((field) => field.key)),
    );
    const unknownFields = Object.keys(payload).filter((key) => !allowedFields.has(key));
    if (unknownFields.length > 0) {
      throw new BadRequestException({
        code: 'DOCUMENT_PAYLOAD_INVALID',
        message: 'The document payload contains fields that are not part of the template',
        details: { unknownFields },
      });
    }
    if (JSON.stringify(payload).length > 256_000) {
      throw new BadRequestException({
        code: 'DOCUMENT_PAYLOAD_TOO_LARGE',
        message: 'The document payload is too large',
      });
    }
    const previous = this.payloadOf(current);
    const changedFields = diffDocumentPayloads(template, previous, payload);
    const nextReviewDate =
      parsed.nextReviewDate === undefined
        ? current.nextReviewDate
        : parsed.nextReviewDate === null
          ? null
          : new Date(parsed.nextReviewDate);
    const lifecycleChanged =
      nextReviewDate?.getTime() !== current.nextReviewDate?.getTime() ||
      (parsed.classification !== undefined && parsed.classification !== current.classification) ||
      (parsed.ownerUserId !== undefined && parsed.ownerUserId !== current.ownerUserId);

    if (changedFields.length === 0 && !lifecycleChanged) {
      return this.buildDetail(actor, organizationId, current, template);
    }

    const progress = calculateDocumentProgress(template, payload);
    const overdue = Boolean(nextReviewDate && nextReviewDate < new Date());
    const status = documentStatusFromProgress(progress.percentage, { overdue });

    const updated = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${documentId}))`;
        const fresh = await tx.document.findFirst({ where: { id: documentId, organizationId } });
        if (!fresh) {
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
        }
        this.assertWritable(fresh, actor);
        if (fresh.currentRevisionNo !== parsed.expectedRevisionNo) {
          throw new ConflictException({
            code: 'DOCUMENT_CONFLICT',
            message: 'This document was changed by someone else. Reload before saving.',
            details: { currentRevisionNo: fresh.currentRevisionNo },
          });
        }

        const nextRevision = fresh.currentRevisionNo + 1;
        const saved = await tx.document.update({
          where: { id: documentId },
          data: {
            payload: payload as Prisma.InputJsonValue,
            progress: progress.percentage,
            status,
            templateVersion: template.version,
            currentRevisionNo: nextRevision,
            classification: parsed.classification,
            nextReviewDate,
            ownerUserId: parsed.ownerUserId === undefined ? fresh.ownerUserId : parsed.ownerUserId,
            lastEditedById: actor.userId,
          },
          include: { template: true },
        });

        await tx.documentRevision.create({
          data: {
            organizationId,
            documentId,
            revisionNo: nextRevision,
            templateVersion: template.version,
            payload: payload as Prisma.InputJsonValue,
            changedFields: { fields: changedFields } as Prisma.InputJsonValue,
            changeNote: parsed.changeNote,
            createdById: actor.userId,
          },
        });

        await this.audit.recordWith(tx, {
          action: 'DOCUMENT_SAVED',
          actorUserId: actor.userId,
          actorRole: actor.globalRole,
          organizationId,
          resourceType: 'document',
          resourceId: documentId,
          metadata: {
            revisionNo: nextRevision,
            progress: progress.percentage,
            changedFields,
            templateKey: template.key,
          },
          ip: actor.ip,
          userAgent: actor.userAgent,
          correlationId: actor.correlationId,
        });

        return saved;
      },
    );

    return this.buildDetail(actor, organizationId, updated, template);
  }

  async lock(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetail> {
    await this.requireMember(actor, organizationId);
    const document = await this.findDocument(actor, organizationId, documentId);
    this.assertWritable(document, actor);
    const expiresAt = new Date(Date.now() + LOCK_MINUTES * 60_000);
    const updated = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${documentId}))`;
        const fresh = await tx.document.findFirst({ where: { id: documentId, organizationId } });
        if (!fresh)
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
        this.assertWritable(fresh, actor);
        return tx.document.update({
          where: { id: documentId },
          data: {
            lockOwnerId: actor.userId,
            lockExpiresAt: expiresAt,
            updatedAt: fresh.updatedAt,
          },
          include: { template: true },
        });
      },
    );
    return this.buildDetail(actor, organizationId, updated, this.parseTemplate(updated.template));
  }

  async unlock(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetail> {
    await this.requireMember(actor, organizationId);
    const document = await this.findDocument(actor, organizationId, documentId);
    if (document.lockOwnerId && document.lockOwnerId !== actor.userId) {
      throw new ConflictException({
        code: 'DOCUMENT_LOCKED',
        message: 'This document is locked by another user',
      });
    }
    const updated = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${documentId}))`;
        const fresh = await tx.document.findFirst({ where: { id: documentId, organizationId } });
        if (!fresh)
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
        return tx.document.update({
          where: { id: documentId },
          data: { lockOwnerId: null, lockExpiresAt: null, updatedAt: fresh.updatedAt },
          include: { template: true },
        });
      },
    );
    return this.buildDetail(actor, organizationId, updated, this.parseTemplate(updated.template));
  }

  async revisions(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
  ): Promise<DocumentRevisionSummary[]> {
    await this.requireMember(actor, organizationId);
    await this.findDocument(actor, organizationId, documentId);
    const revisions = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) =>
        tx.documentRevision.findMany({
          where: { documentId, organizationId },
          include: { createdBy: true },
          orderBy: { revisionNo: 'desc' },
        }),
    );
    return revisions.map((revision) => this.revisionSummary(revision));
  }

  async revision(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
    revisionNo: number,
  ): Promise<DocumentRevisionDetail> {
    await this.requireMember(actor, organizationId);
    const revision = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.documentRevision.findUnique({
        where: { documentId_revisionNo: { documentId, revisionNo } },
        include: { createdBy: true },
      }),
    );
    if (!revision || revision.organizationId !== organizationId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Revision not found' });
    }
    return {
      ...this.revisionSummary(revision),
      payload: this.payloadObject(revision.payload),
    };
  }

  async restore(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
    revisionNo: number,
    changeNote?: string,
  ): Promise<DocumentDetail> {
    await this.requireMember(actor, organizationId);
    const current = await this.findDocument(actor, organizationId, documentId);
    this.assertWritable(current, actor);
    const template = this.parseTemplate(current.template);
    const target = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.documentRevision.findUnique({
        where: { documentId_revisionNo: { documentId, revisionNo } },
      }),
    );
    if (!target || target.organizationId !== organizationId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Revision not found' });
    }

    const targetPayload = this.payloadObject(target.payload);
    const previous = this.payloadOf(current);
    const changedFields = diffDocumentPayloads(template, previous, targetPayload);
    const progress = calculateDocumentProgress(template, targetPayload);
    const overdue = Boolean(current.nextReviewDate && current.nextReviewDate < new Date());
    const status = documentStatusFromProgress(progress.percentage, { overdue });

    const updated = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${documentId}))`;
        const fresh = await tx.document.findFirst({ where: { id: documentId, organizationId } });
        if (!fresh)
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
        this.assertWritable(fresh, actor);
        const nextRevision = fresh.currentRevisionNo + 1;
        const saved = await tx.document.update({
          where: { id: documentId },
          data: {
            payload: targetPayload as Prisma.InputJsonValue,
            progress: progress.percentage,
            status,
            currentRevisionNo: nextRevision,
            templateVersion: template.version,
            lastEditedById: actor.userId,
          },
          include: { template: true },
        });
        await tx.documentRevision.create({
          data: {
            organizationId,
            documentId,
            revisionNo: nextRevision,
            templateVersion: template.version,
            payload: targetPayload as Prisma.InputJsonValue,
            changedFields: { fields: changedFields } as Prisma.InputJsonValue,
            changeNote: changeNote ?? `Restored from revision ${revisionNo}`,
            createdById: actor.userId,
          },
        });
        await this.audit.recordWith(tx, {
          action: 'DOCUMENT_RESTORED',
          actorUserId: actor.userId,
          actorRole: actor.globalRole,
          organizationId,
          resourceType: 'document',
          resourceId: documentId,
          metadata: { restoredRevisionNo: revisionNo, revisionNo: nextRevision },
          ip: actor.ip,
          userAgent: actor.userAgent,
          correlationId: actor.correlationId,
        });
        return saved;
      },
    );

    return this.buildDetail(actor, organizationId, updated, template);
  }

  async versions(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
  ): Promise<SharedDocumentVersion[]> {
    await this.requireMember(actor, organizationId);
    await this.findDocument(actor, organizationId, documentId);
    const versions = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.documentVersion.findMany({
        where: { documentId, organizationId },
        include: { approvals: { include: { approver: true } }, createdBy: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return versions.map((version) => this.versionSummary(version));
  }

  async publishVersion(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
    input: unknown,
  ): Promise<DocumentDetail> {
    await this.requireMember(actor, organizationId);
    const parsed = documentVersionInputSchema.parse(input);
    const current = await this.findDocument(actor, organizationId, documentId);
    this.assertWritable(current, actor);
    if (current.currentRevisionNo < 1) {
      throw new BadRequestException({
        code: 'DOCUMENT_NOT_SAVED',
        message: 'Save the document before publishing a version',
      });
    }
    const existing = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.documentVersion.findUnique({
        where: { documentId_versionLabel: { documentId, versionLabel: parsed.versionLabel } },
      }),
    );
    if (existing) {
      throw new ConflictException({
        code: 'VERSION_EXISTS',
        message: `Version ${parsed.versionLabel} already exists`,
      });
    }

    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const version = await tx.documentVersion.create({
        data: {
          organizationId,
          documentId,
          versionLabel: parsed.versionLabel,
          revisionNo: current.currentRevisionNo,
          status: 'DRAFT',
          createdById: actor.userId,
        },
      });
      await tx.document.update({
        where: { id: documentId },
        data: { currentVersionLabel: parsed.versionLabel },
      });
      await this.audit.recordWith(tx, {
        action: 'DOCUMENT_VERSION_PUBLISHED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'document_version',
        resourceId: version.id,
        metadata: {
          documentId,
          versionLabel: parsed.versionLabel,
          revisionNo: current.currentRevisionNo,
          changeNote: parsed.changeNote,
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });

    return this.detail(actor, organizationId, documentId);
  }

  async approveVersion(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
    versionId: string,
    input: unknown,
  ): Promise<DocumentDetail> {
    await this.requireMember(actor, organizationId);
    const parsed = documentApprovalInputSchema.parse(input);
    const current = await this.findDocument(actor, organizationId, documentId);
    this.assertWritable(current, actor);
    const version = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.documentVersion.findFirst({
        where: { id: versionId, documentId, organizationId },
      }),
    );
    if (!version) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Version not found' });
    }

    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await tx.approval.create({
        data: {
          organizationId,
          documentVersionId: versionId,
          approverUserId: actor.userId,
          role: parsed.role,
          comment: parsed.comment,
          signature: parsed.signature as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.documentVersion.updateMany({
        where: { documentId, status: 'APPROVED', id: { not: versionId } },
        data: { status: 'SUPERSEDED' },
      });
      await tx.documentVersion.update({
        where: { id: versionId },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });
      await tx.document.update({
        where: { id: documentId },
        data: {
          currentVersionLabel: version.versionLabel,
          lastEditedById: actor.userId,
        },
      });
      await this.audit.recordWith(tx, {
        action: 'DOCUMENT_VERSION_APPROVED',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'document_version',
        resourceId: versionId,
        metadata: {
          documentId,
          versionLabel: version.versionLabel,
          revisionNo: version.revisionNo,
          role: parsed.role ?? null,
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    });

    return this.detail(actor, organizationId, documentId);
  }

  private async buildDetail(
    actor: DocumentActor,
    organizationId: string,
    document: DocumentWithTemplate,
    template: SharedDocumentTemplate,
  ): Promise<DocumentDetail> {
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const [revisions, versions, owner, lastEditor, profile, lockOwner] = await Promise.all([
        tx.documentRevision.findMany({
          where: { documentId: document.id, organizationId },
          include: { createdBy: true },
          orderBy: { revisionNo: 'desc' },
          take: 50,
        }),
        tx.documentVersion.findMany({
          where: { documentId: document.id, organizationId },
          include: { approvals: { include: { approver: true } }, createdBy: true },
          orderBy: { createdAt: 'desc' },
        }),
        document.ownerUserId
          ? tx.user.findUnique({ where: { id: document.ownerUserId } })
          : Promise.resolve(null),
        document.lastEditedById
          ? tx.user.findUnique({ where: { id: document.lastEditedById } })
          : Promise.resolve(null),
        tx.companyProfile.findUnique({ where: { organizationId } }),
        document.lockOwnerId
          ? tx.user.findUnique({ where: { id: document.lockOwnerId } })
          : Promise.resolve(null),
      ]);

      const payload = this.payloadOf(document);
      let progress: DocumentProgress;
      try {
        progress = documentProgressSchema.parse(calculateDocumentProgress(template, payload));
      } catch (error) {
        this.logger.warn(`Progress calculation failed for ${document.id}: ${String(error)}`);
        progress = calculateDocumentProgress(template, payload);
      }
      const overdue = Boolean(document.nextReviewDate && document.nextReviewDate < new Date());
      const templateChanged = document.templateVersion !== template.version;
      const status = documentStatusFromProgress(progress.percentage, { overdue, templateChanged });
      const lockActive = Boolean(document.lockExpiresAt && document.lockExpiresAt > new Date());
      const ownedByMe = Boolean(lockActive && document.lockOwnerId === actor.userId);

      return documentDetailSchema.parse({
        id: document.id,
        organizationId,
        templateKey: template.key,
        templateVersion: template.version,
        status,
        classification: document.classification,
        payload,
        progress,
        currentRevisionNo: document.currentRevisionNo,
        currentVersionLabel: document.currentVersionLabel,
        nextReviewDate: document.nextReviewDate?.toISOString() ?? null,
        ownerUserId: document.ownerUserId,
        ownerName: owner ? displayName(owner) : null,
        lastEditedAt: document.updatedAt.toISOString(),
        lastEditedByName: lastEditor ? displayName(lastEditor) : null,
        createdAt: document.createdAt.toISOString(),
        template,
        lock: {
          ownedByMe,
          ownerName: lockActive && lockOwner ? displayName(lockOwner) : null,
          expiresAt: lockActive ? (document.lockExpiresAt?.toISOString() ?? null) : null,
        },
        revisions: revisions.map((revision) => this.revisionSummary(revision)),
        versions: versions.map((version) => this.versionSummary(version)),
        profile: profile ? this.profileSummary(profile) : null,
      });
    });
  }

  private assertWritable(document: Document, actor: DocumentActor): void {
    if (
      document.lockOwnerId &&
      document.lockOwnerId !== actor.userId &&
      document.lockExpiresAt &&
      document.lockExpiresAt > new Date()
    ) {
      throw new ConflictException({
        code: 'DOCUMENT_LOCKED',
        message: 'This document is locked by another user',
      });
    }
  }

  private async requireMember(
    actor: DocumentActor,
    organizationId: string,
  ): Promise<MemberContext> {
    const result = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      const organization = await tx.organization.findUnique({ where: { id: organizationId } });
      const membership = await tx.membership.findFirst({
        where: { organizationId, userId: actor.userId },
      });
      return { organization, membership };
    });
    if (!result.organization) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Organization not found' });
    }
    if (!result.membership) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this organization',
      });
    }
    return {
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        jurisdictionPackCode: result.organization.jurisdictionPackCode,
      },
      membership: { role: result.membership.role },
    };
  }

  private async findDocument(
    actor: DocumentActor,
    organizationId: string,
    documentId: string,
  ): Promise<DocumentWithTemplate> {
    const document = await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.document.findFirst({
        where: { id: documentId, organizationId },
        include: { template: true },
      }),
    );
    if (!document) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
    }
    return document;
  }

  private findDocumentByKey(
    actor: DocumentActor,
    organizationId: string,
    templateKey: string,
  ): Promise<DocumentWithTemplate | null> {
    return this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) =>
      tx.document.findFirst({
        where: { organizationId, template: { key: templateKey } },
        include: { template: true },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  private parseTemplate(record: DocumentTemplate): SharedDocumentTemplate {
    const parsed = documentTemplateSchema.safeParse(record.schema);
    if (parsed.success) return parsed.data;
    this.logger.warn(
      `Template ${record.key}@${record.version} is invalid: ${parsed.error.message}`,
    );
    throw new ServiceUnavailableException({
      code: 'DOCUMENT_TEMPLATE_INVALID',
      message: `Document template ${record.key} is invalid`,
    });
  }

  private payloadOf(document: Document): DocumentPayload {
    return this.payloadObject(document.payload);
  }

  private payloadObject(value: Prisma.JsonValue): DocumentPayload {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as DocumentPayload;
    }
    return {};
  }

  private requiredRemaining(document: DocumentWithTemplate): number {
    const template = this.parseTemplate(document.template);
    return calculateDocumentProgress(template, this.payloadOf(document)).requiredRemaining;
  }

  private revisionSummary(revision: RevisionWithAuthor): DocumentRevisionSummary {
    return {
      id: revision.id,
      revisionNo: revision.revisionNo,
      templateVersion: revision.templateVersion,
      changeNote: revision.changeNote,
      changedFields: this.changedFields(revision.changedFields),
      createdById: revision.createdById,
      createdByName: revision.createdBy ? displayName(revision.createdBy) : null,
      createdAt: revision.createdAt.toISOString(),
    };
  }

  private versionSummary(version: VersionWithRelations): SharedDocumentVersion {
    return {
      id: version.id,
      versionLabel: version.versionLabel,
      revisionNo: version.revisionNo,
      status: version.status,
      approvedAt: version.approvedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      createdByName: version.createdBy ? displayName(version.createdBy) : null,
      approvals: version.approvals.map((approval) => this.approvalSummary(approval)),
    };
  }

  private approvalSummary(approval: Approval & { approver: User }): DocumentApproval {
    return {
      id: approval.id,
      approverUserId: approval.approverUserId,
      approverName: displayName(approval.approver),
      role: approval.role,
      comment: approval.comment,
      signature: approval.signature,
      createdAt: approval.createdAt.toISOString(),
    };
  }

  private changedFields(value: Prisma.JsonValue | null): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const fields = (value as { fields?: unknown }).fields;
    return Array.isArray(fields)
      ? fields.filter((field): field is string => typeof field === 'string')
      : [];
  }

  private profileSummary(profile: CompanyProfile): CompanyProfileSummary {
    const contactPoints = Array.isArray(profile.contactPoints) ? profile.contactPoints : [];
    const firstContact = contactPoints.find(
      (entry): entry is { email: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { email?: unknown }).email === 'string',
    );
    return {
      legalName: profile.legalName,
      registrationNumber: profile.registrationNumber,
      vatNumber: profile.vatNumber,
      city: profile.city,
      countryCode: profile.countryCode,
      website: profile.website,
      dpoName: jsonName(profile.dpo),
      cisoName: jsonName(profile.ciso),
      contactEmail: firstContact?.email ?? null,
    };
  }

  private prefillProfile(
    organizationName: string,
    profile: CompanyProfile | null,
  ): Record<string, unknown> {
    if (!profile) return { legalName: organizationName, countryCode: 'RO' };
    return {
      legalName: profile.legalName,
      registrationNumber: profile.registrationNumber,
      vatNumber: profile.vatNumber,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      county: profile.county,
      postalCode: profile.postalCode,
      countryCode: profile.countryCode,
      website: profile.website,
      sector: profile.sector,
      employeeCount: profile.employeeCount,
      contactEmail: this.profileSummary(profile).contactEmail,
      dpo: profile.dpo,
      ciso: profile.ciso,
      managementBody: profile.managementBody,
    };
  }
}

function displayName(user: Pick<User, 'givenName' | 'familyName' | 'email'>): string {
  const name = `${user.givenName} ${user.familyName}`.trim();
  return name.length > 0 ? name : user.email;
}

function jsonName(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.trim().length > 0 ? name : null;
}
