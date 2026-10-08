// Run: node --test 'deploy/pi/scripts/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runSmoke } from '../drill-smoke.mjs';

// Fake API. `routes` maps "METHOD /path" to [status, body].
async function fakeApi(routes) {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const key = `${req.method} ${req.url}`;
      seen.push({ key, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
      const [status, body] = routes[key] ?? [404, { message: 'not found' }];
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { base, seen, close: () => new Promise((r) => server.close(r)) };
}

const healthy = [200, { status: 'healthy', services: { database: { status: 'connected' } } }];
const okRoutes = {
  'GET /api/health': healthy,
  'POST /api/auth/register': [201, { user: { id: 'u1' } }],
  'POST /api/auth/login': [200, { tokens: { accessToken: 'tok' } }],
  'GET /api/accounting-reports/trial-balance': [200, { isBalanced: true }],
};
const quiet = { log: () => {}, timeoutMs: 300, intervalMs: 20 };

test('registers a throwaway org, logs in and checks the trial balance', async () => {
  const api = await fakeApi(okRoutes);
  try {
    await runSmoke(api.base, quiet);
    const keys = api.seen.map((s) => s.key);
    assert.deepEqual(keys, [
      'GET /api/health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/accounting-reports/trial-balance',
    ]);
    const reg = api.seen[1].body;
    assert.match(reg.email, /^drill-[0-9a-f]+@example\.com$/);
    assert.deepEqual(api.seen[2].body, { email: reg.email, password: reg.password });
    assert.equal(api.seen[3].auth, 'Bearer tok');
  } finally {
    await api.close();
  }
});

test('fails when the trial balance does not balance', async () => {
  const api = await fakeApi({
    ...okRoutes,
    'GET /api/accounting-reports/trial-balance': [200, { isBalanced: false }],
  });
  try {
    await assert.rejects(runSmoke(api.base, quiet), /trial-balance: not balanced/);
  } finally {
    await api.close();
  }
});

test('fails on an unexpected status without echoing the response body', async () => {
  const api = await fakeApi({
    ...okRoutes,
    'POST /api/auth/register': [409, { message: 'secret-detail' }],
  });
  try {
    await assert.rejects(runSmoke(api.base, quiet), (err) => {
      assert.equal(err.message, 'register: HTTP 409');
      return true;
    });
  } finally {
    await api.close();
  }
});

test('times out when the API never reports healthy', async () => {
  const api = await fakeApi({ ...okRoutes, 'GET /api/health': [503, { status: 'unhealthy' }] });
  try {
    await assert.rejects(runSmoke(api.base, quiet), /health: not healthy/);
    assert.ok(api.seen.every((s) => s.key === 'GET /api/health'));
  } finally {
    await api.close();
  }
});
