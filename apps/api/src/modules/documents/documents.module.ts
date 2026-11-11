import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * Phase 3 - template-driven document instances, autosave, immutable revisions,
 * named versions, approvals, diff/restore and review dates.
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
