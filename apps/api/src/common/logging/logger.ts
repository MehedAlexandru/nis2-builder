import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level = 'info', service = 'nis2-api'): Logger {
  return pino({
    level,
    base: {
      service,
      env: process.env.NODE_ENV ?? 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        'token',
        'secret',
        '*.password',
        '*.token',
        '*.secret',
        '*.passwordHash',
      ],
      censor: '[REDACTED]',
    },
  });
}
