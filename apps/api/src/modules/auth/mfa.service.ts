import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MfaFactor, User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { TokenService } from '../../common/crypto/token.service';
import { TotpService, safeEqualStrings } from '../../common/crypto/totp';
import type { AppEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

const SETUP_TTL_MS = 10 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
  expiresAt: string;
}

@Injectable()
export class MfaService {
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly totp: TotpService,
    private readonly encryption: EncryptionService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.issuer = config.get('AUTH_ISSUER', { infer: true });
  }

  async beginSetup(user: User): Promise<MfaSetup> {
    const verified = await this.prisma.mfaFactor.findFirst({
      where: { userId: user.id, verifiedAt: { not: null } },
    });
    if (verified) {
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'MFA is already enabled',
      });
    }

    await this.prisma.mfaFactor.deleteMany({ where: { userId: user.id, verifiedAt: null } });

    const secret = this.totp.generateSecret();
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      this.generateRecoveryCode(),
    );
    const encrypted = this.encryption.encrypt(secret);
    const createdAt = new Date();

    await this.prisma.mfaFactor.create({
      data: {
        userId: user.id,
        type: 'TOTP',
        secretEncrypted: encrypted,
        recoveryCodesHash: recoveryCodes.map((code) => this.tokens.hash(this.normalize(code))),
        createdAt,
      },
    });

    return {
      secret,
      otpauthUri: this.totp.otpauthUri(secret, user.email, this.issuer),
      recoveryCodes,
      expiresAt: new Date(createdAt.getTime() + SETUP_TTL_MS).toISOString(),
    };
  }

  async activate(userId: string, code: string): Promise<MfaFactor> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!factor) {
      throw new UnauthorizedException({ code: 'MFA_SETUP_EXPIRED', message: 'MFA setup expired' });
    }
    if (Date.now() - factor.createdAt.getTime() > SETUP_TTL_MS) {
      await this.prisma.mfaFactor.delete({ where: { id: factor.id } });
      throw new UnauthorizedException({ code: 'MFA_SETUP_EXPIRED', message: 'MFA setup expired' });
    }

    const secret = this.encryption.decrypt(factor.secretEncrypted);
    const step = this.totp.verify(secret, code);
    if (step === null) {
      throw new UnauthorizedException({ code: 'MFA_INVALID_CODE', message: 'Invalid code' });
    }

    const verifiedAt = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.mfaFactor.update({
        where: { id: factor.id },
        data: { verifiedAt, lastUsedStep: step },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } }),
    ]);
    return updated;
  }

  async verifyChallenge(userId: string, code: string): Promise<'totp' | 'recovery'> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId, verifiedAt: { not: null } },
      orderBy: { verifiedAt: 'desc' },
    });
    if (!factor) {
      throw new UnauthorizedException({ code: 'MFA_NOT_ENABLED', message: 'Invalid code' });
    }

    const secret = this.encryption.decrypt(factor.secretEncrypted);
    const step = this.totp.verify(secret, code);
    if (step !== null) {
      if (factor.lastUsedStep !== null && step <= factor.lastUsedStep) {
        throw new UnauthorizedException({ code: 'MFA_REPLAYED', message: 'Invalid code' });
      }
      await this.prisma.mfaFactor.update({
        where: { id: factor.id },
        data: { lastUsedStep: step },
      });
      return 'totp';
    }

    const normalized = this.normalize(code);
    const matchedIndex = factor.recoveryCodesHash.findIndex((hash) =>
      this.tokens.matches(normalized, hash),
    );
    if (matchedIndex === -1) {
      throw new UnauthorizedException({ code: 'MFA_INVALID_CODE', message: 'Invalid code' });
    }
    const remaining = factor.recoveryCodesHash.filter((_, index) => index !== matchedIndex);
    await this.prisma.mfaFactor.update({
      where: { id: factor.id },
      data: { recoveryCodesHash: remaining },
    });
    return 'recovery';
  }

  async disable(userId: string, code: string): Promise<void> {
    await this.verifyChallenge(userId, code);
    await this.prisma.$transaction([
      this.prisma.mfaFactor.deleteMany({ where: { userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } }),
    ]);
  }

  async hasVerifiedFactor(userId: string): Promise<boolean> {
    const count = await this.prisma.mfaFactor.count({
      where: { userId, verifiedAt: { not: null } },
    });
    return count > 0;
  }

  private normalize(code: string): string {
    return code.replaceAll('-', '').replaceAll(' ', '').toUpperCase();
  }

  private generateRecoveryCode(): string {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  }

  /** Exposed for tests; constant-time comparison of two codes. */
  static codesEqual(left: string, right: string): boolean {
    return safeEqualStrings(left, right);
  }
}
