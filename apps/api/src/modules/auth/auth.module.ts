import { Module } from '@nestjs/common';

/**
 * Phase 1 — registration, email verification, login, rotating refresh tokens,
 * TOTP MFA, recovery codes, session listing and revocation.
 *
 * Wired into the module graph now so the boundary exists from day one.
 */
@Module({})
export class AuthModule {}
