import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-133 AC3: AI Insights navigation and forecast/revenue subpages load without errors',
  { tags: ['feat:mz-ai-insights', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    // 1. Main AI Insights page
    await app.open('/en/ai-insights');
    await expect(screen.getByRole('heading', { name: /AI Insights/i })).toBeVisible();

    // 2. Cash Flow Forecast page
    await app.open('/en/ai-insights/forecast');
    await expect(screen.getByRole('heading', { name: /Forecast/i })).toBeVisible();

    // 3. Revenue Forecast page
    await app.open('/en/ai-insights/revenue');
    await expect(screen.getByRole('heading', { name: /Revenue/i })).toBeVisible();

    // 4. Arabic / RTL localization
    await app.open('/ar/ai-insights');
    await agent.assert('Arabic AI insights page loads with RTL layout');
  },
);
