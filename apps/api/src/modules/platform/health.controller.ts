import { Controller, Get, Header, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../../common/auth/auth.decorators';
import type { AppEnv } from '../../config/env';
import { HealthService, type LivenessResult, type ReadinessResult } from './health.service';
import { MetricsService } from './metrics.service';

@Public()
@ApiTags('platform')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Get('healthz')
  @ApiOkResponse({ description: 'Process is alive. Does not touch dependencies.' })
  liveness(): LivenessResult {
    return this.health.liveness();
  }

  @Get('readyz')
  @ApiOkResponse({ description: 'Database and Redis are reachable.' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is unavailable.' })
  async readiness(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessResult> {
    const result = await this.health.readiness();
    if (result.status === 'down') {
      reply.status(503);
    }
    return result;
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async getMetrics(): Promise<string> {
    if (!this.config.get('METRICS_ENABLED', { infer: true })) {
      throw new NotFoundException();
    }
    return this.metrics.scrape();
  }
}
