import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface TenantStore {
  userId?: string;
  organizationId?: string;
  correlationId?: string;
}

/** Request/task-scoped tenant identity, used for audit and defensive checks. */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: () => Promise<T>): Promise<T> {
    return this.storage.run(store, callback);
  }

  get(): TenantStore | undefined {
    return this.storage.getStore();
  }
}
