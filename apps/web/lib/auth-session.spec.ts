/**
 * @jest-environment node
 *
 * Drives NextAuth's real HTTP handler (the one behind app/api/auth/[...nextauth]) through
 * csrf → credentials sign-in → GET /api/auth/session, with only the Nest API mocked (issue #132).
 */
import axios from 'axios';
import NextAuth from 'next-auth';
import type { NextApiRequest, NextApiResponse } from 'next';
import { authOptions, tokenRefresher } from './auth';

const REFRESH_TOKEN = 'refresh-token-7d-secret';
const ACCESS_TOKEN = 'access-token-15m';
const HOST = 'localhost:5001';

interface HandlerResult {
  status: number;
  body: string;
  cookies: Record<string, string>;
}

async function callAuth(
  route: string[],
  init: {
    method?: 'GET' | 'POST';
    body?: Record<string, string>;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Promise<HandlerResult> {
  const headers = new Map<string, string | string[]>();
  let status = 200;
  let body = '';
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    setHeader(key: string, value: string | string[]) {
      headers.set(key.toLowerCase(), value);
      return res;
    },
    getHeader: (key: string) => headers.get(key.toLowerCase()),
    send(payload: unknown) {
      body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    },
    json(payload: unknown) {
      body = JSON.stringify(payload);
    },
    end() {
      return res;
    },
  };
  const req = {
    method: init.method ?? 'GET',
    query: { nextauth: route },
    body: init.body,
    cookies: init.cookies ?? {},
    headers: { host: HOST, ...init.headers },
  };
  await NextAuth(req as unknown as NextApiRequest, res as unknown as NextApiResponse, authOptions);

  const cookies: Record<string, string> = {};
  const setCookie = headers.get('set-cookie') ?? [];
  for (const line of Array.isArray(setCookie) ? setCookie : [setCookie]) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    cookies[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
  }
  return { status, body, cookies };
}

async function signIn(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  const csrf = await callAuth(['csrf']);
  const { csrfToken } = JSON.parse(csrf.body) as { csrfToken: string };
  const callback = await callAuth(['callback', 'credentials'], {
    method: 'POST',
    body: { csrfToken, email: 'ada@mizano.test', password: 'Secret123', json: 'true' },
    cookies: csrf.cookies,
    headers,
  });
  expect(callback.status).toBe(200);
  expect(callback.cookies['next-auth.session-token']).toBeTruthy();
  return { ...csrf.cookies, ...callback.cookies };
}

describe('@e2e @flow:auth-session @issue-132 NextAuth session endpoint', () => {
  let postSpy: jest.SpyInstance;

  beforeAll(() => {
    process.env.NEXTAUTH_URL = `http://${HOST}`;
    process.env.NEXTAUTH_SECRET = 'issue-132-nextauth-test-secret';
  });

  beforeEach(() => {
    tokenRefresher.reset();
    postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'ada@mizano.test',
          name: 'Ada Lovelace',
          organizationId: 'org-1',
          role: 'admin',
        },
        organization: { name: 'Mizano Test Org' },
        tokens: { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN },
      },
    });
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it('@issue-132 AC3: /api/auth/session JSON contains no refreshToken', async () => {
    const cookies = await signIn();

    const session = await callAuth(['session'], { cookies });

    expect(session.status).toBe(200);
    const json = JSON.parse(session.body) as Record<string, unknown>;
    expect(json.user).toMatchObject({ id: 'user-1', organizationId: 'org-1' });
    expect(json).not.toHaveProperty('refreshToken');
    expect(session.body).not.toContain(REFRESH_TOKEN);
  });

  it('@issue-132 AC2: the server-side login forwards the browser X-Forwarded-For to the API', async () => {
    await signIn({ 'x-forwarded-for': '203.0.113.10' });

    const [url, , config] = postSpy.mock.calls[0] as [string, unknown, { headers?: object }?];
    expect(url).toMatch(/\/auth\/login$/);
    expect(config?.headers).toMatchObject({ 'X-Forwarded-For': '203.0.113.10' });
  });

  it('@issue-132 AC2: login without a forwarded address sends no X-Forwarded-For', async () => {
    await signIn();

    const [, , config] = postSpy.mock.calls[0] as [string, unknown, { headers?: object }?];
    expect(config?.headers ?? {}).not.toHaveProperty('X-Forwarded-For');
  });
});
