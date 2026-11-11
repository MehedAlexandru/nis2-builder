import type { User } from '@prisma/client';
import type { AuthUser } from '@nis2/shared';

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    givenName: user.givenName,
    familyName: user.familyName,
    globalRole: user.globalRole,
    status: user.status,
    locale: user.locale,
    timezone: user.timezone,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    mfaEnabled: user.mfaEnabled,
  };
}
