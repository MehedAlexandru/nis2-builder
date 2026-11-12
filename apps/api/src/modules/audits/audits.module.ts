import { Module } from '@nestjs/common';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';

/**
 * Phase 5 - dated audit snapshots, the React Flow network map, manual device
 * inventory, assessments, zones, connections and Nmap/CSV imports.
 */
@Module({
  controllers: [AuditsController],
  providers: [AuditsService],
  exports: [AuditsService],
})
export class AuditsModule {}
