import { validateEnv } from './env';

describe('validateEnv', () => {
  it('applies development defaults', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.ENABLE_QUEUES).toBe(true);
    expect(env.DATABASE_URL).toContain('localhost');
  });

  it('coerces numeric and boolean values', () => {
    const env = validateEnv({
      API_PORT: '8080',
      ENABLE_QUEUES: 'false',
      SMTP_SECURE: 'true',
    });
    expect(env.API_PORT).toBe(8080);
    expect(env.ENABLE_QUEUES).toBe(false);
    expect(env.SMTP_SECURE).toBe(true);
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ API_PORT: 'not-a-port' })).toThrow(/API_PORT/);
    expect(() => validateEnv({ API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('requires hardened secrets in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects development placeholders in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://nis2:nis2_dev_password@localhost:5432/nis2',
        JWT_ACCESS_SECRET: 'local-dev-only-change-me-access-secret',
        JWT_REFRESH_SECRET: 'a'.repeat(48),
        COOKIE_SECRET: 'b'.repeat(48),
        ENCRYPTION_MASTER_KEY: 'c'.repeat(44),
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
        SMTP_HOST: 'smtp.example.com',
        MAIL_FROM: 'NIS2 <no-reply@example.com>',
        PUBLIC_APP_URL: 'https://app.example.com',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/DATABASE_URL|placeholders/);
  });

  it('accepts a complete production configuration', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://nis2:strong-password@db.internal:5432/nis2',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      COOKIE_SECRET: 'c'.repeat(48),
      ENCRYPTION_MASTER_KEY: 'd'.repeat(44),
      S3_ACCESS_KEY: 'key',
      S3_SECRET_KEY: 'secret',
      SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'NIS2 <no-reply@example.com>',
      PUBLIC_APP_URL: 'https://app.example.com',
      CORS_ORIGINS: 'https://app.example.com',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.PUBLIC_APP_URL).toBe('https://app.example.com');
  });
});
