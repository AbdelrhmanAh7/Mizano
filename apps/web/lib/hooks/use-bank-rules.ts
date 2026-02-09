'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankRulesApi } from '@/lib/api';
import { toast } from 'sonner';

export interface BankRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  action: RuleAction;
  priority: number;
  isActive: boolean;
  autoCreate: boolean;
  hitCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleCondition {
  field: 'description' | 'payee' | 'amount' | 'reference';
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
  value: string;
}

export interface RuleAction {
  type: 'categorize' | 'createExpense' | 'matchVendor' | 'matchCustomer';
  accountId?: string;
  vendorId?: string;
  customerId?: string;
  description?: string;
}

export interface BankRuleFilters {
  search?: string;
  isActive?: boolean;
}

// Hooks
export function useBankRules(params?: BankRuleFilters) {
  return useQuery({
    queryKey: ['bank-rules', params],
    queryFn: async () => {
      const response = await bankRulesApi.getAll(params);
      return response.data;
    },
  });
}

export function useBankRule(id: string) {
  return useQuery({
    queryKey: ['bank-rules', id],
    queryFn: async () => {
      const response = await bankRulesApi.getOne(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useCreateBankRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankRulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      toast.success('Bank rule created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create bank rule');
    },
  });
}

export function useUpdateBankRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      bankRulesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      toast.success('Bank rule updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update bank rule');
    },
  });
}

export function useDeleteBankRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankRulesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      toast.success('Bank rule deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete bank rule');
    },
  });
}

export function useTestBankRule() {
  return useMutation({
    mutationFn: bankRulesApi.test,
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to test bank rule');
    },
  });
}

export function useReorderBankRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankRulesApi.reorder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      toast.success('Rules reordered successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to reorder rules');
    },
  });
}

// Helper functions
export const conditionFieldOptions = [
  { value: 'description', label: 'Description' },
  { value: 'payee', label: 'Payee' },
  { value: 'amount', label: 'Amount' },
  { value: 'reference', label: 'Reference' },
];

export const conditionOperatorOptions = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'lessThan', label: 'Less than' },
];

export const actionTypeOptions = [
  { value: 'categorize', label: 'Categorize to Account' },
  { value: 'createExpense', label: 'Create Expense' },
  { value: 'matchVendor', label: 'Match to Vendor' },
  { value: 'matchCustomer', label: 'Match to Customer' },
];

export function getConditionFieldLabel(field: RuleCondition['field']): string {
  return conditionFieldOptions.find((f) => f.value === field)?.label || field;
}

export function getConditionOperatorLabel(operator: RuleCondition['operator']): string {
  return conditionOperatorOptions.find((o) => o.value === operator)?.label || operator;
}

export function getActionTypeLabel(type: RuleAction['type']): string {
  return actionTypeOptions.find((a) => a.value === type)?.label || type;
}
