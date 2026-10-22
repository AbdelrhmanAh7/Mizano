import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-373 AC1 AC2 AC3 AC4 AC5: customer form accessible single-locale labels without keyword stacking and Arabic RTL localization',
  { tags: ['feat:mz-customers'] },
  async ({ app, agent, screen }) => {
    // 1. Sign in as demo admin
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    // 2. Open new customer form in English
    await app.open('/en/sales/customers/new');
    await agent.assert(
      'the customer form displays single-locale English labels and accessible fields for name, email, billing address, and shipping address without bilingual slash-delimited keyword stacking',
    );

    // 3. Invalid/empty case: submitting an empty form shows required validation error
    await agent.act('click the Create Customer submit button without entering a name');
    await agent.assert('an error message indicates customer name is required');

    // 4. Happy path: fill customer name and submit
    await agent.act('fill customer name with {name} and submit the customer form', {
      params: { name: 'Army-373 Test Customer' },
    });
    await agent.assert('the customer is created successfully and listed in the customers page');

    // 5. Open new customer form in Arabic: verify RTL orientation and clean Arabic labels
    await app.open('/ar/sales/customers/new');
    await agent.assert(
      'the customer form renders in Arabic with right-to-left RTL direction and natural Modern Standard Arabic labels without machine translation fragments like مشاركة',
    );
  },
);
