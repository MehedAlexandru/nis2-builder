import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const normalized = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(buffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function totp(
  secret: Buffer,
  timestampMs = Date.now(),
  periodSeconds = 30,
  digits = 6,
): string {
  return hotp(secret, Math.floor(timestampMs / 1000 / periodSeconds), digits);
}

export function safeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/** RFC 6238 TOTP with a ±1 step window, as required for clock drift. */
@Injectable()
export class TotpService {
  readonly periodSeconds = 30;
  readonly digits = 6;

  generateSecret(): string {
    return generateTotpSecret();
  }

  currentCode(secret: string, timestampMs = Date.now()): string {
    return totp(base32Decode(secret), timestampMs, this.periodSeconds, this.digits);
  }

  /** Returns the matched TOTP step (for replay prevention) or null. */
  verify(secret: string, code: string, timestampMs = Date.now()): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const key = base32Decode(secret);
    const counter = Math.floor(timestampMs / 1000 / this.periodSeconds);
    for (let offset = -1; offset <= 1; offset += 1) {
      const step = counter + offset;
      const candidate = hotp(key, step, this.digits);
      if (safeEqualStrings(candidate, code)) return step;
    }
    return null;
  }

  otpauthUri(secret: string, email: string, issuer: string): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(this.digits),
      period: String(this.periodSeconds),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }
}
