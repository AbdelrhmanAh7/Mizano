import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ADMIN = { email: 'admin@mizano.com', password: 'password123' };
// Each request fails fast instead of stalling the gate's time budget.
const REQUEST_TIMEOUT_MS = 20_000;

const send = (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

/** name=value pairs from a response's Set-Cookie headers, merged into the jar. */
function keepCookies(jar: Map<string, string>, res: Response): void {
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

const cookieHeader = (jar: Map<string, string>): string =>
  [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

// Request-level (no browser, no model call): the NextAuth credentials sign-in a browser performs, then
// the same GET /api/auth/session the client's useSession() makes.
test(
  '@issue-185 AC1: the authenticated /api/auth/session JSON carries no refreshToken',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const web = (path: string): string => new URL(path, String(app.baseUrl)).toString();
    const jar = new Map<string, string>();

    // Signed out: the session endpoint returns an empty object, no tokens at all.
    const anon = await send(web('/api/auth/session'));
    expect(await anon.json()).toEqual({});

    const csrfRes = await send(web('/api/auth/csrf'));
    expect(csrfRes.status).toBe(200);
    keepCookies(jar, csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    const signIn = await send(web('/api/auth/callback/credentials'), {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar) },
      body: new URLSearchParams({
        ...ADMIN,
        csrfToken,
        callbackUrl: web('/en/dashboard'),
        json: 'true',
      }),
    });
    // json=true: NextAuth answers { url }; a rejected or throttled login points it at ?error=.
    const { url } = (await signIn.json()) as { url?: string };
    expect(url ?? '').not.toContain('error=');
    keepCookies(jar, signIn);
    expect([...jar.keys()].some((k) => k.includes('next-auth.session-token'))).toBe(true);

    const res = await send(web('/api/auth/session'), { headers: { cookie: cookieHeader(jar) } });
    expect(res.status).toBe(200);
    const body = await res.text();
    const session = JSON.parse(body) as { user?: { email?: string } } & Record<string, unknown>;

    // Still a real signed-in session...
    expect(session.user?.email).toBe(ADMIN.email);
    expect(typeof session.accessToken).toBe('string');
    // ...but the refresh token never reaches the browser.
    expect(Object.keys(session)).not.toContain('refreshToken');
    expect(body).not.toContain('refreshToken');
  },
);
