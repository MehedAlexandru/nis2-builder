import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    correlationId?: string;
    details?: unknown;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = isHttp ? `HTTP_${status}` : 'INTERNAL_ERROR';
    let message = isHttp ? exception.message : 'Internal server error';
    let details: unknown;

    if (isHttp) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const body = response as Record<string, unknown>;
        if (typeof body.code === 'string') {
          code = body.code;
        }
        if (typeof body.message === 'string') {
          message = body.message;
        } else if (Array.isArray(body.message)) {
          message = body.message.join(', ');
        }
        if (body.details !== undefined) {
          details = body.details;
        }
      }
    } else {
      this.logger.error(
        { err: exception, reqId: request.id, url: request.url },
        'Unhandled exception',
      );
    }

    const payload: ErrorEnvelope = {
      error: {
        code,
        message,
        correlationId: request.id,
      },
    };
    if (details !== undefined) {
      payload.error.details = details;
    }

    void reply.status(status).send(payload);
  }
}
