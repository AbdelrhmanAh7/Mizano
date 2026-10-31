import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthSessionsService } from './auth-sessions.service';
import { PasswordResetService } from './password-reset.service';
import { hashToken } from './token-hash';
import { createFakeAuthStore, FakeAuthStore } from './testing/fake-auth-store';

const sendMail = jest.fn((_mail: { to: string; subject: string; text: string }) =>
  Promise.resolve(),
);
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail }) },
}));

describe('PasswordResetService', () => {
  let store: FakeAuthStore;
  let service: PasswordResetService;
  let env: Record<string, string>;

  const lastLinkToken = (): string => {
    const text = sendMail.mock.calls.at(-1)?.[0].text ?? '';
    return /#token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';
  };

  beforeEach(() => {
    sendMail.mockClear();
    env = {
      MAIL_SMTP_HOST: 'smtp.test',
      MAIL_FROM: 'no-reply@mizano.test',
      CORS_ORIGIN: 'https://app.mizano.test/',
    };
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    store = createFakeAuthStore();
    store.user.rows.push({
      id: 'u1',
      email: 'owner@x.test',
      name: 'Owner',
      status: 'ACTIVE',
      organizationId: 'org-1',
      passwordHash: 'old',
    });
    const sessions = new AuthSessionsService(store as never, new JwtService({}), config);
    service = new PasswordResetService(store as never, config, sessions);
  });

  it('answers the same for unknown and known addresses', () => {
    const known = service.request({ email: 'owner@x.test' });
    const unknown = service.request({ email: 'nobody@x.test' });
    expect(unknown).toEqual(known);
  });

  it('sends nothing and stores nothing for an unknown or inactive address', async () => {
    await service.issue('nobody@x.test', 'en');
    store.user.rows[0].status = 'SUSPENDED';
    await service.issue('owner@x.test', 'en');
    expect(store.passwordResetToken.rows).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('emails a single-use link in the asked language and stores only its digest', async () => {
    await service.issue('owner@x.test', 'ar');
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('owner@x.test');
    expect(mail.subject).toBe('إعادة تعيين كلمة المرور في ميزانو');
    expect(mail.text).toContain('https://app.mizano.test/ar/reset-password#token=');

    const token = lastLinkToken();
    expect(token.length).toBeGreaterThan(40);
    expect(store.passwordResetToken.rows[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(store.passwordResetToken.rows)).not.toContain(token);
  });

  it('caps links per account per hour', async () => {
    for (let i = 0; i < 5; i++) await service.issue('owner@x.test', 'en');
    expect(store.passwordResetToken.rows).toHaveLength(3);
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  it('creates no link when no mail server is configured', async () => {
    env = {};
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    const sessions = new AuthSessionsService(store as never, new JwtService({}), config);
    service = new PasswordResetService(store as never, config, sessions);
    await service.issue('owner@x.test', 'en');
    expect(store.passwordResetToken.rows).toHaveLength(0);
  });

  it('resets once, ends every session, and refuses the same link again', async () => {
    await service.issue('owner@x.test', 'en');
    const token = lastLinkToken();
    store.authSession.rows.push(
      { id: 's1', userId: 'u1', revokedAt: null },
      { id: 's2', userId: 'u1', revokedAt: null },
    );

    await service.reset(token, 'NewPassword1');
    expect(await bcrypt.compare('NewPassword1', store.user.rows[0].passwordHash as string)).toBe(
      true,
    );
    expect(store.authSession.rows.every((s) => s.revokedReason === 'password_reset')).toBe(true);
    await expect(service.reset(token, 'OtherPassword1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses an expired or unknown link', async () => {
    await service.issue('owner@x.test', 'en');
    const token = lastLinkToken();
    store.passwordResetToken.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.reset(token, 'NewPassword1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reset('made-up', 'NewPassword1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(store.user.rows[0].passwordHash).toBe('old');
  });
});
