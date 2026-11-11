import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppEnv } from '../../config/env';

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Provider-agnostic transactional email. In development Mailpit captures
 * messages; when SMTP_HOST is unset the message is logged instead of sent so a
 * developer can still follow links.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    this.from =
      config.get('MAIL_FROM', { infer: true }) ?? 'NIS2 Compass <no-reply@nis2-compass.local>';
    this.appUrl = config.get('PUBLIC_APP_URL', { infer: true });
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: config.get('SMTP_PORT', { infer: true }),
          secure: config.get('SMTP_SECURE', { infer: true }),
          auth: config.get('SMTP_USER', { infer: true })
            ? {
                user: config.get('SMTP_USER', { infer: true }),
                pass: config.get('SMTP_PASSWORD', { infer: true }),
              }
            : undefined,
        })
      : null;
  }

  async sendEmailVerification(input: {
    to: string;
    locale: string;
    token: string;
    givenName: string;
  }): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${encodeURIComponent(input.token)}`;
    const ro = input.locale === 'ro';
    await this.send({
      to: input.to,
      subject: ro ? 'Confirmă adresa de email — NIS2 Compass' : 'Verify your email — NIS2 Compass',
      text: ro
        ? `Bună, ${input.givenName}. Confirmă adresa de email: ${link}\nLinkul expiră în 24 de ore.`
        : `Hi ${input.givenName}, verify your email address: ${link}\nThe link expires in 24 hours.`,
      html: ro
        ? `<p>Bună, ${escapeHtml(input.givenName)}.</p><p><a href="${link}">Confirmă adresa de email</a></p><p>Linkul expiră în 24 de ore.</p>`
        : `<p>Hi ${escapeHtml(input.givenName)},</p><p><a href="${link}">Verify your email address</a></p><p>The link expires in 24 hours.</p>`,
    });
  }

  async sendPasswordReset(input: {
    to: string;
    locale: string;
    token: string;
    givenName: string;
  }): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(input.token)}`;
    const ro = input.locale === 'ro';
    await this.send({
      to: input.to,
      subject: ro ? 'Resetare parolă — NIS2 Compass' : 'Reset your password — NIS2 Compass',
      text: ro
        ? `Bună, ${input.givenName}. Resetează parola: ${link}\nLinkul expiră în 60 de minute. Dacă nu ai cerut resetarea, ignoră mesajul.`
        : `Hi ${input.givenName}, reset your password: ${link}\nThe link expires in 60 minutes. If you did not request this, ignore this email.`,
      html: ro
        ? `<p>Bună, ${escapeHtml(input.givenName)}.</p><p><a href="${link}">Resetează parola</a></p><p>Linkul expiră în 60 de minute. Dacă nu ai cerut resetarea, ignoră mesajul.</p>`
        : `<p>Hi ${escapeHtml(input.givenName)},</p><p><a href="${link}">Reset your password</a></p><p>The link expires in 60 minutes. If you did not request this, ignore this email.</p>`,
    });
  }

  async sendInvite(input: {
    to: string;
    locale: string;
    token: string;
    organizationName: string;
    inviterName: string;
  }): Promise<void> {
    const link = `${this.appUrl}/accept-invite?token=${encodeURIComponent(input.token)}`;
    const ro = input.locale === 'ro';
    await this.send({
      to: input.to,
      subject: ro
        ? `Invitație în ${input.organizationName} — NIS2 Compass`
        : `Invitation to ${input.organizationName} — NIS2 Compass`,
      text: ro
        ? `${input.inviterName} te invită în ${input.organizationName}. Acceptă: ${link}\nLinkul expiră în 7 zile.`
        : `${input.inviterName} invited you to ${input.organizationName}. Accept: ${link}\nThe link expires in 7 days.`,
      html: ro
        ? `<p>${escapeHtml(input.inviterName)} te invită în ${escapeHtml(input.organizationName)}.</p><p><a href="${link}">Acceptă invitația</a></p><p>Linkul expiră în 7 zile.</p>`
        : `<p>${escapeHtml(input.inviterName)} invited you to ${escapeHtml(input.organizationName)}.</p><p><a href="${link}">Accept the invitation</a></p><p>The link expires in 7 days.</p>`,
    });
  }

  private async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        { to: message.to, subject: message.subject },
        'SMTP disabled; email not sent',
      );
      this.logger.debug({ text: message.text }, 'Email body preview');
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
