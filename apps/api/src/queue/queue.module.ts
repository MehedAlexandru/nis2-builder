import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { parseRedisUrl } from '../common/redis/parse-redis-url';
import type { AppEnv } from '../config/env';
import { EXPORT_QUEUE, EXPORT_QUEUE_NAME } from './queue.constants';

@Global()
@Module({
  providers: [
    {
      provide: EXPORT_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new Queue(EXPORT_QUEUE_NAME, {
          connection: parseRedisUrl(config.get('REDIS_URL', { infer: true })),
        }),
    },
  ],
  exports: [EXPORT_QUEUE],
})
export class QueueModule {}
