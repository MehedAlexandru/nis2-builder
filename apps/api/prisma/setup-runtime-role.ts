/**
 * Creates (or updates) the least-privilege runtime PostgreSQL role used by the
 * API, then grants only the DML/execute rights it needs. The role is
 * NOSUPERUSER and NOBYPASSRLS, so Row Level Security applies.
 *
 * Usage:
 *   DATABASE_URL=<owner-dsn> APP_DATABASE_URL=<runtime-dsn> \
 *   pnpm --filter @nis2/api prisma:setup-runtime-role
 */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';

for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const ownerUrl = process.env.DATABASE_URL;
const runtimeUrl = process.env.APP_DATABASE_URL;

if (!ownerUrl) throw new Error('DATABASE_URL (owner connection) is required');
if (!runtimeUrl) throw new Error('APP_DATABASE_URL (runtime connection) is required');

const parsed = new URL(runtimeUrl);
const role = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(role)) {
  throw new Error('Runtime role name must be a simple identifier');
}

const identifier = `"${role.replaceAll('"', '""')}"`;
const literal = `'${password.replaceAll("'", "''")}'`;

const prisma = new PrismaClient({ datasourceUrl: ownerUrl });

async function main(): Promise<void> {
  const existing = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS exists
  `;

  if (existing[0]?.exists) {
    await prisma.$executeRawUnsafe(
      `ALTER ROLE ${identifier} WITH LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${literal}`,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `CREATE ROLE ${identifier} WITH LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${literal}`,
    );
  }

  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public, app TO ${identifier}`);
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier}`,
  );
  await prisma.$executeRawUnsafe(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${identifier}`);
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${identifier}`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${identifier}`,
  );

  console.log(`[runtime-role] role ${role} is ready (NOBYPASSRLS, RLS enforced)`);
}

main()
  .catch((error: unknown) => {
    console.error('[runtime-role] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
