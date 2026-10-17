import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ReportsController } from './reports.controller';
import {
  FinancialReportsService,
  GeneralLedgerReport,
} from '../services/financial-reports.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';

describe('ReportsController - General Ledger isolation (@issue-223)', () => {
  let controller: ReportsController;
  const mockReport = { entries: [{ journalId: 'j-1' }] } as unknown as GeneralLedgerReport;
  const financialReportsService = {
    getGeneralLedger: jest.fn(async (org: string, acc: string) => {
      if (org === 'org-owner' && acc === 'acc-own') return mockReport;
      throw new NotFoundException('Account not found');
    }),
    getTrialBalance: jest.fn(),
  };

  beforeEach(() => {
    controller = new ReportsController(
      financialReportsService as unknown as FinancialReportsService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('route protection and token validation (AC3)', () => {
    it('applies JwtAuthGuard and PermissionsGuard at controller level', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual([
        JwtAuthGuard,
        PermissionsGuard,
      ]);
    });

    it('requires reports.view permission on by-id and list general ledger/report routes', () => {
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.getGeneralLedger),
      ).toEqual(['reports.view']);
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.getTrialBalance),
      ).toEqual(['reports.view']);
    });
  });

  describe('general ledger account isolation (AC1, AC2)', () => {
    it('AC1: returns 200 with ledger entries when requesting own account', async () => {
      const res = await controller.getGeneralLedger(
        'org-owner',
        'acc-own',
        '2026-01-01',
        '2026-01-31',
      );
      expect(res).toBe(mockReport);
      expect(res.entries).toHaveLength(1);
    });

    it('AC2: returns 404 NotFoundException when accessing foreign account ID', async () => {
      await expect(controller.getGeneralLedger('org-foreign', 'acc-own')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getGeneralLedger('org-owner', 'acc-foreign')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
