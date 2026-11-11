import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Worker, type Job } from 'bullmq';
import { createLogger } from './common/logging/logger';
import { parseRedisUrl } from './common/redis/parse-redis-url';
import { S3Storage } from './common/storage/storage.service';
import { validateEnv } from './config/env';
import { processExportJob, type ExportJobData } from './modules/exports/export-processor';
import { EXPORT_QUEUE_NAME } from './queue/queue.constants';

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL, 'nis2-worker');
  const connection = parseRedisUrl(env.REDIS_URL);
  const prisma = new PrismaClient({
    datasourceUrl: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  });
  const storage = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });

  const worker = new Worker(
    EXPORT_QUEUE_NAME,
    async (job: Job<ExportJobData>) => {
      await processExportJob(prisma, storage, logger, job.data);
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
    await prisma.$disconnect();
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
