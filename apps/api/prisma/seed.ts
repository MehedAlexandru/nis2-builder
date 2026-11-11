import { hash } from '@node-rs/argon2';
import { Prisma, PrismaClient, $Enums } from '@prisma/client';
import { classificationAnswersSchema, classify, getClassificationPack } from '@nis2/shared';

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
