import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { BreachCheckService } from './breach/breach-check.service';
import { EncryptionService } from './crypto/encryption.service';
import { JwtTokenService } from './crypto/jwt.service';
import { PasswordService } from './crypto/password.service';
import { TokenService } from './crypto/token.service';
import { TotpService } from './crypto/totp';
import { MailService } from './mail/mail.service';
import { TenantContextService } from './tenancy/tenant-context.service';
import { TenantPrismaService } from './tenancy/tenant-prisma.service';

@Global()
@Module({
  providers: [
    PasswordService,
    TokenService,
    TotpService,
    EncryptionService,
    JwtTokenService,
    BreachCheckService,
    MailService,
    AuditService,
    TenantContextService,
    TenantPrismaService,
  ],
  exports: [
    PasswordService,
    TokenService,
    TotpService,
    EncryptionService,
    JwtTokenService,
    BreachCheckService,
    MailService,
    AuditService,
    TenantContextService,
    TenantPrismaService,
  ],
})
export class CommonModule {}
