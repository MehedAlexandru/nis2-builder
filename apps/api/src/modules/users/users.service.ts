import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrganizationSummary, UpdateProfileInput } from '@nis2/shared';
import { AuditService } from '../../common/audit/audit.service';
import { toAuthUser } from '../../common/auth/user-mapper';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface UserActor {
  userId: string;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async me(
    actor: UserActor,
  ): Promise<{ user: ReturnType<typeof toAuthUser>; organizations: OrganizationSummary[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return { user: toAuthUser(user), organizations: await this.organizationsOf(actor.userId) };
  }

  async updateProfile(
    actor: UserActor,
    input: UpdateProfileInput,
  ): Promise<ReturnType<typeof toAuthUser>> {
    const user = await this.prisma.user.update({
      where: { id: actor.userId },
      data: {
        givenName: input.givenName,
        familyName: input.familyName,
        locale: input.locale,
        timezone: input.timezone,
      },
    });
    await this.audit.record({
      action: 'USER_PROFILE_UPDATED',
      actorUserId: actor.userId,
      actorRole: user.globalRole,
      resourceType: 'user',
      resourceId: actor.userId,
      metadata: { fields: Object.keys(input) },
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
    return toAuthUser(user);
  }

  async exportData(actor: UserActor): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    const [organizations, sessions, auditLogs] = await Promise.all([
      this.organizationsOf(actor.userId),
      this.prisma.session.findMany({
        where: { userId: actor.userId },
        select: {
          id: true,
          organizationId: true,
          userAgent: true,
          ip: true,
          createdAt: true,
          lastSeenAt: true,
          revokedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.tenantPrisma.runForUser(actor.userId, (tx) =>
        tx.auditLog.findMany({
          where: { actorUserId: actor.userId },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ),
    ]);
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return {
      exportedAt: new Date().toISOString(),
      user: safeUser,
      organizations,
      sessions,
      auditLogs,
    };
  }

  async deleteAccount(actor: UserActor): Promise<void> {
    const memberships = await this.tenantPrisma.runForUser(actor.userId, (tx) =>
      tx.membership.findMany({
        where: { userId: actor.userId, role: 'OWNER' },
        select: { organizationId: true },
      }),
    );
    for (const membership of memberships) {
      const ownerCount = await this.tenantPrisma.runInTenant(
        membership.organizationId,
        actor.userId,
        (tx) =>
          tx.membership.count({
            where: { organizationId: membership.organizationId, role: 'OWNER' },
          }),
      );
      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER',
          message: 'Transfer ownership or delete the organization before deleting your account',
        });
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    await this.audit.record({
      action: 'USER_ACCOUNT_DELETED',
      actorUserId: actor.userId,
      actorRole: user?.globalRole,
      resourceType: 'user',
      resourceId: actor.userId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
    await this.prisma.user.delete({ where: { id: actor.userId } });
  }

  private async organizationsOf(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.tenantPrisma.runForUser(userId, (tx) =>
      tx.membership.findMany({
        where: { userId },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      status: membership.organization.status,
      countryCode: membership.organization.countryCode,
      jurisdictionPackCode: membership.organization.jurisdictionPackCode,
      scopeMode: membership.organization.scopeMode,
      plan: membership.organization.plan,
    }));
  }
}
