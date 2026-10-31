import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  GeneralSettings,
  InvoiceSettings,
  InventorySettings,
  EmailSettings,
  LocalizationSettings,
  BrandingSettings,
} from './use-all-settings';

// ============ Types ============

export interface FinancialSettings {
  fiscalYearStartMonth: number;
  lockDate: Date | null;
  defaultPaymentTermsDays: number;
  defaultTaxRateId: string | null;
}

export interface AccountSettings {
  defaultArAccountId: string | null;
  defaultRevenueAccountId: string | null;
  defaultVatPayableAccountId: string | null;
  defaultApAccountId: string | null;
  defaultVatReceivableAccountId: string | null;
  defaultBankAccountId: string | null;
  defaultCashAccountId: string | null;
  defaultSalesReturnsAccountId: string | null;
}

export interface AllSettings {
  general: GeneralSettings;
  financial: FinancialSettings;
  invoice: InvoiceSettings;
  inventory: InventorySettings;
  email: EmailSettings;
  localization: LocalizationSettings;
  branding: BrandingSettings;
  accounts: AccountSettings;
}

export interface OnboardingStep {
  completed: boolean;
  skipped: boolean;
}

export interface OnboardingStatus {
  isComplete: boolean;
  completedSteps: number;
  totalSteps: number;
  steps: {
    companyInfo: OnboardingStep;
    chartOfAccounts: OnboardingStep;
    taxConfig: OnboardingStep;
    openingBalances: OnboardingStep;
    importData: OnboardingStep;
    aiFeatures: OnboardingStep;
    tour: OnboardingStep;
  };
  selectedIndustry: string | null;
  selectedCoaTemplate: string | null;
  completedAt: Date | null;
}

export interface CoaTemplatePreview {
  id: string;
  name: string;
  description: string;
  accountCount: number;
  industries: string[];
  accounts: Array<{ code: string; name: string; type: string }>;
}

// ============ API Functions ============

const organizationApi = {
  // Organization
  getOrganization: async () => {
    const response = await api.get('/organization');
    return response.data;
  },

  // All Settings
  getAllSettings: async (): Promise<AllSettings> => {
    const response = await api.get('/organization/settings');
    return response.data;
  },

  // Settings by Category
  updateGeneralSettings: async (data: Partial<GeneralSettings>) => {
    const response = await api.patch('/organization/settings/general', data);
    return response.data;
  },
  updateFinancialSettings: async (data: Partial<FinancialSettings>) => {
    const response = await api.patch('/organization/settings/financial', data);
    return response.data;
  },
  updateInvoiceSettings: async (data: Partial<InvoiceSettings>) => {
    const response = await api.patch('/organization/settings/invoice', data);
    return response.data;
  },
  updateInventorySettings: async (data: Partial<InventorySettings>) => {
    const response = await api.patch('/organization/settings/inventory', data);
    return response.data;
  },
  updateEmailSettings: async (data: Partial<EmailSettings & { smtpPassword?: string }>) => {
    const response = await api.patch('/organization/settings/email', data);
    return response.data;
  },
  updateLocalizationSettings: async (data: Partial<LocalizationSettings>) => {
    const response = await api.patch('/organization/settings/localization', data);
    return response.data;
  },
  updateBrandingSettings: async (data: Partial<BrandingSettings>) => {
    const response = await api.patch('/organization/settings/branding', data);
    return response.data;
  },

  // Account Settings
  getAccountSettings: async (): Promise<AccountSettings> => {
    const response = await api.get('/organization/account-settings');
    return response.data;
  },
  updateAccountSettings: async (data: Partial<AccountSettings>) => {
    const response = await api.patch('/organization/account-settings', data);
    return response.data;
  },

  // Logo Upload
  uploadLogo: async (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.post('/organization/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Lock Date
  setLockDate: async (lockDate: Date) => {
    const response = await api.patch('/organization/lock-date', { lockDate });
    return response.data;
  },

  // Onboarding
  getOnboardingStatus: async (): Promise<OnboardingStatus> => {
    const response = await api.get('/organization/onboarding');
    return response.data;
  },
  getCoaTemplates: async (): Promise<CoaTemplatePreview[]> => {
    const response = await api.get('/organization/onboarding/coa-templates');
    return response.data;
  },
  completeCompanyInfo: async (data: {
    name: string;
    industry?: string;
    logoUrl?: string;
    baseCurrency: string;
    address?: string;
    phone?: string;
  }) => {
    const response = await api.post('/organization/onboarding/company-info', data);
    return response.data;
  },
  completeChartOfAccounts: async (data: { template: string; applyTemplate?: boolean }) => {
    const response = await api.post('/organization/onboarding/chart-of-accounts', data);
    return response.data;
  },
  completeTaxConfig: async (data: {
    taxRates: Array<{ name: string; rate: number; code?: string; isDefault?: boolean }>;
  }) => {
    const response = await api.post('/organization/onboarding/tax-config', data);
    return response.data;
  },
  completeOpeningBalances: async (data: {
    balances: Array<{ accountId: string; amount: number; isDebit?: boolean }>;
    openingDate: string;
  }) => {
    const response = await api.post('/organization/onboarding/opening-balances', data);
    return response.data;
  },
  completeImportData: async (data: {
    customersImported?: number;
    vendorsImported?: number;
    itemsImported?: number;
    skipped?: boolean;
  }) => {
    const response = await api.post('/organization/onboarding/import-data', data);
    return response.data;
  },
  completeAiFeatures: async (data: {
    categorizationEnabled?: boolean;
    reconciliationEnabled?: boolean;

    forecastingEnabled?: boolean;
    anomalyEnabled?: boolean;
    leadScoringEnabled?: boolean;
  }) => {
    const response = await api.post('/organization/onboarding/ai-features', data);
    return response.data;
  },
  completeTour: async () => {
    const response = await api.post('/organization/onboarding/tour');
    return response.data;
  },
  skipStep: async (step: string) => {
    const response = await api.post('/organization/onboarding/skip', { step });
    return response.data;
  },
};

// ============ Hooks ============

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: organizationApi.getOrganization,
  });
}

/**
 * The organization's base (ledger) currency. AP/AR documents without an explicit currency are
 * posted in it, so they must be displayed in it too, never in the counterparty's default.
 */
export function useBaseCurrency(): string | undefined {
  return useOrganization().data?.baseCurrency;
}

/** Display currency of a document: its own currency, else the organization base currency. */
export function documentCurrency(
  currencyCode: string | null | undefined,
  baseCurrency: string | undefined,
): string | undefined {
  return currencyCode || baseCurrency;
}
