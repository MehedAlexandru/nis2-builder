import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  agentHeartbeatSchema,
  agentJobFailSchema,
  agentScanResultSchema,
  type AgentHeartbeatInput,
  type AgentHeartbeatResponse,
  type AgentJobFailInput,
  type AgentScanResult,
  type ScanDiffSummary,
} from '@nis2/shared';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentsService } from './agents.service';

@ApiTags('agent-ingest')
@Public()
@Controller('v1/agents')
export class AgentIngestController {
  constructor(private readonly agents: AgentsService) {}

  @Post('heartbeat')
  @HttpCode(200)
  heartbeat(
    @Body(new ZodValidationPipe(agentHeartbeatSchema)) body: AgentHeartbeatInput,
    @Req() request: FastifyRequest,
  ): Promise<AgentHeartbeatResponse> {
    return this.agents.heartbeat(agentToken(request), body);
  }

  @Post('jobs/:jobId/results')
  @HttpCode(200)
  results(
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(agentScanResultSchema)) body: AgentScanResult,
    @Req() request: FastifyRequest,
  ): Promise<ScanDiffSummary> {
    return this.agents.ingestResults(agentToken(request), jobId, body);
  }

  @Post('jobs/:jobId/fail')
  @HttpCode(204)
  fail(
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(agentJobFailSchema)) body: AgentJobFailInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.agents.failJob(agentToken(request), jobId, body.error);
  }
}

function agentToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedException({
      code: 'AGENT_UNAUTHORIZED',
      message: 'An agent token is required',
    });
  }
  return header.slice('Bearer '.length).trim();
}
