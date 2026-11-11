import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'owner@demo.local';
const DEMO_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? 'Demo!Passw0rd123';

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

  console.log(`[seed] demo organization ready: ${organization.name} (${organization.id})`);
  console.log(`[seed] demo owner: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
