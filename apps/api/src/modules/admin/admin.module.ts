import { Module } from '@nestjs/common';

/**
 * Phase 8 — platform administration. Every cross-tenant read is written to the
 * append-only audit log before data is returned. Impersonation is read-only.
 */
@Module({})
export class AdminModule {}
