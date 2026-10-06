import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import api from '@/lib/api';

// ============ Types ============

export interface GeneralSettings {
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxRegistrationNumber: string | null;
  industry: string | null;
  baseCurrency: string;
}

export interface FinancialSettings {
  fiscalYearStartMonth: number;
  lockDate: Date | null;
  defaultPaymentTermsDays: number;
  defaultTaxRateId: string | null;
}

export interface InvoiceSettings {
  invoicePrefix: string;
  invoiceNextNumber: number;
  invoiceDefaultNotes: string | null;
  invoiceDefaultTerms: string | null;
  invoiceAutoSend: boolean;
  bankDetails: string | null;
  quotePrefix: string;
  quoteNextNumber: number;
  billPrefix: string;
  billNextNumber: number;
}

export interface InventorySettings {
  defaultValuationMethod: string;
  enableMultiWarehouse: boolean;
  enableBundles: boolean;
}

export interface AiSettings {
  aiCategorizationEnabled: boolean;
  aiReconciliationEnabled: boolean;

  aiForecastingEnabled: boolean;
  aiAnomalyEnabled: boolean;
  aiLeadScoringEnabled: boolean;
  anomalySensitivity: number;
}

export interface EmailSettings {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  isConfigured: boolean;
}

export interface LocalizationSettings {
  dateFormat: string;
  numberFormat: string;
  timezone: string;
}

export interface BrandingSettings {
  logoUrl: string | null;
  primaryColor: string | null;
  footerText: string | null;
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
  ai: AiSettings;
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

  // Readable by every authenticated member (no settings.view needed).
  getBaseCurrency: async (): Promise<{ baseCurrency: string }> => {
    const response = await api.get('/organization/base-currency');
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
  updateAiSettings: async (data: Partial<AiSettings>) => {
    const response = await api.patch('/organization/settings/ai', data);
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
    balances: Array<{ accountId: string; amount: string; isDebit?: boolean }>;
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
  return useBaseCurrencyQuery().data?.baseCurrency;
}

/** Exposes loading, failure and retry for views that require the ledger currency. */
export function useBaseCurrencyQuery(): UseQueryResult<{ baseCurrency: string }, Error> {
  // Its own lookup instead of GET /organization, which needs settings.view: an AP-only role must
  // still see the real currency. Fetched through the authenticated client (token refresh and
  // expiry handled there) and refreshed whenever an ['organization', ...] query is invalidated,
  // e.g. after the base currency is chosen in settings or onboarding.
  // Keyed by organization so signing in to another organization never reuses a cached value.
  const organizationId = useSession().data?.user?.organizationId;
  return useQuery({
    queryKey: ['organization', 'base-currency', organizationId],
    queryFn: organizationApi.getBaseCurrency,
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Display currency of a document: its own currency, else the organization base currency. */
export function documentCurrency(
  currencyCode: string | null | undefined,
  baseCurrency: string | undefined,
): string | undefined {
  return currencyCode || baseCurrency;
}

export function useAllSettings() {
  return useQuery({
    queryKey: ['organization-settings'],
    queryFn: organizationApi.getAllSettings,
  });
}

export function useUpdateGeneralSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateGeneralSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
}

export function useUpdateFinancialSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateFinancialSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useUpdateInvoiceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateInvoiceSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useUpdateInventorySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateInventorySettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useUpdateAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateAiSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useUpdateEmailSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateEmailSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useUpdateLocalizationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateLocalizationSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useUpdateBrandingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateBrandingSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useAccountSettings() {
  return useQuery({
    queryKey: ['organization-account-settings'],
    queryFn: organizationApi.getAccountSettings,
  });
}

export function useUpdateAccountSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.updateAccountSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-account-settings'] });
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.uploadLogo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
}

export function useSetLockDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.setLockDate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

// ============ Onboarding Hooks ============

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ['onboarding-status'],
    queryFn: organizationApi.getOnboardingStatus,
  });
}

export function useCoaTemplates() {
  return useQuery({
    queryKey: ['coa-templates'],
    queryFn: organizationApi.getCoaTemplates,
  });
}

export function useCompleteCompanyInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.completeCompanyInfo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
}

export function useCompleteChartOfAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.completeChartOfAccounts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useCompleteTaxConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.completeTaxConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
    },
  });
}

export function useCompleteOpeningBalances() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.completeOpeningBalances,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
    },
  });
}

export function useCompleteImportData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.completeImportData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });
}

export function useCompleteAiFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.completeAiFeatures,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
    },
  });
}

export function useCompleteTour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.completeTour,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
}

export function useSkipOnboardingStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationApi.skipStep,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });
}

// ============ Helper Functions ============

export function getIndustryLabel(industry: string): string {
  const labels: Record<string, string> = {
    retail: 'Retail & E-commerce',
    services: 'Professional Services',
    construction: 'Construction',
    manufacturing: 'Manufacturing',
    healthcare: 'Healthcare',
    technology: 'Technology',
    other: 'Other',
  };
  return labels[industry] || industry;
}

export function getDateFormatExample(format: string): string {
  const examples: Record<string, string> = {
    'DD/MM/YYYY': '25/12/2024',
    'MM/DD/YYYY': '12/25/2024',
    'YYYY-MM-DD': '2024-12-25',
  };
  return examples[format] || format;
}

export function getNumberFormatExample(format: string): string {
  const examples: Record<string, string> = {
    '1,000.00': '1,234.56',
    '1.000,00': '1.234,56',
    '1 000,00': '1 234,56',
  };
  return examples[format] || format;
}

export function getTimezones(): Array<{ value: string; label: string }> {
  return [
    { value: 'Asia/Riyadh', label: 'Riyadh (GMT+3)' },
    { value: 'Asia/Dubai', label: 'Dubai (GMT+4)' },
    { value: 'Asia/Kuwait', label: 'Kuwait (GMT+3)' },
    { value: 'Asia/Bahrain', label: 'Bahrain (GMT+3)' },
    { value: 'Asia/Qatar', label: 'Qatar (GMT+3)' },
    { value: 'Africa/Cairo', label: 'Cairo (GMT+2)' },
    { value: 'Europe/London', label: 'London (GMT+0/+1)' },
    { value: 'America/New_York', label: 'New York (GMT-5/-4)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8/-7)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (GMT+8)' },
    { value: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
    { value: 'Australia/Sydney', label: 'Sydney (GMT+10/+11)' },
  ];
}

export function getRetrainingFrequencyLabel(frequency: string): string {
  const labels: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
  };
  return labels[frequency] || frequency;
}

export function getValuationMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    FIFO: 'First In, First Out (FIFO)',
    LIFO: 'Last In, First Out (LIFO)',
    WEIGHTED_AVG: 'Weighted Average',
  };
  return labels[method] || method;
}

export function getOnboardingProgress(status: OnboardingStatus): number {
  return Math.round((status.completedSteps / status.totalSteps) * 100);
}

export function getNextOnboardingStep(status: OnboardingStatus): string | null {
  const stepOrder = [
    'companyInfo',
    'chartOfAccounts',
    'taxConfig',
    'openingBalances',
    'importData',
    'aiFeatures',
    'tour',
  ] as const;

  for (const step of stepOrder) {
    if (!status.steps[step].completed && !status.steps[step].skipped) {
      return step;
    }
  }

  return null;
}
