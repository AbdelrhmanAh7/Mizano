import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-110 AC1-AC4: GET /api/health/ready is unauthenticated, reports db and disk, and leaks nothing',
  { tags: ['feat:mz-health', 'lvl:api'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/health/ready', app.baseUrl));
    const text = await res.text();
    const body = JSON.parse(text) as {
      status: string;
      db: string;
      disk: { freeBytes: number; freePct: number } | string;
    };

    // The throwaway stack has a live database; the disk verdict depends on the runner, so both
    // documented outcomes are accepted as long as status code and body agree.
    expect([200, 503]).toContain(res.status);
    expect(Object.keys(body).sort()).toEqual(['db', 'disk', 'status']);
    expect(body.status).toBe(res.status === 200 ? 'ok' : 'fail');
    expect(body.db).toBe('ok');
    if (res.status === 200) {
      const disk = body.disk as { freeBytes: number; freePct: number };
      expect(disk.freeBytes).toBeGreaterThan(0);
      expect(disk.freePct).toBeGreaterThanOrEqual(10);
    } else {
      expect(body.disk).toBe('fail');
    }
    expect(text).not.toMatch(/postgres(ql)?:\/\/|password|organizationId|\/data\//i);

    const live = await fetch(new URL('/api/health', app.baseUrl));
    expect(live.status).toBe(200);
  },
);
