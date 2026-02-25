import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type RecurringType = 'JOURNAL' | 'INVOICE' | 'BILL' | 'EXPENSE';
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurringStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface RecurringExecution {
  id: string;
  profileId: string;
  executedAt: string;
  createdEntityType: string;
  createdEntityId: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface RecurringProfile {
  id: string;
  name: string;
  type: RecurringType;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  isActive: boolean;
  autoPost: boolean;
  autoSend: boolean;
  templateData: Record<string, any>;
  entityType?: string;
  executionCount: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
  executions?: RecurringExecution[];
}

export interface CreateRecurringProfileDto {
  name: string;
  type: RecurringType;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  autoPost?: boolean;
  autoSend?: boolean;
  templateData: Record<string, any>;
  entityType?: string;
}

export interface UpdateRecurringProfileDto {
  name?: string;
  frequency?: RecurringFrequency;
  startDate?: string;
  endDate?: string;
  autoPost?: boolean;
  autoSend?: boolean;
  templateData?: Record<string, any>;
}

export interface RecurringQueryParams {
  isActive?: boolean;
  type?: RecurringType;
  page?: number;
  limit?: number;
}

export interface RecurringStatistics {
  total: number;
  active: number;
  paused: number;
  byType: Array<{ type: RecurringType; count: number }>;
  recentExecutions: Array<RecurringExecution & { profile: { name: string; type: RecurringType } }>;
}

export interface ExecuteProfileResult {
  success: boolean;
  createdEntityType: string;
  createdEntityId: string;
  error?: string;
}

// ============ API Functions ============

const recurringApi = {
  getAll: async (params?: RecurringQueryParams) => {
    const response = await api.get('/recurring-profiles', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/recurring-profiles/${id}`);
    return response.data;
  },
  create: async (data: CreateRecurringProfileDto) => {
    const response = await api.post('/recurring-profiles', data);
    return response.data;
  },
  update: async (id: string, data: UpdateRecurringProfileDto) => {
    const response = await api.put(`/recurring-profiles/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/recurring-profiles/${id}`);
    return response.data;
  },
  toggle: async (id: string) => {
    const response = await api.post(`/recurring-profiles/${id}/toggle`);
    return response.data;
  },
  execute: async (id: string) => {
    const response = await api.post(`/recurring-profiles/${id}/execute`);
    return response.data;
  },
  getStatistics: async () => {
    const response = await api.get('/recurring-profiles/statistics');
    return response.data;
  },
  getUpcoming: async (days: number = 7) => {
    const response = await api.get('/recurring-profiles/upcoming', { params: { days } });
    return response.data;
  },
  getExecutionHistory: async (profileId: string, limit: number = 50) => {
    const response = await api.get(`/recurring-profiles/${profileId}/executions`, {
      params: { limit },
    });
    return response.data;
  },
};

// ============ Hooks ============

export function useRecurringProfiles(params?: RecurringQueryParams) {
  return useQuery({
    queryKey: ['recurring-profiles', params],
    queryFn: () => recurringApi.getAll(params),
  });
}

export function useRecurringProfile(id: string) {
  return useQuery({
    queryKey: ['recurring-profiles', id],
    queryFn: () => recurringApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateRecurringProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recurringApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-statistics'] });
    },
  });
}

export function useUpdateRecurringProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRecurringProfileDto }) =>
      recurringApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles', id] });
    },
  });
}

export function useDeleteRecurringProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recurringApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-statistics'] });
    },
  });
}

export function useToggleRecurringProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recurringApi.toggle,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles', id] });
      queryClient.invalidateQueries({ queryKey: ['recurring-statistics'] });
    },
  });
}

export function useExecuteRecurringProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recurringApi.execute,
    onSuccess: (result, id) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles', id] });
      queryClient.invalidateQueries({ queryKey: ['recurring-executions', id] });

      // Invalidate the created entity type
      if (result.createdEntityType) {
        queryClient.invalidateQueries({ queryKey: [result.createdEntityType] });
      }
    },
  });
}

export function useRecurringStatistics() {
  return useQuery({
    queryKey: ['recurring-statistics'],
    queryFn: () => recurringApi.getStatistics(),
  });
}

export function useUpcomingRecurringProfiles(days: number = 7) {
  return useQuery({
    queryKey: ['recurring-upcoming', days],
    queryFn: () => recurringApi.getUpcoming(days),
  });
}

export function useRecurringExecutionHistory(profileId: string, limit: number = 50) {
  return useQuery({
    queryKey: ['recurring-executions', profileId, limit],
    queryFn: () => recurringApi.getExecutionHistory(profileId, limit),
    enabled: !!profileId,
  });
}

// ============ Helper Functions ============

export function getRecurringTypeLabel(type: RecurringType): string {
  const labels: Record<RecurringType, string> = {
    JOURNAL: 'Journal Entry',
    INVOICE: 'Invoice',
    BILL: 'Bill',
    EXPENSE: 'Expense',
  };
  return labels[type] || type;
}

export function getRecurringTypeIcon(type: RecurringType): string {
  const icons: Record<RecurringType, string> = {
    JOURNAL: '📔',
    INVOICE: '📄',
    BILL: '🧾',
    EXPENSE: '💳',
  };
  return icons[type] || '📋';
}

export function getRecurringTypeColor(type: RecurringType): string {
  const colors: Record<RecurringType, string> = {
    JOURNAL: 'bg-purple-100 text-purple-800',
    INVOICE: 'bg-blue-100 text-blue-800',
    BILL: 'bg-orange-100 text-orange-800',
    EXPENSE: 'bg-red-100 text-red-800',
  };
  return colors[type] || '';
}

export function getFrequencyLabel(frequency: RecurringFrequency): string {
  const labels: Record<RecurringFrequency, string> = {
    DAILY: 'Daily',
    WEEKLY: 'Weekly',
    MONTHLY: 'Monthly',
    YEARLY: 'Yearly',
  };
  return labels[frequency] || frequency;
}

export function getFrequencyDescription(frequency: RecurringFrequency): string {
  const descriptions: Record<RecurringFrequency, string> = {
    DAILY: 'Runs every day',
    WEEKLY: 'Runs every week',
    MONTHLY: 'Runs every month',
    YEARLY: 'Runs every year',
  };
  return descriptions[frequency] || '';
}

export function getExecutionStatusColor(status: 'success' | 'failed'): string {
  return status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
}

export function getExecutionStatusIcon(status: 'success' | 'failed'): string {
  return status === 'success' ? '✅' : '❌';
}

export function formatNextRunDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < 30) return `In ${Math.ceil(diffDays / 7)} weeks`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function isOverdue(nextRunDate: string): boolean {
  return new Date(nextRunDate) < new Date();
}

export function getDaysUntilNextRun(nextRunDate: string): number {
  const now = new Date();
  const next = new Date(nextRunDate);
  const diffTime = next.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function calculateNextRunDate(currentDate: Date, frequency: RecurringFrequency): Date {
  const nextDate = new Date(currentDate);

  switch (frequency) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }

  return nextDate;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
