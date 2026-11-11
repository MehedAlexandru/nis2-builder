/**
 * One-time platform administrator bootstrap. Never exposed through the public
 * UI. Requires ADMIN_BOOTSTRAP_TOKEN to be present in the environment as proof
 * that the operator controls deployment secrets.
 *
 * Usage (inside the API container or with the root .env loaded):
 *   ADMIN_BOOTSTRAP_TOKEN=... ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD='...' pnpm --filter @nis2/api admin:bootstrap
 *
 * Optional: ADMIN_GIVEN_NAME, ADMIN_FAMILY_NAME.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';

for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  required('ADMIN_BOOTSTRAP_TOKEN');
  const email = required('ADMIN_EMAIL').trim().toLowerCase();
  const password = required('ADMIN_PASSWORD');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error('ADMIN_EMAIL is not a valid email');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  // @node-rs/argon2 defaults to Argon2id.
  const passwordHash = await hash(password, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      globalRole: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      givenName: process.env.ADMIN_GIVEN_NAME ?? 'Platform',
      familyName: process.env.ADMIN_FAMILY_NAME ?? 'Administrator',
      globalRole: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'ADMIN_BOOTSTRAPPED',
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      resourceType: 'user',
      resourceId: admin.id,
      metadata: { source: 'cli' },
    },
  });

  console.log(`[bootstrap-admin] administrator ready: ${admin.email} (${admin.id})`);
  console.log('[bootstrap-admin] MFA enrollment is required on first login.');
}

main()
  .catch((error: unknown) => {
    console.error('[bootstrap-admin] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
