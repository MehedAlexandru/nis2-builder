import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Session } from '@prisma/client';
import { uuidv7 } from '../../common/id';
import { TokenService } from '../../common/crypto/token.service';
import type { AppEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  refreshMaxAgeSeconds: number;
}

interface RequestMetadata {
  userAgent?: string | null;
  ip?: string | null;
}

@Injectable()
export class SessionService {
  private readonly refreshTtl: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.refreshTtl = config.get('JWT_REFRESH_TTL_SECONDS', { infer: true });
  }

  get refreshTtlSeconds(): number {
    return this.refreshTtl;
  }

  async create(
    userId: string,
    organizationId: string | null,
    metadata: RequestMetadata,
  ): Promise<IssuedSession> {
    const sessionId = uuidv7();
    const refresh = this.tokens.generate(32);
    const expiresAt = new Date(Date.now() + this.refreshTtl * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          id: sessionId,
          userId,
          organizationId,
          userAgent: metadata.userAgent?.slice(0, 512) ?? null,
          ip: metadata.ip?.slice(0, 64) ?? null,
        },
      });
      const refreshRow = await tx.refreshToken.create({
        data: {
          id: uuidv7(),
          userId,
          familyId: sessionId,
          tokenHash: refresh.hash,
          expiresAt,
          userAgent: metadata.userAgent?.slice(0, 512) ?? null,
          ip: metadata.ip?.slice(0, 64) ?? null,
        },
      });
      await tx.session.update({
        where: { id: sessionId },
        data: { refreshTokenId: refreshRow.id },
      });
    });

    return { sessionId, refreshToken: refresh.token, refreshMaxAgeSeconds: this.refreshTtl };
  }

  async rotate(
    rawToken: string,
    metadata: RequestMetadata,
  ): Promise<{ issued: IssuedSession; session: Session }> {
    const now = new Date();
    const hash = this.tokens.hash(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!existing) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session expired' });
    }

    if (existing.revokedAt) {
      // Reuse of a rotated token: compromise signal. Revoke the whole family.
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException({ code: 'REFRESH_REUSE', message: 'Session expired' });
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session expired' });
    }

    const session = await this.prisma.session.findUnique({ where: { id: existing.familyId } });
    if (!session || session.revokedAt) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session expired' });
    }

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException({ code: 'REFRESH_REUSE', message: 'Session expired' });
    }

    const next = this.tokens.generate(32);
    const nextId = uuidv7();
    const nextExpiresAt = new Date(now.getTime() + this.refreshTtl * 1000);

    const [, updatedSession] = await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          id: nextId,
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: next.hash,
          expiresAt: nextExpiresAt,
          userAgent: metadata.userAgent?.slice(0, 512) ?? null,
          ip: metadata.ip?.slice(0, 64) ?? null,
        },
      }),
      this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          refreshTokenId: nextId,
          userAgent: metadata.userAgent?.slice(0, 512) ?? session.userAgent,
          ip: metadata.ip?.slice(0, 64) ?? session.ip,
        },
      }),
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { replacedById: nextId },
      }),
    ]);

    return {
      issued: {
        sessionId: session.id,
        refreshToken: next.token,
        refreshMaxAgeSeconds: this.refreshTtl,
      },
      session: updatedSession,
    };
  }

  async list(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async revoke(sessionId: string, userId: string): Promise<boolean> {
    const updated = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) return false;
    await this.revokeFamily(sessionId);
    return true;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.session.updateMany({
        where: { id: familyId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async findValidSession(sessionId: string, userId: string): Promise<Session | null> {
    return this.prisma.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
  }
}
