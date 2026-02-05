'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorsApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

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

export interface VendorStatement {
  vendor: Vendor;
  bills: Array<{
    id: string;
    billNumber: string;
    date: string;
    dueDate: string;
    grandTotal: string;
    balanceDue: string;
    status: string;
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    date: string;
    amount: string;
    paymentMode: string;
  }>;
  vendorCredits: Array<{
    id: string;
    creditNumber: string;
    date: string;
    amount: string;
    reason: string;
  }>;
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Vendor created',
        description: 'The vendor has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating vendor',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing vendor
 */
export function useUpdateVendor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendors', variables.id] });
      toast({
        title: 'Vendor updated',
        description: 'The vendor has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error updating vendor',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a vendor
 */
export function useDeleteVendor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await vendorsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Vendor deleted',
        description: 'The vendor has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting vendor',
        description: error.response?.data?.message || 'An error occurred',
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
