import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-301 AC1 AC6: customer form transforms address fields into nested structure and posts successfully',
  { tags: ['feat:mz-customers', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    await app.open('/en/sales/customers/new');
    await agent.act('fill customer name with {name}', {
      params: { name: 'Army Customer 301' },
    });
    await agent.act('fill street address with {street}', {
      params: { street: '123 Nile Corniche' },
    });
    await agent.act('fill city with {city}', {
      params: { city: 'Cairo' },
    });
    await agent.act('submit the customer form');
    await agent.assert('the customer was created and the customer list is displayed');

    // Arabic / RTL check
    await app.open('/ar/sales/customers/new');
    const isRtl = await screen.evaluate(() => document.documentElement.dir === 'rtl');
    expect(isRtl).toBe(true);
  },
);
