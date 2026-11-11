import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type {
  ClassificationRun as PrismaClassificationRun,
  Membership,
  Organization,
  Prisma,
} from '@prisma/client';
import {
  calculateEnterpriseSize,
  classificationAnswersSchema,
  classificationConfidenceSchema,
  classificationConsequenceSchema,
  classificationPackSchema,
  classificationResultSchema,
  ClassificationInputError,
  classify,
  documentApplicabilitySchema,
  getClassificationPack,
  hasSizeIndependentCriteria,
  legalCitationSchema,
  normalizeSizeIndependentCriteria,
  resolveSelection,
  type ClassificationAnswers,
  type ClassificationCatalog,
  type ClassificationPack,
  type ClassificationRun,
  type ClassificationRunSummary,
} from '@nis2/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { renderClassificationPdf } from './classification.pdf';

export interface ClassificationActor {
  userId: string;
  globalRole: 'USER' | 'ADMIN';
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

interface MemberContext {
  organization: Organization;
  membership: Membership;
}

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async catalog(
    actor: ClassificationActor,
    organizationId: string,
  ): Promise<ClassificationCatalog> {
    const { organization } = await this.requireMember(actor, organizationId);
    const pack = await this.activePack(organization.jurisdictionPackCode);
    return {
      pack: {
        code: pack.code,
        version: pack.version,
        name: pack.name,
        authority: pack.authority,
        authorityUrl: pack.authorityUrl,
        legalInstrument: pack.legalInstrument,
        status: pack.status,
        updatedAt: pack.updatedAt,
      },
      sectors: pack.sectors,
      sizeRules: pack.sizeRules,
    };
  }

  async current(
    actor: ClassificationActor,
    organizationId: string,
  ): Promise<ClassificationRun | null> {
    await this.requireMember(actor, organizationId);
    const run = await this.latestRun(organizationId);
    if (!run) return null;
    return this.toRun(run, await this.packForRun(run));
  }

  async list(
    actor: ClassificationActor,
    organizationId: string,
  ): Promise<ClassificationRunSummary[]> {
    await this.requireMember(actor, organizationId);
    const runs = await this.prisma.classificationRun.findMany({
      where: { organizationId },
      orderBy: { version: 'desc' },
      take: 25,
    });
    return Promise.all(
      runs.map(async (run) => {
        const detailed = this.toRun(run, await this.packForRun(run));
        return {
          id: detailed.id,
          organizationId: detailed.organizationId,
          version: detailed.version,
          result: detailed.result,
          confidence: detailed.confidence,
          jurisdictionPackCode: detailed.jurisdictionPackCode,
          jurisdictionPackVersion: detailed.jurisdictionPackVersion,
          createdAt: detailed.createdAt,
          summary: detailed.summary,
        };
      }),
    );
  }

  async detail(
    actor: ClassificationActor,
    organizationId: string,
    runId: string,
  ): Promise<ClassificationRun> {
    await this.requireMember(actor, organizationId);
    const run = await this.prisma.classificationRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Classification run not found' });
    return this.toRun(run, await this.packForRun(run));
  }

  async create(
    actor: ClassificationActor,
    organizationId: string,
    input: ClassificationAnswers,
  ): Promise<ClassificationRun> {
    const { organization } = await this.requireMember(actor, organizationId);
    const answers = classificationAnswersSchema.parse(input);
    const pack = await this.activePack(organization.jurisdictionPackCode);
    let computation: ReturnType<typeof classify>;
    try {
      computation = classify(pack, answers);
    } catch (error) {
      if (error instanceof ClassificationInputError) {
        throw new BadRequestException({
          code: 'CLASSIFICATION_INPUT_INVALID',
          message: error.message,
        });
      }
      throw error;
    }

    const created = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
        const latest = await tx.classificationRun.findFirst({
          where: { organizationId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (latest?.version ?? 0) + 1;

        const run = await tx.classificationRun.create({
          data: {
            organizationId,
            version,
            inputs: answers as unknown as Prisma.InputJsonValue,
            result: computation.outcome as $Enums.ClassificationResult,
            confidence: computation.confidence,
            ruleId: computation.ruleId,
            reasonKey: computation.reasonKey,
            legalBasis: computation.legalBasis as unknown as Prisma.InputJsonValue,
            consequences: computation.consequences as unknown as Prisma.InputJsonValue,
            applicability: computation.documents as unknown as Prisma.InputJsonValue,
            jurisdictionPackCode: pack.code,
            jurisdictionPackVersion: pack.version,
            createdById: actor.userId,
          },
        });

        await tx.companyProfile.upsert({
          where: { organizationId },
          update: {
            sector: answers.sectorCode,
            subsector: answers.subsectorCode,
            employeeCount: Math.round(computation.size.total.employees),
            annualTurnoverEur: computation.size.total.annualTurnoverEur,
            balanceSheetTotalEur: computation.size.total.balanceSheetTotalEur,
            partnerEnterprises: answers.size.partners as unknown as Prisma.InputJsonValue,
            linkedEnterprises: answers.size.linkedEnterprises as unknown as Prisma.InputJsonValue,
          },
          create: {
            organizationId,
            legalName: organization.name,
            countryCode: organization.countryCode,
            sector: answers.sectorCode,
            subsector: answers.subsectorCode,
            employeeCount: Math.round(computation.size.total.employees),
            annualTurnoverEur: computation.size.total.annualTurnoverEur,
            balanceSheetTotalEur: computation.size.total.balanceSheetTotalEur,
            partnerEnterprises: answers.size.partners as unknown as Prisma.InputJsonValue,
            linkedEnterprises: answers.size.linkedEnterprises as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.organization.update({
          where: { id: organizationId },
          data: { scopeMode: computation.outcome === 'OUT_OF_SCOPE' ? 'VOLUNTARY' : 'MANDATORY' },
        });

        await this.audit.recordWith(tx, {
          action: 'CLASSIFICATION_RUN_CREATED',
          actorUserId: actor.userId,
          actorRole: actor.globalRole,
          organizationId,
          resourceType: 'classification_run',
          resourceId: run.id,
          metadata: {
            version,
            result: computation.outcome,
            ruleId: computation.ruleId,
            jurisdictionPackCode: pack.code,
            jurisdictionPackVersion: pack.version,
          },
          ip: actor.ip,
          userAgent: actor.userAgent,
          correlationId: actor.correlationId,
        });

        return run;
      },
    );

    return this.toRun(created, pack);
  }

  async renderPdf(
    actor: ClassificationActor,
    organizationId: string,
    runId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const { organization } = await this.requireMember(actor, organizationId);
    const run = await this.prisma.classificationRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Classification run not found' });
    const pack = await this.packForRun(run);
    const detailed = this.toRun(run, pack);
    const buffer = await renderClassificationPdf(detailed, {
      organizationName: organization.name,
      packStatus: pack.status,
      generatedAt: new Date(),
    });
    return {
      filename: `nis2-classification-v${detailed.version}.pdf`,
      buffer,
    };
  }

  private async latestRun(organizationId: string): Promise<PrismaClassificationRun | null> {
    return this.prisma.classificationRun.findFirst({
      where: { organizationId },
      orderBy: { version: 'desc' },
    });
  }

  private async requireMember(
    actor: ClassificationActor,
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
    return { organization: result.organization, membership: result.membership };
  }

  private async activePack(code: string): Promise<ClassificationPack> {
    const record = await this.prisma.jurisdictionPack.findFirst({
      where: { code, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (record) {
      const parsed = classificationPackSchema.safeParse(record.content);
      if (parsed.success) return parsed.data;
      this.logger.warn(
        `Active ${code} pack ${record.version} is invalid (${parsed.error.message}); using the bundled copy.`,
      );
    }

    const fallback = getClassificationPack(code);
    if (fallback) {
      this.logger.warn(
        `No active ${code} pack in the database; using the bundled ${fallback.version} pack. Run the seed.`,
      );
      return fallback;
    }

    throw new ServiceUnavailableException({
      code: 'CLASSIFICATION_PACK_UNAVAILABLE',
      message: `No active classification pack for ${code}`,
    });
  }

  private async packForRun(run: PrismaClassificationRun): Promise<ClassificationPack> {
    const record = await this.prisma.jurisdictionPack.findUnique({
      where: {
        code_version: {
          code: run.jurisdictionPackCode,
          version: run.jurisdictionPackVersion,
        },
      },
    });
    if (record) {
      const parsed = classificationPackSchema.safeParse(record.content);
      if (parsed.success) return parsed.data;
      this.logger.warn(
        `Pinned ${run.jurisdictionPackCode}@${run.jurisdictionPackVersion} content is invalid; using the active pack.`,
      );
    }
    return this.activePack(run.jurisdictionPackCode);
  }

  private toRun(run: PrismaClassificationRun, pack: ClassificationPack): ClassificationRun {
    const inputs = classificationAnswersSchema.parse(run.inputs);
    const result = classificationResultSchema.parse(run.result);
    const selection = resolveSelection(pack, inputs);
    const size = calculateEnterpriseSize(inputs.size, pack.sizeRules);
    size.sizeIndependent = hasSizeIndependentCriteria(
      normalizeSizeIndependentCriteria(inputs.sizeIndependent, selection),
    );
    const applicability = z.array(documentApplicabilitySchema).parse(run.applicability ?? []);
    const consequences = run.consequences
      ? classificationConsequenceSchema.parse(run.consequences)
      : pack.consequences[result];
    if (!consequences) {
      throw new BadRequestException({
        code: 'CLASSIFICATION_DATA_INVALID',
        message: 'Stored classification run has no consequences',
      });
    }

    return {
      id: run.id,
      organizationId: run.organizationId,
      version: run.version,
      result,
      confidence: classificationConfidenceSchema.parse(run.confidence ?? 'high'),
      jurisdictionPackCode: run.jurisdictionPackCode,
      jurisdictionPackVersion: run.jurisdictionPackVersion,
      createdAt: run.createdAt.toISOString(),
      summary: {
        sectorName: selection.sectorName,
        subsectorName: selection.subsectorName,
        entityTypeName: selection.entityTypeName,
        establishmentCountries: inputs.establishmentCountries,
        sizeCategory: size.category,
        employees: Math.round(size.total.employees),
        annualTurnoverEur: size.total.annualTurnoverEur,
        balanceSheetTotalEur: size.total.balanceSheetTotalEur,
      },
      createdById: run.createdById,
      inputs,
      legalBasis: z.array(legalCitationSchema).parse(run.legalBasis),
      consequences,
      applicability,
      selection,
      size,
      ruleId: run.ruleId ?? 'stored',
      reasonKey: run.reasonKey ?? 'classification.reasons.stored',
    };
  }
}
