import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CSRF_COOKIE, CSRF_HEADER, csrfTokensMatch } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Endpoints that establish a session (or are account-recovery flows) have no
 * CSRF token yet and are exempt. Every other state-changing request must carry
 * the double-submit token.
 */
const EXEMPT_SUFFIXES = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/accept-invite',
  '/auth/mfa/challenge',
  '/auth/mfa/setup',
  '/auth/mfa/activate',
];

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method.toUpperCase();
    if (SAFE_METHODS.has(method)) return true;

    const path = (request.url.split('?')[0] ?? '').replace(/\/$/, '');
    if (EXEMPT_SUFFIXES.some((suffix) => path.endsWith(suffix))) return true;

    const cookie = request.cookies?.[CSRF_COOKIE];
    const header = request.headers[CSRF_HEADER];
    const headerValue = Array.isArray(header) ? header[0] : header;
    if (!cookie || !headerValue || !csrfTokensMatch(cookie, headerValue)) {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'Missing or invalid CSRF token',
      });
    }
    return true;
  }
}
