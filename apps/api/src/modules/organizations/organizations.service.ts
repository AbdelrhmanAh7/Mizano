import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockOrganizationLedger } from '../../common/utils/ledger-lock';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateAccountSettingsDto } from './dto/update-account-settings.dto';
import {
  AllSettingsResponse,
  GeneralSettingsDto,
  FinancialSettingsDto,
  InvoiceSettingsDto,
  InventorySettingsDto,
  AiSettingsDto,
  EmailSettingsDto,
  LocalizationSettingsDto,
  BrandingSettingsDto,
} from './dto/organization-settings.dto';
import {
  CompanyInfoStepDto,
  ChartOfAccountsStepDto,
  TaxConfigStepDto,
  OpeningBalancesStepDto,
  ImportDataStepDto,
  AiFeaturesStepDto,
  OnboardingStatusResponse,
  CoaTemplatePreview,
} from './dto/onboarding.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // BASIC ORGANIZATION METHODS
  // ============================================

  async findOne(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        currency: true,
        taxId: true,
        lockDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization.update({
      where: { id },
      data: updateOrganizationDto,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        currency: true,
        taxId: true,
        lockDate: true,
        updatedAt: true,
      },
    });

    return organization;
  }

  async setLockDate(id: string, lockDate: Date) {
    const organization = await this.prisma.organization.update({
      where: { id },
      data: { lockDate },
      select: {
        id: true,
        lockDate: true,
      },
    });

    return organization;
  }

  async getLockDate(id: string): Promise<Date | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { lockDate: true },
    });

    return organization?.lockDate || null;
  }

  // ============================================
  // ACCOUNT SETTINGS
  // ============================================

  async getAccountSettings(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        defaultArAccountId: true,
        defaultRevenueAccountId: true,
        defaultVatPayableAccountId: true,
        defaultApAccountId: true,
        defaultVatReceivableAccountId: true,
        defaultBankAccountId: true,
        defaultCashAccountId: true,
        defaultSalesReturnsAccountId: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async updateAccountSettings(id: string, updateAccountSettingsDto: UpdateAccountSettingsDto) {
    // Validate that all provided account IDs exist and belong to the organization
    const accountIds = Object.values(updateAccountSettingsDto).filter(Boolean) as string[];

    if (accountIds.length > 0) {
      const accounts = await this.prisma.account.findMany({
        where: {
          id: { in: accountIds },
          organizationId: id,
          isActive: true,
        },
        select: { id: true },
      });

      const foundIds = accounts.map((a) => a.id);
      const invalidIds = accountIds.filter((aid) => !foundIds.includes(aid));

      if (invalidIds.length > 0) {
        throw new BadRequestException(`Invalid or inactive account IDs: ${invalidIds.join(', ')}`);
      }
    }

    const organization = await this.prisma.organization.update({
      where: { id },
      data: updateAccountSettingsDto,
      select: {
        defaultArAccountId: true,
        defaultRevenueAccountId: true,
        defaultVatPayableAccountId: true,
        defaultApAccountId: true,
        defaultVatReceivableAccountId: true,
        defaultBankAccountId: true,
        defaultCashAccountId: true,
        defaultSalesReturnsAccountId: true,
      },
    });

    return organization;
  }

  // ============================================
  // ALL SETTINGS (GROUPED)
  // ============================================

  async getAllSettings(id: string): Promise<AllSettingsResponse> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      general: {
        name: org.name,
        logoUrl: org.logoUrl,
        address: org.address,
        phone: org.phone,
        email: org.email,
        website: org.website,
        taxRegistrationNumber: org.taxRegistrationNumber,
        industry: org.industry,
        baseCurrency: org.baseCurrency,
      },
      financial: {
        fiscalYearStartMonth: org.fiscalYearStartMonth,
        lockDate: org.lockDate,
        defaultPaymentTermsDays: org.defaultPaymentTermsDays,
        defaultTaxRateId: org.defaultTaxRateId,
      },
      invoice: {
        invoicePrefix: org.invoicePrefix,
        invoiceNextNumber: org.invoiceNextNumber,
        invoiceDefaultNotes: org.invoiceDefaultNotes,
        invoiceDefaultTerms: org.invoiceDefaultTerms,
        invoiceAutoSend: org.invoiceAutoSend,
        bankDetails: org.bankDetails,
        quotePrefix: org.quotePrefix,
        quoteNextNumber: org.quoteNextNumber,
        billPrefix: org.billPrefix,
        billNextNumber: org.billNextNumber,
      },
      inventory: {
        defaultValuationMethod: org.defaultValuationMethod,
        enableMultiWarehouse: org.enableMultiWarehouse,
        enableBundles: org.enableBundles,
      },
      ai: {
        aiCategorizationEnabled: org.aiCategorizationEnabled,
        aiReconciliationEnabled: org.aiReconciliationEnabled,

        aiForecastingEnabled: org.aiForecastingEnabled,
        aiAnomalyEnabled: org.aiAnomalyEnabled,
        aiLeadScoringEnabled: org.aiLeadScoringEnabled,
        anomalySensitivity: org.anomalySensitivity,
      },
      email: {
        smtpHost: org.smtpHost,
        smtpPort: org.smtpPort,
        smtpUser: org.smtpUser,
        smtpFromEmail: org.smtpFromEmail,
        smtpFromName: org.smtpFromName,
        isConfigured: !!(org.smtpHost && org.smtpPort && org.smtpUser && org.smtpFromEmail),
      },
      localization: {
        dateFormat: org.dateFormat,
        numberFormat: org.numberFormat,
        timezone: org.timezone,
      },
      branding: {
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        footerText: org.footerText,
      },
      accounts: {
        defaultArAccountId: org.defaultArAccountId,
        defaultRevenueAccountId: org.defaultRevenueAccountId,
        defaultVatPayableAccountId: org.defaultVatPayableAccountId,
        defaultApAccountId: org.defaultApAccountId,
        defaultVatReceivableAccountId: org.defaultVatReceivableAccountId,
        defaultBankAccountId: org.defaultBankAccountId,
        defaultCashAccountId: org.defaultCashAccountId,
        defaultSalesReturnsAccountId: org.defaultSalesReturnsAccountId,
      },
    };
  }

  async updateGeneralSettings(id: string, dto: GeneralSettingsDto) {
    // Guard and update commit together under the ledger lock (see assertBaseCurrencyChangeAllowed).
    return this.prisma.$transaction(async (tx) => {
      await this.assertBaseCurrencyChangeAllowed(tx, id, dto.baseCurrency);
      return tx.organization.update({
        where: { id },
        data: {
          name: dto.name,
          logoUrl: dto.logoUrl,
          address: dto.address,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          taxRegistrationNumber: dto.taxRegistrationNumber,
          industry: dto.industry,
          // Legacy `currency` mirrors the base currency so the two can never drift apart.
          baseCurrency: dto.baseCurrency,
          currency: dto.baseCurrency,
        },
        select: { id: true, name: true, updatedAt: true },
      });
    });
  }

  /**
   * The ledger stores amounts in the base currency without conversion, so the base currency is
   * frozen once anything is posted; changing it would relabel every historical amount.
   */
  private async assertBaseCurrencyChangeAllowed(
    tx: Prisma.TransactionClient,
    organizationId: string,
    baseCurrency: string | undefined,
  ): Promise<void> {
    if (!baseCurrency) return;
    // Same lock as journal posting: no journal can commit between this check and the update.
    await lockOrganizationLedger(tx, organizationId);
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    if (!org || org.baseCurrency === baseCurrency) return;
    const posted = await tx.journal.count({
      where: { organizationId, isPosted: true, deletedAt: null },
    });
    if (posted > 0) {
      throw new BadRequestException(
        'The base currency cannot be changed after journals have been posted',
      );
    }
  }

  async updateFinancialSettings(id: string, dto: FinancialSettingsDto) {
    return this.prisma.organization.update({
      where: { id },
      data: {
        fiscalYearStartMonth: dto.fiscalYearStartMonth,
        lockDate: dto.lockDate,
        defaultPaymentTermsDays: dto.defaultPaymentTermsDays,
        defaultTaxRateId: dto.defaultTaxRateId,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async updateInvoiceSettings(id: string, dto: InvoiceSettingsDto) {
    return this.prisma.organization.update({
      where: { id },
      data: {
        invoicePrefix: dto.invoicePrefix,
        invoiceNextNumber: dto.invoiceNextNumber,
        invoiceDefaultNotes: dto.invoiceDefaultNotes,
        invoiceDefaultTerms: dto.invoiceDefaultTerms,
        invoiceAutoSend: dto.invoiceAutoSend,
        bankDetails: dto.bankDetails,
        quotePrefix: dto.quotePrefix,
        quoteNextNumber: dto.quoteNextNumber,
        billPrefix: dto.billPrefix,
        billNextNumber: dto.billNextNumber,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async updateInventorySettings(id: string, dto: InventorySettingsDto) {
    return this.prisma.organization.update({
      where: { id },
      data: {
        defaultValuationMethod: dto.defaultValuationMethod,
        enableMultiWarehouse: dto.enableMultiWarehouse,
        enableBundles: dto.enableBundles,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async updateAiSettings(id: string, dto: AiSettingsDto) {
    return this.prisma.organization.update({
      where: { id },
      data: {
        aiCategorizationEnabled: dto.aiCategorizationEnabled,
        aiReconciliationEnabled: dto.aiReconciliationEnabled,

        aiForecastingEnabled: dto.aiForecastingEnabled,
        aiAnomalyEnabled: dto.aiAnomalyEnabled,
        aiLeadScoringEnabled: dto.aiLeadScoringEnabled,
        anomalySensitivity: dto.anomalySensitivity,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async updateEmailSettings(id: string, dto: EmailSettingsDto) {
    return this.prisma.organization.update({
      where: { id },
      data: {
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort,
        smtpUser: dto.smtpUser,
        smtpPassword: dto.smtpPassword,
        smtpFromEmail: dto.smtpFromEmail,
        smtpFromName: dto.smtpFromName,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async updateLocalizationSettings(id: string, dto: LocalizationSettingsDto) {
    return this.prisma.organization.update({
      where: { id },
      data: {
        dateFormat: dto.dateFormat,
        numberFormat: dto.numberFormat,
        timezone: dto.timezone,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async updateBrandingSettings(id: string, dto: BrandingSettingsDto) {
    return this.prisma.organization.update({
      where: { id },
      data: {
        logoUrl: dto.logoUrl,
        primaryColor: dto.primaryColor,
        footerText: dto.footerText,
      },
      select: { id: true, updatedAt: true },
    });
  }

  // ============================================
  // LOGO UPLOAD
  // ============================================

  async updateLogo(id: string, logoUrl: string) {
    return this.prisma.organization.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    });
  }

  // ============================================
  // ONBOARDING
  // ============================================

  async getOnboardingStatus(orgId: string): Promise<OnboardingStatusResponse> {
    const onboarding = await this.prisma.organizationOnboarding.findUnique({
      where: { organizationId: orgId },
    });

    if (!onboarding) {
      // Create onboarding record if it doesn't exist
      const newOnboarding = await this.prisma.organizationOnboarding.create({
        data: { organizationId: orgId },
      });

      return this.formatOnboardingStatus(newOnboarding);
    }

    return this.formatOnboardingStatus(onboarding);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatOnboardingStatus(onboarding: any): OnboardingStatusResponse {
    const skippedSteps = onboarding.skippedSteps || [];

    const steps = {
      companyInfo: {
        completed: onboarding.companyInfoCompleted,
        skipped: skippedSteps.includes('company_info'),
      },
      chartOfAccounts: {
        completed: onboarding.chartOfAccountsCompleted,
        skipped: skippedSteps.includes('chart_of_accounts'),
      },
      taxConfig: {
        completed: onboarding.taxConfigCompleted,
        skipped: skippedSteps.includes('tax_config'),
      },
      openingBalances: {
        completed: onboarding.openingBalancesCompleted,
        skipped: skippedSteps.includes('opening_balances'),
      },
      importData: {
        completed: onboarding.importDataCompleted,
        skipped: skippedSteps.includes('import_data'),
      },
      aiFeatures: {
        completed: onboarding.aiFeaturesCompleted,
        skipped: skippedSteps.includes('ai_features'),
      },
      tour: {
        completed: onboarding.tourCompleted,
        skipped: skippedSteps.includes('tour'),
      },
    };

    const completedSteps = Object.values(steps).filter((s) => s.completed || s.skipped).length;

    return {
      isComplete: onboarding.completedAt !== null,
      completedSteps,
      totalSteps: 7,
      steps,
      selectedIndustry: onboarding.selectedIndustry,
      selectedCoaTemplate: onboarding.selectedCoaTemplate,
      completedAt: onboarding.completedAt,
    };
  }

  async completeCompanyInfoStep(orgId: string, dto: CompanyInfoStepDto) {
    // Guard and update commit together under the ledger lock (see assertBaseCurrencyChangeAllowed).
    await this.prisma.$transaction(async (tx) => {
      await this.assertBaseCurrencyChangeAllowed(tx, orgId, dto.baseCurrency);
      await tx.organization.update({
        where: { id: orgId },
        data: {
          name: dto.name,
          industry: dto.industry,
          logoUrl: dto.logoUrl,
          baseCurrency: dto.baseCurrency,
          currency: dto.baseCurrency,
          address: dto.address,
          phone: dto.phone,
        },
      });
    });

    // Mark step as complete
    await this.prisma.organizationOnboarding.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        companyInfoCompleted: true,
        selectedIndustry: dto.industry,
      },
      update: {
        companyInfoCompleted: true,
        selectedIndustry: dto.industry,
      },
    });

    return this.getOnboardingStatus(orgId);
  }

  async completeChartOfAccountsStep(orgId: string, dto: ChartOfAccountsStepDto) {
    if (dto.applyTemplate) {
      // Apply COA template (create accounts)
      await this.applyCoaTemplate(orgId, dto.template);
    }

    // Mark step as complete
    await this.prisma.organizationOnboarding.update({
      where: { organizationId: orgId },
      data: {
        chartOfAccountsCompleted: true,
        selectedCoaTemplate: dto.template,
      },
    });

    return this.getOnboardingStatus(orgId);
  }

  async completeTaxConfigStep(orgId: string, dto: TaxConfigStepDto) {
    // Create tax rates
    let defaultTaxRateId: string | null = null;

    for (const rate of dto.taxRates) {
      const taxRate = await this.prisma.taxRate.create({
        data: {
          name: rate.name,
          rate: rate.rate,
          code: rate.code,
          isDefault: rate.isDefault || false,
          type: 'BOTH',
          organizationId: orgId,
        },
      });

      if (rate.isDefault) {
        defaultTaxRateId = taxRate.id;
      }
    }

    // Set default tax rate on organization
    if (defaultTaxRateId) {
      await this.prisma.organization.update({
        where: { id: orgId },
        data: { defaultTaxRateId },
      });
    }

    // Mark step as complete
    await this.prisma.organizationOnboarding.update({
      where: { organizationId: orgId },
      data: { taxConfigCompleted: true },
    });

    return this.getOnboardingStatus(orgId);
  }

  async completeOpeningBalancesStep(orgId: string, dto: OpeningBalancesStepDto) {
    if (dto.balances.length > 0) {
      // Create opening balance journal entry
      const lines = dto.balances.map((b) => ({
        accountId: b.accountId,
        debit: b.isDebit ? new Decimal(b.amount) : new Decimal(0),
        credit: b.isDebit ? new Decimal(0) : new Decimal(b.amount),
        description: 'Opening Balance',
      }));

      // Validate that debits equal credits
      const totalDebits = lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
      const totalCredits = lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));

      if (!totalDebits.equals(totalCredits)) {
        throw new BadRequestException('Opening balances must balance (debits = credits)');
      }

      // Create the journal
      await this.prisma.journal.create({
        data: {
          journalNumber: 'OB-001',
          date: new Date(dto.openingDate),
          reference: 'Opening Balances',
          notes: 'Initial opening balances from onboarding',
          isPosted: true,
          organizationId: orgId,
          lines: {
            create: lines,
          },
        },
      });
    }

    // Mark step as complete
    await this.prisma.organizationOnboarding.update({
      where: { organizationId: orgId },
      data: { openingBalancesCompleted: true },
    });

    return this.getOnboardingStatus(orgId);
  }

  async completeImportDataStep(orgId: string, _dto: ImportDataStepDto) {
    // This step is marked complete after imports are done
    // The actual import is handled by the import-export module

    await this.prisma.organizationOnboarding.update({
      where: { organizationId: orgId },
      data: { importDataCompleted: true },
    });

    return this.getOnboardingStatus(orgId);
  }

  async completeAiFeaturesStep(orgId: string, dto: AiFeaturesStepDto) {
    // Update AI settings
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        aiCategorizationEnabled: dto.categorizationEnabled ?? true,
        aiReconciliationEnabled: dto.reconciliationEnabled ?? true,

        aiForecastingEnabled: dto.forecastingEnabled ?? true,
        aiAnomalyEnabled: dto.anomalyEnabled ?? true,
        aiLeadScoringEnabled: dto.leadScoringEnabled ?? true,
      },
    });

    // Mark step as complete
    await this.prisma.organizationOnboarding.update({
      where: { organizationId: orgId },
      data: { aiFeaturesCompleted: true },
    });

    return this.getOnboardingStatus(orgId);
  }

  async completeTourStep(orgId: string) {
    // Mark step and onboarding as complete
    await this.prisma.organizationOnboarding.update({
      where: { organizationId: orgId },
      data: {
        tourCompleted: true,
        completedAt: new Date(),
      },
    });

    // Mark organization onboarding as complete
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { onboardingCompleted: true },
    });

    return this.getOnboardingStatus(orgId);
  }

  async skipStep(orgId: string, step: string) {
    const onboarding = await this.prisma.organizationOnboarding.findUnique({
      where: { organizationId: orgId },
    });

    const skippedSteps = onboarding?.skippedSteps || [];
    if (!skippedSteps.includes(step)) {
      skippedSteps.push(step);
    }

    await this.prisma.organizationOnboarding.update({
      where: { organizationId: orgId },
      data: { skippedSteps },
    });

    return this.getOnboardingStatus(orgId);
  }

  async getCoaTemplates(): Promise<CoaTemplatePreview[]> {
    return [
      {
        id: 'standard',
        name: 'Standard Chart of Accounts',
        description: 'A comprehensive general-purpose chart of accounts',
        accountCount: 45,
        industries: ['other'],
        accounts: [
          { code: '1000', name: 'Cash', type: 'ASSET' },
          { code: '1100', name: 'Bank Accounts', type: 'ASSET' },
          { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
          { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
          { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
          { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
        ],
      },
      {
        id: 'retail',
        name: 'Retail Business',
        description: 'Optimized for retail and e-commerce businesses',
        accountCount: 50,
        industries: ['retail'],
        accounts: [
          { code: '1000', name: 'Cash', type: 'ASSET' },
          { code: '1100', name: 'Bank Accounts', type: 'ASSET' },
          { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
          { code: '1300', name: 'Inventory', type: 'ASSET' },
          { code: '4000', name: 'Product Sales', type: 'REVENUE' },
          { code: '4100', name: 'Shipping Revenue', type: 'REVENUE' },
        ],
      },
      {
        id: 'services',
        name: 'Professional Services',
        description: 'For consulting, agencies, and professional services',
        accountCount: 40,
        industries: ['services', 'technology'],
        accounts: [
          { code: '1000', name: 'Cash', type: 'ASSET' },
          { code: '1100', name: 'Bank Accounts', type: 'ASSET' },
          { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
          { code: '4000', name: 'Service Revenue', type: 'REVENUE' },
          { code: '4100', name: 'Consulting Revenue', type: 'REVENUE' },
        ],
      },
      {
        id: 'manufacturing',
        name: 'Manufacturing',
        description: 'For manufacturing and production businesses',
        accountCount: 55,
        industries: ['manufacturing'],
        accounts: [
          { code: '1000', name: 'Cash', type: 'ASSET' },
          { code: '1300', name: 'Raw Materials', type: 'ASSET' },
          { code: '1310', name: 'Work in Progress', type: 'ASSET' },
          { code: '1320', name: 'Finished Goods', type: 'ASSET' },
          { code: '5000', name: 'Direct Materials', type: 'EXPENSE' },
          { code: '5100', name: 'Direct Labor', type: 'EXPENSE' },
        ],
      },
      {
        id: 'construction',
        name: 'Construction',
        description: 'For construction and contracting businesses',
        accountCount: 50,
        industries: ['construction'],
        accounts: [
          { code: '1000', name: 'Cash', type: 'ASSET' },
          { code: '1400', name: 'Construction in Progress', type: 'ASSET' },
          { code: '1500', name: 'Equipment', type: 'ASSET' },
          { code: '4000', name: 'Contract Revenue', type: 'REVENUE' },
          { code: '5000', name: 'Materials Cost', type: 'EXPENSE' },
          { code: '5100', name: 'Subcontractor Costs', type: 'EXPENSE' },
        ],
      },
    ];
  }

  private async applyCoaTemplate(orgId: string, templateId: string) {
    // Check if accounts already exist
    const existingAccounts = await this.prisma.account.count({
      where: { organizationId: orgId },
    });

    if (existingAccounts > 0) {
      throw new BadRequestException('Chart of accounts already exists. Cannot apply template.');
    }

    // Get the template accounts based on templateId
    const accounts = this.getTemplateAccounts(templateId);

    // Create all accounts and link organization defaults in one transaction
    await this.prisma.$transaction(async (tx) => {
      const created: { id: string; code: string }[] = [];
      for (const account of accounts) {
        created.push(
          await tx.account.create({
            data: { ...account, organizationId: orgId },
            select: { id: true, code: true },
          }),
        );
      }

      const idFor = (code: string): string | undefined => created.find((a) => a.code === code)?.id;
      await tx.organization.update({
        where: { id: orgId },
        data: {
          defaultCashAccountId: idFor('1000'),
          defaultBankAccountId: idFor('1110'),
          defaultArAccountId: idFor('1200'),
          defaultApAccountId: idFor('2000'),
          defaultVatPayableAccountId: idFor('2200'),
          defaultVatReceivableAccountId: idFor('2300'),
          defaultRevenueAccountId: idFor('4100'),
          defaultSalesReturnsAccountId: idFor('4400'),
        },
      });
    });
  }

  private getTemplateAccounts(_templateId: string) {
    // Base accounts used by all templates
    const baseAccounts = [
      { code: '1000', name: 'Cash on Hand', type: 'ASSET', isParent: false },
      { code: '1100', name: 'Bank Accounts', type: 'ASSET', isParent: true },
      { code: '1110', name: 'Main Bank Account', type: 'ASSET', parentCode: '1100' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', isParent: false },
      { code: '1300', name: 'Inventory', type: 'ASSET', isParent: false },
      { code: '1400', name: 'Prepaid Expenses', type: 'ASSET', isParent: false },
      { code: '1500', name: 'Fixed Assets', type: 'ASSET', isParent: true },
      { code: '1510', name: 'Equipment', type: 'ASSET', parentCode: '1500' },
      { code: '1520', name: 'Furniture & Fixtures', type: 'ASSET', parentCode: '1500' },
      { code: '1530', name: 'Vehicles', type: 'ASSET', parentCode: '1500' },
      { code: '1590', name: 'Accumulated Depreciation', type: 'ASSET', parentCode: '1500' },
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', isParent: false },
      { code: '2100', name: 'Accrued Expenses', type: 'LIABILITY', isParent: false },
      { code: '2200', name: 'VAT Payable', type: 'LIABILITY', isParent: false },
      { code: '2300', name: 'VAT Receivable', type: 'ASSET', isParent: false },
      { code: '2400', name: 'Salaries Payable', type: 'LIABILITY', isParent: false },
      { code: '2500', name: 'Short-term Loans', type: 'LIABILITY', isParent: false },
      { code: '2600', name: 'Long-term Loans', type: 'LIABILITY', isParent: false },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY', isParent: true },
      { code: '3100', name: 'Capital', type: 'EQUITY', parentCode: '3000' },
      { code: '3200', name: 'Retained Earnings', type: 'EQUITY', parentCode: '3000' },
      { code: '3300', name: 'Drawings', type: 'EQUITY', parentCode: '3000' },
      { code: '4000', name: 'Revenue', type: 'REVENUE', isParent: true },
      { code: '4100', name: 'Sales Revenue', type: 'REVENUE', parentCode: '4000' },
      { code: '4200', name: 'Service Revenue', type: 'REVENUE', parentCode: '4000' },
      { code: '4300', name: 'Other Income', type: 'REVENUE', parentCode: '4000' },
      { code: '4400', name: 'Sales Returns & Allowances', type: 'REVENUE', parentCode: '4000' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', isParent: false },
      { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', isParent: true },
      { code: '6100', name: 'Salaries & Wages', type: 'EXPENSE', parentCode: '6000' },
      { code: '6200', name: 'Rent Expense', type: 'EXPENSE', parentCode: '6000' },
      { code: '6300', name: 'Utilities', type: 'EXPENSE', parentCode: '6000' },
      { code: '6400', name: 'Office Supplies', type: 'EXPENSE', parentCode: '6000' },
      { code: '6500', name: 'Insurance', type: 'EXPENSE', parentCode: '6000' },
      { code: '6600', name: 'Depreciation Expense', type: 'EXPENSE', parentCode: '6000' },
      { code: '6700', name: 'Marketing & Advertising', type: 'EXPENSE', parentCode: '6000' },
      { code: '6800', name: 'Professional Fees', type: 'EXPENSE', parentCode: '6000' },
      { code: '6900', name: 'Bank Charges', type: 'EXPENSE', parentCode: '6000' },
      { code: '7000', name: 'Other Expenses', type: 'EXPENSE', isParent: false },
      { code: '8000', name: 'Interest Income', type: 'INCOME', isParent: false },
      { code: '8100', name: 'Interest Expense', type: 'EXPENSE', isParent: false },
      { code: '9000', name: 'Foreign Exchange Gain/Loss', type: 'EXPENSE', isParent: false },
    ];

    // Add template-specific accounts based on industry
    // For now, return base accounts - can be extended per template
    return baseAccounts.map((acc) => ({
      code: acc.code,
      name: acc.name,
      type: acc.type as import('@prisma/client').AccountType,
      isActive: true,
    }));
  }
}
