'use client';

import { useTranslations } from 'next-intl';
import { useToastMutation } from './use-toast-mutation';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { vendorsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
export interface VendorAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  taxId: string | null;
  billingStreet: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  paymentTerms: number;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  outstandingBalance?: string;
}

export interface VendorParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateVendorData {
  name: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  taxId?: string | null;
  billingAddress?: VendorAddress;
  paymentTerms?: number;
}

interface UpdateVendorData extends Partial<CreateVendorData> {}

/**
 * Hook to fetch all vendors with pagination
 */
export function useVendors(params?: VendorParams) {
  return useQuery({
    queryKey: ['vendors', params],
    queryFn: async () => {
      const response = await vendorsApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all vendors with cursor-based pagination (virtual scroll)
 */
export function useInfiniteVendors(params?: Record<string, unknown>) {
  return useInfiniteTableData<Vendor, Record<string, unknown>>({
    queryKey: ['vendors'],
    fetchFn: async (p) => {
      const response = await vendorsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single vendor by ID
 */
export function useVendor(id: string | undefined) {
  return useQuery({
    queryKey: ['vendors', id],
    queryFn: async () => {
      if (!id) throw new Error('Vendor ID is required');
      const response = await vendorsApi.getOne(id);
      return response.data as Vendor;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new vendor
 */
export function useCreateVendor() {
  return useToastMutation({
    namespace: 'purchases.vendors.toast',
    mutationFn: async (data: CreateVendorData) => {
      // Flatten address for API
      const submitData = {
        name: data.name,
        displayName: data.displayName || null,
        email: data.email || null,
        phone: data.phone || null,
        currency: data.currency || 'USD',
        taxId: data.taxId || null,
        paymentTerms: data.paymentTerms || 0,
        billingAddress: data.billingAddress,
      };
      const response = await vendorsApi.create(submitData);
      return response.data;
    },
    invalidate: () => [['vendors']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing vendor
 */
export function useUpdateVendor() {
  return useToastMutation({
    namespace: 'purchases.vendors.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateVendorData }) => {
      // Flatten address for API
      const submitData = {
        name: data.name,
        displayName: data.displayName || null,
        email: data.email || null,
        phone: data.phone || null,
        currency: data.currency,
        taxId: data.taxId || null,
        paymentTerms: data.paymentTerms,
        billingStreet: data.billingAddress?.street || null,
        billingCity: data.billingAddress?.city || null,
        billingState: data.billingAddress?.state || null,
        billingPostalCode: data.billingAddress?.postalCode || null,
        billingCountry: data.billingAddress?.country || null,
      };
      const response = await vendorsApi.update(id, submitData);
      return response.data;
    },
    invalidate: (variables) => [['vendors'], ['vendors', variables.id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to delete a vendor
 */
export function useDeleteVendor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('purchases.vendors.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await vendorsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: t('deleted'),
        description: t('deletedGenericDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('deleteErrorTitle'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

/**
 * Format vendor address for display
 */
export function formatVendorAddress(vendor: Vendor): string {
  const parts = [
    vendor.billingStreet,
    vendor.billingCity,
    vendor.billingState,
    vendor.billingPostalCode,
    vendor.billingCountry,
  ].filter(Boolean);
  return parts.join(', ') || '-';
}

/**
 * Get outstanding balance color class
 */
export function getBalanceColor(balance: string | number | undefined): string {
  if (balance === undefined || balance === null) return 'text-gray-600';
  const value = typeof balance === 'string' ? parseFloat(balance) : balance;
  if (value > 0) return 'text-red-600 font-semibold';
  if (value < 0) return 'text-green-600';
  return 'text-gray-600';
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: string | number, currency: string = 'USD'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num);
}
