import { Module } from '@nestjs/common';
import { AgentIngestController } from './agent-ingest.controller';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

/**
 * Phase 6 - one-time agent enrollment, outbound heartbeat/job polling,
 * signed scan result ingestion and diff-based rescans.
 */
@Module({
  controllers: [AgentsController, AgentIngestController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
