/**
 * @jest-environment node
 */
import axios from 'axios';
import type { JWT } from 'next-auth/jwt';
import { refreshAccessToken, tokenRefresher } from './auth';
import { createTokenRefresher, sessionRefreshKey, type RefreshedTokens } from './auth-refresh';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jwtFor(user: string, refreshToken: string): JWT {
  return {
    id: user,
    firstName: user,
    lastName: '',
    organizationId: `org-${user}`,
    role: 'admin',
    accessToken: `old-access-${user}`,
    refreshToken,
    accessTokenExpires: 0,
  };
}

function bodyRefreshToken(call: unknown[]): string {
  return (call[1] as { refreshToken: string }).refreshToken;
}

describe('refreshAccessToken (per-session isolation)', () => {
  let postSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const pending = new Map<string, Deferred<{ data: { tokens: RefreshedTokens } }>>();

  beforeEach(() => {
    tokenRefresher.reset();
    pending.clear();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    postSpy = jest.spyOn(axios, 'post').mockImplementation((_url: string, body?: unknown) => {
      const rt = (body as { refreshToken: string }).refreshToken;
      const d = deferred<{ data: { tokens: RefreshedTokens } }>();
      pending.set(rt, d);
      return d.promise;
    });
  });

  afterEach(() => {
    postSpy.mockRestore();
    errorSpy.mockRestore();
  });

  async function flush(): Promise<void> {
    await new Promise((r) => setImmediate(r));
  }

  it('gives concurrent refreshes for users A and B only their own tokens', async () => {
    const a = refreshAccessToken(jwtFor('A', 'rt-A'));
    const b = refreshAccessToken(jwtFor('B', 'rt-B'));
    await flush();

    expect(postSpy).toHaveBeenCalledTimes(2);
    // Resolve B first to prove ordering does not matter.
    pending.get('rt-B')?.resolve({
      data: { tokens: { accessToken: 'access-B2', refreshToken: 'rt-B2' } },
    });
    pending.get('rt-A')?.resolve({
      data: { tokens: { accessToken: 'access-A2', refreshToken: 'rt-A2' } },
    });

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toMatchObject({ id: 'A', accessToken: 'access-A2', refreshToken: 'rt-A2' });
    expect(rb).toMatchObject({ id: 'B', accessToken: 'access-B2', refreshToken: 'rt-B2' });
    expect(ra.error).toBeUndefined();
    expect(rb.error).toBeUndefined();
    expect(tokenRefresher.size()).toEqual({ inFlight: 0, cooldowns: 0 });
  });

  it('shares one network call for concurrent refreshes of the same session', async () => {
    const calls = [1, 2, 3].map(() => refreshAccessToken(jwtFor('A', 'rt-A')));
    await flush();

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(bodyRefreshToken(postSpy.mock.calls[0])).toBe('rt-A');
    pending.get('rt-A')?.resolve({
      data: { tokens: { accessToken: 'access-A2', refreshToken: 'rt-A2' } },
    });

    const results = await Promise.all(calls);
    for (const r of results) {
      expect(r).toMatchObject({ accessToken: 'access-A2', refreshToken: 'rt-A2' });
    }
    expect(tokenRefresher.size().inFlight).toBe(0);
  });

  it('does not let a failure for A block or affect B', async () => {
    const a = refreshAccessToken(jwtFor('A', 'rt-A'));
    const b = refreshAccessToken(jwtFor('B', 'rt-B'));
    await flush();

    pending.get('rt-A')?.reject(new Error('boom'));
    pending.get('rt-B')?.resolve({
      data: { tokens: { accessToken: 'access-B2', refreshToken: 'rt-B2' } },
    });
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.error).toBe('RefreshAccessTokenError');
    expect(ra.accessToken).toBe('old-access-A');
    expect(rb).toMatchObject({ accessToken: 'access-B2', refreshToken: 'rt-B2' });
    expect(rb.error).toBeUndefined();

    // A is cooling down (no new network call); B's rotated session refreshes freely.
    postSpy.mockClear();
    const a2 = await refreshAccessToken(jwtFor('A', 'rt-A'));
    expect(a2.error).toBe('RefreshAccessTokenError');
    expect(postSpy).not.toHaveBeenCalled();

    const b2 = refreshAccessToken(jwtFor('B', 'rt-B2'));
    await flush();
    expect(postSpy).toHaveBeenCalledTimes(1);
    pending.get('rt-B2')?.resolve({
      data: { tokens: { accessToken: 'access-B3', refreshToken: 'rt-B3' } },
    });
    expect(await b2).toMatchObject({ accessToken: 'access-B3', refreshToken: 'rt-B3' });
  });

  it('never logs tokens or auth headers on failure', async () => {
    const a = refreshAccessToken(jwtFor('A', 'secret-refresh-token'));
    await flush();
    const err = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      config: { headers: { Authorization: 'Bearer secret-refresh-token' } },
      response: { status: 401 },
    });
    pending.get('secret-refresh-token')?.reject(err);
    await a;

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain('secret-refresh-token');
    expect(logged).not.toContain('Bearer');
    expect(logged).toContain('HTTP 401');
  });

  it('returns an error without a network call when no refresh token exists', async () => {
    const r = await refreshAccessToken(jwtFor('A', ''));
    expect(r.error).toBe('RefreshAccessTokenError');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('treats a malformed refresh response as a failure', async () => {
    const a = refreshAccessToken(jwtFor('A', 'rt-A'));
    await flush();
    pending.get('rt-A')?.resolve({ data: {} } as { data: { tokens: RefreshedTokens } });
    expect((await a).error).toBe('RefreshAccessTokenError');
  });
});

describe('createTokenRefresher', () => {
  it('keys state by a hash, not the raw token', () => {
    const key = sessionRefreshKey('raw-token');
    expect(key).not.toContain('raw-token');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires cooldowns and allows a retry afterwards', async () => {
    let time = 1_000;
    const refresh = jest
      .fn<Promise<RefreshedTokens | null>, [string]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ accessToken: 'a', refreshToken: 'r' });
    const refresher = createTokenRefresher({ refresh, cooldownMs: 100, now: () => time });

    expect(await refresher.refresh('rt')).toBeNull();
    expect(await refresher.refresh('rt')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);

    time += 101;
    expect(await refresher.refresh('rt')).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(refresher.size()).toEqual({ inFlight: 0, cooldowns: 0 });
  });

  it('bounds the cooldown map size', async () => {
    const refresh = jest.fn<Promise<RefreshedTokens | null>, [string]>().mockResolvedValue(null);
    const refresher = createTokenRefresher({ refresh, maxCooldownEntries: 3, now: () => 0 });
    for (let i = 0; i < 10; i += 1) {
      await refresher.refresh(`rt-${i}`);
    }
    expect(refresher.size().cooldowns).toBe(3);
  });

  it('cleans up in-flight state when the refresh function throws synchronously', async () => {
    const refresh = jest.fn<Promise<RefreshedTokens | null>, [string]>(() => {
      throw new Error('sync');
    });
    const refresher = createTokenRefresher({ refresh });
    expect(await refresher.refresh('rt')).toBeNull();
    expect(refresher.size().inFlight).toBe(0);
  });
});
