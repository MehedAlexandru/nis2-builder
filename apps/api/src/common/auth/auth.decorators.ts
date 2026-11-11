import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { GlobalRole } from '@nis2/shared';
import type { FastifyRequest } from 'fastify';
import type { AccessTokenClaims } from '../crypto/jwt.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Marks a route as reachable without a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to one of the given global roles (defense in depth). */
export const Roles = (...roles: GlobalRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.auth) {
      throw new Error('CurrentAuth used on an unauthenticated route');
    }
    return request.auth;
  },
);
