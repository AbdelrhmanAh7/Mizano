import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Fixed documentation-range addresses (RFC 5737): the forwarded client IPs of two testers behind
// the same proxy. They never collide with the suite's own logins, which carry no forwarded header.
const IP_A = '198.51.100.184';
const IP_B = '203.0.113.184';
const WRONG_LOGIN = { email: 'army-184-throttle@army-e2e.test', password: 'Wrong-password-184' };

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

async function loginFrom(api: string, ip: string): Promise<number> {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(WRONG_LOGIN),
  });
  await res.text();
  return res.status;
}

test(
  '@issue-184 AC5 AC6: login throttling counts per forwarded client IP, with no global lockout',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    // IP A burns through the 5-per-minute login limit and is throttled.
    const burst: number[] = [];
    for (let i = 0; i < 6; i++) burst.push(await loginFrom(api, IP_A));
    expect(burst).toContain(429);
    expect(burst.every((s) => s === 401 || s === 429)).toBe(true);

    // A second client behind the same proxy still reaches the login check (wrong password: 401).
    expect(await loginFrom(api, IP_B)).toBe(401);

    // IP A stays throttled while IP B keeps getting through.
    expect(await loginFrom(api, IP_A)).toBe(429);
    expect(await loginFrom(api, IP_B)).toBe(401);
  },
);
