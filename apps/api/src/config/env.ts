import { z } from 'zod';

const DEV_DATABASE_URL =
  'postgresql://nis2:nis2_dev_password@localhost:5432/nis2_compass?schema=public';

const booleanString = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

const optionalSecret = z.string().min(32).optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    ENABLE_QUEUES: booleanString(true),
    METRICS_ENABLED: booleanString(true),

    DATABASE_URL: z.string().min(1).default(DEV_DATABASE_URL),
    APP_DATABASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

    JWT_ACCESS_SECRET: optionalSecret,
    JWT_REFRESH_SECRET: optionalSecret,
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
    AUTH_ISSUER: z.string().min(1).default('nis2-compass'),
    AUTH_AUDIENCE: z.string().min(1).default('nis2-compass-web'),
    COOKIE_SECRET: optionalSecret,
    COOKIE_SECURE: booleanString(true),
    ENCRYPTION_MASTER_KEY: optionalSecret,
    ADMIN_BOOTSTRAP_TOKEN: z.string().min(32).optional(),
    BREACH_CHECK_ENABLED: booleanString(true),
    BREACH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(2_500),
    ARGON2_MEMORY_KIB: z.coerce.number().int().min(8_192).max(262_144).default(19_456),
    ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(2),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(8).default(1),

    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('eu-central-1'),
    S3_BUCKET: z.string().default('nis2-compass'),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: booleanString(true),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: booleanString(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),

    OTEL_ENABLED: booleanString(false),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

    FEATURE_AI_ASSIST: booleanString(false),
    FEATURE_WEBAUTHN: booleanString(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    const requiredInProduction = [
      ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
      ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
      ['COOKIE_SECRET', env.COOKIE_SECRET],
      ['ENCRYPTION_MASTER_KEY', env.ENCRYPTION_MASTER_KEY],
      ['S3_ACCESS_KEY', env.S3_ACCESS_KEY],
      ['S3_SECRET_KEY', env.S3_SECRET_KEY],
      ['SMTP_HOST', env.SMTP_HOST],
      ['MAIL_FROM', env.MAIL_FROM],
    ] as const;

    for (const [key, value] of requiredInProduction) {
      if (!value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }

    if (
      env.JWT_ACCESS_SECRET?.startsWith('local-dev-only') ||
      env.JWT_REFRESH_SECRET?.startsWith('local-dev-only') ||
      env.COOKIE_SECRET?.startsWith('local-dev-only')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'development secret placeholders must be replaced in production',
      });
    }

    if (env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('nis2_dev_password')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL must point to a non-development database in production',
      });
    }

    if (env.PUBLIC_APP_URL.includes('localhost') || env.CORS_ORIGINS.includes('localhost')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_APP_URL'],
        message: 'PUBLIC_APP_URL and CORS_ORIGINS must use production origins',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
