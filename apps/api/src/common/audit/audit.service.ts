import { Injectable } from '@nestjs/common';
import type { Prisma, GlobalRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEvent {
  action: string;
  actorUserId?: string | null;
  actorRole?: GlobalRole | null;
  organizationId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
  correlationId?: string | null;
}

/**
 * Append-only audit trail writer. The database trigger rejects UPDATE/DELETE,
 * so this service only ever inserts. Tenant-scoped events run with
 * `app.organization_id` set so the RLS INSERT policy passes.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.withContext(tx, event.organizationId ?? null, event.actorUserId ?? null);
      await tx.auditLog.create({
        data: {
          action: event.action,
          actorUserId: event.actorUserId ?? null,
          actorRole: event.actorRole ?? null,
          organizationId: event.organizationId ?? null,
          resourceType: event.resourceType ?? null,
          resourceId: event.resourceId ?? null,
          ip: event.ip?.slice(0, 64) ?? null,
          userAgent: event.userAgent?.slice(0, 512) ?? null,
          metadata: event.metadata,
          correlationId: event.correlationId ?? null,
        },
      });
    });
  }

  /** Use inside an existing transaction; the caller must set the tenant context. */
  async recordWith(tx: Prisma.TransactionClient, event: AuditEvent): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: event.action,
        actorUserId: event.actorUserId ?? null,
        actorRole: event.actorRole ?? null,
        organizationId: event.organizationId ?? null,
        resourceType: event.resourceType ?? null,
        resourceId: event.resourceId ?? null,
        ip: event.ip?.slice(0, 64) ?? null,
        userAgent: event.userAgent?.slice(0, 512) ?? null,
        metadata: event.metadata,
        correlationId: event.correlationId ?? null,
      },
    });
  }

  private async withContext(
    tx: Prisma.TransactionClient,
    organizationId: string | null,
    userId: string | null,
  ): Promise<void> {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId ?? ''}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId ?? ''}, true)`;
  }
}
