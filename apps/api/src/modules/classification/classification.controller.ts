import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  classificationAnswersSchema,
  type ClassificationAnswers,
  type ClassificationCatalog,
  type ClassificationRun,
  type ClassificationRunSummary,
} from '@nis2/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClassificationService, type ClassificationActor } from './classification.service';

@ApiTags('classification')
@Controller('classification')
export class ClassificationController {
  constructor(private readonly classification: ClassificationService) {}

  @Get('catalog')
  catalog(@CurrentAuth() auth: AccessTokenClaims): Promise<ClassificationCatalog> {
    return this.classification.catalog(actorOf(auth), organizationOf(auth));
  }

  @Get('current')
  current(@CurrentAuth() auth: AccessTokenClaims): Promise<ClassificationRun | null> {
    return this.classification.current(actorOf(auth), organizationOf(auth));
  }

  @Get('runs')
  runs(@CurrentAuth() auth: AccessTokenClaims): Promise<ClassificationRunSummary[]> {
    return this.classification.list(actorOf(auth), organizationOf(auth));
  }

  @Post('runs')
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(classificationAnswersSchema)) body: ClassificationAnswers,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<ClassificationRun> {
    return this.classification.create(actorOf(auth, request), organizationOf(auth), body);
  }

  @Get('runs/:runId')
  detail(
    @Param('runId') runId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<ClassificationRun> {
    return this.classification.detail(actorOf(auth, request), organizationOf(auth), runId);
  }

  @Get('runs/:runId/summary.pdf')
  async summaryPdf(
    @Param('runId') runId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const pdf = await this.classification.renderPdf(
      actorOf(auth, request),
      organizationOf(auth),
      runId,
    );
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${pdf.filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(pdf.buffer);
  }
}

function organizationOf(auth: AccessTokenClaims): string {
  if (!auth.org) {
    throw new BadRequestException({
      code: 'NO_ACTIVE_ORGANIZATION',
      message: 'Select an organization before using classification',
    });
  }
  return auth.org;
}

function actorOf(auth: AccessTokenClaims, request?: FastifyRequest): ClassificationActor {
  const userAgent = request?.headers['user-agent'];
  return {
    userId: auth.sub,
    globalRole: auth.role,
    ip: request?.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request?.id,
  };
}
