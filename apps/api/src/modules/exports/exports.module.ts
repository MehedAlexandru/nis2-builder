import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

/**
 * Phase 4 - DOCX/PDF/ZIP export jobs from the canonical content model, plus
 * the compliance summary report.
 */
@Module({
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
