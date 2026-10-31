import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { INVALIDATE_CACHE_KEY, LEDGER_CACHE_PATTERNS } from './invalidate-cache.decorator';
import { CacheInvalidationInterceptor } from '../interceptors/cache-invalidation.interceptor';
import { JournalsController } from '../../modules/accounting/controllers/journals.controller';
import { OpeningBalancesController } from '../../modules/accounting/controllers/opening-balances.controller';
import { RecurringProfilesController } from '../../modules/accounting/controllers/recurring-profiles.controller';
import { ReconciliationController } from '../../modules/banking/controllers/reconciliation.controller';
import { BillsController } from '../../modules/purchases/controllers/bills.controller';
import { ExpensesController } from '../../modules/purchases/controllers/expenses.controller';
import { PaymentsMadeController } from '../../modules/purchases/controllers/payments-made.controller';
import { VendorCreditsController } from '../../modules/purchases/controllers/vendor-credits.controller';
import { CreditNotesController } from '../../modules/sales/controllers/credit-notes.controller';
import { InvoicesController } from '../../modules/sales/controllers/invoices.controller';
import { PaymentsReceivedController } from '../../modules/sales/controllers/payments-received.controller';

type Controller = { prototype: object; name: string };

/**
 * Every pilot endpoint that posts, reverses or changes an open balance, and so must clear the
 * ledger-derived caches (journals, accounts, reports such as aging, dashboards) (#586, was #166).
 * Add a new posting endpoint here together with its `@InvalidatesLedger(...)`.
 */
const LEDGER_ENDPOINTS: Array<[Controller, string[]]> = [
  [JournalsController, ['create', 'update', 'post', 'reverse', 'remove', 'bulkDelete', 'bulkPost']],
  [OpeningBalancesController, ['post']],
  [RecurringProfilesController, ['executeProfile']],
  [BillsController, ['open', 'approve', 'bulkOpen', 'bulkApprove', 'bulkPay']],
  [ExpensesController, ['create', 'post', 'remove', 'bulkDelete', 'bulkApprove']],
  [PaymentsMadeController, ['create', 'bulkDelete', 'void']],
  [VendorCreditsController, ['create', 'bulkDelete', 'remove', 'applyToBill', 'refund']],
  [InvoicesController, ['send', 'void', 'recordPayment', 'bulkSend', 'bulkVoid', 'bulkPay']],
  [PaymentsReceivedController, ['create', 'bulkDelete', 'void']],
  [CreditNotesController, ['create', 'bulkDelete', 'remove', 'apply']],
  [ReconciliationController, ['confirmMatch', 'createExpense']],
];

describe('ledger cache invalidation on posting endpoints', () => {
  describe.each(LEDGER_ENDPOINTS)('%p', (controller, methods) => {
    it('runs the cache invalidation interceptor', () => {
      const interceptors: unknown[] = Reflect.getMetadata(INTERCEPTORS_METADATA, controller) ?? [];
      expect(interceptors).toContain(CacheInvalidationInterceptor);
    });

    it.each(methods)('%s clears every ledger-derived cache', (method) => {
      const handler = (controller.prototype as Record<string, unknown>)[method];
      expect(typeof handler).toBe('function');
      const patterns: string[] = Reflect.getMetadata(INVALIDATE_CACHE_KEY, handler as object) ?? [];
      expect(patterns).toEqual(expect.arrayContaining(LEDGER_CACHE_PATTERNS));
    });
  });
});
