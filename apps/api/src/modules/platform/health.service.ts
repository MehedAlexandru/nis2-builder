import { Inject, Injectable } from '@nestjs/common';
import { APP_VERSION } from '../../common/version';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis.module';

type CheckState = 'up' | 'down';

export interface LivenessResult {
  status: 'ok';
  uptimeSeconds: number;
  version: string;
}

export interface ReadinessResult {
  status: 'ok' | 'down';
  uptimeSeconds: number;
  version: string;
  checks: Record<string, CheckState>;
}

const READINESS_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('readiness check timed out')), timeoutMs);
    }),
  ]);
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  liveness(): LivenessResult {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      version: APP_VERSION,
    };
  }

  async readiness(): Promise<ReadinessResult> {
    const checks: Record<string, CheckState> = {
      database: 'down',
      redis: 'down',
    };

    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS);
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    try {
      await withTimeout(this.redis.ping(), READINESS_TIMEOUT_MS);
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }

    return {
      status: checks.database === 'up' && checks.redis === 'up' ? 'ok' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      version: APP_VERSION,
      checks,
    };
  }
}
