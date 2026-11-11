import type { AccessTokenClaims } from '../crypto/jwt.service';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessTokenClaims;
  }
}

export { type AccessTokenClaims };
