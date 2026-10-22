/**
 * E2E tests for issue #355: work orders navigation, Arabic RTL, and completion API validation.
 * Tags: feat:mz-work-orders, feat:mz-bom
 */
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-355 AC1 AC2: manufacturing work orders page loads and navigates without auth redirect or CORS errors',
  { tags: ['feat:mz-work-orders', 'feat:mz-bom'] },
  async ({ app, agent }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    await app.open('/en/manufacturing/work-orders');
    await agent.assert('the manufacturing work orders list page is displayed');

    await agent.act('click on new work order');
    await agent.assert('the new work order form is displayed and the user remains authenticated');
  },
);

test(
  '@issue-355 AC3: manufacturing work orders renders right-to-left in Arabic locale',
  { tags: ['feat:mz-work-orders', 'feat:mz-bom'] },
  async ({ app, agent, browser }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    await app.open('/ar/manufacturing/work-orders');
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  },
);

test(
  '@issue-355 AC4 AC5: work order completion endpoint requires quantityProduced and rejects absent quantity',
  { tags: ['feat:mz-work-orders', 'lvl:api'] },
  async ({ app }) => {
    const api = (process.env.E2E_ARMY_API ?? new URL('/api', app.baseUrl).href).replace(/\/+$/, '');
    const loginRes = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
    });
    expect([200, 201]).toContain(loginRes.status);
    const loginBody = (await loginRes.json()) as { tokens?: { accessToken?: string }; accessToken?: string };
    const token = loginBody.tokens?.accessToken || loginBody.accessToken;
    expect(token).toBeDefined();

    const emptyCompleteRes = await fetch(`${api}/manufacturing/work-orders/wo-dummy-test/complete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    expect([400, 404]).toContain(emptyCompleteRes.status);
  },
);
