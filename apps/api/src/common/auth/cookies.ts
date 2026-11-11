import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';

export const REFRESH_COOKIE = 'nis2_refresh';
export const CSRF_COOKIE = 'nis2_csrf';
export const REFRESH_COOKIE_PATH = '/api/auth';
export const CSRF_HEADER = 'x-csrf-token';

export function refreshCookieOptions(
  maxAgeSeconds: number,
  secure: boolean,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  };
}

export function csrfCookieOptions(maxAgeSeconds: number, secure: boolean): CookieSerializeOptions {
  return {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash a CSRF token for safe comparison storage. */
export function hashCsrfToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function csrfTokensMatch(cookieValue: string, headerValue: string): boolean {
  const left = Buffer.from(hashCsrfToken(cookieValue), 'utf8');
  const right = Buffer.from(hashCsrfToken(headerValue), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
