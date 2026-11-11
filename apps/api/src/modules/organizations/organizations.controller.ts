import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createOrganizationSchema,
  inviteSchema,
  paginationQuerySchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type InviteInput,
  type InviteSummary,
  type OrganizationDetail,
  type OrganizationMember,
  type OrganizationSummary,
  type PaginationQuery,
  type UpdateMemberRoleInput,
  type UpdateOrganizationInput,
} from '@nis2/shared';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrganizationsService, type OrgActor } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<OrganizationSummary[]> {
    return this.organizations.list(actorOf(auth, request));
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<OrganizationDetail> {
    return this.organizations.create(actorOf(auth, request), body);
  }

  @Get(':organizationId')
  get(
    @Param('organizationId') organizationId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<OrganizationDetail> {
    return this.organizations.get(actorOf(auth, request), organizationId);
  }

  @Patch(':organizationId')
  update(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<OrganizationDetail> {
    return this.organizations.update(actorOf(auth, request), organizationId, body);
  }

  @Get(':organizationId/members')
  members(
    @Param('organizationId') organizationId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<{ items: OrganizationMember[]; total: number; page: number; pageSize: number }> {
    return this.organizations.members(
      actorOf(auth, request),
      organizationId,
      query.page,
      query.pageSize,
    );
  }

  @Post(':organizationId/invites')
  @HttpCode(201)
  invite(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(inviteSchema)) body: InviteInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<InviteSummary> {
    return this.organizations.invite(actorOf(auth, request), organizationId, body);
  }

  @Get(':organizationId/invites')
  invites(
    @Param('organizationId') organizationId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<InviteSummary[]> {
    return this.organizations.invites(actorOf(auth, request), organizationId);
  }

  @Delete(':organizationId/invites/:inviteId')
  @HttpCode(204)
  revokeInvite(
    @Param('organizationId') organizationId: string,
    @Param('inviteId') inviteId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.organizations.revokeInvite(actorOf(auth, request), organizationId, inviteId);
  }

  @Patch(':organizationId/members/:userId/role')
  @HttpCode(204)
  updateMemberRole(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.organizations.updateMemberRole(
      actorOf(auth, request),
      organizationId,
      userId,
      body,
    );
  }

  @Delete(':organizationId/members/:userId')
  @HttpCode(204)
  removeMember(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.organizations.removeMember(actorOf(auth, request), organizationId, userId);
  }
}

function actorOf(auth: AccessTokenClaims, request: FastifyRequest): OrgActor {
  const userAgent = request.headers['user-agent'];
  return {
    userId: auth.sub,
    globalRole: auth.role,
    ip: request.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request.id,
  };
}
