import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env';

export interface BreachCheckResult {
  checked: boolean;
  breached: boolean;
  occurrences: number;
}

/**
 * Have I Been Pwned k-anonymity range check. Only the first five SHA-1
 * characters leave the server; the full password and hash never do.
 *
 * Failure policy: if the upstream is unreachable, the check fails open but is
 * logged, because availability of registration/login must not depend on a third
 * party. Set BREACH_CHECK_ENABLED=false to disable it in air-gapped installs.
 */
@Injectable()
export class BreachCheckService {
  private readonly logger = new Logger(BreachCheckService.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async check(password: string): Promise<BreachCheckResult> {
    if (!this.config.get('BREACH_CHECK_ENABLED', { infer: true })) {
      return { checked: false, breached: false, occurrences: 0 };
    }

    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get('BREACH_CHECK_TIMEOUT_MS', { infer: true }),
    );

    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'nis2-compass-breach-check' },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn({ status: response.status }, 'Breach check upstream returned an error');
        return { checked: false, breached: false, occurrences: 0 };
      }
      const body = await response.text();
      for (const line of body.split('\n')) {
        const [candidate, count] = line.trim().split(':');
        if (candidate?.toUpperCase() === suffix) {
          const occurrences = Number.parseInt(count ?? '0', 10);
          return { checked: true, breached: occurrences > 0, occurrences };
        }
      }
      return { checked: true, breached: false, occurrences: 0 };
    } catch (error) {
      this.logger.warn({ err: error }, 'Breach check unavailable; allowing request');
      return { checked: false, breached: false, occurrences: 0 };
    } finally {
      clearTimeout(timeout);
    }
  }
}
