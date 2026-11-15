import { createReadStream } from 'node:fs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  agentDownloadPlatformSchema,
  createAgentEnrollmentSchema,
  createAgentScanSchema,
  type AgentDownloadPlatform,
  type AgentEnrollmentResponse,
  type AgentScanSummary,
  type AgentSummary,
  type CreateAgentEnrollmentInput,
  type CreateAgentScanInput,
} from '@nis2/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentsService, type AgentActor } from './agents.service';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list(@CurrentAuth() auth: AccessTokenClaims): Promise<AgentSummary[]> {
    return this.agents.list(actorOf(auth), organizationOf(auth));
  }

  @Post('enrollment')
  @HttpCode(201)
  createEnrollment(
    @Body(new ZodValidationPipe(createAgentEnrollmentSchema)) body: CreateAgentEnrollmentInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<AgentEnrollmentResponse> {
    return this.agents.createEnrollment(actorOf(auth, request), organizationOf(auth), body);
  }

  @Delete(':agentId')
  @HttpCode(204)
  revoke(
    @Param('agentId') agentId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.agents.revoke(actorOf(auth, request), organizationOf(auth), agentId);
  }

  @Post(':agentId/scans')
  @HttpCode(202)
  createScan(
    @Param('agentId') agentId: string,
    @Body(new ZodValidationPipe(createAgentScanSchema)) body: CreateAgentScanInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<AgentScanSummary> {
    return this.agents.createScan(actorOf(auth, request), organizationOf(auth), agentId, body);
  }

  @Get('download/:platform')
  async download(
    @Param('platform', new ZodValidationPipe(agentDownloadPlatformSchema))
    platform: AgentDownloadPlatform,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.agents.download(platform);
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Length', file.size)
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(createReadStream(file.path));
  }

  @Get('scans')
  scans(@CurrentAuth() auth: AccessTokenClaims): Promise<AgentScanSummary[]> {
    return this.agents.scans(actorOf(auth), organizationOf(auth));
  }

  @Get('scans/:jobId')
  scan(
    @Param('jobId') jobId: string,
    @CurrentAuth() auth: AccessTokenClaims,
  ): Promise<AgentScanSummary> {
    return this.agents.scan(actorOf(auth), organizationOf(auth), jobId);
  }
}

function organizationOf(auth: AccessTokenClaims): string {
  if (!auth.org) {
    throw new BadRequestException({
      code: 'NO_ACTIVE_ORGANIZATION',
      message: 'Select an organization before using scanner agents',
    });
  }
  return auth.org;
}

function actorOf(auth: AccessTokenClaims, request?: FastifyRequest): AgentActor {
  const userAgent = request?.headers['user-agent'];
  return {
    userId: auth.sub,
    globalRole: auth.role,
    ip: request?.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request?.id,
  };
}
