import type { TFunction } from 'i18next';

type ErrorKey =
  | 'auth.errors.generic'
  | 'auth.errors.INVALID_CREDENTIALS'
  | 'auth.errors.EMAIL_NOT_VERIFIED'
  | 'auth.errors.ACCOUNT_LOCKED'
  | 'auth.errors.RATE_LIMITED'
  | 'auth.errors.PASSWORD_BREACHED'
  | 'auth.errors.PASSWORD_TOO_SHORT'
  | 'auth.errors.VALIDATION_ERROR'
  | 'auth.errors.CSRF_INVALID'
  | 'auth.errors.MFA_INVALID_CODE'
  | 'auth.errors.MFA_SETUP_EXPIRED'
  | 'auth.errors.INVALID_TOKEN'
  | 'auth.errors.INVALID_INVITE'
  | 'auth.errors.ACCOUNT_EXISTS'
  | 'auth.errors.FORBIDDEN'
  | 'auth.errors.OWNER_REQUIRED'
  | 'auth.errors.LAST_OWNER'
  | 'auth.errors.ALREADY_MEMBER';

const ERROR_KEYS: Record<string, ErrorKey> = {
  INVALID_CREDENTIALS: 'auth.errors.INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'auth.errors.EMAIL_NOT_VERIFIED',
  ACCOUNT_LOCKED: 'auth.errors.ACCOUNT_LOCKED',
  RATE_LIMITED: 'auth.errors.RATE_LIMITED',
  PASSWORD_BREACHED: 'auth.errors.PASSWORD_BREACHED',
  PASSWORD_TOO_SHORT: 'auth.errors.PASSWORD_TOO_SHORT',
  VALIDATION_ERROR: 'auth.errors.VALIDATION_ERROR',
  CSRF_INVALID: 'auth.errors.CSRF_INVALID',
  MFA_INVALID_CODE: 'auth.errors.MFA_INVALID_CODE',
  MFA_SETUP_EXPIRED: 'auth.errors.MFA_SETUP_EXPIRED',
  INVALID_TOKEN: 'auth.errors.INVALID_TOKEN',
  INVALID_INVITE: 'auth.errors.INVALID_INVITE',
  ACCOUNT_EXISTS: 'auth.errors.ACCOUNT_EXISTS',
  FORBIDDEN: 'auth.errors.FORBIDDEN',
  NOT_A_MEMBER: 'auth.errors.FORBIDDEN',
  OWNER_REQUIRED: 'auth.errors.OWNER_REQUIRED',
  LAST_OWNER: 'auth.errors.LAST_OWNER',
  ALREADY_MEMBER: 'auth.errors.ALREADY_MEMBER',
};

export function authErrorText(t: TFunction, code: string, fallback: string): string {
  const key = ERROR_KEYS[code];
  return key ? t(key) : fallback;
}
