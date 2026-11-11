import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Membership, Organization, User } from '@prisma/client';
import {
  type AcceptInviteInput,
  type AuthResponse,
  type LoginInput,
  type MfaRequiredResponse,
  type MfaSetupRequiredResponse,
  type OrganizationSummary,
  type RegisterInput,
  type ResetPasswordInput,
  type SelectOrganizationInput,
} from '@nis2/shared';
import { AuditService } from '../../common/audit/audit.service';
import { toAuthUser } from '../../common/auth/user-mapper';
import { BreachCheckService } from '../../common/breach/breach-check.service';
import { JwtTokenService } from '../../common/crypto/jwt.service';
import { PasswordService } from '../../common/crypto/password.service';
import { TokenService } from '../../common/crypto/token.service';
import { uuidv7 } from '../../common/id';
import { MailService } from '../../common/mail/mail.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import type { AppEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginThrottleService } from './login-throttle.service';
import { MfaService } from './mfa.service';
import { SessionService } from './session.service';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

type MembershipWithOrg = Membership & { organization: Organization };

export type LoginResult =
  | { kind: 'tokens'; response: AuthResponse; refreshToken: string; refreshMaxAge: number }
  | { kind: 'mfa'; response: MfaRequiredResponse }
  | { kind: 'mfa_setup'; response: MfaSetupRequiredResponse };

const MAX_FAILED_LOGINS = 5;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly passwordMin: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly passwords: PasswordService,
    private readonly breach: BreachCheckService,
    private readonly tokens: TokenService,
    private readonly jwt: JwtTokenService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly throttle: LoginThrottleService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.passwordMin = config.get('NODE_ENV', { infer: true }) === 'test' ? 8 : 12;
  }

  async register(input: RegisterInput, meta: RequestMeta): Promise<{ message: string }> {
    await this.assertPasswordAcceptable(input.password);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });

    // Always answer the same way; do not reveal whether the email is taken.
    const generic = {
      message: 'If the email is new, a verification message has been sent.',
    };
    if (existing) return generic;

    const passwordHash = await this.passwords.hash(input.password);
    const userId = uuidv7();
    const organizationId = uuidv7();
    const countryCode = input.countryCode;

    try {
      await this.tenantPrisma.runInTenant(organizationId, userId, async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email: input.email,
            passwordHash,
            givenName: input.givenName,
            familyName: input.familyName,
            locale: input.locale,
            status: 'PENDING',
          },
        });
        await tx.organization.create({
          data: {
            id: organizationId,
            name: input.organizationName,
            countryCode,
            jurisdictionPackCode: countryCode,
            companyProfile: { create: { legalName: input.organizationName, countryCode } },
          },
        });
        await tx.membership.create({
          data: { id: uuidv7(), organizationId, userId, role: 'OWNER' },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return generic;
      throw error;
    }

    await this.sendVerificationEmail(userId, input.email, input.locale, input.givenName);
    await this.audit.record({
      action: 'AUTH_REGISTER',
      actorUserId: userId,
      actorRole: 'USER',
      organizationId,
      resourceType: 'user',
      resourceId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
    return generic;
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<{ message: string }> {
    const hash = this.tokens.hash(token);
    const row = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (
      !row ||
      row.usedAt ||
      row.expiresAt.getTime() <= Date.now() ||
      row.user.status === 'DISABLED'
    ) {
      throw new BadRequestException({ code: 'INVALID_TOKEN', message: 'Invalid or expired link' });
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: now } }),
      this.prisma.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: now, status: 'ACTIVE' },
      }),
    ]);

    await this.audit.record({
      action: 'AUTH_EMAIL_VERIFIED',
      actorUserId: row.userId,
      actorRole: row.user.globalRole,
      resourceType: 'user',
      resourceId: row.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
    return { message: 'Email verified. You can now sign in.' };
  }

  async resendVerification(email: string, meta: RequestMeta): Promise<{ message: string }> {
    const generic = { message: 'If the account needs verification, a message has been sent.' };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'PENDING') return generic;
    await this.sendVerificationEmail(user.id, user.email, user.locale, user.givenName);
    void meta;
    return generic;
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
    await this.throttle.assertAllowed(meta.ip ?? 'unknown', input.email);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      await this.passwords.fakeVerify(input.password);
      await this.throttle.recordFailure(meta.ip ?? 'unknown', input.email);
      await this.recordLoginFailure(null, meta, 'unknown-account');
      throw invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.throttle.recordFailure(meta.ip ?? 'unknown', input.email);
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many attempts. Try again later.',
      });
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.registerFailedLogin(user);
      await this.throttle.recordFailure(meta.ip ?? 'unknown', input.email);
      await this.recordLoginFailure(user.id, meta, 'bad-password');
      throw invalidCredentials();
    }

    if (user.status === 'DISABLED') {
      await this.recordLoginFailure(user.id, meta, 'disabled');
      throw invalidCredentials();
    }

    if (user.status === 'PENDING') {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address before signing in.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.throttle.resetAccount(input.email);

    const hasMfa = await this.mfa.hasVerifiedFactor(user.id);
    if (hasMfa) {
      return {
        kind: 'mfa',
        response: {
          mfaRequired: true,
          challengeToken: this.jwt.signMfaChallenge(user.id),
          expiresIn: 300,
        },
      };
    }

    if (user.globalRole === 'ADMIN') {
      return {
        kind: 'mfa_setup',
        response: {
          mfaSetupRequired: true,
          setupToken: this.jwt.signMfaSetup(user.id),
          expiresIn: 600,
        },
      };
    }

    const memberships = await this.loadMemberships(user.id);
    const organizationId = this.chooseOrganization(memberships, input.organizationId);
    const issued = await this.sessions.create(user.id, organizationId, meta);
    const response = await this.buildAuthResponse(
      user,
      memberships,
      organizationId,
      issued.sessionId,
    );
    await this.recordLoginSuccess(user, organizationId, meta);
    return {
      kind: 'tokens',
      response,
      refreshToken: issued.refreshToken,
      refreshMaxAge: issued.refreshMaxAgeSeconds,
    };
  }

  async refresh(
    rawToken: string,
    meta: RequestMeta,
  ): Promise<{ response: AuthResponse; refreshToken: string; refreshMaxAge: number }> {
    let rotated: Awaited<ReturnType<SessionService['rotate']>>;
    try {
      rotated = await this.sessions.rotate(rawToken, meta);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.audit.record({
          action: 'AUTH_REFRESH_REJECTED',
          ip: meta.ip,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
        });
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { id: rotated.session.userId } });
    if (!user || user.status !== 'ACTIVE') {
      await this.sessions.revoke(rotated.session.id, rotated.session.userId);
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session expired' });
    }
    const memberships = await this.loadMemberships(user.id);
    let organizationId = rotated.session.organizationId;
    if (organizationId && !memberships.some((item) => item.organizationId === organizationId)) {
      organizationId = null;
    }
    const response = await this.buildAuthResponse(
      user,
      memberships,
      organizationId,
      rotated.session.id,
    );
    return {
      response,
      refreshToken: rotated.issued.refreshToken,
      refreshMaxAge: rotated.issued.refreshMaxAgeSeconds,
    };
  }

  async logout(
    rawToken: string | undefined,
    sessionId: string | undefined,
    meta: RequestMeta,
  ): Promise<void> {
    if (rawToken) {
      const hash = this.tokens.hash(rawToken);
      const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
      if (row) {
        await this.sessions.revokeFamily(row.familyId);
        await this.audit.record({
          action: 'AUTH_LOGOUT',
          actorUserId: row.userId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
        });
      }
    } else if (sessionId) {
      await this.sessions.revokeFamily(sessionId);
    }
  }

  async forgotPassword(email: string, meta: RequestMeta): Promise<{ message: string }> {
    const generic = { message: 'If the account exists, a reset message has been sent.' };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'DISABLED') return generic;

    const reset = this.tokens.generate(32);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: reset.hash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await this.mail.sendPasswordReset({
      to: user.email,
      locale: user.locale,
      token: reset.token,
      givenName: user.givenName,
    });
    await this.audit.record({
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      actorUserId: user.id,
      resourceType: 'user',
      resourceId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
    return generic;
  }

  async resetPassword(input: ResetPasswordInput, meta: RequestMeta): Promise<{ message: string }> {
    const hash = this.tokens.hash(input.token);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: 'INVALID_TOKEN', message: 'Invalid or expired link' });
    }
    await this.assertPasswordAcceptable(input.password);
    const passwordHash = await this.passwords.hash(input.password);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: now } }),
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
    ]);
    await this.sessions.revokeAllForUser(row.userId);
    await this.audit.record({
      action: 'AUTH_PASSWORD_RESET',
      actorUserId: row.userId,
      resourceType: 'user',
      resourceId: row.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
    return { message: 'Password updated. Sign in with your new password.' };
  }

  async acceptInvite(input: AcceptInviteInput, meta: RequestMeta): Promise<{ message: string }> {
    await this.assertPasswordAcceptable(input.password);
    const hash = this.tokens.hash(input.token);
    const invite = await this.tenantPrisma.runForInvite(hash, (tx) =>
      tx.invite.findUnique({ where: { tokenHash: hash } }),
    );
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'INVALID_INVITE',
        message: 'Invalid or expired invite',
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      throw new ConflictException({
        code: 'ACCOUNT_EXISTS',
        message: 'An account already exists for this email. Sign in to join the organization.',
      });
    }

    const passwordHash = await this.passwords.hash(input.password);
    const userId = uuidv7();
    const now = new Date();

    await this.tenantPrisma.runInTenant(invite.organizationId, userId, async (tx) => {
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException({
          code: 'INVALID_INVITE',
          message: 'Invalid or expired invite',
        });
      }
      await tx.user.create({
        data: {
          id: userId,
          email: invite.email,
          passwordHash,
          givenName: input.givenName,
          familyName: input.familyName,
          locale: input.locale,
          status: 'ACTIVE',
          emailVerifiedAt: now,
        },
      });
      await tx.membership.create({
        data: { id: uuidv7(), organizationId: invite.organizationId, userId, role: invite.role },
      });
    });

    await this.audit.record({
      action: 'AUTH_INVITE_ACCEPTED',
      actorUserId: userId,
      actorRole: 'USER',
      organizationId: invite.organizationId,
      resourceType: 'invite',
      resourceId: invite.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
    return { message: 'Invitation accepted. You can now sign in.' };
  }

  async selectOrganization(
    userId: string,
    sessionId: string,
    input: SelectOrganizationInput,
    meta: RequestMeta,
  ): Promise<AuthResponse> {
    const membership = await this.tenantPrisma.runForUser(userId, (tx) =>
      tx.membership.findFirst({
        where: { userId, organizationId: input.organizationId },
        include: { organization: true },
      }),
    );
    if (!membership) {
      throw new ForbiddenException({ code: 'NOT_A_MEMBER', message: 'Organization not available' });
    }
    const session = await this.sessions.findValidSession(sessionId, userId);
    if (!session) {
      throw new UnauthorizedException({ code: 'INVALID_SESSION', message: 'Session expired' });
    }
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { organizationId: input.organizationId, lastSeenAt: new Date() },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException({ code: 'INVALID_SESSION', message: 'Session expired' });
    const memberships = await this.loadMemberships(userId);
    await this.audit.record({
      action: 'AUTH_ORGANIZATION_SELECTED',
      actorUserId: userId,
      actorRole: user.globalRole,
      organizationId: input.organizationId,
      resourceType: 'organization',
      resourceId: input.organizationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
    return this.buildAuthResponse(user, memberships, input.organizationId, sessionId);
  }

  async getUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return user;
  }

  async beginMfaSetup(userId: string): Promise<{
    secret: string;
    otpauthUri: string;
    recoveryCodes: string[];
    expiresAt: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return this.mfa.beginSetup(user);
  }

  async beginMfaSetupFromToken(token: string): Promise<{
    secret: string;
    otpauthUri: string;
    recoveryCodes: string[];
    expiresAt: string;
  }> {
    const claims = this.verifyMfaToken(token, 'mfa_setup');
    return this.beginMfaSetup(claims.sub);
  }

  /** Enrolment from an authenticated session; returns a setup token for activation. */
  async enrollMfa(userId: string): Promise<{
    secret: string;
    otpauthUri: string;
    recoveryCodes: string[];
    expiresAt: string;
    setupToken: string;
  }> {
    const setup = await this.beginMfaSetup(userId);
    return { ...setup, setupToken: this.jwt.signMfaSetup(userId) };
  }

  async activateMfa(
    token: string,
    code: string,
    meta: RequestMeta,
  ): Promise<{ response: AuthResponse; refreshToken: string; refreshMaxAge: number }> {
    const claims = this.verifyMfaToken(token, 'mfa_setup');
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired setup',
      });
    }
    await this.throttle.assertAllowed(meta.ip ?? 'unknown', `mfa-setup:${user.id}`);
    try {
      await this.mfa.activate(user.id, code);
    } catch (error) {
      await this.throttle.recordFailure(meta.ip ?? 'unknown', `mfa-setup:${user.id}`);
      throw error;
    }
    const activatedUser = await this.getUser(user.id);
    const memberships = await this.loadMemberships(activatedUser.id);
    const organizationId = this.chooseOrganization(memberships, undefined);
    const issued = await this.sessions.create(activatedUser.id, organizationId, meta);
    const response = await this.buildAuthResponse(
      activatedUser,
      memberships,
      organizationId,
      issued.sessionId,
    );
    await this.audit.record({
      action: 'AUTH_MFA_ACTIVATED',
      actorUserId: activatedUser.id,
      actorRole: activatedUser.globalRole,
      organizationId,
      resourceType: 'user',
      resourceId: activatedUser.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
    return {
      response,
      refreshToken: issued.refreshToken,
      refreshMaxAge: issued.refreshMaxAgeSeconds,
    };
  }

  async challengeMfa(
    token: string,
    code: string,
    meta: RequestMeta,
  ): Promise<{ response: AuthResponse; refreshToken: string; refreshMaxAge: number }> {
    const claims = this.verifyMfaToken(token, 'mfa_challenge');
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired challenge',
      });
    }
    await this.throttle.assertAllowed(meta.ip ?? 'unknown', `mfa:${user.id}`);
    try {
      await this.mfa.verifyChallenge(user.id, code);
    } catch (error) {
      await this.throttle.recordFailure(meta.ip ?? 'unknown', `mfa:${user.id}`);
      await this.audit.record({
        action: 'AUTH_MFA_CHALLENGE_FAILED',
        actorUserId: user.id,
        resourceType: 'user',
        resourceId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });
      throw error;
    }
    const memberships = await this.loadMemberships(user.id);
    const organizationId = this.chooseOrganization(memberships, undefined);
    const issued = await this.sessions.create(user.id, organizationId, meta);
    const response = await this.buildAuthResponse(
      user,
      memberships,
      organizationId,
      issued.sessionId,
    );
    await this.recordLoginSuccess(user, organizationId, meta);
    return {
      response,
      refreshToken: issued.refreshToken,
      refreshMaxAge: issued.refreshMaxAgeSeconds,
    };
  }

  async disableMfa(user: User, password: string, code: string, meta: RequestMeta): Promise<void> {
    if (user.globalRole === 'ADMIN') {
      throw new ForbiddenException({
        code: 'ADMIN_MFA_REQUIRED',
        message: 'MFA cannot be disabled for administrators',
      });
    }
    const passwordOk = await this.passwords.verify(user.passwordHash, password);
    if (!passwordOk) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid password' });
    }
    await this.mfa.disable(user.id, code);
    await this.sessions.revokeAllForUser(user.id);
    await this.audit.record({
      action: 'AUTH_MFA_DISABLED',
      actorUserId: user.id,
      actorRole: user.globalRole,
      resourceType: 'user',
      resourceId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  }

  async listSessions(userId: string): Promise<Awaited<ReturnType<SessionService['list']>>> {
    return this.sessions.list(userId);
  }

  async revokeSession(sessionId: string, userId: string, meta: RequestMeta): Promise<void> {
    const revoked = await this.sessions.revoke(sessionId, userId);
    if (!revoked) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
    await this.audit.record({
      action: 'AUTH_SESSION_REVOKED',
      actorUserId: userId,
      resourceType: 'session',
      resourceId: sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  }

  private verifyMfaToken(token: string, expected: 'mfa_challenge' | 'mfa_setup'): { sub: string } {
    try {
      return this.jwt.verifyMfa(token, expected);
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    }
  }

  private async buildAuthResponse(
    user: User,
    memberships: MembershipWithOrg[],
    organizationId: string | null,
    sessionId: string,
  ): Promise<AuthResponse> {
    const organizations: OrganizationSummary[] = memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      status: membership.organization.status,
      countryCode: membership.organization.countryCode,
      jurisdictionPackCode: membership.organization.jurisdictionPackCode,
      scopeMode: membership.organization.scopeMode,
      plan: membership.organization.plan,
    }));
    const accessToken = this.jwt.signAccess({
      userId: user.id,
      sessionId,
      role: user.globalRole,
      organizationId,
      mfaSatisfied: user.globalRole === 'ADMIN' ? true : user.mfaEnabled,
    });
    return {
      accessToken,
      expiresIn: this.jwt.accessTtlSeconds,
      user: toAuthUser(user),
      organizations,
      activeOrganizationId: organizationId,
    };
  }

  private async loadMemberships(userId: string): Promise<MembershipWithOrg[]> {
    return this.tenantPrisma.runForUser(userId, (tx) =>
      tx.membership.findMany({
        where: { userId },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  private chooseOrganization(
    memberships: MembershipWithOrg[],
    requested: string | undefined,
  ): string | null {
    if (requested) {
      return memberships.some((item) => item.organizationId === requested) ? requested : null;
    }
    return memberships.length === 1 ? (memberships[0]?.organizationId ?? null) : null;
  }

  private async registerFailedLogin(user: User): Promise<void> {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil =
      failedLoginCount >= MAX_FAILED_LOGINS
        ? new Date(Date.now() + Math.min(60, 2 ** (failedLoginCount - MAX_FAILED_LOGINS)) * 60_000)
        : null;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil },
    });
  }

  private async recordLoginFailure(
    userId: string | null,
    meta: RequestMeta,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      action: 'AUTH_LOGIN_FAILED',
      actorUserId: userId,
      metadata: { reason },
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  }

  private async recordLoginSuccess(
    user: User,
    organizationId: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    await this.audit.record({
      action: 'AUTH_LOGIN_SUCCESS',
      actorUserId: user.id,
      actorRole: user.globalRole,
      organizationId,
      resourceType: 'user',
      resourceId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
    locale: string,
    givenName: string,
  ): Promise<void> {
    const verification = this.tokens.generate(32);
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: verification.hash,
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
    await this.mail.sendEmailVerification({
      to: email,
      locale,
      token: verification.token,
      givenName,
    });
  }

  private async assertPasswordAcceptable(password: string): Promise<void> {
    if (password.length < this.passwordMin) {
      throw new BadRequestException({
        code: 'PASSWORD_TOO_SHORT',
        message: `Password must be at least ${this.passwordMin} characters`,
      });
    }
    const result = await this.breach.check(password);
    if (result.breached) {
      throw new BadRequestException({
        code: 'PASSWORD_BREACHED',
        message: 'This password appears in known breaches. Choose a different one.',
      });
    }
  }
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
