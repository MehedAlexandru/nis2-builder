import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Opaque, high-entropy tokens (verification, reset, invite, refresh).
 * Only the SHA-256 hash is stored; the plaintext leaves the server once.
 */
@Injectable()
export class TokenService {
  generate(bytes = 32): { token: string; hash: string } {
    const token = randomBytes(bytes).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  matches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(token), 'utf8');
    const expected = Buffer.from(expectedHash, 'utf8');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }

  randomCode(length = 6): string {
    const digits = '0123456789';
    let code = '';
    for (let index = 0; index < length; index += 1) {
      const byte = randomBytes(1)[0] ?? 0;
      code += digits[byte % digits.length];
    }
    return code;
  }
}
