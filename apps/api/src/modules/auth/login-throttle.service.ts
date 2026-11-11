import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis.module';

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 40;
const ACCOUNT_LIMIT = 10;

/**
 * Redis-backed distributed throttle for login attempts, complementing the
 * durable per-account lockout in the database. Failures here fail open; the
 * database lockout remains authoritative.
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async assertAllowed(ip: string, email: string): Promise<void> {
    try {
      const [ipCount, accountCount] = await Promise.all([
        this.redis.get(this.ipKey(ip)),
        this.redis.get(this.accountKey(email)),
      ]);
      if (Number(ipCount ?? 0) >= IP_LIMIT || Number(accountCount ?? 0) >= ACCOUNT_LIMIT) {
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn({ err: error }, 'Login throttle unavailable; allowing attempt');
    }
  }

  async recordFailure(ip: string, email: string): Promise<void> {
    await this.increment(this.ipKey(ip));
    await this.increment(this.accountKey(email));
  }

  async resetAccount(email: string): Promise<void> {
    try {
      await this.redis.del(this.accountKey(email));
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not reset account throttle');
    }
  }

  private async increment(key: string): Promise<void> {
    try {
      await this.redis.multi().incr(key).expire(key, WINDOW_SECONDS).exec();
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not record throttle failure');
    }
  }

  private ipKey(ip: string): string {
    return `auth:fail:ip:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
  }

  private accountKey(email: string): string {
    return `auth:fail:acct:${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)}`;
  }
}
