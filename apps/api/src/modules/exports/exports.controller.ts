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
  createBundleExportSchema,
  createDocumentExportSchema,
  createSummaryExportSchema,
  type CreateBundleExportInput,
  type CreateDocumentExportInput,
  type CreateSummaryExportInput,
  type ExportJobSummary,
} from '@nis2/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExportsService, type ExportActor } from './exports.service';

@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get()
  list(@CurrentAuth() auth: AccessTokenClaims): Promise<ExportJobSummary[]> {
    return this.exportsService.list(actorOf(auth), organizationOf(auth));
  }

  @Post('documents/:documentId')
  @HttpCode(202)
  createDocumentExport(
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(createDocumentExportSchema)) body: CreateDocumentExportInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<ExportJobSummary> {
    return this.exportsService.createDocumentExport(
      actorOf(auth, request),
      organizationOf(auth),
      documentId,
      body,
    );
  }

  @Post('all')
  @HttpCode(202)
  createBundle(
    @Body(new ZodValidationPipe(createBundleExportSchema)) body: CreateBundleExportInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<ExportJobSummary> {
    return this.exportsService.createBundle(actorOf(auth, request), organizationOf(auth), body);
  }

  @Post('compliance-summary')
  @HttpCode(202)
  createSummary(
    @Body(new ZodValidationPipe(createSummaryExportSchema)) body: CreateSummaryExportInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<ExportJobSummary> {
    return this.exportsService.createSummary(actorOf(auth, request), organizationOf(auth), body);
  }

  @Get(':jobId')
  get(
    @Param('jobId') jobId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<ExportJobSummary> {
    return this.exportsService.get(actorOf(auth, request), organizationOf(auth), jobId);
  }

  @Get(':jobId/download')
  async download(
    @Param('jobId') jobId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const result = await this.exportsService.download(
      actorOf(auth, request),
      organizationOf(auth),
      jobId,
    );
    if (result.object.contentLength) {
      reply.header('Content-Length', result.object.contentLength);
    }
    reply
      .header('Content-Type', result.contentType)
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(result.object.body);
  }
}

function organizationOf(auth: AccessTokenClaims): string {
  if (!auth.org) {
    throw new BadRequestException({
      code: 'NO_ACTIVE_ORGANIZATION',
      message: 'Select an organization before exporting documents',
    });
  }
  return auth.org;
}

function actorOf(auth: AccessTokenClaims, request?: FastifyRequest): ExportActor {
  const userAgent = request?.headers['user-agent'];
  return {
    userId: auth.sub,
    globalRole: auth.role,
    ip: request?.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request?.id,
  };
}
