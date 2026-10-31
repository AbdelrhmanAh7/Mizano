import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../../common/utils/redact';
import { AuthSessionsService } from './auth-sessions.service';
import { hashToken } from './token-hash';
import { buildPasswordResetMail } from './password-reset-mail';
import type { ForgotPasswordDto, ResetLocale } from './dto/password.dto';

const RESET_TTL_MINUTES = 30;
/** At most this many links per account per hour, on top of the per-address route throttle. */
const MAX_LINKS_PER_HOUR = 3;

const INVALID_LINK = {
  code: 'PASSWORD_RESET_INVALID',
  message: 'This reset link is invalid or has expired. Request a new one.',
};

interface MailTransport {
  send(mail: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

/**
 * Forgot-password flow. The request answers the same way whether or not the account exists
 * (the work happens after the response), links are single use, expire, and only their SHA-256
 * is stored. A successful reset ends every signed-in session of the account.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: AuthSessionsService,
  ) {}

  /** Accepts a request without revealing whether the address has an account. */
  request(dto: ForgotPasswordDto): { message: string } {
    void this.issue(dto.email, dto.locale ?? 'en').catch((error: unknown) => {
      this.logger.warn(
        `Password reset email failed: ${describeError(error, { includeMessage: false })}`,
      );
    });
    return {
      message: 'If an account exists for this email, we sent a link to reset the password.',
    };
  }

  /** Creates and emails a reset link when the address belongs to an active account. */
  async issue(email: string, locale: ResetLocale): Promise<void> {
    // Pre-authentication lookup by email, exactly as sign-in finds the account.
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, name: true, status: true, organizationId: true },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const recent = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= MAX_LINKS_PER_HOUR) return;

    const transport = await this.transportFor(user.organizationId);
    if (!transport) {
      this.logger.warn('Password reset email not sent: no mail server is configured');
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    });
    // The token rides in the fragment, which browsers never send to a server or a Referer.
    const link = `${this.webAppUrl()}/${locale}/reset-password#token=${token}`;
    const mail = buildPasswordResetMail(locale, user.name, link, RESET_TTL_MINUTES);
    await transport.send({ to: user.email, ...mail });
  }

  /** Sets a new password with a valid link and signs the account out everywhere. */
  async reset(token: string, password: string): Promise<{ message: string }> {
    const now = new Date();
    // Pre-authentication lookup by the token digest (the documented exception to org scoping).
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { status: true } },
      },
    });
    if (!record || record.usedAt || record.expiresAt <= now || record.user.status !== 'ACTIVE') {
      throw new BadRequestException(INVALID_LINK);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException(INVALID_LINK);
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      // Other outstanding links of the account stop working too.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      await this.sessions.endAll(record.userId, 'password_reset', tx);
    });
    return { message: 'Your password was changed. Sign in with the new password.' };
  }

  private webAppUrl(): string {
    const explicit = this.config.get<string>('WEB_APP_URL');
    const fromCors = this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim();
    return (explicit || fromCors || 'http://localhost:5001').replace(/\/+$/, '');
  }

  /**
   * The operator's mail server (MAIL_SMTP_*) when set, else the organization's own SMTP
   * settings, else none.
   */
  private async transportFor(organizationId: string): Promise<MailTransport | null> {
    const host = this.config.get<string>('MAIL_SMTP_HOST');
    if (host) {
      const port = Number(this.config.get<string>('MAIL_SMTP_PORT') ?? 587);
      const user = this.config.get<string>('MAIL_SMTP_USER');
      const pass = this.config.get<string>('MAIL_SMTP_PASSWORD');
      const from = this.config.get<string>('MAIL_FROM') ?? user;
      if (!from) return null;
      return this.smtp({ host, port, auth: user && pass ? { user, pass } : undefined }, from);
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFromEmail: true,
      },
    });
    if (!org?.smtpHost || !org.smtpUser || !org.smtpPassword) return null;
    return this.smtp(
      {
        host: org.smtpHost,
        port: org.smtpPort || 587,
        auth: { user: org.smtpUser, pass: org.smtpPassword },
      },
      org.smtpFromEmail || org.smtpUser,
    );
  }

  private smtp(
    options: { host: string; port: number; auth?: { user: string; pass: string } },
    from: string,
  ): MailTransport {
    const transporter = nodemailer.createTransport({ ...options, secure: options.port === 465 });
    return {
      send: async (mail) => {
        await transporter.sendMail({ from, ...mail });
      },
    };
  }
}
