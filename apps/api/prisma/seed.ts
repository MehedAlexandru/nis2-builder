import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Metadata only — no legal claims. The Romanian pack remains
  // `pending-legal-review` until a qualified reviewer signs it off.
  await prisma.jurisdictionPack.upsert({
    where: { code_version: { code: 'RO', version: '0.1.0-draft' } },
    update: {},
    create: {
      code: 'RO',
      version: '0.1.0-draft',
      name: 'Romania',
      authority: 'DNSC',
      content: {
        status: 'pending-legal-review',
        legalInstrument: 'OUG 155/2024',
        note: 'Legal content is authored from official sources and awaits qualified review.',
      },
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
          employeeCount: 42,
          annualTurnoverEur: 8_500_000,
        },
      },
    },
  });

  console.log(`[seed] demo organization ready: ${organization.name} (${organization.id})`);
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
