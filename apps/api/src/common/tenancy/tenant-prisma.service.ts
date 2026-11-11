import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Runs tenant queries in a transaction with `app.organization_id` (and
 * optionally `app.user_id`) set, so PostgreSQL RLS is enforced even if the
 * application forgets a WHERE clause.
 *
 * The transaction-scoped `set_config(..., true)` avoids leaking tenant context
 * across pooled connections.
 */
@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  runInTenant<T>(
    organizationId: string,
    userId: string | null,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId ?? ''}, true)`;
      return callback(tx);
    });
  }

  /** User-scoped discovery path used before an organization is selected. */
  runForUser<T>(
    userId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return callback(tx);
    });
  }

  /** Invite lookup by one-time token hash, before the account exists. */
  runForInvite<T>(
    tokenHash: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.invite_token_hash', ${tokenHash}, true)`;
      return callback(tx);
    });
  }
}
