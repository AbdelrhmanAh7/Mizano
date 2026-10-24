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

/**
 * Controller wiring only: guards, permissions and that the ownership check runs before the
 * ledger is built. The tenant isolation itself (real JWTs, real database) is proven in
 * test/general-ledger.isolation-spec.ts.
 */
describe('ReportsController - general ledger wiring (@issue-223)', () => {
  let controller: ReportsController;
  const mockReport = { entries: [{ journalId: 'j-1' }] } as unknown as GeneralLedgerReport;
  const financialReportsService = {
    assertAccountOwnership: jest.fn(),
    getGeneralLedger: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    financialReportsService.getGeneralLedger.mockResolvedValue(mockReport);
    controller = new ReportsController(
      financialReportsService as unknown as FinancialReportsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('applies JwtAuthGuard and PermissionsGuard at controller level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual([
      JwtAuthGuard,
      PermissionsGuard,
    ]);
  });

  it('requires reports.view on the general ledger and trial balance routes', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.getGeneralLedger),
    ).toEqual(['reports.view']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.getTrialBalance),
    ).toEqual(['reports.view']);
  });

  it('declares getGeneralLedger as an async method on ReportsController', () => {
    expect(ReportsController.prototype.getGeneralLedger.constructor.name).toBe('AsyncFunction');
    financialReportsService.assertAccountOwnership.mockResolvedValue(undefined);
    const result = controller.getGeneralLedger('org-a', 'acc-own');
    expect(result).toBeInstanceOf(Promise);
  });

  it('checks account ownership for the caller organization before building the ledger', async () => {
    financialReportsService.assertAccountOwnership.mockResolvedValue(undefined);
    const res = await controller.getGeneralLedger('org-a', 'acc-own', '2026-01-01', '2026-01-31');
    expect(res).toBe(mockReport);
    expect(financialReportsService.assertAccountOwnership).toHaveBeenCalledWith('org-a', 'acc-own');
    expect(financialReportsService.getGeneralLedger).toHaveBeenCalledWith(
      'org-a',
      'acc-own',
      '2026-01-01',
      '2026-01-31',
    );
  });

  it('stops with the 404 and never builds the ledger when the ownership check fails', async () => {
    financialReportsService.assertAccountOwnership.mockRejectedValue(
      new NotFoundException('Account not found'),
    );
    await expect(controller.getGeneralLedger('org-b', 'acc-own')).rejects.toThrow(
      NotFoundException,
    );
    expect(financialReportsService.getGeneralLedger).not.toHaveBeenCalled();
  });
});
