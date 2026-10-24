import { Test, TestingModule } from '@nestjs/testing';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ReportsController } from './reports.controller';
import { ApReconciliationService } from '../services/ap-reconciliation.service';
import { FinancialReportsService } from '../services/financial-reports.service';
import { AgingReportsService } from '../services/aging-reports.service';
import { DashboardService } from '../services/dashboard.service';
import { PdfService } from '../../documents/services/pdf.service';
import { FinancialNarrativeService } from '../../ai/services/financial-narrative.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { ApReconciliationResponseDto } from '../dto/ap-reconciliation.dto';

describe('ReportsController - AP Reconciliation (@issue-320)', () => {
  let controller: ReportsController;
  let apReconciliationService: jest.Mocked<Partial<ApReconciliationService>>;

  beforeEach(async () => {
    apReconciliationService = {
      reconcileApControl: jest.fn().mockResolvedValue({
        asOf: '2026-10-23',
        currencyCode: 'SAR',
        subledgerTotal: '1500.0000',
        controlBalance: '1500.0000',
        difference: '0.0000',
        ok: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ApReconciliationService, useValue: apReconciliationService },
        { provide: FinancialReportsService, useValue: {} },
        { provide: AgingReportsService, useValue: {} },
        { provide: DashboardService, useValue: {} },
        { provide: PdfService, useValue: {} },
        { provide: FinancialNarrativeService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getApReconciliation endpoint', () => {
    const orgId = 'org-test-123';

    it('delegates to ApReconciliationService.reconcileApControl with orgId and asOf date', async () => {
      const result = await controller.getApReconciliation(orgId, '2026-10-23');

      expect(apReconciliationService.reconcileApControl).toHaveBeenCalledWith(orgId, '2026-10-23');
      expect(result).toEqual({
        asOf: '2026-10-23',
        currencyCode: 'SAR',
        subledgerTotal: '1500.0000',
        controlBalance: '1500.0000',
        difference: '0.0000',
        ok: true,
      });
    });

    it('delegates with undefined when asOf parameter is omitted', async () => {
      await controller.getApReconciliation(orgId);
      expect(apReconciliationService.reconcileApControl).toHaveBeenCalledWith(orgId, undefined);
    });

    it('requires reports.view permission', () => {
      const permissions = Reflect.getMetadata(
        PERMISSIONS_KEY,
        ReportsController.prototype.getApReconciliation,
      );
      expect(permissions).toEqual(['reports.view']);
    });

    it('documents HTTP responses via @ApiResponse decorators (200, 400, 401, 403)', () => {
      const responses = Reflect.getMetadata(
        DECORATORS.API_RESPONSE,
        ReportsController.prototype.getApReconciliation,
      );
      expect(responses).toBeDefined();

      // 200 response documented with type ApReconciliationResponseDto
      expect(responses['200']).toBeDefined();
      expect(responses['200'].type).toBe(ApReconciliationResponseDto);
      expect(responses['200'].description).toMatch(/reconciliation summary/i);

      // 400 bad request documented
      expect(responses['400']).toBeDefined();
      expect(responses['400'].description).toMatch(/invalid date/i);

      // 401 unauthorized documented
      expect(responses['401']).toBeDefined();
      expect(responses['401'].description).toMatch(/unauthorized/i);

      // 403 forbidden documented
      expect(responses['403']).toBeDefined();
      expect(responses['403'].description).toMatch(/forbidden/i);
    });

    it('documents query parameter asOf via @ApiQuery decorator', () => {
      const parameters = Reflect.getMetadata(
        DECORATORS.API_PARAMETERS,
        ReportsController.prototype.getApReconciliation,
      );
      expect(parameters).toBeDefined();
      const asOfParam = Object.values(parameters).find(
        (p: any) => p.name === 'asOf' && p.in === 'query',
      );
      expect(asOfParam).toBeDefined();
      expect((asOfParam as any).required).toBe(false);
    });
  });
});
