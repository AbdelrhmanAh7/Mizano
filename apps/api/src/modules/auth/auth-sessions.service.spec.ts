import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthSessionsService, TokenSubject } from './auth-sessions.service';
import { hashToken } from './token-hash';
import { createFakeAuthStore, FakeAuthStore } from './testing/fake-auth-store';

describe('AuthSessionsService', () => {
  let store: FakeAuthStore;
  let sessions: AuthSessionsService;
  const jwt = new JwtService({});
  const config = {
    get: (key: string, fallback?: string): string | undefined =>
      ({ JWT_SECRET: 'a', JWT_REFRESH_SECRET: 'b' })[key] ?? fallback,
  } as unknown as ConfigService;

  const subject = (id: string): TokenSubject => ({
    id,
    email: `${id}@x.test`,
    name: id,
    organizationId: `org-${id}`,
    roleId: 'r',
  });
  const sidOf = (token: string): string => jwt.decode<{ sid: string }>(token).sid;

  beforeEach(() => {
    store = createFakeAuthStore();
    store.user.rows.push(
      { ...subject('a'), status: 'ACTIVE' },
      { ...subject('b'), status: 'ACTIVE' },
    );
    sessions = new AuthSessionsService(store as never, jwt, config);
  });

  afterEach(() => jest.useRealTimers());

  it('keeps the first device signed in when the same user signs in on a second one', async () => {
    const laptop = await sessions.start(subject('a'));
    const phone = await sessions.start(subject('a'));

    expect(sidOf(laptop.refreshToken)).not.toEqual(sidOf(phone.refreshToken));
    await expect(
      sessions.rotate('a', sidOf(laptop.refreshToken), laptop.refreshToken),
    ).resolves.toBeDefined();
    await expect(
      sessions.rotate('a', sidOf(phone.refreshToken), phone.refreshToken),
    ).resolves.toBeDefined();
    expect(await sessions.activeUser('a', sidOf(laptop.accessToken))).toMatchObject({ id: 'a' });
  });

  it('stores only token digests', async () => {
    const tokens = await sessions.start(subject('a'));
    const [row] = store.authSession.rows;
    expect(row.refreshTokenHash).toBe(hashToken(tokens.refreshToken));
    expect(JSON.stringify(store.authSession.rows)).not.toContain(tokens.refreshToken);
  });

  it('refuses a rotated-out token inside the grace window without ending the session', async () => {
    const first = await sessions.start(subject('a'));
    const sid = sidOf(first.refreshToken);
    const second = await sessions.rotate('a', sid, first.refreshToken);

    await expect(sessions.rotate('a', sid, first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(sessions.rotate('a', sid, second.refreshToken)).resolves.toBeDefined();
  });

  it('ends the session when a rotated-out token comes back after the grace window', async () => {
    // Fake only the clock: signing a JWT waits on real timers.
    jest.useFakeTimers({
      now: new Date('2026-11-01T10:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'],
    });
    const first = await sessions.start(subject('a'));
    const sid = sidOf(first.refreshToken);
    const second = await sessions.rotate('a', sid, first.refreshToken);

    jest.setSystemTime(new Date('2026-11-01T10:05:00Z'));
    await expect(sessions.rotate('a', sid, first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // The thief's replay also signs out whoever holds the current token.
    await expect(sessions.rotate('a', sid, second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(store.authSession.rows[0].revokedReason).toBe('reuse');
    expect(await sessions.activeUser('a', sid)).toBeNull();
  });

  it('lets only one of two concurrent refreshes with the same token win', async () => {
    const tokens = await sessions.start(subject('a'));
    const sid = sidOf(tokens.refreshToken);
    const results = await Promise.allSettled([
      sessions.rotate('a', sid, tokens.refreshToken),
      sessions.rotate('a', sid, tokens.refreshToken),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('signing out ends only this device; signing out everywhere ends all', async () => {
    const laptop = await sessions.start(subject('a'));
    const phone = await sessions.start(subject('a'));
    const other = await sessions.start(subject('b'));

    await sessions.end('a', sidOf(laptop.accessToken), 'logout');
    expect(await sessions.activeUser('a', sidOf(laptop.accessToken))).toBeNull();
    expect(await sessions.activeUser('a', sidOf(phone.accessToken))).not.toBeNull();

    expect(await sessions.endAll('a', 'logout_all')).toBe(1);
    expect(await sessions.activeUser('a', sidOf(phone.accessToken))).toBeNull();
    await expect(
      sessions.rotate('a', sidOf(phone.refreshToken), phone.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // Another user is untouched.
    expect(await sessions.activeUser('b', sidOf(other.accessToken))).not.toBeNull();
  });

  it("never accepts another user's session or a token without a session", async () => {
    const tokens = await sessions.start(subject('a'));
    const sid = sidOf(tokens.refreshToken);
    expect(await sessions.activeUser('b', sid)).toBeNull();
    expect(await sessions.activeUser('a', undefined)).toBeNull();
    await expect(sessions.rotate('b', sid, tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(sessions.rotate('a', undefined, tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses to refresh for a user who is no longer active', async () => {
    const tokens = await sessions.start(subject('a'));
    store.user.rows[0].status = 'SUSPENDED';
    await expect(
      sessions.rotate('a', sidOf(tokens.refreshToken), tokens.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
