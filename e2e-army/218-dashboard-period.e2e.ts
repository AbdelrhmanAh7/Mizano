import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

async function signIn(app: any, agent: any) {
  await app.open('/en/login');
  await agent.act('sign in as {email} with password {pw}', {
    params: { email: 'admin@mizano.com', pw: 'password123' },
  });
}

test(
  '@issue-218 AC1: dashboard revenue KPI defaults to the current month',
  { tags: ['feat:mz-dashboard'] },
  async ({ app, agent, screen }) => {
    await signIn(app, agent);
    await app.open('/en/dashboard');
    await agent.assert('the date range button shows the first day of the current month through today');
    await expect(screen.getByText('2540.3')).toBeVisible();
  },
);

test(
  '@issue-218 AC2-AC4: period=all shows the full-history total, survives reload and selector change',
  { tags: ['feat:mz-dashboard'] },
  async ({ app, agent, screen }) => {
    await signIn(app, agent);
    await app.open('/en/dashboard?period=all');
    await agent.assert('the revenue KPI shows the all-time total, larger than the current month total');
    await expect(screen.getByText('17782.1')).toBeVisible();
    await app.open('/en/dashboard?period=all');
    await expect(screen.getByText('17782.1')).toBeVisible();
    await agent.act('open the date range picker and choose {preset}', { params: { preset: 'This Month' } });
    await expect(screen.getByText('2540.3')).toBeVisible();
  },
);
