'use client';

import { format } from 'date-fns';
import { customersApi } from '@/lib/api';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useQuery } from '@tanstack/react-query';

// Types
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
 * Customer statement (`GET /customers/:id/statement`, sales.view), served by the reconciling reports service: issued
 * invoices, payments (a voided payment is a separate debit on its void date) and credit notes.
 * Every money value is a fixed 4-dp decimal string computed exactly by the API.
 */
export interface CustomerStatement {
  customer: { id: string; name: string; email: string | null };
  period: { startDate: string; endDate: string };
  openingBalance: string;
  transactions: Array<{
    date: string;
    type:
      | 'Invoice'
      | 'Invoice Void'
      | 'Payment'
      | 'Payment Void'
      | 'Credit Note'
      | 'Credit Note Refund';
    reference: string;
    sourceType: 'invoice' | 'payment' | 'creditNote';
    sourceId: string;
    debit: string;
    credit: string;
    balance: string;
  }>;
  closingBalance: string;
  /** Invoice debits only. */
  totalInvoiced: string;
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
      // The cutoff is the user's local calendar day (toISOString would be the UTC day).
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const response = await customersApi.getStatement(id, { startDate: '2000-01-01', endDate });
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
  return useToastMutation({
    namespace: 'sales.customers.toast',
    mutationFn: async (data: CreateCustomerData) => (await customersApi.create(data)).data,
    invalidate: () => [['customers']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing customer
 */
export function useUpdateCustomer() {
  return useToastMutation({
    namespace: 'sales.customers.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateCustomerData }) =>
      (await customersApi.update(id, data)).data,
    invalidate: (variables) => [['customers'], ['customers', variables.id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to delete a customer
 */
export function useDeleteCustomer() {
  return useToastMutation({
    namespace: 'sales.customers.toast',
    mutationFn: async (id: string) => (await customersApi.delete(id)).data,
    invalidate: () => [['customers']],
    success: 'deleted',
    error: 'deleteError',
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
  if (balance === undefined || balance === null) return 'text-muted-foreground';
  const value = typeof balance === 'string' ? parseFloat(balance) : balance;
  if (value > 0) return 'text-destructive font-semibold';
  if (value < 0) return 'text-success';
  return 'text-muted-foreground';
}
