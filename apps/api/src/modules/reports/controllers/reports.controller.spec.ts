import { NotFoundException } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AgingReportsService } from '../services/aging-reports.service';
import { DashboardService } from '../services/dashboard.service';
import { FinancialReportsService } from '../services/financial-reports.service';
import { PdfService } from '../../documents/services/pdf.service';
import { FinancialNarrativeService } from '../../ai/services/financial-narrative.service';

describe('ReportsController statements', () => {
  const aging = {
    getCustomerStatement: jest.fn(),
    getVendorStatement: jest.fn(),
  };
  const controller = new ReportsController(
    {} as FinancialReportsService,
    aging as unknown as AgingReportsService,
    {} as DashboardService,
    {} as PdfService,
    {} as FinancialNarrativeService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('returns the customer statement of the organization', async () => {
    const statement = { closingBalance: '10.0000' };
    aging.getCustomerStatement.mockResolvedValue(statement);
    await expect(
      controller.getCustomerStatement('org-1', 'cust-1', '2025-01-01', '2025-12-31'),
    ).resolves.toBe(statement);
    expect(aging.getCustomerStatement).toHaveBeenCalledWith(
      'org-1',
      'cust-1',
      '2025-01-01',
      '2025-12-31',
    );
  });

  it('answers 404 for a customer outside the organization', async () => {
    aging.getCustomerStatement.mockResolvedValue(null);
    await expect(
      controller.getCustomerStatement('org-1', 'cust-x', '2025-01-01', '2025-12-31'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the vendor statement of the organization', async () => {
    const statement = { closingBalance: '10.0000' };
    aging.getVendorStatement.mockResolvedValue(statement);
    await expect(
      controller.getVendorStatement('org-1', 'vend-1', '2025-01-01', '2025-12-31'),
    ).resolves.toBe(statement);
  });

  it('answers 404 for a vendor outside the organization', async () => {
    aging.getVendorStatement.mockResolvedValue(null);
    await expect(
      controller.getVendorStatement('org-1', 'vend-x', '2025-01-01', '2025-12-31'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
