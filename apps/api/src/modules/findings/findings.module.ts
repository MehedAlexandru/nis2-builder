import { Module } from '@nestjs/common';
import { FindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

/**
 * Phase 7 - findings and remediation register, auto-suggested findings,
 * risk acceptance and the risk-register feed.
 */
@Module({
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService],
})
export class FindingsModule {}
