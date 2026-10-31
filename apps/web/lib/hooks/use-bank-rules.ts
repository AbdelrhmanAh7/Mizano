'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankRulesApi } from '@/lib/api';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';

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
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: bankRulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      toast.success(t('ruleCreated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('ruleCreateError'), tApiErrors));
    },
  });
}

export function useUpdateBankRule() {
  const queryClient = useQueryClient();
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      bankRulesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      toast.success(t('ruleUpdated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('ruleUpdateError'), tApiErrors));
    },
  });
}

export function useDeleteBankRule() {
  const queryClient = useQueryClient();
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: bankRulesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      toast.success(t('ruleDeleted'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('ruleDeleteError'), tApiErrors));
    },
  });
}

// Helper functions. `labelKey` is a key under the `banking` messages namespace.
export const conditionFieldOptions: { value: RuleCondition['field']; labelKey: string }[] = [
  { value: 'description', labelKey: 'rules.conditions.fields.description' },
  { value: 'payee', labelKey: 'rules.conditions.fields.payee' },
  { value: 'amount', labelKey: 'rules.conditions.fields.amount' },
  { value: 'reference', labelKey: 'rules.conditions.fields.reference' },
];

export const conditionOperatorOptions: { value: RuleCondition['operator']; labelKey: string }[] = [
  { value: 'contains', labelKey: 'rules.conditions.operators.contains' },
  { value: 'equals', labelKey: 'rules.conditions.operators.equals' },
  { value: 'startsWith', labelKey: 'rules.conditions.operators.startsWith' },
  { value: 'endsWith', labelKey: 'rules.conditions.operators.endsWith' },
  { value: 'greaterThan', labelKey: 'rules.conditions.operators.greaterThan' },
  { value: 'lessThan', labelKey: 'rules.conditions.operators.lessThan' },
];

export const actionTypeOptions: { value: RuleAction['type']; labelKey: string }[] = [
  { value: 'categorize', labelKey: 'rules.actions.types.categorize' },
  { value: 'createExpense', labelKey: 'rules.actions.types.createExpense' },
  { value: 'matchVendor', labelKey: 'rules.actions.types.matchVendor' },
  { value: 'matchCustomer', labelKey: 'rules.actions.types.matchCustomer' },
];

type Translate = (key: string) => string;

/** Translated label of a condition field; `t` is `useTranslations('banking')`. */
export function getConditionFieldLabel(field: RuleCondition['field'], t: Translate): string {
  const option = conditionFieldOptions.find((f) => f.value === field);
  return option ? t(option.labelKey) : field;
}

/** Translated label of a condition operator; `t` is `useTranslations('banking')`. */
export function getConditionOperatorLabel(
  operator: RuleCondition['operator'],
  t: Translate,
): string {
  const option = conditionOperatorOptions.find((o) => o.value === operator);
  return option ? t(option.labelKey) : operator;
}

/** Translated label of a rule action type; `t` is `useTranslations('banking')`. */
export function getActionTypeLabel(type: RuleAction['type'], t: Translate): string {
  const option = actionTypeOptions.find((a) => a.value === type);
  return option ? t(option.labelKey) : type;
}
