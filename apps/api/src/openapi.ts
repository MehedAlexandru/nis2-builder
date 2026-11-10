import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';

// Must be set before AppModule is imported: the queue module is conditional.
process.env.ENABLE_QUEUES = 'false';

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
