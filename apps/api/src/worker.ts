import 'reflect-metadata';
import { Worker, type Job } from 'bullmq';
import { createLogger } from './common/logging/logger';
import { parseRedisUrl } from './common/redis/parse-redis-url';
import { validateEnv } from './config/env';
import { EXPORT_QUEUE_NAME } from './queue/queue.constants';

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL, 'nis2-worker');
  const connection = parseRedisUrl(env.REDIS_URL);

  const worker = new Worker(
    EXPORT_QUEUE_NAME,
    async (job: Job) => {
      // Phase 4 replaces this with the DOCX/PDF render pipeline. The queue,
      // retry policy and observability exist from Phase 0.
      logger.info(
        { jobId: job.id, jobName: job.name, attempts: job.attemptsMade },
        'export job received (Phase 0 placeholder)',
      );
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'export job failed');
  });
  worker.on('error', (error) => {
    logger.error({ err: error }, 'worker connection error');
  });

  logger.info({ queue: EXPORT_QUEUE_NAME }, 'worker started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down worker');
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void bootstrap().catch((error: unknown) => {
  // The logger may not exist yet if env validation failed.
  console.error('Worker failed to start', error);
  process.exit(1);
});
