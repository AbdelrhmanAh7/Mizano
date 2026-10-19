import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Fixed documentation-range addresses (RFC 5737). The forged values are what an attacker would
// rotate; the API must keep counting the tester's real address (the right-most hop the edge or
// local proxy appended, or the socket peer), so rotation never opens a fresh bucket.
const FORGED = ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4', '198.51.100.5'];
const REAL_HOP = '203.0.113.184';
const WRONG_LOGIN = { email: 'army-184-throttle@army-e2e.test', password: 'Wrong-password-184' };

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

async function loginWithForgedIp(api: string, i: number): Promise<number> {
  const forged = FORGED[i % FORGED.length];
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Client-chosen prefix plus the hop a proxy appends; both headers rotate per attempt.
      'x-forwarded-for': `${forged}, ${REAL_HOP}`,
      'cf-connecting-ip': forged,
    },
    body: JSON.stringify(WRONG_LOGIN),
  });
  await res.text();
  return res.status;
}

test(
  '@issue-184 AC5 AC6: rotating forged client-IP headers does not escape login throttling',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    // One tester, a new forged X-Forwarded-For / CF-Connecting-IP on every attempt: the
    // 5-per-minute login limit still applies to that tester, so the 6th attempt is throttled.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push(await loginWithForgedIp(api, i));
    expect(statuses.every((s) => s === 401 || s === 429)).toBe(true);
    expect(statuses).toContain(429);

    // Still throttled on the next forged value.
    expect(await loginWithForgedIp(api, 6)).toBe(429);
  },
);
