import { DocumentBuilder } from '@nestjs/swagger';
import { LEGAL_DISCLAIMER } from '@nis2/shared';
import { APP_VERSION } from './version';

export const swaggerConfig = new DocumentBuilder()
  .setTitle('NIS2 Compass API')
  .setDescription(
    [
      'API for NIS2 Compass — classification, documentation, security audits and administration.',
      '',
      `**Legal notice:** ${LEGAL_DISCLAIMER.en}`,
      '',
      'All business resources are scoped to an organization. Access tokens are short-lived;',
      'refresh tokens rotate in an HttpOnly cookie.',
    ].join('\n'),
  )
  .setVersion(APP_VERSION)
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Short-lived access token issued by POST /auth/login',
    },
    'access-token',
  )
  .addTag('platform', 'Health, readiness and metrics')
  .addTag('auth', 'Registration, login, MFA and sessions')
  .addTag('organizations', 'Tenant profile, members and invites')
  .addTag('users', 'Self-service profile and GDPR export/erasure')
  .addTag('classification', 'NIS2 entity classification')
  .addTag('documents', 'Documentation centre, revisions and approvals')
  .addTag('audits', 'Security audits, devices and network map')
  .addTag('findings', 'Findings and remediation register')
  .addTag('agents', 'Scanner agent enrollment and scan jobs')
  .addTag('exports', 'DOCX/PDF generation jobs')
  .addTag('notifications', 'In-app notifications')
  .addTag('admin', 'Platform administration')
  .build();
