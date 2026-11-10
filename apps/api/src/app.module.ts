import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { AdminModule } from './modules/admin/admin.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AuditsModule } from './modules/audits/audits.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassificationModule } from './modules/classification/classification.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ExportsModule } from './modules/exports/exports.module';
import { FindingsModule } from './modules/findings/findings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PlatformModule } from './modules/platform/platform.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

// Evaluated before ConfigModule loads .env: set ENABLE_QUEUES=false in the
// process environment (not only in .env) to boot without Redis. The OpenAPI
// generator does exactly that.
const queuesEnabled = process.env.ENABLE_QUEUES !== 'false';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['../../.env.local', '../../.env', '.env.local', '.env'],
    }),
    PrismaModule,
    RedisModule,
    ...(queuesEnabled ? [QueueModule] : []),
    PlatformModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    ClassificationModule,
    DocumentsModule,
    AuditsModule,
    FindingsModule,
    AgentsModule,
    ExportsModule,
    NotificationsModule,
    AdminModule,
  ],
})
export class AppModule {}
