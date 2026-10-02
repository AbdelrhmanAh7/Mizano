'use client';

import { useToast } from '@/components/ui/use-toast';
import { api, customersApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

export interface CustomerAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface Customer {
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
  shippingStreet: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  paymentTerms: number;
  priceListId: string | null;
  notes: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  outstandingBalance?: string;
}

/**
 * Customer statement from the reconciling reports API (`/reports/customer-statement/:id`): issued
 * invoices, payments (a voided payment is a separate debit on its void date) and credit notes.
 * Every money value is a fixed 4-dp decimal string computed exactly by the API.
 */
export interface CustomerStatement {
  customer: { id: string; name: string; email: string | null };
  period: { startDate: string; endDate: string };
  openingBalance: string;
  transactions: Array<{
    date: string;
    type: 'Invoice' | 'Payment' | 'Payment Void' | 'Credit Note' | 'Credit Note Refund';
    reference: string;
    debit: string;
    credit: string;
    balance: string;
  }>;
  closingBalance: string;
  totalDebits: string;
  totalCredits: string;
}

export interface CustomerParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateCustomerData {
  name: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  taxId?: string;
  billingAddress?: CustomerAddress;
  shippingAddress?: CustomerAddress;
  paymentTerms?: number;
  priceListId?: string;
}

interface UpdateCustomerData extends Partial<CreateCustomerData> {}

/**
 * Hook to fetch all customers with pagination
 */
export function useCustomers(params?: CustomerParams) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: async () => {
      const response = await customersApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all customers with cursor-based pagination (virtual scroll)
 */
export function useInfiniteCustomers(params?: Record<string, unknown>) {
  return useInfiniteTableData<Customer, Record<string, unknown>>({
    queryKey: ['customers'],
    fetchFn: async (p) => {
      const response = await customersApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single customer by ID
 */
export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      if (!id) throw new Error('Customer ID is required');
      const response = await customersApi.getOne(id);
      return response.data as Customer;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch customer statement
 */
export function useCustomerStatement(id: string | undefined) {
  return useQuery({
    queryKey: ['customers', id, 'statement'],
    queryFn: async () => {
      if (!id) throw new Error('Customer ID is required');
      // Full history: an early start date keeps the opening balance at zero.
      const endDate = new Date().toISOString().slice(0, 10);
      const response = await api.get(`/reports/customer-statement/${id}`, {
        params: { startDate: '2000-01-01', endDate },
      });
      const body = response.data?.data ?? response.data;
      return (body && Array.isArray(body.transactions) ? body : null) as CustomerStatement | null;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new customer
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateCustomerData) => {
      const response = await customersApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Customer created',
        description: 'The customer has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating customer',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing customer
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCustomerData }) => {
      const response = await customersApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers', variables.id] });
      toast({
        title: 'Customer updated',
        description: 'The customer has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating customer',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a customer
 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await customersApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Customer deleted',
        description: 'The customer has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting customer',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Format customer address for display
 * Can be called with individual address components or with a customer object and type
 */
export function formatAddress(
  customerOrStreet: Customer | string | null,
  typeOrCity?: 'billing' | 'shipping' | string | null,
  state?: string | null,
  postalCode?: string | null,
  country?: string | null,
): string {
  // If first argument is a Customer object
  if (customerOrStreet && typeof customerOrStreet === 'object' && 'id' in customerOrStreet) {
    const customer = customerOrStreet as Customer;
    const type = typeOrCity as 'billing' | 'shipping';

    if (type === 'billing') {
      const parts = [
        customer.billingStreet,
        customer.billingCity,
        customer.billingState,
        customer.billingPostalCode,
        customer.billingCountry,
      ].filter(Boolean);
      return parts.join(', ') || '-';
    } else {
      const parts = [
        customer.shippingStreet,
        customer.shippingCity,
        customer.shippingState,
        customer.shippingPostalCode,
        customer.shippingCountry,
      ].filter(Boolean);
      return parts.join(', ') || '-';
    }
  }

  // Original behavior: individual address components
  const parts = [customerOrStreet, typeOrCity, state, postalCode, country].filter(Boolean);
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
