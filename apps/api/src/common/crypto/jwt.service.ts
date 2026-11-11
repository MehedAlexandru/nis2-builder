import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { AppEnv } from '../../config/env';
import type { GlobalRole } from '@nis2/shared';

export type TokenType = 'access' | 'mfa_challenge' | 'mfa_setup';

export interface AccessTokenClaims {
  typ: 'access';
  sub: string;
  sid: string;
  role: GlobalRole;
  org: string | null;
  mfa: boolean;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface MfaTokenClaims {
  typ: 'mfa_challenge' | 'mfa_setup';
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export type AnyTokenClaims = AccessTokenClaims | MfaTokenClaims;

@Injectable()
export class JwtTokenService {
  private readonly accessSecret: string;
  private readonly accessTtl: number;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: ConfigService<AppEnv, true>) {
    const secret = config.get('JWT_ACCESS_SECRET', { infer: true });
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters');
    }
    this.accessSecret = secret;
    this.accessTtl = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    this.issuer = config.get('AUTH_ISSUER', { infer: true });
    this.audience = config.get('AUTH_AUDIENCE', { infer: true });
  }

  get accessTtlSeconds(): number {
    return this.accessTtl;
  }

  signAccess(input: {
    userId: string;
    sessionId: string;
    role: GlobalRole;
    organizationId: string | null;
    mfaSatisfied: boolean;
  }): string {
    return jwt.sign(
      {
        typ: 'access',
        sid: input.sessionId,
        role: input.role,
        org: input.organizationId,
        mfa: input.mfaSatisfied,
      },
      this.accessSecret,
      {
        algorithm: 'HS256',
        subject: input.userId,
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: this.accessTtl,
      },
    );
  }

  signMfaChallenge(userId: string, ttlSeconds = 300): string {
    return this.signMfa(userId, 'mfa_challenge', ttlSeconds);
  }

  signMfaSetup(userId: string, ttlSeconds = 600): string {
    return this.signMfa(userId, 'mfa_setup', ttlSeconds);
  }

  private signMfa(userId: string, typ: 'mfa_challenge' | 'mfa_setup', ttlSeconds: number): string {
    return jwt.sign({ typ }, this.accessSecret, {
      algorithm: 'HS256',
      subject: userId,
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: ttlSeconds,
    });
  }

  verify(token: string): AnyTokenClaims {
    const decoded = jwt.verify(token, this.accessSecret, {
      algorithms: ['HS256'],
      issuer: this.issuer,
      audience: this.audience,
    });
    if (typeof decoded === 'string' || !decoded || typeof decoded.typ !== 'string') {
      throw new Error('Malformed token');
    }
    return decoded as AnyTokenClaims;
  }

  verifyAccess(token: string): AccessTokenClaims {
    const claims = this.verify(token);
    if (claims.typ !== 'access') throw new Error('Expected an access token');
    return claims;
  }

  verifyMfa(token: string, expected: 'mfa_challenge' | 'mfa_setup'): MfaTokenClaims {
    const claims = this.verify(token);
    if (claims.typ !== expected) throw new Error('Unexpected token type');
    return claims;
  }
}
