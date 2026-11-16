import {
  BadRequestException,
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
  createFindingSchema,
  findingListQuerySchema,
  findingSuggestionActionSchema,
  updateFindingSchema,
  type CreateFindingInput,
  type FindingDetail,
  type FindingList,
  type FindingListQuery,
  type FindingSuggestionAction,
  type FindingSuggestionList,
  type UpdateFindingInput,
} from '@nis2/shared';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FindingsService, type FindingActor } from './findings.service';

@ApiTags('findings')
@Controller('findings')
export class FindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get()
  list(
    @CurrentAuth() auth: AccessTokenClaims,
    @Query(new ZodValidationPipe(findingListQuerySchema)) query: FindingListQuery,
  ): Promise<FindingList> {
    return this.findings.list(actorOf(auth), organizationOf(auth), query);
  }

  @Get('suggestions')
  suggestions(
    @CurrentAuth() auth: AccessTokenClaims,
    @Query('auditId') auditId: string,
  ): Promise<FindingSuggestionList> {
    if (!auditId) {
      throw new BadRequestException({
        code: 'AUDIT_REQUIRED',
        message: 'Choose an audit before loading suggestions',
      });
    }
    return this.findings.suggestions(actorOf(auth), organizationOf(auth), auditId);
  }

  @Post('suggestions/confirm')
  @HttpCode(201)
  confirmSuggestion(
    @Body(new ZodValidationPipe(findingSuggestionActionSchema)) body: FindingSuggestionAction,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<FindingDetail> {
    return this.findings.confirmSuggestion(actorOf(auth, request), organizationOf(auth), body);
  }

  @Post('suggestions/dismiss')
  @HttpCode(204)
  dismissSuggestion(
    @Body(new ZodValidationPipe(findingSuggestionActionSchema)) body: FindingSuggestionAction,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.findings.dismissSuggestion(actorOf(auth, request), organizationOf(auth), body);
  }

  @Get(':findingId')
  get(
    @Param('findingId') findingId: string,
    @CurrentAuth() auth: AccessTokenClaims,
  ): Promise<FindingDetail> {
    return this.findings.get(actorOf(auth), organizationOf(auth), findingId);
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createFindingSchema)) body: CreateFindingInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<FindingDetail> {
    return this.findings.create(actorOf(auth, request), organizationOf(auth), body);
  }

  @Patch(':findingId')
  update(
    @Param('findingId') findingId: string,
    @Body(new ZodValidationPipe(updateFindingSchema)) body: UpdateFindingInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<FindingDetail> {
    return this.findings.update(actorOf(auth, request), organizationOf(auth), findingId, body);
  }

  @Delete(':findingId')
  @HttpCode(204)
  remove(
    @Param('findingId') findingId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.findings.remove(actorOf(auth, request), organizationOf(auth), findingId);
  }
}

function organizationOf(auth: AccessTokenClaims): string {
  if (!auth.org) {
    throw new BadRequestException({
      code: 'NO_ACTIVE_ORGANIZATION',
      message: 'Select an organization before using the findings register',
    });
  }
  return auth.org;
}

function actorOf(auth: AccessTokenClaims, request?: FastifyRequest): FindingActor {
  const userAgent = request?.headers['user-agent'];
  return {
    userId: auth.sub,
    globalRole: auth.role,
    ip: request?.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request?.id,
  };
}
