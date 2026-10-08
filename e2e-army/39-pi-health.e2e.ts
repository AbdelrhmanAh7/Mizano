import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The Pi compose probes (api: /api/health/ready, web: /api/health) are plain HTTP-status probes,
// so a healthy stack must answer 200 with a ready body and nothing else may answer 200 for them.
const apiBase = () => (process.env.E2E_ARMY_API ?? 'http://127.0.0.1:6001/api').replace(/\/+$/, '');

test(
  '@issue-39 AC2: the api readiness route answers 200 only when database and redis are up',
  { tags: ['feat:mz-health'] },
  async () => {
    const res = await fetch(`${apiBase()}/health/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ready: boolean; services: { database: string } };
    expect(body.ready).toBe(true);
    expect(body.services.database).toBe('connected');
  },
);

test(
  '@issue-39 AC2: the web health route reports the api as ready',
  { tags: ['feat:mz-health'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/health', app.baseUrl));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', api: 'ready' });
  },
);

test(
  '@issue-39 AC2: an unknown health route is not a healthy answer',
  { tags: ['feat:mz-health'] },
  async () => {
    const res = await fetch(`${apiBase()}/health/not-a-probe`);
    expect(res.status).toBe(404);
  },
);
