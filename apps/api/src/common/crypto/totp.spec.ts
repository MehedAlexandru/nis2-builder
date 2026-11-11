import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  safeEqualStrings,
  totp,
} from './totp';

const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_BASE32 = base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'));

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const input = Buffer.from('NIS2 Compass secret');
    expect(base32Decode(base32Encode(input))).toEqual(input);
  });

  it('rejects invalid characters', () => {
    expect(() => base32Decode('INVALID!')).toThrow();
  });
});

describe('hotp/totp (RFC 4226/6238)', () => {
  it('matches the RFC 6238 SHA-1 vectors (6 digits)', () => {
    const secret = base32Decode(RFC_SECRET_BASE32);
    expect(totp(secret, 59_000, 30, 6)).toBe('287082');
    expect(totp(secret, 1_111_111_109_000, 30, 6)).toBe('081804');
    expect(totp(secret, 1_111_111_111_000, 30, 6)).toBe('050471');
  });

  it('produces a 6-digit HOTP from the RFC 4226 secret', () => {
    expect(hotp(Buffer.from(RFC_SECRET_ASCII, 'ascii'), 0)).toBe('755224');
    expect(hotp(Buffer.from(RFC_SECRET_ASCII, 'ascii'), 1)).toBe('287082');
  });

  it('generates 20-byte base32 secrets', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });
});

describe('safeEqualStrings', () => {
  it('compares equal strings and rejects different lengths', () => {
    expect(safeEqualStrings('123456', '123456')).toBe(true);
    expect(safeEqualStrings('123456', '123457')).toBe(false);
    expect(safeEqualStrings('123456', '12345')).toBe(false);
  });
});
