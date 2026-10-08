// Seeded smoke for the restore drill, run inside the deployed API image against the
// restored scratch database: wait for health, register a throwaway organization, log in
// and check that its trial balance balances. Prints step names and status codes only.
// Usage: node drill-smoke.mjs [base-url]   (default http://127.0.0.1:6001/api)
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

async function call(base, method, path, { step, expect, body, token }) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status !== expect) throw new Error(`${step}: HTTP ${res.status}`);
  return res.json();
}

async function waitHealthy(base, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok && (await res.json()).status === 'healthy') return;
    } catch {
      // API not listening yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('health: not healthy before timeout');
}

export async function runSmoke(base, opts = {}) {
  const { timeoutMs = 180000, intervalMs = 2000, log = (m) => console.log(m) } = opts;
  await waitHealthy(base, timeoutMs, intervalMs);
  log('smoke: health ok');
  const suffix = randomBytes(6).toString('hex');
  const email = `drill-${suffix}@example.com`;
  const password = `Drill${randomBytes(12).toString('hex')}A1`;
  await call(base, 'POST', '/auth/register', {
    step: 'register',
    expect: 201,
    body: {
      email,
      password,
      firstName: 'Restore',
      lastName: 'Drill',
      organizationName: `Restore drill ${suffix}`,
    },
  });
  const login = await call(base, 'POST', '/auth/login', {
    step: 'login',
    expect: 200,
    body: { email, password },
  });
  const token = login?.tokens?.accessToken;
  if (!token) throw new Error('login: no access token');
  const tb = await call(base, 'GET', '/accounting-reports/trial-balance', {
    step: 'trial-balance',
    expect: 200,
    token,
  });
  if (tb?.isBalanced !== true) throw new Error('trial-balance: not balanced');
  log('smoke: register, login and trial balance OK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke(process.argv[2] || 'http://127.0.0.1:6001/api').catch((err) => {
    console.error(`DRILL FAILED: smoke ${err.message}`);
    process.exit(1);
  });
}
