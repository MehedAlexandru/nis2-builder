import { Module } from '@nestjs/common';
import { ClassificationController } from './classification.controller';
import { ClassificationService } from './classification.service';

/**
 * Phase 2 — data-driven NIS2 classification rules, versioned runs and the
 * result PDF summary. Legal content lives in versioned jurisdiction packs.
 */
@Module({
  controllers: [ClassificationController],
  providers: [ClassificationService],
  exports: [ClassificationService],
})
export class ClassificationModule {}
