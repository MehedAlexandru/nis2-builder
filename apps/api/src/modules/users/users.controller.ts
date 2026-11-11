import { Body, Controller, Delete, Get, HttpCode, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  updateProfileSchema,
  type OrganizationSummary,
  type UpdateProfileInput,
} from '@nis2/shared';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService, type UserActor } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<{ user: unknown; organizations: OrganizationSummary[] }> {
    return this.users.me(actorOf(auth, request)) as Promise<{
      user: unknown;
      organizations: OrganizationSummary[];
    }>;
  }

  @Patch('me')
  updateProfile(
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<unknown> {
    return this.users.updateProfile(actorOf(auth, request), body);
  }

  @Get('me/export')
  exportData(
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<Record<string, unknown>> {
    return this.users.exportData(actorOf(auth, request));
  }

  @Delete('me')
  @HttpCode(204)
  deleteAccount(
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.users.deleteAccount(actorOf(auth, request));
  }
}

function actorOf(auth: AccessTokenClaims, request: FastifyRequest): UserActor {
  const userAgent = request.headers['user-agent'];
  return {
    userId: auth.sub,
    ip: request.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request.id,
  };
}
