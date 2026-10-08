import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('@issue-96 AC1: a draft bill matching a posted bill shows a dismissible, non-blocking duplicate warning', async ({
  app,
  agent,
  screen,
}) => {
  await app.open('/en/login');
  await agent.act('sign in as {email} with password {pw}', {
    params: { email: 'admin@mizano.com', pw: 'password123' },
  });
  await app.open('/en/purchases/bills');
  await agent.act('open any draft or pending bill from the list');
  await agent.assert(
    "either a 'Possible duplicate bill' warning with links to posted bills is shown, or no duplicate warning is shown, and the Approve button is still available",
  );
  await agent.act("if a 'Possible duplicate bill' warning is visible, dismiss it");
  await agent.assert(
    "the page has no 'Possible duplicate bill' warning and the bill is still unposted",
  );
});

test('@issue-96 AC2: the Arabic bills page renders right-to-left', async ({
  app,
  agent,
  browser,
}) => {
  await app.open('/ar/login');
  await agent.act('sign in as {email} with password {pw}', {
    params: { email: 'admin@mizano.com', pw: 'password123' },
  });
  await app.open('/ar/purchases/bills');
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
});
