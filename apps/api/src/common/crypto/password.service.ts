import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';
import type { AppEnv } from '../../config/env';

/** Argon2id hashing with ASVS-aligned defaults. Parameters are configurable per deployment. */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly options: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
  private dummyHashPromise: Promise<string> | null = null;

  constructor(config: ConfigService<AppEnv, true>) {
    this.options = {
      memoryCost: config.get('ARGON2_MEMORY_KIB', { infer: true }),
      timeCost: config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: config.get('ARGON2_PARALLELISM', { infer: true }),
    };
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  async verify(hashValue: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashValue, plain);
    } catch (error) {
      this.logger.warn({ err: error }, 'Argon2 verification failed');
      return false;
    }
  }

  /**
   * Constant-work verification used when an account does not exist, so login
   * timing does not reveal whether an email is registered.
   */
  async fakeVerify(plain: string): Promise<void> {
    this.dummyHashPromise ??= this.hash('timing-equalisation-dummy-password');
    const dummy = await this.dummyHashPromise;
    await this.verify(dummy, plain);
  }
}
