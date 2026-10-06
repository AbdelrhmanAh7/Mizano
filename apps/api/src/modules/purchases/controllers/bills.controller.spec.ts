import { Reflector } from '@nestjs/core';
import { BillsController } from './bills.controller';
import { BillsService } from '../services/bills.service';
import { PaymentsMadeService } from '../services/payments-made.service';

describe('BillsController - Duplicate Warning', () => {
  let controller: BillsController;
  let billsService: {
    findPossibleDuplicateBills: jest.Mock;
  };
  let paymentsMadeService: Record<string, unknown>;
  const reflector = new Reflector();
  const ORG_ID = 'org-test-123';

  beforeEach(() => {
    billsService = {
      findPossibleDuplicateBills: jest.fn().mockResolvedValue({
        status: 'possible',
        matches: [
          { billId: 'bill-1', documentDate: '2026-10-06', amount: '100.10', currency: 'EGP' },
        ],
      }),
    };
    paymentsMadeService = {};
    controller = new BillsController(
      billsService as unknown as BillsService,
      paymentsMadeService as unknown as PaymentsMadeService,
    );
  });

  describe('findPossibleDuplicates', () => {
    it('is protected by purchases.view permission', () => {
      const perms = reflector.get('permissions', controller.findPossibleDuplicates);
      expect(perms).toEqual(['purchases.view']);
    });

    it('delegates to billsService with organizationId from decorator and query dto', async () => {
      const query = {
        vendorId: 'vendor-1',
        amount: '100.10',
        date: '2026-10-06',
      };
      const res = await controller.findPossibleDuplicates(ORG_ID, query);

      expect(billsService.findPossibleDuplicateBills).toHaveBeenCalledWith(ORG_ID, query);
      expect(res.status).toBe('possible');
      expect(res.matches).toHaveLength(1);
    });
  });

  describe('findPossibleDuplicatesForBill', () => {
    it('is protected by purchases.view permission', () => {
      const perms = reflector.get('permissions', controller.findPossibleDuplicatesForBill);
      expect(perms).toEqual(['purchases.view']);
    });

    it('delegates to billsService with billId', async () => {
      const res = await controller.findPossibleDuplicatesForBill(ORG_ID, 'draft-bill-1');

      expect(billsService.findPossibleDuplicateBills).toHaveBeenCalledWith(ORG_ID, {
        billId: 'draft-bill-1',
      });
      expect(res.status).toBe('possible');
    });
  });
});
