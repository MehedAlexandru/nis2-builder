import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaActivateSchema,
  mfaChallengeSchema,
  mfaDisableSchema,
  mfaTokenSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  selectOrganizationSchema,
  verifyEmailSchema,
  type AcceptInviteInput,
  type AuthSession,
  type ForgotPasswordInput,
  type LoginInput,
  type MfaActivateInput,
  type MfaChallengeInput,
  type MfaDisableInput,
  type RegisterInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type SelectOrganizationInput,
  type VerifyEmailInput,
} from '@nis2/shared';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentAuth, Public } from '../../common/auth/auth.decorators';
import {
  CSRF_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  createCsrfToken,
  csrfCookieOptions,
  refreshCookieOptions,
} from '../../common/auth/cookies';
import type { AccessTokenClaims } from '../../common/crypto/jwt.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AppEnv } from '../../config/env';
import { AuthService, type LoginResult, type RequestMeta } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.secureCookies = config.get('COOKIE_SECURE', { infer: true });
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    return this.auth.register(body, metaOf(request));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    return this.auth.verifyEmail(body.token, metaOf(request));
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(202)
  resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationInput,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    return this.auth.resendVerification(body.email, metaOf(request));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResult['response']> {
    const result = await this.auth.login(body, metaOf(request));
    if (result.kind === 'tokens') {
      this.setSessionCookies(reply, result.refreshToken, result.refreshMaxAge);
    }
    return result.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResult['response']> {
    const rawToken = request.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      this.clearSessionCookies(reply);
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session expired' });
    }
    const result = await this.auth.refresh(rawToken, metaOf(request));
    this.setSessionCookies(reply, result.refreshToken, result.refreshMaxAge);
    return result.response;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const rawToken = request.cookies?.[REFRESH_COOKIE];
    await this.auth.logout(rawToken, request.auth?.sid, metaOf(request));
    this.clearSessionCookies(reply);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    return this.auth.forgotPassword(body.email, metaOf(request));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    return this.auth.resetPassword(body, metaOf(request));
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(201)
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    return this.auth.acceptInvite(body, metaOf(request));
  }

  @Public()
  @Post('mfa/challenge')
  @HttpCode(200)
  async challengeMfa(
    @Body(new ZodValidationPipe(mfaChallengeSchema)) body: MfaChallengeInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResult['response']> {
    const result = await this.auth.challengeMfa(body.token, body.code, metaOf(request));
    this.setSessionCookies(reply, result.refreshToken, result.refreshMaxAge);
    return result.response;
  }

  @Public()
  @Post('mfa/setup')
  @HttpCode(200)
  beginMfaSetup(
    @Body(new ZodValidationPipe(mfaTokenSchema)) body: { token: string },
  ): ReturnType<AuthService['beginMfaSetupFromToken']> {
    return this.auth.beginMfaSetupFromToken(body.token);
  }

  @Post('mfa/enroll')
  @HttpCode(200)
  enrollMfa(@CurrentAuth() auth: AccessTokenClaims): ReturnType<AuthService['enrollMfa']> {
    return this.auth.enrollMfa(auth.sub);
  }

  @Public()
  @Post('mfa/activate')
  @HttpCode(200)
  async activateMfa(
    @Body(new ZodValidationPipe(mfaActivateSchema)) body: MfaActivateInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResult['response']> {
    const result = await this.auth.activateMfa(body.token, body.code, metaOf(request));
    this.setSessionCookies(reply, result.refreshToken, result.refreshMaxAge);
    return result.response;
  }

  @Post('mfa/disable')
  @HttpCode(204)
  async disableMfa(
    @Body(new ZodValidationPipe(mfaDisableSchema)) body: MfaDisableInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const user = await this.auth.getUser(auth.sub);
    await this.auth.disableMfa(user, body.password, body.code, metaOf(request));
  }

  @Post('select-organization')
  @HttpCode(200)
  async selectOrganization(
    @Body(new ZodValidationPipe(selectOrganizationSchema)) body: SelectOrganizationInput,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResult['response']> {
    const response = await this.auth.selectOrganization(auth.sub, auth.sid, body, metaOf(request));
    this.rotateCsrfCookie(reply);
    return response;
  }

  @Get('sessions')
  async sessions(@CurrentAuth() auth: AccessTokenClaims): Promise<AuthSession[]> {
    const sessions = await this.auth.listSessions(auth.sub);
    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      current: session.id === auth.sid,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @Param('id') id: string,
    @CurrentAuth() auth: AccessTokenClaims,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.auth.revokeSession(id, auth.sub, metaOf(request));
  }

  private setSessionCookies(reply: FastifyReply, refreshToken: string, maxAge: number): void {
    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(maxAge, this.secureCookies));
    this.rotateCsrfCookie(reply, maxAge);
  }

  private rotateCsrfCookie(reply: FastifyReply, maxAge = 8 * 60 * 60): void {
    reply.setCookie(CSRF_COOKIE, createCsrfToken(), csrfCookieOptions(maxAge, this.secureCookies));
  }

  private clearSessionCookies(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
  }
}

function metaOf(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    correlationId: request.id,
  };
}
