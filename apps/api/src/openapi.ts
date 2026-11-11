import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';

// Must be set before AppModule is imported: the queue module is conditional.
process.env.ENABLE_QUEUES = 'false';
// The contract build does not handle requests; provide non-secret placeholders
// so provider factories can be constructed without deployment secrets.
process.env.JWT_ACCESS_SECRET ??= 'openapi-contract-generation-secret-not-for-runtime';
process.env.COOKIE_SECRET ??= 'openapi-contract-generation-cookie-secret';
process.env.ENCRYPTION_MASTER_KEY ??= Buffer.alloc(32, 1).toString('base64');

async function main(): Promise<void> {
  const [{ AppModule }, { swaggerConfig }] = await Promise.all([
    import('./app.module'),
    import('./common/swagger'),
  ]);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false },
  );
  await app.init();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outputPath = resolve(process.cwd(), '../../docs/openapi/openapi.json');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  console.log(`OpenAPI contract written to ${outputPath}`);
}

void main().catch((error: unknown) => {
  console.error('Failed to generate OpenAPI contract', error);
  process.exit(1);
});
