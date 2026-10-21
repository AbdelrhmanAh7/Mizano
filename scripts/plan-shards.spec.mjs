import { strictEqual, deepStrictEqual } from 'node:assert';
import { globToRegex, planShards } from './plan-shards.mjs';

// Test globToRegex
const re1 = globToRegex('apps/api/src/modules/sales/**');
strictEqual(re1.test('apps/api/src/modules/sales/services/invoices.service.ts'), true);
strictEqual(re1.test('apps/api/src/modules/banking/services/bank.service.ts'), false);

const re2 = globToRegex('apps/web/messages/*/auth.json');
strictEqual(re2.test('apps/web/messages/ar/auth.json'), true);
strictEqual(re2.test('apps/web/messages/auth.json'), false);

// Test planShards on push
const pushShards = planShards({ eventName: 'push' });
strictEqual(pushShards[0], 'pr');
strictEqual(pushShards.includes('smoke'), true);
strictEqual(pushShards.includes('sales-api'), true);
strictEqual(pushShards.length, 23); // 'pr' + 22 shards

// Test planShards on pull_request with a sales api file
const prSalesShards = planShards({
  eventName: 'pull_request',
  changedFiles: ['apps/api/src/modules/sales/services/invoices.service.ts'],
});
strictEqual(prSalesShards[0], 'pr');
strictEqual(prSalesShards.includes('sales-api'), true);
// Since no web UI file changed, ui-sales should not be triggered
strictEqual(prSalesShards.includes('ui-sales'), false);

// Test planShards on pull_request with sales web UI file
const prSalesUiShards = planShards({
  eventName: 'pull_request',
  changedFiles: ['apps/web/app/[locale]/(dashboard)/sales/invoices/page.tsx'],
});
strictEqual(prSalesUiShards[0], 'pr');
strictEqual(prSalesUiShards.includes('ui-sales'), true);

// Test planShards on pull_request with ignore file (e.g. README.md)
const prIgnoreShards = planShards({
  eventName: 'pull_request',
  changedFiles: ['README.md'],
});
deepStrictEqual(prIgnoreShards, ['pr', 'smoke']);

console.log('All plan-shards.spec.mjs assertions passed cleanly.');
