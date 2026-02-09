'use client';

import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Types ──────────────────────────────────────────────────────

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
  lockDate: string | null;
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

export interface AISettings {
  aiCategorizationEnabled: boolean;
  aiReconciliationEnabled: boolean;
  aiOcrEnabled: boolean;
  aiForecastingEnabled: boolean;
  aiAnomalyEnabled: boolean;
  aiLeadScoringEnabled: boolean;
  aiRetrainingFrequency: string;
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

export interface AllOrganizationSettings {
  general: GeneralSettings;
  financial: FinancialSettings;
  invoice: InvoiceSettings;
  inventory: InventorySettings;
  ai: AISettings;
  email: EmailSettings;
  localization: LocalizationSettings;
  branding: BrandingSettings;
}

// ─── Hooks ──────────────────────────────────────────────────────

const SETTINGS_KEY = ['organization', 'settings'];

/**
 * Fetch all organization settings at once
 */
export function useAllOrganizationSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const response = await api.get('/organizations/settings');
      return response.data as AllOrganizationSettings;
    },
  });
}

function useUpdateSection<T>(section: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Partial<T>) => {
      const response = await api.patch(`/organizations/settings/${section}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast({
        title: 'Settings saved',
        description: `${section.charAt(0).toUpperCase() + section.slice(1)} settings updated.`,
      });
    },
    onError: (error: unknown) => {
      const errMsg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update settings';
      toast({ variant: 'destructive', title: 'Error', description: errMsg });
    },
  });
}

export function useUpdateGeneralSettings() {
  return useUpdateSection<GeneralSettings>('general');
}

export function useUpdateFinancialSettings() {
  return useUpdateSection<FinancialSettings>('financial');
}

export function useUpdateInvoiceSettings() {
  return useUpdateSection<InvoiceSettings>('invoice');
}

export function useUpdateInventorySettings() {
  return useUpdateSection<InventorySettings>('inventory');
}

export function useUpdateAISettings() {
  return useUpdateSection<AISettings>('ai');
}

export function useUpdateEmailSettings() {
  return useUpdateSection<EmailSettings>('email');
}

export function useUpdateLocalizationSettings() {
  return useUpdateSection<LocalizationSettings>('localization');
}

export function useUpdateBrandingSettings() {
  return useUpdateSection<BrandingSettings>('branding');
}

/**
 * Fetch the organization profile (simple: name, email, phone, etc.)
 */
export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await api.get('/organizations');
      return response.data;
    },
  });
}

/**
 * Update the lock date
 */
export function useUpdateLockDate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (lockDate: string | null) => {
      const response = await api.patch('/organizations/lock-date', { lockDate });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast({ title: 'Lock date updated' });
    },
    onError: (error: unknown) => {
      const errMsg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update lock date';
      toast({ variant: 'destructive', title: 'Error', description: errMsg });
    },
  });
}
