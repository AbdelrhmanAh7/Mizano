import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The Pi compose probes (api: /api/health/ready, web: /api/health) are plain HTTP-status probes,
// so a healthy stack must answer 200 with a ready body and nothing else may answer 200 for them.
const WEB = (app?: { baseUrl?: string }) =>
  String(process.env.E2E_ARMY_URL ?? app?.baseUrl ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

test(
  '@issue-39 AC2: the api readiness route answers 200 only when database and redis are up',
  { tags: ['feat:mz-health', 'feat:mz-system-diagnostics', 'lvl:api'] },
  async ({ app }) => {
    const apiDirect = process.env.E2E_ARMY_API ? process.env.E2E_ARMY_API.replace(/\/+$/, '') : null;
    if (apiDirect) {
      const res = await fetch(`${apiDirect}/health/ready`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ready: boolean; services: { database: string } };
      expect(body.ready).toBe(true);
      expect(body.services.database).toBe('connected');
    } else {
      const res = await fetch(new URL('/api/health', WEB(app)));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; api: string };
      expect(body).toEqual({ status: 'ok', api: 'ready' });
    }
  },
);

test(
  '@issue-39 AC2: the web health route reports the api as ready',
  { tags: ['feat:mz-health', 'lvl:api'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/health', WEB(app)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', api: 'ready' });
  },
);

test(
  '@issue-39 AC2: an unknown health route is not a healthy answer',
  { tags: ['feat:mz-health', 'lvl:api'] },
  async ({ app }) => {
    const apiDirect = process.env.E2E_ARMY_API ? process.env.E2E_ARMY_API.replace(/\/+$/, '') : null;
    const url = apiDirect
      ? `${apiDirect}/health/not-a-probe`
      : new URL('/api/health/not-a-probe', WEB(app)).toString();
    const res = await fetch(url);
    expect(res.status).toBe(404);
  },
);

test(
  '@issue-39 AC1: the api live status route reports service readiness for intake processing',
  { tags: ['feat:mz-intake-processor', 'lvl:api'] },
  async ({ app }) => {
    const apiDirect = process.env.E2E_ARMY_API ? process.env.E2E_ARMY_API.replace(/\/+$/, '') : null;
    if (apiDirect) {
      const res = await fetch(`${apiDirect}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('ok');
    } else {
      const res = await fetch(new URL('/api/health', WEB(app)));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; api: string };
      expect(body.status).toBe('ok');
    }
  },
);
