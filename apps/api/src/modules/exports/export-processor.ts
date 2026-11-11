import type { CompanyProfile, DocumentTemplate, Organization, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import JSZip from 'jszip';
import type { Logger } from 'pino';
import type { ObjectStorage } from '../../common/storage/storage.service';
import { buildComplianceModel, buildDocumentExportModel, type ExportLogo } from './export-model';
import { renderComplianceDocx, renderDocumentDocx } from './export-docx';
import { renderCompliancePdf, renderDocumentPdf } from './export-pdf';

export interface ExportJobData {
  exportJobId: string;
  organizationId: string;
}

type DocumentWithRelations = Prisma.DocumentGetPayload<{
  include: {
    template: true;
    revisions: { include: { createdBy: true } };
    versions: { include: { createdBy: true; approvals: { include: { approver: true } } } };
  };
}>;

export async function processExportJob(
  prisma: PrismaClient,
  storage: ObjectStorage,
  logger: Logger,
  data: ExportJobData,
): Promise<void> {
  const job = await withTenant(prisma, data.organizationId, (tx) =>
    tx.exportJob.findFirst({
      where: { id: data.exportJobId, organizationId: data.organizationId },
      include: { organization: true },
    }),
  );
  if (!job) throw new Error(`Export job ${data.exportJobId} not found`);
  if (job.status === 'READY') return;

  await withTenant(prisma, data.organizationId, (tx) =>
    tx.exportJob.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', errorMessage: null },
    }),
  );

  try {
    const organization = job.organization;
    const profile = await withTenant(prisma, data.organizationId, (tx) =>
      tx.companyProfile.findUnique({ where: { organizationId: data.organizationId } }),
    );
    const logo = await loadLogo(storage, organization);
    const locale = exportLocale(job.entityIds);

    let content: Buffer;
    let filename: string;
    let contentType: string;

    if (job.type === 'ZIP') {
      const bundle = await buildZip(prisma, logger, organization, profile, logo, locale);
      content = bundle.content;
      filename = bundle.filename;
      contentType = 'application/zip';
    } else if (job.type === 'COMPLIANCE_SUMMARY') {
      const format = exportFormat(job.entityIds);
      const templates = await withTenant(prisma, data.organizationId, (tx) =>
        tx.documentTemplate.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      );
      const documents = await withTenant(prisma, data.organizationId, (tx) =>
        tx.document.findMany({
          where: { organizationId: data.organizationId },
          include: { template: true },
        }),
      );
      const latestRun = await withTenant(prisma, data.organizationId, (tx) =>
        tx.classificationRun.findFirst({
          where: { organizationId: data.organizationId },
          orderBy: { version: 'desc' },
        }),
      );
      const model = buildComplianceModel({
        organization,
        profile,
        templates,
        documents,
        latestRun,
        logo,
        locale,
      });
      content =
        format === 'DOCX' ? await renderComplianceDocx(model) : await renderCompliancePdf(model);
      filename = `nis2-compliance-summary-${dateStamp()}.${format === 'DOCX' ? 'docx' : 'pdf'}`;
      contentType =
        format === 'DOCX'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf';
    } else {
      const document = await loadDocument(prisma, data.organizationId, job.entityId);
      if (!document) throw new Error('Document not found for export');
      const model = buildDocumentExportModel({
        document,
        organization,
        profile,
        revisions: document.revisions,
        versions: document.versions,
        logo,
        locale,
      });
      const format = job.type;
      content =
        format === 'DOCX' ? await renderDocumentDocx(model) : await renderDocumentPdf(model);
      const versionPart = model.versionLabel === '—' ? 'draft' : safeFilename(model.versionLabel);
      filename = `${safeFilename(model.templateKey)}-v${versionPart}.${format === 'DOCX' ? 'docx' : 'pdf'}`;
      contentType =
        format === 'DOCX'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf';
    }

    const storageKey = `org/${data.organizationId}/exports/${job.id}/${filename}`;
    await storage.putObject(storageKey, content, contentType);
    await withTenant(prisma, data.organizationId, (tx) =>
      tx.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'READY',
          storageKey,
          completedAt: new Date(),
          errorMessage: null,
        },
      }),
    );
    await recordAudit(prisma, data.organizationId, 'EXPORT_READY', job.id, {
      type: job.type,
      filename,
      sizeBytes: content.length,
    });
    logger.info({ exportJobId: job.id, type: job.type, filename }, 'export ready');
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Export failed';
    await withTenant(prisma, data.organizationId, (tx) =>
      tx.exportJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: message, completedAt: new Date() },
      }),
    );
    await recordAudit(prisma, data.organizationId, 'EXPORT_FAILED', job.id, { message });
    logger.error({ err: error, exportJobId: job.id }, 'export failed');
    throw error;
  }
}

async function buildZip(
  prisma: PrismaClient,
  logger: Logger,
  organization: Organization,
  profile: CompanyProfile | null,
  logo: ExportLogo | null,
  locale: 'en' | 'ro',
): Promise<{ content: Buffer; filename: string }> {
  const templates = await withTenant(prisma, organization.id, (tx) =>
    tx.documentTemplate.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
  );
  const documents = await withTenant(prisma, organization.id, (tx) =>
    tx.document.findMany({
      where: { organizationId: organization.id },
      include: {
        template: true,
        revisions: { include: { createdBy: true }, orderBy: { revisionNo: 'desc' }, take: 50 },
        versions: {
          include: { createdBy: true, approvals: { include: { approver: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
  );
  const documentsByKey = new Map<string, DocumentWithRelations>();
  for (const document of documents) {
    if (!documentsByKey.has(document.template.key))
      documentsByKey.set(document.template.key, document);
  }

  const zip = new JSZip();
  for (const template of templates) {
    const document = documentsByKey.get(template.key) ?? emptyDocument(organization.id, template);
    const model = buildDocumentExportModel({
      document,
      organization,
      profile,
      revisions: document.revisions,
      versions: document.versions,
      logo,
      locale,
    });
    const base = safeFilename(template.key);
    zip.file(`documents/${base}.docx`, await renderDocumentDocx(model));
    zip.file(`documents/${base}.pdf`, await renderDocumentPdf(model));
    logger.info({ templateKey: template.key }, 'bundled document export');
  }

  const latestRun = await withTenant(prisma, organization.id, (tx) =>
    tx.classificationRun.findFirst({
      where: { organizationId: organization.id },
      orderBy: { version: 'desc' },
    }),
  );
  const summary = buildComplianceModel({
    organization,
    profile,
    templates,
    documents,
    latestRun,
    logo,
    locale,
  });
  zip.file(`compliance-summary.pdf`, await renderCompliancePdf(summary));
  zip.file(`compliance-summary.docx`, await renderComplianceDocx(summary));
  zip.file(
    'README.txt',
    [
      'NIS2 Compass document bundle',
      `Organization: ${organization.name}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      summary.disclaimer,
      summary.legalReviewNotice,
      '',
      'The compliance summary lists outstanding required documents.',
    ].join('\n'),
  );

  return {
    content: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    filename: `nis2-documents-${dateStamp()}.zip`,
  };
}

async function loadDocument(
  prisma: PrismaClient,
  organizationId: string,
  documentId: string | null,
): Promise<DocumentWithRelations | null> {
  if (!documentId) return null;
  return withTenant(prisma, organizationId, (tx) =>
    tx.document.findFirst({
      where: { id: documentId, organizationId },
      include: {
        template: true,
        revisions: { include: { createdBy: true }, orderBy: { revisionNo: 'desc' }, take: 50 },
        versions: {
          include: { createdBy: true, approvals: { include: { approver: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
  );
}

async function loadLogo(
  storage: ObjectStorage,
  organization: Organization,
): Promise<ExportLogo | null> {
  if (!organization.logoKey || !storage.isConfigured()) return null;
  try {
    const object = await storage.getObject(organization.logoKey);
    const data = await streamToBuffer(object.body);
    return {
      data,
      mimeType: object.contentType ?? 'image/png',
    };
  } catch {
    return null;
  }
}

function emptyDocument(organizationId: string, template: DocumentTemplate): DocumentWithRelations {
  const now = new Date();
  return {
    id: `draft-${template.key}`,
    organizationId,
    templateId: template.id,
    templateVersion: template.version,
    status: 'NOT_STARTED',
    classification: 'INTERNAL',
    payload: {},
    progress: 0,
    currentRevisionNo: 0,
    currentVersionLabel: null,
    nextReviewDate: null,
    ownerUserId: null,
    lastEditedById: null,
    lockOwnerId: null,
    lockExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    template,
    revisions: [],
    versions: [],
  };
}

function exportLocale(value: Prisma.JsonValue | null): 'en' | 'ro' {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const locale = (value as { locale?: unknown }).locale;
    if (locale === 'ro') return 'ro';
  }
  return 'en';
}

function exportFormat(value: Prisma.JsonValue | null): 'DOCX' | 'PDF' {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const format = (value as { format?: unknown }).format;
    if (format === 'DOCX') return 'DOCX';
  }
  return 'PDF';
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'document';
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(chunk as ArrayBuffer));
    }
  }
  return Buffer.concat(chunks);
}

function withTenant<T>(
  prisma: PrismaClient,
  organizationId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return callback(tx);
  });
}

async function recordAudit(
  prisma: PrismaClient,
  organizationId: string,
  action: string,
  resourceId: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  await withTenant(prisma, organizationId, (tx) =>
    tx.auditLog.create({
      data: {
        action,
        organizationId,
        resourceType: 'export_job',
        resourceId,
        metadata,
      },
    }),
  );
}
