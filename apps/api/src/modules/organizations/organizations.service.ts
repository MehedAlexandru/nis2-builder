import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { GlobalRole, MembershipRole } from '@prisma/client';
import {
  type CreateOrganizationInput,
  type InviteInput,
  type InviteSummary,
  type OrganizationDetail,
  type OrganizationLogoUploadInput,
  type OrganizationMember,
  type OrganizationSummary,
  type UpdateMemberRoleInput,
  type UpdateOrganizationInput,
} from '@nis2/shared';
import { AuditService } from '../../common/audit/audit.service';
import { TokenService } from '../../common/crypto/token.service';
import { uuidv7 } from '../../common/id';
import { MailService } from '../../common/mail/mail.service';
import { StorageService, type StoredObject } from '../../common/storage/storage.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrgActor {
  userId: string;
  globalRole: GlobalRole;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async list(actor: OrgActor): Promise<OrganizationSummary[]> {
    const memberships = await this.tenantPrisma.runForUser(actor.userId, (tx) =>
      tx.membership.findMany({
        where: { userId: actor.userId },
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

  async create(actor: OrgActor, input: CreateOrganizationInput): Promise<OrganizationDetail> {
    const organizationId = uuidv7();
    const countryCode = input.countryCode;
    const jurisdictionPackCode = input.jurisdictionPackCode ?? countryCode;
    const membershipId = uuidv7();

    await this.tenantPrisma.runInTenant(organizationId, actor.userId, async (tx) => {
      await tx.organization.create({
        data: {
          id: organizationId,
          name: input.name,
          countryCode,
          jurisdictionPackCode,
          companyProfile: { create: { legalName: input.name, countryCode } },
        },
      });
      await tx.membership.create({
        data: { id: membershipId, organizationId, userId: actor.userId, role: 'OWNER' },
      });
    });

    await this.audit.record({
      action: 'ORGANIZATION_CREATED',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'organization',
      resourceId: organizationId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });

    return this.get(actor, organizationId);
  }

  async get(actor: OrgActor, organizationId: string): Promise<OrganizationDetail> {
    const { organization, membership, memberCount } = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        const org = await tx.organization.findUnique({ where: { id: organizationId } });
        const member = await tx.membership.findFirst({
          where: { organizationId, userId: actor.userId },
        });
        const count = await tx.membership.count({ where: { organizationId } });
        return { organization: org, membership: member, memberCount: count };
      },
    );

    if (!organization)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Organization not found' });
    if (!membership && actor.globalRole !== 'ADMIN') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Organization not available' });
    }
    if (!membership && actor.globalRole === 'ADMIN') {
      await this.audit.record({
        action: 'ADMIN_ORGANIZATION_ACCESS',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: { mode: 'read-only' },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    }

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      plan: organization.plan,
      scopeMode: organization.scopeMode,
      countryCode: organization.countryCode,
      jurisdictionPackCode: organization.jurisdictionPackCode,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
      membershipRole: membership?.role ?? null,
      memberCount,
    };
  }

  async uploadLogo(
    actor: OrgActor,
    organizationId: string,
    input: OrganizationLogoUploadInput,
  ): Promise<OrganizationDetail> {
    await this.requireOwner(actor, organizationId);
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Object storage is not configured',
      });
    }
    const buffer = Buffer.from(input.dataBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException({
        code: 'LOGO_INVALID',
        message: 'The logo must be a PNG or JPEG file up to 2 MB',
      });
    }
    const isPng =
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isJpeg =
      buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (
      (input.mimeType === 'image/png' && !isPng) ||
      (input.mimeType === 'image/jpeg' && !isJpeg)
    ) {
      throw new BadRequestException({
        code: 'LOGO_INVALID',
        message: 'The uploaded file content does not match the declared image type',
      });
    }

    const organization = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId } }),
    );
    if (!organization) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Organization not found' });
    }
    const extension = input.mimeType === 'image/png' ? 'png' : 'jpg';
    const key = `org/${organizationId}/branding/logo-${Date.now()}.${extension}`;
    await this.storage.putObject(key, buffer, input.mimeType);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.organization.update({ where: { id: organizationId }, data: { logoKey: key } }),
    );
    if (organization.logoKey && organization.logoKey !== key) {
      await this.storage.deleteObject(organization.logoKey).catch(() => undefined);
    }
    await this.audit.record({
      action: 'ORGANIZATION_LOGO_UPDATED',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { mimeType: input.mimeType, sizeBytes: buffer.length },
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
    return this.get(actor, organizationId);
  }

  async logo(actor: OrgActor, organizationId: string): Promise<StoredObject> {
    await this.requireAccess(actor, organizationId);
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Object storage is not configured',
      });
    }
    const organization = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId } }),
    );
    if (!organization?.logoKey) {
      throw new NotFoundException({ code: 'LOGO_NOT_FOUND', message: 'No logo uploaded' });
    }
    return this.storage.getObject(organization.logoKey);
  }

  async update(
    actor: OrgActor,
    organizationId: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationDetail> {
    await this.requireOwner(actor, organizationId);
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.organization.update({
        where: { id: organizationId },
        data: {
          name: input.name,
          countryCode: input.countryCode,
          jurisdictionPackCode: input.jurisdictionPackCode,
          scopeMode: input.scopeMode,
        },
      }),
    );
    await this.audit.record({
      action: 'ORGANIZATION_UPDATED',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { fields: Object.keys(input) },
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
    return this.get(actor, organizationId);
  }

  async members(
    actor: OrgActor,
    organizationId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: OrganizationMember[]; total: number; page: number; pageSize: number }> {
    await this.requireAccess(actor, organizationId);
    const [rows, total] = await this.tenantPrisma.runInTenant(
      organizationId,
      actor.userId,
      async (tx) => {
        const data = await tx.membership.findMany({
          where: { organizationId },
          include: { user: true },
          orderBy: { createdAt: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        return [data, await tx.membership.count({ where: { organizationId } })] as const;
      },
    );
    return {
      items: rows.map((row) => ({
        userId: row.userId,
        email: row.user.email,
        givenName: row.user.givenName,
        familyName: row.user.familyName,
        role: row.role,
        status: row.user.status,
        joinedAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async invite(
    actor: OrgActor,
    organizationId: string,
    input: InviteInput,
  ): Promise<InviteSummary> {
    await this.requireOwner(actor, organizationId);
    const existingMember = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.findFirst({
        where: { organizationId, user: { email: input.email } },
      }),
    );
    if (existingMember) {
      throw new ConflictException({ code: 'ALREADY_MEMBER', message: 'User is already a member' });
    }

    const invite = this.tokens.generate(32);
    const organization = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId } }),
    );
    if (!organization)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Organization not found' });

    const inviter = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    const record = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.invite.create({
        data: {
          organizationId,
          email: input.email,
          role: input.role,
          tokenHash: invite.hash,
          invitedById: actor.userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      }),
    );

    await this.mail.sendInvite({
      to: input.email,
      locale: inviter?.locale ?? 'en',
      token: invite.token,
      organizationName: organization.name,
      inviterName: inviter ? `${inviter.givenName} ${inviter.familyName}`.trim() : 'A colleague',
    });
    await this.audit.record({
      action: 'ORGANIZATION_INVITE_SENT',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'invite',
      resourceId: record.id,
      metadata: { email: input.email, role: input.role },
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });

    return {
      id: record.id,
      email: record.email,
      role: record.role,
      expiresAt: record.expiresAt.toISOString(),
      acceptedAt: record.acceptedAt ? record.acceptedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async invites(actor: OrgActor, organizationId: string): Promise<InviteSummary[]> {
    await this.requireOwner(actor, organizationId);
    const rows = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.invite.findMany({
        where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async revokeInvite(actor: OrgActor, organizationId: string, inviteId: string): Promise<void> {
    await this.requireOwner(actor, organizationId);
    const deleted = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.invite.deleteMany({ where: { id: inviteId, organizationId } }),
    );
    if (deleted.count === 0)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invite not found' });
    await this.audit.record({
      action: 'ORGANIZATION_INVITE_REVOKED',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'invite',
      resourceId: inviteId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
  }

  async updateMemberRole(
    actor: OrgActor,
    organizationId: string,
    userId: string,
    input: UpdateMemberRoleInput,
  ): Promise<void> {
    await this.requireOwner(actor, organizationId);
    const membership = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.findFirst({ where: { organizationId, userId } }),
    );
    if (!membership)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' });

    if (membership.role === 'OWNER' && input.role !== 'OWNER') {
      const ownerCount = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
        tx.membership.count({ where: { organizationId, role: 'OWNER' } }),
      );
      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER',
          message: 'The organization must keep at least one owner',
        });
      }
    }

    await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.update({
        where: { organizationId_userId: { organizationId, userId } },
        data: { role: input.role },
      }),
    );
    await this.audit.record({
      action: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'membership',
      resourceId: userId,
      metadata: { role: input.role },
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
  }

  async removeMember(actor: OrgActor, organizationId: string, userId: string): Promise<void> {
    await this.requireOwner(actor, organizationId);
    const membership = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.findFirst({ where: { organizationId, userId } }),
    );
    if (!membership)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' });
    if (membership.role === 'OWNER') {
      const ownerCount = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
        tx.membership.count({ where: { organizationId, role: 'OWNER' } }),
      );
      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER',
          message: 'The organization must keep at least one owner',
        });
      }
    }
    await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.delete({ where: { organizationId_userId: { organizationId, userId } } }),
    );
    await this.audit.record({
      action: 'ORGANIZATION_MEMBER_REMOVED',
      actorUserId: actor.userId,
      actorRole: actor.globalRole,
      organizationId,
      resourceType: 'membership',
      resourceId: userId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      correlationId: actor.correlationId,
    });
  }

  private async requireAccess(
    actor: OrgActor,
    organizationId: string,
  ): Promise<MembershipRole | null> {
    const membership = await this.tenantPrisma.runInTenant(organizationId, actor.userId, (tx) =>
      tx.membership.findFirst({ where: { organizationId, userId: actor.userId } }),
    );
    if (!membership && actor.globalRole !== 'ADMIN') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Organization not available' });
    }
    if (!membership && actor.globalRole === 'ADMIN') {
      await this.audit.record({
        action: 'ADMIN_ORGANIZATION_ACCESS',
        actorUserId: actor.userId,
        actorRole: actor.globalRole,
        organizationId,
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: { mode: 'read-only' },
        ip: actor.ip,
        userAgent: actor.userAgent,
        correlationId: actor.correlationId,
      });
    }
    return membership?.role ?? null;
  }

  private async requireOwner(actor: OrgActor, organizationId: string): Promise<void> {
    const role = await this.requireAccess(actor, organizationId);
    if (role !== 'OWNER') {
      throw new ForbiddenException({ code: 'OWNER_REQUIRED', message: 'Owner role required' });
    }
  }
}
