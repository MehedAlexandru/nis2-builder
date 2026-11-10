import { Injectable, type OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  onModuleInit(): void {
    this.registry.setDefaultLabels({ service: 'nis2-api' });
    collectDefaultMetrics({ register: this.registry, prefix: 'nis2_api_' });
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
