import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-332 AC2: NextAuth session endpoint omits refreshToken for unauthenticated requests',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/auth/session', app.baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
    expect(JSON.stringify(body)).not.toContain('refreshToken');
  },
);

test(
  '@issue-332 AC1 AC2: NextAuth session endpoint response omits refreshToken',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/auth/session', app.baseUrl));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('refreshToken');
  },
);
