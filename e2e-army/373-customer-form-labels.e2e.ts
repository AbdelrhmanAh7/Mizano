import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-373 AC1 AC2 AC3 AC4 AC5 AC7: customer form accessible single-locale labels without keyword stacking, Arabic RTL localization, and crm alias routing',
  { tags: ['feat:mz-customers'] },
  async ({ app, agent, screen }) => {
    // 1. Sign in as demo admin
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });

    // 2. Open new customer form in English via CRM alias route (verifies no 404 error)
    await app.open('/en/crm/customers/new');
    await agent.assert(
      'the customer form displays single-locale English labels and accessible fields for name, email, billing address, and shipping address without 404 error and without bilingual slash-delimited keyword stacking',
    );

    // 3. Open customer form via primary sales path
    await app.open('/en/sales/customers/new');
    await agent.assert(
      'the customer form is accessible at /en/sales/customers/new with clean labels',
    );

    // 4. Invalid/empty case: submitting an empty form shows required validation error
    await agent.act('click the Create Customer submit button without entering a name');
    await agent.assert('an error message indicates customer name is required');

    // 5. Happy path: fill customer name and submit
    await agent.act('fill customer name with {name} and submit the customer form', {
      params: { name: 'Army-373 Test Customer' },
    });
    await agent.assert('the customer is created successfully and listed in the customers page');

    // 6. Open new customer form in Arabic via CRM alias: verify RTL orientation, clean Arabic labels, and no 404 error
    await app.open('/ar/crm/customers/new');
    await agent.assert(
      'the customer form renders in Arabic with right-to-left RTL direction and natural Modern Standard Arabic labels without 404 error and without machine translation fragments like مشاركة',
    );
  },
);
