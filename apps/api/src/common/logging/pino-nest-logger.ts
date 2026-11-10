import type { LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';

function asMessage(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, asMessage(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, asMessage(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, asMessage(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, asMessage(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, asMessage(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal({ context }, asMessage(message));
  }
}
