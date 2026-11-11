import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * AES-256-GCM envelope primitive used for sensitive secrets (TOTP seeds).
 * The master key is a base64-encoded 32-byte value from configuration/KMS.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService<AppEnv, true>) {
    const encoded = config.get('ENCRYPTION_MASTER_KEY', { infer: true });
    if (!encoded) {
      this.key = null;
      return;
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes');
    }
    this.key = key;
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.key) throw new Error('ENCRYPTION_MASTER_KEY is not configured');
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    if (!this.key) throw new Error('ENCRYPTION_MASTER_KEY is not configured');
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unsupported encrypted payload');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
