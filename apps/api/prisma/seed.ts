import { hash } from '@node-rs/argon2';
import { Prisma, PrismaClient, $Enums } from '@prisma/client';
import {
  applyDocumentPrefill,
  calculateDocumentProgress,
  classificationAnswersSchema,
  classify,
  documentStatusFromProgress,
  documentTemplateSchema,
  getClassificationPack,
  getDocumentTemplate,
  getDocumentTemplates,
  type DocumentPayload,
} from '@nis2/shared';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'owner@demo.local';
const DEMO_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? 'Demo!Passw0rd123';

async function main(): Promise<void> {
  const roPack = getClassificationPack('RO');
  if (!roPack) throw new Error('RO classification pack is not available');

  // The pack is versioned data. Deactivate older versions, keep them for
  // reproducibility of historical classification runs.
  await prisma.jurisdictionPack.updateMany({
    where: { code: roPack.code, version: { not: roPack.version } },
    data: { isActive: false },
  });
  await prisma.jurisdictionPack.upsert({
    where: { code_version: { code: roPack.code, version: roPack.version } },
    update: {
      name: roPack.name,
      authority: roPack.authority,
      content: roPack as unknown as Prisma.InputJsonValue,
      isActive: true,
    },
    create: {
      code: roPack.code,
      version: roPack.version,
      name: roPack.name,
      authority: roPack.authority,
      content: roPack as unknown as Prisma.InputJsonValue,
      isActive: true,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-sme' },
    update: {},
    create: {
      name: 'Demo SME SRL',
      slug: 'demo-sme',
      countryCode: 'RO',
      jurisdictionPackCode: 'RO',
      scopeMode: 'MANDATORY',
      companyProfile: {
        create: {
          legalName: 'Demo SME SRL',
          countryCode: 'RO',
          city: 'Bucharest',
          employeeCount: 60,
          annualTurnoverEur: 12_000_000,
          balanceSheetTotalEur: 6_000_000,
        },
      },
    },
  });

  // @node-rs/argon2 defaults to Argon2id.
  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const owner = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      givenName: 'Demo',
      familyName: 'Owner',
      globalRole: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      locale: 'en',
    },
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: owner.id } },
    update: { role: 'OWNER' },
    create: { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
  });

  await prisma.companyProfile.update({
    where: { organizationId: organization.id },
    data: {
      sector: 'ict_service_management',
      subsector: 'managed_services',
      employeeCount: 60,
      annualTurnoverEur: 12_000_000,
      balanceSheetTotalEur: 6_000_000,
    },
  });

  // Data-driven document templates. Older versions stay for reproducibility.
  for (const template of getDocumentTemplates()) {
    const parsed = documentTemplateSchema.parse(template);
    await prisma.documentTemplate.updateMany({
      where: { key: parsed.key, version: { not: parsed.version } },
      data: { isActive: false },
    });
    await prisma.documentTemplate.upsert({
      where: { key_version: { key: parsed.key, version: parsed.version } },
      update: {
        title: parsed.title.en,
        shortDescription: parsed.shortDescription.en,
        category: parsed.category,
        legalReference: parsed.legalReference,
        applicability: parsed.applicability,
        ownerRole: parsed.ownerRole,
        reviewFrequencyMonths: parsed.reviewFrequencyMonths,
        schema: parsed as unknown as Prisma.InputJsonValue,
        isActive: true,
        sortOrder: parsed.sortOrder,
      },
      create: {
        key: parsed.key,
        version: parsed.version,
        title: parsed.title.en,
        shortDescription: parsed.shortDescription.en,
        category: parsed.category,
        legalReference: parsed.legalReference,
        applicability: parsed.applicability,
        ownerRole: parsed.ownerRole,
        reviewFrequencyMonths: parsed.reviewFrequencyMonths,
        schema: parsed as unknown as Prisma.InputJsonValue,
        isActive: true,
        sortOrder: parsed.sortOrder,
      },
    });
  }

  // A seeded, partially completed document so the documentation centre is
  // immediately explorable. Existing user work is never overwritten.
  const demoProfile = await prisma.companyProfile.findUnique({
    where: { organizationId: organization.id },
  });
  const demoTemplate = getDocumentTemplate('governance_registration');
  if (demoTemplate && demoProfile) {
    const templateRow = await prisma.documentTemplate.findUnique({
      where: { key_version: { key: demoTemplate.key, version: demoTemplate.version } },
    });
    if (templateRow) {
      const existingDocument = await prisma.document.findUnique({
        where: {
          organizationId_templateId: {
            organizationId: organization.id,
            templateId: templateRow.id,
          },
        },
      });
      if (!existingDocument) {
        const profileData = {
          legalName: demoProfile.legalName,
          registrationNumber: demoProfile.registrationNumber,
          vatNumber: demoProfile.vatNumber,
          addressLine1: demoProfile.addressLine1,
          city: demoProfile.city,
          countryCode: demoProfile.countryCode,
          website: demoProfile.website,
          contactEmail: null,
          dpo: demoProfile.dpo,
          ciso: demoProfile.ciso,
        };
        const payload = applyDocumentPrefill(
          demoTemplate,
          {},
          profileData as Record<string, unknown>,
        );
        payload.primaryContactName = 'Demo Owner';
        payload.primaryContactEmail = DEMO_EMAIL;
        payload.registrationAuthority = 'DNSC';
        payload.services = [
          {
            service: 'Managed security services',
            description: 'Managed detection and response for SME customers',
            memberState: 'RO',
            criticality: 'High',
          },
        ];
        const nextPayload = payload as DocumentPayload;
        const progress = calculateDocumentProgress(demoTemplate, nextPayload);
        const reviewDate = new Date();
        reviewDate.setMonth(reviewDate.getMonth() + demoTemplate.reviewFrequencyMonths);
        const document = await prisma.document.create({
          data: {
            organizationId: organization.id,
            templateId: templateRow.id,
            templateVersion: demoTemplate.version,
            status: documentStatusFromProgress(progress.percentage),
            payload: nextPayload as Prisma.InputJsonValue,
            progress: progress.percentage,
            currentRevisionNo: 1,
            nextReviewDate: reviewDate,
            ownerUserId: owner.id,
            lastEditedById: owner.id,
          },
        });
        await prisma.documentRevision.create({
          data: {
            organizationId: organization.id,
            documentId: document.id,
            revisionNo: 1,
            templateVersion: demoTemplate.version,
            payload: nextPayload as Prisma.InputJsonValue,
            changedFields: { fields: Object.keys(nextPayload) } as Prisma.InputJsonValue,
            changeNote: 'Initial demo content',
            createdById: owner.id,
          },
        });
      }
    }
  }

  const riskTemplate = getDocumentTemplate('risk_management_policy');
  if (riskTemplate) {
    const templateRow = await prisma.documentTemplate.findUnique({
      where: { key_version: { key: riskTemplate.key, version: riskTemplate.version } },
    });
    if (templateRow) {
      const existingDocument = await prisma.document.findUnique({
        where: {
          organizationId_templateId: {
            organizationId: organization.id,
            templateId: templateRow.id,
          },
        },
      });
      if (!existingDocument) {
        const riskPayload = {
          methodology:
            'ISO/IEC 27005 aligned risk analysis with likelihood and impact scored from 1 to 5.',
          riskCriteria: 'Residual risk above 12 requires management approval before acceptance.',
          reviewCycle: 'Annual and after any significant change',
          riskRegister: [
            {
              asset: 'ERP',
              threat: 'Outage',
              likelihood: '4',
              impact: '4',
              treatment: 'DR site and tested backups',
              owner: 'CISO',
              dueDate: '2026-12-31',
            },
            {
              asset: 'Email',
              threat: 'Phishing',
              likelihood: '5',
              impact: '3',
              treatment: 'MFA and awareness training',
              owner: 'IT',
              dueDate: '2026-12-31',
            },
            {
              asset: 'DNS',
              threat: 'Spoofing',
              likelihood: '3',
              impact: '4',
              treatment: 'DNSSEC and registrar lock',
              owner: 'IT',
              dueDate: '2026-12-31',
            },
          ],
          residualRisk: { likelihood: 2, impact: 3 },
        };
        const progress = calculateDocumentProgress(riskTemplate, riskPayload);
        const reviewDate = new Date();
        reviewDate.setMonth(reviewDate.getMonth() + riskTemplate.reviewFrequencyMonths);
        const document = await prisma.document.create({
          data: {
            organizationId: organization.id,
            templateId: templateRow.id,
            templateVersion: riskTemplate.version,
            status: documentStatusFromProgress(progress.percentage),
            payload: riskPayload as Prisma.InputJsonValue,
            progress: progress.percentage,
            currentRevisionNo: 1,
            nextReviewDate: reviewDate,
            ownerUserId: owner.id,
            lastEditedById: owner.id,
          },
        });
        await prisma.documentRevision.create({
          data: {
            organizationId: organization.id,
            documentId: document.id,
            revisionNo: 1,
            templateVersion: riskTemplate.version,
            payload: riskPayload as Prisma.InputJsonValue,
            changedFields: { fields: Object.keys(riskPayload) } as Prisma.InputJsonValue,
            changeNote: 'Initial demo risk register',
            createdById: owner.id,
          },
        });
      }
    }
  }

  // Seed one demo classification run so the result page can be explored
  // immediately. Existing runs are never overwritten.
  const existingRun = await prisma.classificationRun.findFirst({
    where: { organizationId: organization.id },
    orderBy: { version: 'desc' },
  });
  if (!existingRun) {
    const demoAnswers = classificationAnswersSchema.parse({
      establishmentCountries: ['RO'],
      sectorCode: 'ict_service_management',
      subsectorCode: 'managed_services',
      entityTypeCode: 'managed_service_provider',
      size: {
        employees: 60,
        annualTurnoverEur: 12_000_000,
        balanceSheetTotalEur: 6_000_000,
      },
    });
    const computation = classify(roPack, demoAnswers);
    await prisma.classificationRun.create({
      data: {
        organizationId: organization.id,
        version: 1,
        inputs: demoAnswers as unknown as Prisma.InputJsonValue,
        result: computation.outcome as $Enums.ClassificationResult,
        confidence: computation.confidence,
        ruleId: computation.ruleId,
        reasonKey: computation.reasonKey,
        legalBasis: computation.legalBasis as unknown as Prisma.InputJsonValue,
        consequences: computation.consequences as unknown as Prisma.InputJsonValue,
        applicability: computation.documents as unknown as Prisma.InputJsonValue,
        jurisdictionPackCode: roPack.code,
        jurisdictionPackVersion: roPack.version,
        createdById: owner.id,
      },
    });
  }

  console.log(`[seed] demo organization ready: ${organization.name} (${organization.id})`);
  console.log(`[seed] demo owner: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`[seed] classification pack: ${roPack.code}@${roPack.version} (${roPack.status})`);
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
