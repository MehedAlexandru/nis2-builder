import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  documentApprovalInputSchema,
  documentCreateInputSchema,
  documentRestoreInputSchema,
  documentSaveInputSchema,
  documentVersionInputSchema,
  type DocumentApprovalInput,
  type DocumentCatalog,
  type DocumentCreateInput,
  type DocumentDetail,
  type DocumentRevisionDetail,
  type DocumentRevisionSummary,
  type DocumentRestoreInput,
  type DocumentSaveInput,
  type DocumentVersion,
  type DocumentVersionInput,
} from '@nis2/shared';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth } from '../../common/auth/auth.decorators';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DocumentsService, type DocumentActor } from './documents.service';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  catalog(@CurrentAuth() auth: AccessTokenClaims): Promise<DocumentCatalog> {
    return this.documents.catalog(actorOf(auth), organizationOf(auth));
  }

  @Post()
  @HttpCode(201)
  open(
    @Body(new ZodValidationPipe(documentCreateInputSchema)) body: DocumentCreateInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.ensureDocument(
      actorOf(auth, request),
      organizationOf(auth),
      body.templateKey,
    );
  }

  @Get(':documentId')
  detail(
    @Param('documentId') documentId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.detail(actorOf(auth, request), organizationOf(auth), documentId);
  }

  @Patch(':documentId')
  save(
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(documentSaveInputSchema)) body: DocumentSaveInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.save(actorOf(auth, request), organizationOf(auth), documentId, body);
  }

  @Post(':documentId/lock')
  @HttpCode(200)
  lock(
    @Param('documentId') documentId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.lock(actorOf(auth, request), organizationOf(auth), documentId);
  }

  @Delete(':documentId/lock')
  unlock(
    @Param('documentId') documentId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.unlock(actorOf(auth, request), organizationOf(auth), documentId);
  }

  @Get(':documentId/revisions')
  revisions(
    @Param('documentId') documentId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentRevisionSummary[]> {
    return this.documents.revisions(actorOf(auth, request), organizationOf(auth), documentId);
  }

  @Get(':documentId/revisions/:revisionNo')
  revision(
    @Param('documentId') documentId: string,
    @Param('revisionNo') revisionNo: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentRevisionDetail> {
    return this.documents.revision(
      actorOf(auth, request),
      organizationOf(auth),
      documentId,
      revisionNumber(revisionNo),
    );
  }

  @Post(':documentId/revisions/:revisionNo/restore')
  @HttpCode(200)
  restore(
    @Param('documentId') documentId: string,
    @Param('revisionNo') revisionNo: string,
    @Body(new ZodValidationPipe(documentRestoreInputSchema)) body: DocumentRestoreInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.restore(
      actorOf(auth, request),
      organizationOf(auth),
      documentId,
      revisionNumber(revisionNo),
      body.changeNote,
    );
  }

  @Get(':documentId/versions')
  versions(
    @Param('documentId') documentId: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentVersion[]> {
    return this.documents.versions(actorOf(auth, request), organizationOf(auth), documentId);
  }

  @Post(':documentId/versions')
  @HttpCode(201)
  publish(
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(documentVersionInputSchema)) body: DocumentVersionInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.publishVersion(
      actorOf(auth, request),
      organizationOf(auth),
      documentId,
      body,
    );
  }

  @Post(':documentId/versions/:versionId/approve')
  @HttpCode(200)
  approve(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(documentApprovalInputSchema)) body: DocumentApprovalInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<DocumentDetail> {
    return this.documents.approveVersion(
      actorOf(auth, request),
      organizationOf(auth),
      documentId,
      versionId,
      body,
    );
  }
}

function organizationOf(auth: AccessTokenClaims): string {
  if (!auth.org) {
    throw new BadRequestException({
      code: 'NO_ACTIVE_ORGANIZATION',
      message: 'Select an organization before using documents',
    });
  }
  return auth.org;
}

function actorOf(auth: AccessTokenClaims, request?: FastifyRequest): DocumentActor {
  const userAgent = request?.headers['user-agent'];
  return {
    userId: auth.sub,
    globalRole: auth.role,
    ip: request?.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request?.id,
  };
}

function revisionNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException({
      code: 'REVISION_INVALID',
      message: 'Revision number must be a positive integer',
    });
  }
  return parsed;
}
