import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Revenue KPI totals of the seeded demo organization (issue #218): this month vs full history.
const MONTH_TOTAL = '2540.3';
const ALL_TIME_TOTAL = '17782.1';

test(
  '@issue-218 AC1: dashboard revenue KPI defaults to the current month',
  { tags: ['feat:mz-dashboard'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/dashboard');
    await agent.assert(
      'the date range button shows the first day of the current month through today',
    );
    await expect(screen.getByText(MONTH_TOTAL)).toBeVisible();
    await expect(screen.getByText(ALL_TIME_TOTAL)).toHaveCount(0);
  },
);

test(
  '@issue-218 AC2: period=all shows the full-history total, larger than the month total',
  { tags: ['feat:mz-dashboard'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/dashboard?period=all');
    await expect(screen.getByText(ALL_TIME_TOTAL)).toBeVisible();
    await expect(screen.getByText(MONTH_TOTAL)).toHaveCount(0);
  },
);

test(
  '@issue-218 AC3: changing the period selector re-fetches and the KPI changes',
  { tags: ['feat:mz-dashboard'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/dashboard');
    await expect(screen.getByText(MONTH_TOTAL)).toBeVisible();
    await agent.act('open the date range picker and choose {preset}', {
      params: { preset: 'All Time' },
    });
    await expect(screen.getByText(ALL_TIME_TOTAL)).toBeVisible();
    await expect(screen.getByText(MONTH_TOTAL)).toHaveCount(0);
    await agent.act('open the date range picker and choose {preset}', {
      params: { preset: 'This Month' },
    });
    await expect(screen.getByText(MONTH_TOTAL)).toBeVisible();
    await expect(screen.getByText(ALL_TIME_TOTAL)).toHaveCount(0);
  },
);

test(
  '@issue-218 AC4: reloading with the same period renders the same KPI',
  { tags: ['feat:mz-dashboard'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/dashboard');
    await agent.act('open the date range picker and choose {preset}', {
      params: { preset: 'All Time' },
    });
    await expect(screen.getByText(ALL_TIME_TOTAL)).toBeVisible();
    await agent.act('reload the page');
    await agent.assert('the address bar still contains period=all');
    await expect(screen.getByText(ALL_TIME_TOTAL)).toBeVisible();
  },
);
