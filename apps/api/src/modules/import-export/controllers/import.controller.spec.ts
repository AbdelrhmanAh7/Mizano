import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from '../services/import.service';
import { ENTITY_FIELD_DEFINITIONS, ImportEntityType } from '../dto/import-export.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';

describe('ImportController', () => {
  let controller: ImportController;
  let importService: {
    getAvailableEntityTypes: jest.Mock;
    getFieldDefinitions: jest.Mock;
    parseFile: jest.Mock;
    validateImport: jest.Mock;
    importData: jest.Mock;
  };

  beforeEach(async () => {
    importService = {
      getAvailableEntityTypes: jest.fn().mockReturnValue(Object.values(ImportEntityType)),
      getFieldDefinitions: jest.fn().mockImplementation((entityType: ImportEntityType) => {
        return ENTITY_FIELD_DEFINITIONS[entityType] || [];
      }),
      parseFile: jest.fn(),
      validateImport: jest.fn(),
      importData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [{ provide: ImportService, useValue: importService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CacheInvalidationInterceptor)
      .useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })
      .compile();

    controller = module.get<ImportController>(ImportController);
  });

  describe('getEntityTypes', () => {
    it('should return all available entity types including new sales types', () => {
      const result = controller.getEntityTypes();

      expect(result).toContain(ImportEntityType.CUSTOMERS);
      expect(result).toContain(ImportEntityType.INVOICES);
      expect(result).toContain(ImportEntityType.QUOTES);
      expect(result).toContain(ImportEntityType.CREDIT_NOTES);
      expect(result).toContain(ImportEntityType.PAYMENTS_RECEIVED);
      expect(result).toContain(ImportEntityType.DELIVERY_CHALLANS);
    });
  });

  describe('getFieldDefinitions', () => {
    it('should return field definitions for a valid entity type (customers)', () => {
      const result = controller.getFieldDefinitions('customers');

      expect(result.entityType).toBe('customers');
      expect(result.fields).toBeDefined();
      expect(result.fields.length).toBeGreaterThan(0);
      expect(importService.getFieldDefinitions).toHaveBeenCalledWith('customers');
    });

    it('should return field definitions for quotes', () => {
      const result = controller.getFieldDefinitions('quotes');

      expect(result.entityType).toBe('quotes');
      expect(result.fields).toBeDefined();
    });

    it('should return field definitions for credit_notes (underscored)', () => {
      const result = controller.getFieldDefinitions('credit_notes');

      expect(result.entityType).toBe('credit_notes');
      expect(result.fields).toBeDefined();
    });

    it('should return field definitions for payments_received (underscored)', () => {
      const result = controller.getFieldDefinitions('payments_received');

      expect(result.entityType).toBe('payments_received');
      expect(result.fields).toBeDefined();
    });

    it('should return field definitions for delivery_challans (underscored)', () => {
      const result = controller.getFieldDefinitions('delivery_challans');

      expect(result.entityType).toBe('delivery_challans');
      expect(result.fields).toBeDefined();
    });

    // Regression test for Error 2: hyphenated entity types now normalized
    it('should normalize credit-notes (hyphenated) to credit_notes', () => {
      const result = controller.getFieldDefinitions('credit-notes');

      expect(result.entityType).toBe('credit_notes');
      expect(importService.getFieldDefinitions).toHaveBeenCalledWith('credit_notes');
    });

    it('should normalize payments-received (hyphenated) to payments_received', () => {
      const result = controller.getFieldDefinitions('payments-received');

      expect(result.entityType).toBe('payments_received');
      expect(importService.getFieldDefinitions).toHaveBeenCalledWith('payments_received');
    });

    it('should normalize delivery-challans (hyphenated) to delivery_challans', () => {
      const result = controller.getFieldDefinitions('delivery-challans');

      expect(result.entityType).toBe('delivery_challans');
      expect(importService.getFieldDefinitions).toHaveBeenCalledWith('delivery_challans');
    });

    it('should normalize bank-transactions (hyphenated) to bank_transactions', () => {
      const result = controller.getFieldDefinitions('bank-transactions');

      expect(result.entityType).toBe('bank_transactions');
      expect(importService.getFieldDefinitions).toHaveBeenCalledWith('bank_transactions');
    });

    it('should not affect already valid underscored entity types', () => {
      const result = controller.getFieldDefinitions('credit_notes');

      expect(result.entityType).toBe('credit_notes');
      expect(importService.getFieldDefinitions).toHaveBeenCalledWith('credit_notes');
    });

    it('should not affect entity types without hyphens or underscores', () => {
      const result = controller.getFieldDefinitions('customers');

      expect(result.entityType).toBe('customers');
      expect(importService.getFieldDefinitions).toHaveBeenCalledWith('customers');
    });

    it('should throw BadRequestException for completely invalid entity type', () => {
      expect(() => controller.getFieldDefinitions('invalid_type')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty string', () => {
      expect(() => controller.getFieldDefinitions('')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for nonsense hyphenated value', () => {
      expect(() => controller.getFieldDefinitions('foo-bar-baz')).toThrow(BadRequestException);
    });
  });
});
