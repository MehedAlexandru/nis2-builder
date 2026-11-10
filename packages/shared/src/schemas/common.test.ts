import { describe, expect, it } from 'vitest';
import { emailSchema, paginationQuerySchema, passwordSchema } from './common';

describe('emailSchema', () => {
  it('trims and lowercases valid addresses', () => {
    expect(emailSchema.parse('  Alex.Mehed@Example.COM ')).toBe('alex.mehed@example.com');
  });

  it('rejects malformed addresses', () => {
    expect(() => emailSchema.parse('not-an-email')).toThrow();
  });
});

describe('passwordSchema', () => {
  it('enforces the 12-character minimum', () => {
    expect(() => passwordSchema.parse('short')).toThrow();
    expect(passwordSchema.parse('correct horse battery staple')).toHaveLength(28);
  });

  it('accepts long passphrases without composition theatre', () => {
    const passphrase = 'a'.repeat(64);
    expect(passwordSchema.parse(passphrase)).toBe(passphrase);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults and coerces query strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('caps page size', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: '1000' })).toThrow();
  });
});
