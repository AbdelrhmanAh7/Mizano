import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-42 AC1: the bill scan page offers one deterministic CPU extraction and no Fast/Accurate choice',
  { tags: ['feat:mz-bill-scan'] },
  async ({ app, agent }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/purchases/bills/scan');
    await agent.assert('the page offers a way to upload a vendor bill document for scanning');
    await agent.assert('there is no Fast or Accurate scan mode selector on the page');
  },
);

test(
  '@issue-42 AC2: the Arabic bill scan page renders right-to-left',
  { tags: ['feat:mz-bill-scan'] },
  async ({ app, agent, browser }) => {
    await app.open('/ar/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/ar/purchases/bills/scan');
    await agent.assert('the page offers a way to upload a vendor bill document for scanning');
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
  },
);

test(
  '@issue-42 AC3: the intake job list rejects unauthenticated requests while extraction runs in the worker',
  { tags: ['feat:mz-document-intake'] },
  async ({ app }) => {
    const res = await fetch(new URL('/api/ai/document-intake/jobs', app.baseUrl));
    expect(res.status).toBe(401);
  },
);
