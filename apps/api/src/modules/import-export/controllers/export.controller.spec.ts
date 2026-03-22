import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from '../services/export.service';
import { BulkExportService } from '../services/bulk-export.service';
import { ExportFormat, ImportEntityType } from '../dto/import-export.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

describe('ExportController', () => {
  let controller: ExportController;
  let exportService: {
    exportData: jest.Mock;
    generateImportTemplate: jest.Mock;
  };
  let bulkExportService: {
    exportByIds: jest.Mock;
  };

  const mockExportResult = {
    buffer: Buffer.from('test-csv-data'),
    contentType: 'text/csv',
    filename: 'test.csv',
  };

  const mockRes = {
    set: jest.fn(),
    send: jest.fn(),
  };

  beforeEach(async () => {
    exportService = {
      exportData: jest.fn().mockResolvedValue(mockExportResult),
      generateImportTemplate: jest.fn().mockResolvedValue(mockExportResult),
    };
    bulkExportService = {
      exportByIds: jest.fn().mockResolvedValue(mockExportResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        { provide: ExportService, useValue: exportService },
        { provide: BulkExportService, useValue: bulkExportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExportController>(ExportController);
    jest.clearAllMocks();
  });

  describe('downloadTemplate', () => {
    // Regression tests for Errors 1, 3-6: template endpoint must exist and work
    // These errors occurred because the frontend called /import/template/ instead of /export/template/
    // The backend fix adds hyphen-to-underscore normalization as defense-in-depth

    it('should download template for customers', async () => {
      await controller.downloadTemplate('customers', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.CUSTOMERS,
        ExportFormat.CSV,
      );
      expect(mockRes.set).toHaveBeenCalled();
      expect(mockRes.send).toHaveBeenCalledWith(mockExportResult.buffer);
    });

    it('should download template for invoices', async () => {
      await controller.downloadTemplate('invoices', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.INVOICES,
        ExportFormat.CSV,
      );
    });

    it('should download template for quotes', async () => {
      await controller.downloadTemplate('quotes', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.QUOTES,
        ExportFormat.CSV,
      );
    });

    it('should download template for credit_notes', async () => {
      await controller.downloadTemplate('credit_notes', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.CREDIT_NOTES,
        ExportFormat.CSV,
      );
    });

    it('should download template for payments_received', async () => {
      await controller.downloadTemplate('payments_received', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.PAYMENTS_RECEIVED,
        ExportFormat.CSV,
      );
    });

    it('should download template for delivery_challans', async () => {
      await controller.downloadTemplate('delivery_challans', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.DELIVERY_CHALLANS,
        ExportFormat.CSV,
      );
    });

    // Defense-in-depth: hyphenated entity types should also work via normalization
    it('should normalize credit-notes to credit_notes for template download', async () => {
      await controller.downloadTemplate('credit-notes', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.CREDIT_NOTES,
        ExportFormat.CSV,
      );
    });

    it('should normalize payments-received to payments_received for template download', async () => {
      await controller.downloadTemplate('payments-received', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.PAYMENTS_RECEIVED,
        ExportFormat.CSV,
      );
    });

    it('should normalize delivery-challans to delivery_challans for template download', async () => {
      await controller.downloadTemplate('delivery-challans', ExportFormat.CSV, mockRes as never);

      expect(exportService.generateImportTemplate).toHaveBeenCalledWith(
        ImportEntityType.DELIVERY_CHALLANS,
        ExportFormat.CSV,
      );
    });

    it('should throw BadRequestException for invalid entity type', async () => {
      await expect(
        controller.downloadTemplate('invalid', ExportFormat.CSV, mockRes as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set correct response headers', async () => {
      await controller.downloadTemplate('customers', ExportFormat.CSV, mockRes as never);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': mockExportResult.contentType,
        'Content-Disposition': `attachment; filename="${mockExportResult.filename}"`,
        'Content-Length': mockExportResult.buffer.length,
      });
    });
  });

  describe('exportData', () => {
    const ORG_ID = 'org-test-001';

    it('should export data for valid entity type', async () => {
      await controller.exportData(mockRes as never, ORG_ID, 'customers', ExportFormat.CSV);

      expect(exportService.exportData).toHaveBeenCalledWith(ORG_ID, 'customers', {
        format: ExportFormat.CSV,
        dateFrom: undefined,
        dateTo: undefined,
        fields: undefined,
        includeDeleted: false,
      });
    });

    it('should normalize hyphenated entity types in exportData', async () => {
      await controller.exportData(mockRes as never, ORG_ID, 'credit-notes', ExportFormat.CSV);

      expect(exportService.exportData).toHaveBeenCalledWith(
        ORG_ID,
        'credit_notes',
        expect.any(Object),
      );
    });

    it('should normalize payments-received in exportData', async () => {
      await controller.exportData(mockRes as never, ORG_ID, 'payments-received', ExportFormat.CSV);

      expect(exportService.exportData).toHaveBeenCalledWith(
        ORG_ID,
        'payments_received',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException for invalid entity type in exportData', async () => {
      await expect(
        controller.exportData(mockRes as never, ORG_ID, 'invalid', ExportFormat.CSV),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass date filters correctly', async () => {
      await controller.exportData(
        mockRes as never,
        ORG_ID,
        'invoices',
        ExportFormat.CSV,
        '2024-01-01',
        '2024-12-31',
      );

      expect(exportService.exportData).toHaveBeenCalledWith(ORG_ID, 'invoices', {
        format: ExportFormat.CSV,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31'),
        fields: undefined,
        includeDeleted: false,
      });
    });

    it('should parse comma-separated fields', async () => {
      await controller.exportData(
        mockRes as never,
        ORG_ID,
        'customers',
        ExportFormat.CSV,
        undefined,
        undefined,
        'name,email,phone',
      );

      expect(exportService.exportData).toHaveBeenCalledWith(ORG_ID, 'customers', {
        format: ExportFormat.CSV,
        dateFrom: undefined,
        dateTo: undefined,
        fields: ['name', 'email', 'phone'],
        includeDeleted: false,
      });
    });
  });
});
