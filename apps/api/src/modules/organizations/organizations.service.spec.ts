import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../../prisma/prisma.service';

const ORG_ID = 'org-001';

const mockOrg = {
  id: ORG_ID,
  name: 'Acme Corp',
  email: 'org@example.com',
  phone: '+1234567890',
  address: '123 Main St',
  currency: 'USD',
  taxId: 'TAX-123',
  lockDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  logoUrl: null,
  website: null,
  taxRegistrationNumber: null,
  industry: null,
  baseCurrency: 'USD',
  fiscalYearStartMonth: 1,
  defaultPaymentTermsDays: 30,
  defaultTaxRateId: null,
  invoicePrefix: 'INV-',
  invoiceNextNumber: 1,
  invoiceDefaultNotes: null,
  invoiceDefaultTerms: null,
  invoiceAutoSend: false,
  bankDetails: null,
  quotePrefix: 'EST-',
  quoteNextNumber: 1,
  billPrefix: 'BILL-',
  billNextNumber: 1,
  defaultValuationMethod: 'WEIGHTED_AVERAGE',
  enableMultiWarehouse: false,
  enableBundles: false,
  aiCategorizationEnabled: true,
  aiReconciliationEnabled: true,
  aiForecastingEnabled: true,
  aiAnomalyEnabled: true,
  aiLeadScoringEnabled: false,
  anomalySensitivity: 3,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpPassword: null,
  smtpFromEmail: null,
  smtpFromName: null,
  dateFormat: 'DD/MM/YYYY',
  numberFormat: '1,000.00',
  timezone: 'UTC',
  primaryColor: null,
  footerText: null,
  defaultArAccountId: null,
  defaultRevenueAccountId: null,
  defaultVatPayableAccountId: null,
  defaultApAccountId: null,
  defaultVatReceivableAccountId: null,
  defaultBankAccountId: null,
  defaultCashAccountId: null,
  defaultSalesReturnsAccountId: null,
};

const mockPrisma = {
  organization: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  account: {
    findMany: jest.fn(),
  },
};

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganizationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  // ── findOne ─────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns organization data', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.findOne(ORG_ID);
      expect(result.name).toBe('Acme Corp');
    });

    it('throws NotFoundException when org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getAllSettings ──────────────────────────────────────────────

  describe('getAllSettings', () => {
    it('returns all 8 setting categories plus accounts', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.getAllSettings(ORG_ID);
      expect(result).toHaveProperty('general');
      expect(result).toHaveProperty('financial');
      expect(result).toHaveProperty('invoice');
      expect(result).toHaveProperty('inventory');
      expect(result).toHaveProperty('ai');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('localization');
      expect(result).toHaveProperty('branding');
      expect(result).toHaveProperty('accounts');
    });

    it('maps organization fields to general settings', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.getAllSettings(ORG_ID);
      expect(result.general.name).toBe('Acme Corp');
      expect(result.general.baseCurrency).toBe('USD');
    });

    it('maps AI settings correctly', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.getAllSettings(ORG_ID);
      expect(result.ai.anomalySensitivity).toBe(3);
      expect(result.ai.aiCategorizationEnabled).toBe(true);
    });

    it('computes email isConfigured correctly', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.getAllSettings(ORG_ID);
      expect(result.email.isConfigured).toBe(false); // smtpHost is null

      mockPrisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user',
        smtpFromEmail: 'noreply@example.com',
      });

      const result2 = await service.getAllSettings(ORG_ID);
      expect(result2.email.isConfigured).toBe(true);
    });

    it('maps localization settings', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.getAllSettings(ORG_ID);
      expect(result.localization.dateFormat).toBe('DD/MM/YYYY');
      expect(result.localization.numberFormat).toBe('1,000.00');
      expect(result.localization.timezone).toBe('UTC');
    });

    it('throws NotFoundException for missing org', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getAllSettings('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateGeneralSettings ──────────────────────────────────────

  describe('updateGeneralSettings', () => {
    it('updates general fields', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        id: ORG_ID,
        name: 'New Name',
        updatedAt: new Date(),
      });

      const result = await service.updateGeneralSettings(ORG_ID, { name: 'New Name' });
      expect(result.name).toBe('New Name');
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORG_ID } }),
      );
    });

    it('keeps the legacy currency in sync when the base currency changes', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        id: ORG_ID,
        name: 'X',
        updatedAt: new Date(),
      });

      await service.updateGeneralSettings(ORG_ID, { name: 'X', baseCurrency: 'EGP' });

      const { data } = mockPrisma.organization.update.mock.calls[0][0];
      expect(data).toMatchObject({ baseCurrency: 'EGP', currency: 'EGP' });
    });

    it('leaves both currency fields untouched when no base currency is sent', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        id: ORG_ID,
        name: 'X',
        updatedAt: new Date(),
      });

      await service.updateGeneralSettings(ORG_ID, { name: 'X' });

      const { data } = mockPrisma.organization.update.mock.calls[0][0];
      expect(data.baseCurrency).toBeUndefined();
      expect(data.currency).toBeUndefined();
    });
  });

  // ── updateFinancialSettings ────────────────────────────────────

  describe('updateFinancialSettings', () => {
    it('updates financial fields', async () => {
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, updatedAt: new Date() });

      await service.updateFinancialSettings(ORG_ID, { fiscalYearStartMonth: 4 });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fiscalYearStartMonth: 4 }),
        }),
      );
    });
  });

  // ── updateInvoiceSettings ──────────────────────────────────────

  describe('updateInvoiceSettings', () => {
    it('updates invoice prefix and next number', async () => {
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, updatedAt: new Date() });

      await service.updateInvoiceSettings(ORG_ID, {
        invoicePrefix: 'FACT-',
        invoiceNextNumber: 100,
      });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ invoicePrefix: 'FACT-', invoiceNextNumber: 100 }),
        }),
      );
    });
  });

  // ── updateInventorySettings ────────────────────────────────────

  describe('updateInventorySettings', () => {
    it('updates inventory toggles', async () => {
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, updatedAt: new Date() });

      await service.updateInventorySettings(ORG_ID, { enableMultiWarehouse: true });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enableMultiWarehouse: true }),
        }),
      );
    });
  });

  // ── updateAiSettings ───────────────────────────────────────────

  describe('updateAiSettings', () => {
    it('updates AI toggles and anomaly sensitivity', async () => {
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, updatedAt: new Date() });

      await service.updateAiSettings(ORG_ID, { anomalySensitivity: 4, aiAnomalyEnabled: true });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ anomalySensitivity: 4, aiAnomalyEnabled: true }),
        }),
      );
    });
  });

  // ── updateEmailSettings ────────────────────────────────────────

  describe('updateEmailSettings', () => {
    it('updates SMTP configuration', async () => {
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, updatedAt: new Date() });

      await service.updateEmailSettings(ORG_ID, {
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
      });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ smtpHost: 'smtp.test.com', smtpPort: 587 }),
        }),
      );
    });
  });

  // ── updateLocalizationSettings ─────────────────────────────────

  describe('updateLocalizationSettings', () => {
    it('updates date format, number format, and timezone', async () => {
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, updatedAt: new Date() });

      await service.updateLocalizationSettings(ORG_ID, {
        dateFormat: 'YYYY-MM-DD',
        numberFormat: '1.000,00',
        timezone: 'Asia/Riyadh',
      });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            dateFormat: 'YYYY-MM-DD',
            numberFormat: '1.000,00',
            timezone: 'Asia/Riyadh',
          },
        }),
      );
    });
  });

  // ── updateBrandingSettings ─────────────────────────────────────

  describe('updateBrandingSettings', () => {
    it('updates branding fields', async () => {
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, updatedAt: new Date() });

      await service.updateBrandingSettings(ORG_ID, { primaryColor: '#ff0000' });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ primaryColor: '#ff0000' }),
        }),
      );
    });
  });

  // ── updateAccountSettings ──────────────────────────────────────

  describe('updateAccountSettings', () => {
    it('updates default account mappings', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: 'acc-1' }]);
      mockPrisma.organization.update.mockResolvedValue({ id: ORG_ID, defaultArAccountId: 'acc-1' });

      await service.updateAccountSettings(ORG_ID, { defaultArAccountId: 'acc-1' });
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['acc-1'] },
            organizationId: ORG_ID,
          }),
        }),
      );
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ defaultArAccountId: 'acc-1' }),
        }),
      );
    });

    it('throws BadRequestException for invalid account IDs', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]); // none found

      await expect(
        service.updateAccountSettings(ORG_ID, { defaultArAccountId: 'bad-acc' }),
      ).rejects.toThrow('Invalid or inactive account IDs');
    });
  });
});
