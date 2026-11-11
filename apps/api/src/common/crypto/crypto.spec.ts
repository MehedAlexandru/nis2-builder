import type { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env';
import { EncryptionService } from './encryption.service';
import { PasswordService } from './password.service';

function configWith(values: Record<string, unknown>): ConfigService<AppEnv, true> {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService<AppEnv, true>;
}

describe('PasswordService', () => {
  const service = new PasswordService(
    configWith({
      ARGON2_MEMORY_KIB: 8_192,
      ARGON2_TIME_COST: 2,
      ARGON2_PARALLELISM: 1,
    }),
  );

  it('hashes with Argon2id and verifies the password', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('does not throw on malformed hashes', async () => {
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });
});

describe('EncryptionService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('round-trips AES-256-GCM payloads', () => {
    const service = new EncryptionService(configWith({ ENCRYPTION_MASTER_KEY: key }));
    const ciphertext = service.encrypt('BASE32SECRET');
    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(service.decrypt(ciphertext)).toBe('BASE32SECRET');
  });

  it('rejects tampered ciphertext', () => {
    const service = new EncryptionService(configWith({ ENCRYPTION_MASTER_KEY: key }));
    const ciphertext = service.encrypt('BASE32SECRET');
    const parts = ciphertext.split(':');
    parts[3] = `${parts[3]?.slice(0, -2)}AA`;
    expect(() => service.decrypt(parts.join(':'))).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(
      () =>
        new EncryptionService(
          configWith({ ENCRYPTION_MASTER_KEY: Buffer.alloc(16).toString('base64') }),
        ),
    ).toThrow(/32 bytes/);
  });
});
