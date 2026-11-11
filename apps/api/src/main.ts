import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import type { RawRequestDefaultExpression } from 'fastify';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createLogger } from './common/logging/logger';
import { PinoNestLogger } from './common/logging/pino-nest-logger';
import { swaggerConfig } from './common/swagger';
import type { AppEnv } from './config/env';

const logger = createLogger(process.env.LOG_LEVEL ?? 'info');

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
    genReqId: (request: RawRequestDefaultExpression) => {
      const raw = request.headers['x-request-id'];
      const header = Array.isArray(raw) ? raw[0] : raw;
      return header && header.length > 0 && header.length <= 128 ? header : randomUUID();
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  app.useLogger(new PinoNestLogger(logger));
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.setGlobalPrefix('api', {
    exclude: ['healthz', 'readyz', 'metrics', 'docs', 'docs-json'],
  });

  const config = app.get(ConfigService<AppEnv, true>);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'none'"],
            baseUri: ["'none'"],
            frameAncestors: ["'none'"],
            formAction: ["'none'"],
          },
        }
      : false,
    hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'no-referrer' },
  });

  const allowedOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(fastifyCors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  await app.register(fastifyCookie, {
    secret: config.get<string>('COOKIE_SECRET'),
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  if (!isProduction) {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  }

  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.info({ port }, 'NIS2 Compass API listening');
}

void bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API failed to start');
  process.exit(1);
});
