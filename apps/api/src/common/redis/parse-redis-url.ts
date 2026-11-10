import type { RedisOptions } from 'ioredis';

/**
 * BullMQ/ioredis accept a URL for the standalone client, but connection option
 * objects are more predictable for workers. Keep parsing in one place.
 */
export function parseRedisUrl(raw: string): RedisOptions {
  const url = new URL(raw);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(`Unsupported Redis protocol: ${url.protocol}`);
  }

  const dbPath = url.pathname.replace(/^\//, '');

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: dbPath ? Number(dbPath) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
